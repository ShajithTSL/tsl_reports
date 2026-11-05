# Copyright (c) 2026, TSL Electronics Services LLC
"""Report wizard: phrase library, auto-fill from a job document, and report/WCR generation."""

import json
import re

import frappe
from frappe import _
from frappe.utils import escape_html, nowdate, strip_html

from .constants import TARGET_DOCTYPE, TEMPLATE_DOCTYPE

PHRASE = "Report Phrase"
SETTINGS = "TSL Report Settings"

# Label -> candidate fieldnames on the report DocType (same list the print format uses)
HEADER_CANDIDATES = [
	("Report No.", ["report_no", "report_number", "tr_report_no"]),
	("Reference / Job No.", ["job_no", "job_number", "reference_no", "reference", "job_card", "work_order"]),
	("Date Received", ["date_received", "received_date", "receiving_date"]),
	("Report Date", ["report_date", "inspection_date", "posting_date", "date"]),
	("Client Name", ["customer_name", "client_name", "customer", "client"]),
	("Equipment Type", ["equipment_type", "equipment", "item_group"]),
	("Manufacturer", ["manufacturer", "make", "brand"]),
	("Model / Part No.", ["model", "model_no", "model_number", "part_no", "item_code"]),
	("Serial No.", ["serial_no", "serial_number", "serial_nos"]),
]

# report field -> source fields tried in order when auto-filling from a job document
AUTOFILL_ALIASES = {
	"customer": ["customer", "party_name", "customer_name"],
	"customer_name": ["customer_name", "customer", "party_name"],
	"client": ["customer", "client", "party_name"],
	"client_name": ["customer_name", "client_name", "customer"],
	"manufacturer": ["manufacturer", "brand", "make"],
	"brand": ["brand", "manufacturer"],
	"make": ["make", "brand", "manufacturer"],
	"model": ["model", "model_no", "item_code"],
	"model_no": ["model_no", "model", "item_code"],
	"part_no": ["part_no", "item_code"],
	"item_code": ["item_code"],
	"equipment_type": ["equipment_type", "item_group", "item_name"],
	"serial_no": ["serial_no", "serial_number"],
	"date_received": ["date_received", "received_date", "posting_date", "transaction_date", "opening_date"],
	"job_no": ["job_no", "name"],
	"reference_no": ["reference_no", "name"],
}
COPY_TYPES = {"Data", "Link", "Select", "Small Text", "Text", "Date", "Datetime", "Int", "Float", "Dynamic Link", "Phone"}
SKIP_FIELDS = {"naming_series", "amended_from", "status", "workflow_state", "title", "company"}


# ----------------------------------------------------------------------------- helpers
def _applies(equipment_types, equipment):
	if not equipment_types or not equipment:
		return True
	eq = equipment.lower()
	return any(t.strip().lower() in eq for t in equipment_types.split(",") if t.strip())


def _header_fields():
	meta = frappe.get_meta(TARGET_DOCTYPE)
	out = []
	for label, cands in HEADER_CANDIDATES:
		df = next((meta.get_field(c) for c in cands if meta.get_field(c)), None)
		if df and not df.hidden:
			out.append({"label": df.label or label, "fieldname": df.fieldname, "fieldtype": df.fieldtype,
						"options": df.options, "read_only": df.read_only})
	return out


def _equipment_phrase(doc_or_dict):
	get = doc_or_dict.get
	parts = [p for p in (_hv(get, "Manufacturer"), _hv(get, "Equipment Type")) if p]
	return " ".join(parts) if parts else "unit"


def _hv(get, label):
	for lbl, cands in HEADER_CANDIDATES:
		if lbl == label:
			for c in cands:
				if get(c):
					return str(get(c)).strip()
	return ""


def _settings():
	try:
		return frappe.get_cached_doc(SETTINGS)
	except Exception:
		return frappe._dict()


def _employee_row(employee, role):
	if not employee:
		return None
	e = frappe.db.get_value("Employee", employee, ["name", "employee_name", "designation"], as_dict=True) or {}
	sig = frappe.db.get_value("Employee", employee, "tr_signature") if frappe.get_meta("Employee").has_field("tr_signature") else None
	# the signatory table links to Technician ID; from the wizard we copy the employee's name / designation
	return {"role": role, "full_name": e.get("employee_name"), "designation": e.get("designation"),
			"signature": sig, "sign_date": nowdate(), "company_line": "TSL Electronics Services LLC"}


# block builders -----------------------------------------------------------------------
def H(t, **k):
	return {"block_type": "Heading", "title": t, **k}


def S(t):
	return {"block_type": "Sub Heading", "title": t}


def T(html):
	return {"block_type": "Text", "content": html}


def P(text):
	paras = [p.strip() for p in (text or "").split("\n") if p.strip()]
	return T("".join(f"<p>{escape_html(p)}</p>" for p in paras))


def UL(items, intro=None):
	html = f"<p>{escape_html(intro)}</p>" if intro else ""
	html += "<ul>" + "".join(f"<li>{escape_html(i)}</li>" for i in items) + "</ul>"
	return T(html)


def grouped(items, block_fn):
	"""Items [{text, section}] -> blocks; adds sub-headings when more than one section is used."""
	sections = []
	for it in items:
		s = (it.get("section") or "").strip()
		if s not in sections:
			sections.append(s)
	if len([s for s in sections if s]) <= 1:
		return block_fn(items)
	blocks = []
	for s in sections:
		chunk = [it for it in items if (it.get("section") or "").strip() == s]
		if s:
			blocks.append(S(s))
		blocks += block_fn(chunk)
	return blocks


def bullets(items):
	return [UL([i["text"] for i in items])] if items else []


# ----------------------------------------------------------------------------- API: wizard context
@frappe.whitelist()
def get_wizard_context():
	frappe.has_permission(TARGET_DOCTYPE, "read", throw=True)
	phrases = frappe.get_all(
		PHRASE, filters={"disabled": 0},
		fields=["name", "phrase_type", "section", "label", "text", "equipment_types", "default_checked",
				"completion_step", "expected", "sort_order"],
		order_by="sort_order asc, creation asc",
	)
	links = {}
	for r in frappe.get_all("Report Phrase Link", filters={"parenttype": PHRASE}, fields=["parent", "phrase"], order_by="idx asc"):
		links.setdefault(r.parent, []).append(r.phrase)
	for p in phrases:
		p["suggests"] = links.get(p.name, [])

	s = _settings()
	me = frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, "name")
	return {
		"phrases": phrases,
		"header_fields": _header_fields(),
		"source_doctype": s.get("source_doctype"),
		"me": me,
		"default_approver": s.get("default_approver"),
		"inspector_role": s.get("inspector_role") or "Inspected By",
		"approver_role": s.get("approver_role") or "Approved By",
		"photo_columns": s.get("photo_columns") or "2",
		"overall_photo_first": 1 if s.get("overall_photo_first") is None else s.get("overall_photo_first"),
		"can_add_phrases": frappe.has_permission(PHRASE, "create"),
	}


# ----------------------------------------------------------------------------- API: auto-fill
@frappe.whitelist()
def get_autofill(source_doctype, source_name):
	"""Values to copy from a job document into the report's empty header fields."""
	src = frappe.get_doc(source_doctype, source_name)
	src.check_permission("read")
	tmeta = frappe.get_meta(TARGET_DOCTYPE)
	out = {}

	def put(tf, val):
		if tf not in out and val not in (None, "") and tmeta.has_field(tf):
			out[tf] = val

	for row in (_settings().get("field_map") or []):
		put(row.report_field, src.get(row.source_field))

	for df in tmeta.fields:
		fn = df.fieldname
		if df.fieldtype not in COPY_TYPES or fn.startswith("tr_") or fn in SKIP_FIELDS:
			continue
		if src.meta.has_field(fn):
			put(fn, src.get(fn))
		for alt in AUTOFILL_ALIASES.get(fn, []):
			if alt == "name":
				put(fn, src.name)
			elif src.meta.has_field(alt):
				put(fn, src.get(alt))

	# Serial No documents: the document name *is* the serial number
	if source_doctype == "Serial No":
		for fn in ("serial_no", "serial_number", "serial_nos"):
			put(fn, src.name)
	return out


# ----------------------------------------------------------------------------- API: build report
@frappe.whitelist()
def build_from_wizard(data, header=None):
	"""Turn wizard answers into report blocks. Pure function – the client applies the result."""
	frappe.has_permission(TARGET_DOCTYPE, "write", throw=True)
	data = json.loads(data) if isinstance(data, str) else data
	header = json.loads(header) if isinstance(header, str) else (header or {})

	findings = data.get("findings") or []
	actions = data.get("actions") or []
	photos = [p for p in (data.get("photos") or []) if p.get("image")]
	cols = str(data.get("photo_columns") or "2")

	blocks = []
	cover = None
	if photos and data.get("overall_photo_first"):
		cover, photos = photos[0], photos[1:]
		blocks.append({"block_type": "Image", "image": cover["image"],
					   "title": cover.get("caption") or "Overall Unit (As-Received Condition)", "columns": "1"})

	if (data.get("complaint") or "").strip():
		blocks += [H("Complaint Details"), P(data["complaint"])]
	if (data.get("assessment") or "").strip():
		blocks += [H("Inspection and Assessment"), P(data["assessment"])]
	if findings:
		blocks.append(H("Inspection Findings"))
		blocks += grouped(findings, bullets)
	for p in photos:
		blocks.append({"block_type": "Image", "image": p["image"], "title": p.get("caption") or "", "columns": cols})
	if actions:
		blocks.append(H("Recommended Corrective Actions"))
		blocks += grouped(actions, bullets)
	if (data.get("conclusion") or "").strip():
		blocks += [H("Conclusion"), P(data["conclusion"])]

	sigs = []
	for role, emp in ((data.get("inspector_role") or "Inspected By", data.get("inspected_by")),
					  (data.get("approver_role") or "Approved By", data.get("approved_by"))):
		row = _employee_row(emp, role)
		if row:
			sigs.append(row)

	_save_custom_phrases(data)
	return {"blocks": blocks, "signatories": sigs, "report_type": "Inspection Report"}


def _save_custom_phrases(data):
	"""Custom items the engineer ticked 'save to library' for."""
	if not frappe.has_permission(PHRASE, "create"):
		return
	equipment = (data.get("equipment_type") or "").strip()
	for ptype, key in (("Finding", "findings"), ("Recommended Action", "actions")):
		for it in data.get(key) or []:
			if it.get("save_to_library") and it.get("text"):
				if frappe.db.exists(PHRASE, {"phrase_type": ptype, "text": it["text"]}):
					continue
				frappe.get_doc({"doctype": PHRASE, "phrase_type": ptype, "text": it["text"],
								"section": it.get("section") or "", "equipment_types": equipment,
								"sort_order": 500}).insert()


# ----------------------------------------------------------------------------- WCR generation
LI_RE = re.compile(r"<li[^>]*>(.*?)</li>", re.S | re.I)


def _items_under(src, keywords):
	"""Fallback for reports not made with the wizard: bullet items under headings containing a keyword."""
	items, active, section = [], False, ""
	for b in src.get("tr_blocks") or []:
		title = (b.title or "").lower()
		if b.block_type == "Heading":
			active = any(k in title for k in keywords)
			section = ""
		elif b.block_type == "Sub Heading" and active:
			section = b.title or ""
		elif b.block_type == "Text" and active:
			for li in LI_RE.findall(b.content or ""):
				t = strip_html(li).strip()
				if t:
					items.append({"text": t, "section": section})
	return items


def build_wcr_blocks(src):
	wiz = {}
	try:
		wiz = json.loads(src.get("tr_wizard_data") or "{}")
	except Exception:
		wiz = {}
	findings = wiz.get("findings") or _items_under(src, ("finding", "observation", "assessment summary"))
	actions = wiz.get("actions") or _items_under(src, ("recommend", "corrective", "action"))
	equipment = _equipment_phrase(src)

	phrases = frappe.get_all(PHRASE, filters={"disabled": 0, "phrase_type": ["in", ["Work Step", "Test"]]},
							 fields=["phrase_type", "section", "text", "expected", "equipment_types", "default_checked"],
							 order_by="sort_order asc, creation asc")
	eq_type = _hv(src.get, "Equipment Type")
	steps = [p for p in phrases if p.phrase_type == "Work Step" and p.default_checked and _applies(p.equipment_types, eq_type)]
	tests = [p for p in phrases if p.phrase_type == "Test" and p.default_checked and _applies(p.equipment_types, eq_type)]
	pre = [s for s in steps if (s.section or "") in ("Preparation & Safety", "Dismantling")]
	post = [s for s in steps if s not in pre]

	done = [{"text": (a.get("completion_step") or a.get("text") or "").strip(), "section": a.get("section") or "Repair Work"}
			for a in actions]
	done = [d for d in done if d["text"]]

	def checklist(items):
		return [{"block_type": "Checklist Row", "title": i["text"], "status": "Done"} for i in items]

	blocks = [H("Work Overview")]
	intro = (f"This report covers the repair, servicing and testing carried out on the {equipment} at the TSL Electronics "
			 f"Services LLC workshop, following inspection report {src.name}. The work included:")
	blocks.append(UL([d["text"] for d in done] or ["Complete servicing and functional testing of the unit."], intro=intro))
	if findings:
		blocks += [H("Summary of Inspection Findings"), UL([f["text"] for f in findings])]

	blocks.append(H("Repair Steps Performed"))
	# three clear tables instead of many one-row tables
	for title, items in (
		("Preparation & Dismantling", [{"text": s.text} for s in pre]),
		("Repair & Servicing", done),
		("Reassembly", [{"text": s.text} for s in post]),
	):
		if items:
			blocks.append(S(title))
			blocks += checklist(items)

	if tests:
		blocks.append(H("Testing & Verification"))
		blocks += [{"block_type": "Test Row", "title": t.text, "expected": t.expected or ""} for t in tests]

	blocks.append(H("Photographs"))
	first_img = next((b.image for b in (src.get("tr_blocks") or []) if b.block_type == "Image" and b.image), None)
	blocks.append({"block_type": "Image", "image": first_img, "title": "Unit condition upon receipt", "columns": "2"})
	for cap in ("PCB assemblies — after servicing", "Reassembled unit — tested"):
		blocks.append({"block_type": "Image", "title": cap, "columns": "2"})
	return blocks

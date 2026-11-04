# Copyright (c) 2026, TSL Electronics Services LLC
"""Auto-fill the values of 'Extra Header Info' rows (and 'Header References').

For each row with a label, the value is looked up in this order:
  1. "Fill From" on the row, if set – a path (see resolve_path): a report field, a child-table field
     (items.serial_no, items[*].serial_no), a field of a linked document (customer.customer_group),
     or the linked job document (job.plant)
  2. a field on the report whose label or fieldname matches the row label (e.g. "Model / Part No" -> model_part_no)
  3. the same match on the linked job document (Report Setup > Job Document)
Only empty rows, and rows that were filled automatically before, are (re)filled. A value you type yourself is kept.
"""

import re

import frappe

from tsl_reports.constants import TARGET_DOCTYPE

TABLES = ("tr_extra_fields", "tr_header_refs")
SKIP_TYPES = {"Section Break", "Column Break", "Tab Break", "Table", "Table MultiSelect", "HTML", "Button",
			  "Image", "Fold", "Heading", "Attach", "Attach Image", "Signature", "Password", "Text Editor"}

# extra spellings for common labels (normalised label -> candidate fieldnames)
ALIASES = {
	"wo": ["work_order", "wo", "wo_no", "work_order_no"],
	"workorder": ["work_order", "wo"],
	"serialno": ["serial_no", "serial_number", "serial_nos"],
	"modelpartno": ["model", "model_no", "part_no", "model_part_no", "item_code"],
	"model": ["model", "model_no", "item_code"],
	"partno": ["part_no", "item_code"],
	"description": ["description", "item_name", "equipment_type"],
	"manufacturer": ["manufacturer", "brand", "make"],
	"customer": ["customer_name", "customer"],
	"client": ["customer_name", "customer"],
	"plant": ["plant", "location", "site"],
	"rigno": ["rig_no", "rig", "rig_number"],
	"notificationno": ["notification_no", "notification"],
	"pono": ["po_no", "purchase_order", "customer_po"],
	"contractno": ["contract_no", "contract"],
}


def _norm(s):
	return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _value(doc, df):
	v = doc.get(df.fieldname)
	if v in (None, "", 0) and df.fieldtype in ("Check", "Int", "Float", "Currency"):
		return ""
	if v in (None, ""):
		return ""
	try:
		out = str(doc.get_formatted(df.fieldname) or v)
	except Exception:
		out = str(v)
	if "<" in out:  # Text Editor / HTML fields: keep the text only
		from frappe.utils import strip_html

		out = strip_html(out)
	return re.sub(r"\s+", " ", out).strip()


def _index(doc, skip_prefix=None):
	"""normalised label / fieldname -> docfield, for value-bearing fields"""
	idx = {}
	for df in doc.meta.fields:
		if df.fieldtype in SKIP_TYPES or (skip_prefix and df.fieldname.startswith(skip_prefix)):
			continue
		for key in (_norm(df.label), _norm(df.fieldname)):
			if key and key not in idx:
				idx[key] = df
	return idx


def _lookup(doc, idx, label):
	key = _norm(label)
	if not key:
		return ""
	df = idx.get(key)
	if df:
		v = _value(doc, df)
		if v:
			return v
	for fn in ALIASES.get(key, []):
		df = doc.meta.get_field(fn)
		if df:
			v = _value(doc, df)
			if v:
				return v
	return ""


def _job(doc):
	dt, dn = doc.get("tr_source_doctype"), doc.get("tr_source_name")
	if dt and dn and frappe.db.exists(dt, dn):
		try:
			return frappe.get_cached_doc(dt, dn)
		except Exception:
			return None
	return None


SEG_RE = re.compile(r"^([A-Za-z0-9_]+)(?:\[(\*|-?\d+)\])?$")


def _linked(doc, df):
	"""The document a Link / Dynamic Link field points to (if readable)."""
	name = doc.get(df.fieldname)
	if not name:
		return None
	dt = df.options if df.fieldtype == "Link" else doc.get(df.options)
	if not dt or not frappe.db.exists(dt, name):
		return None
	try:
		linked = frappe.get_cached_doc(dt, name)
	except Exception:
		return None
	if not frappe.has_permission(dt, "read", linked):
		return None
	return linked


def resolve_path(start, path, raw=False):
	"""Follow a 'Fill From' path and return the text to print.

	  serial_no                     field on the report
	  items.serial_no               child table "items", first row
	  items[2].serial_no            second row        items[-1].serial_no   last row
	  items[*].serial_no            all rows, joined with ", "
	  customer.customer_group       follow the Link field "customer" to the Customer
	  items.item_code.brand         child row -> linked Item -> brand
	  job.plant / job.items.qty     the linked job document (Report Setup > Job Document)
	"""
	docs = [start]
	segs = [x for x in path.split(".") if x]
	for i, seg in enumerate(segs):
		m = SEG_RE.match(seg)
		if not m:
			return ""
		name, pick = m.group(1), m.group(2)
		last = i == len(segs) - 1
		nxt = []
		for d in docs:
			df = d.meta.get_field(name)
			if not df:
				continue
			if df.fieldtype in ("Table", "Table MultiSelect"):
				all_rows = d.get(name) or []
				if not pick:
					rows = all_rows[:1]
				elif pick == "*":
					rows = all_rows
				else:
					k = int(pick)
					idx = k - 1 if k > 0 else (k if k < 0 else 0)  # rows are counted from 1; -1 = last row
					rows = [all_rows[idx]] if -len(all_rows) <= idx < len(all_rows) else []
				nxt.extend(rows)
			elif last:
				v = (str(d.get(name) or "").strip()) if raw else _value(d, df)
				if v:
					nxt.append(v)
			elif df.fieldtype in ("Link", "Dynamic Link"):
				ld = _linked(d, df)
				if ld:
					nxt.append(ld)
		docs = nxt
		if not docs:
			return ""
	vals = []
	for v in docs:
		v = v if isinstance(v, str) else ""
		if v and v not in vals:
			vals.append(v)
	return ", ".join(vals)


def value_for(row, doc, report_idx, job, job_idx):
	src = (row.get("fetch_field") or "").strip()
	if src:
		if src.startswith("job.") and not doc.meta.get_field("job"):
			return resolve_path(job, src[4:]) if job else ""
		return resolve_path(doc, src)
	v = _lookup(doc, report_idx, row.get("label"))
	if not v and job:
		v = _lookup(job, job_idx, row.get("label"))
	return v


def fill(doc, force=False):
	"""Fill empty / auto-filled rows. Returns number of rows changed."""
	report_idx = _index(doc, skip_prefix="tr_")
	job = _job(doc)
	job_idx = _index(job) if job else {}
	changed = 0
	for table in TABLES:
		if not doc.meta.get_field(table):
			continue
		for row in doc.get(table) or []:
			if not row.get("label"):
				continue
			if row.get("value") and not row.get("auto_filled") and not force:
				continue  # typed by hand – keep it
			v = value_for(row, doc, report_idx, job, job_idx)
			if v and v != row.get("value"):
				row.value = v
				row.auto_filled = 1
				changed += 1
	changed += fill_images(doc)
	return changed


def fill_images(doc):
	"""Photo blocks with 'Take Photo From' and no photo yet get the image from that field."""
	job = None
	changed = 0
	for b in doc.get("tr_blocks") or []:
		src = (b.get("image_from") or "").strip()
		if b.get("block_type") != "Image" or not src or b.get("image"):
			continue
		if src.startswith("job.") and not doc.meta.get_field("job"):
			job = job or _job(doc)
			url = resolve_path(job, src[4:], raw=True) if job else ""
		else:
			url = resolve_path(doc, src, raw=True)
		url = (url or "").split(", ")[0]  # first photo if the path gives several
		if url:
			b.image = url
			changed += 1
	return changed


def on_validate(doc, method=None):
	fill(doc)


@frappe.whitelist()
def fill_values(doc, force=0):
	"""Called from the form: returns {table: [{name, value, auto_filled}]} for rows that got a value."""
	if isinstance(doc, str):
		doc = frappe.parse_json(doc)
	if (doc or {}).get("doctype") != TARGET_DOCTYPE:
		frappe.throw("Invalid document")
	frappe.has_permission(TARGET_DOCTYPE, "read", throw=True)
	d = frappe.get_doc(doc)
	fill(d, force=bool(int(force or 0)))
	out = {}
	for table in TABLES:
		out[table] = [{"name": r.name, "value": r.value, "auto_filled": r.get("auto_filled") or 0}
					  for r in (d.get(table) or []) if r.get("auto_filled")]
	out["tr_blocks"] = [{"name": r.name, "image": r.image} for r in (d.get("tr_blocks") or [])
						if r.get("block_type") == "Image" and r.get("image_from") and r.get("image")]
	return out

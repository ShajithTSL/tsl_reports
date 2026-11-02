# Copyright (c) 2026, TSL Electronics Services LLC
"""Adds the tr_* fields to the existing report DocType and installs starter templates.

Run manually at any time with:
    bench --site <site> execute tsl_reports.setup.install.setup_fields
    bench --site <site> execute tsl_reports.setup.install.install_templates
    bench --site <site> execute tsl_reports.setup.install.install_phrases
"""

import json
import os

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ..constants import TARGET_DOCTYPE, TEMPLATE_DOCTYPE

TABLE_TYPES = ["Key-Value", "Table Row", "Checklist Row", "Test Row"]


def report_fields():
	"""Fields added to the report DocType. All prefixed tr_ so they never clash with existing fields.
	Order here = order on the form. Re-running setup updates labels/order of existing fields."""
	return [
		# --- 1. Setup: the only things most users touch
		dict(fieldname="tr_sb_layout", fieldtype="Section Break", label="Report Setup", collapsible=0),
		dict(fieldname="tr_template", fieldtype="Link", label="Start from Template", options=TEMPLATE_DOCTYPE,
			 description="Pick a template to fill in the sections. You can change everything afterwards."),
		dict(fieldname="tr_report_type", fieldtype="Select", label="Report Type",
			 options="Inspection Report\nWork Completion Report\nTest Report\nOther",
			 default="Inspection Report", in_standard_filter=1),
		dict(fieldname="tr_cb_layout", fieldtype="Column Break"),
		dict(fieldname="tr_report_title", fieldtype="Data", label="Title on PDF",
			 description="Leave empty to use the report type, e.g. TECHNICAL INSPECTION REPORT"),
		dict(fieldname="tr_header_format", fieldtype="Link", label="Header Format", options="Report Header Format",
			 description="Logo, company / customer name, references and footer. Leave empty for the default."),
		dict(fieldname="tr_inspection_report", fieldtype="Link", label="Based on Inspection Report",
			 options=TARGET_DOCTYPE, depends_on="eval:doc.tr_inspection_report", read_only=1),
		dict(fieldname="tr_source_doctype", fieldtype="Link", label="Job Document Type", options="DocType",
			 description="Optional: link the job / serial no. / work order to auto-fill the header"),
		dict(fieldname="tr_source_name", fieldtype="Dynamic Link", label="Job Document", options="tr_source_doctype",
			 depends_on="eval:doc.tr_source_doctype"),

		# --- 2. Extra header rows (opens automatically when it has rows)
		dict(fieldname="tr_sb_extra", fieldtype="Section Break", label="Extra Header Info",
			 collapsible=1, collapsible_depends_on="eval:(doc.tr_extra_fields || []).length",
			 description="Customer-specific rows printed in the header box, e.g. Notification No., Rig No., PO No. Empty rows are not printed."),
		dict(fieldname="tr_extra_fields", fieldtype="Table", label="Extra Header Info",
			 options="Technical Report Header Field"),

		# --- 2b. References printed in the page header (contract no., PO no. ...)
		dict(fieldname="tr_sb_refs", fieldtype="Section Break", label="Header References",
			 collapsible=1, collapsible_depends_on="eval:(doc.tr_header_refs || []).length",
			 description="Printed at the top of every page, e.g. Contract No., PO No. Filled from the header format; change values per report. Empty rows are not printed."),
		dict(fieldname="tr_header_refs", fieldtype="Table", label="Header References",
			 options="Technical Report Header Field"),

		# --- 3. Content: the visual editor
		dict(fieldname="tr_sb_body", fieldtype="Section Break", label="Report Content", collapsible=0),
		dict(fieldname="tr_editor", fieldtype="HTML", label="Editor"),

		# --- 4. Sign-off
		dict(fieldname="tr_sb_sign", fieldtype="Section Break", label="Sign-Off", collapsible=0),
		dict(fieldname="tr_signatories", fieldtype="Table", label="Signed By",
			 options="Technical Report Signatory",
			 description="Pick the employee: name, designation and signature are filled in automatically."),
		dict(fieldname="tr_signoff_note", fieldtype="Small Text", label="Sign-Off Statement"),

		# --- 5. Advanced (collapsed)
		dict(fieldname="tr_sb_options", fieldtype="Section Break", label="Advanced: Layout Options", collapsible=1),
		dict(fieldname="tr_report_subtitle", fieldtype="Data", label="Subtitle on PDF"),
		dict(fieldname="tr_header_layout", fieldtype="Select", label="Header Box Layout",
			 options="Two Column\nSingle Column", default="Two Column"),
		dict(fieldname="tr_cb_options", fieldtype="Column Break"),
		dict(fieldname="tr_show_end_marker", fieldtype="Check", label="Print '— END OF REPORT —'"),
		dict(fieldname="tr_sb_raw", fieldtype="Section Break", label="Advanced: Block Table", collapsible=1,
			 description="The raw data behind the editor above. You normally don't need this."),
		dict(fieldname="tr_blocks", fieldtype="Table", label="Report Blocks", options="Technical Report Block"),
		dict(fieldname="tr_wizard_data", fieldtype="Long Text", label="Wizard Data", hidden=1, no_copy=1),
	]


def employee_fields():
	return [
		dict(fieldname="tr_signature", fieldtype="Attach Image", label="Signature (for reports)",
			 insert_after="image" if frappe.get_meta("Employee").has_field("image") else None),
	]


def _chain_insert_after(fields, anchor=None):
	prev = anchor
	for df in fields:
		if prev:
			df.setdefault("insert_after", prev)
		prev = df["fieldname"]
	return fields


def setup_fields():
	if not frappe.db.exists("DocType", TARGET_DOCTYPE):
		print(f"[tsl_reports] DocType '{TARGET_DOCTYPE}' not found - skipping report fields. "
			  "Edit tsl_reports/constants.py if your DocType has a different name.")
	else:
		meta = frappe.get_meta(TARGET_DOCTYPE)
		last = meta.fields[-1].fieldname if meta.fields else None
		# put our section after the last existing field that isn't one of ours
		for df in reversed(meta.fields):
			if not (df.fieldname or "").startswith("tr_"):
				last = df.fieldname
				break
		fields = _chain_insert_after(report_fields(), last)

		if frappe.db.get_value("DocType", TARGET_DOCTYPE, "custom"):
			_add_to_custom_doctype(fields)
		else:
			create_custom_fields({TARGET_DOCTYPE: fields}, update=True)

	if frappe.db.exists("DocType", "Employee"):
		ef = [{k: v for k, v in df.items() if v is not None} for df in employee_fields()]
		create_custom_fields({"Employee": ef}, update=True)
	frappe.clear_cache()


def _add_to_custom_doctype(fields):
	"""DocTypes created from the UI ("custom") are edited directly instead of via Custom Field.
	Adds missing fields, updates our tr_* fields' properties and keeps them in the listed order."""
	dt = frappe.get_doc("DocType", TARGET_DOCTYPE)
	by_name = {d.fieldname: d for d in dt.fields}
	for df in fields:
		props = {k: v for k, v in df.items() if k != "insert_after"}
		if df["fieldname"] in by_name:
			by_name[df["fieldname"]].update(props)
		else:
			by_name[df["fieldname"]] = dt.append("fields", props)

	ours = [by_name[df["fieldname"]] for df in fields]
	others = [d for d in dt.fields if d not in ours]
	anchor = fields[0].get("insert_after")
	pos = next((i + 1 for i, d in enumerate(others) if d.fieldname == anchor), len(others))
	dt.fields = others[:pos] + ours + others[pos:]
	for i, d in enumerate(dt.fields, 1):
		d.idx = i
	dt.save()


SEEDED_KEY = "tsl_reports_seeded_templates"


def _seeded():
	try:
		return set(json.loads(frappe.db.get_default(SEEDED_KEY) or "[]"))
	except Exception:
		return set()


def install_templates(overwrite=False, only_new=False):
	"""Install the template files shipped in setup/templates.
	only_new=True (used on every migrate) installs templates added in a new app version,
	but never re-creates one that was installed before and later deleted by you."""
	folder = os.path.join(os.path.dirname(__file__), "templates")
	seeded = _seeded()
	if only_new and not frappe.db.count(TEMPLATE_DOCTYPE):
		only_new = False  # nothing there at all (fresh or re-installed site): install every starter template
	for fname in sorted(os.listdir(folder)):
		if not fname.endswith(".json"):
			continue
		with open(os.path.join(folder, fname)) as fh:
			data = json.load(fh)
		data.pop("doctype", None)
		name = data["template_name"]
		if frappe.db.exists(TEMPLATE_DOCTYPE, name):
			seeded.add(name)
			if not overwrite:
				continue
			frappe.delete_doc(TEMPLATE_DOCTYPE, name, force=True)
		elif only_new and name in seeded:
			continue
		doc = frappe.get_doc({"doctype": TEMPLATE_DOCTYPE, **data})
		doc.insert(ignore_permissions=True)
		seeded.add(name)
		print(f"[tsl_reports] installed template: {name}")
	frappe.db.set_default(SEEDED_KEY, json.dumps(sorted(seeded)))


PHRASE_DOCTYPE = "Report Phrase"


def install_phrases():
	"""Seed the phrase library once (phrases are matched by their key, so re-running only adds missing ones)."""
	path = os.path.join(os.path.dirname(__file__), "phrases.json")
	with open(path) as fh:
		data = json.load(fh)
	keys = {}
	for row in frappe.get_all(PHRASE_DOCTYPE, filters={"phrase_key": ["is", "set"]}, fields=["name", "phrase_key"]):
		keys[row.phrase_key] = row.name
	added = 0
	pending_links = []
	for item in data:
		item = dict(item)
		suggests = item.pop("suggests_keys", None)
		if item["phrase_key"] in keys:
			continue
		doc = frappe.get_doc({"doctype": PHRASE_DOCTYPE, **item})
		doc.insert(ignore_permissions=True)
		keys[item["phrase_key"]] = doc.name
		added += 1
		if suggests:
			pending_links.append((doc.name, suggests))
	for name, suggests in pending_links:
		doc = frappe.get_doc(PHRASE_DOCTYPE, name)
		for k in suggests:
			if k in keys:
				doc.append("suggests", {"phrase": keys[k]})
		doc.save(ignore_permissions=True)
	if added:
		print(f"[tsl_reports] added {added} phrases to the phrase library")


HEADER_DOCTYPE = "Report Header Format"


def install_header_formats():
	"""Create the default 'TSL Standard' header format once."""
	if frappe.db.count(HEADER_DOCTYPE):
		return
	meta = frappe.get_meta(HEADER_DOCTYPE)
	doc = frappe.new_doc(HEADER_DOCTYPE)
	for df in meta.fields:
		if df.default and df.fieldtype not in ("Section Break", "Column Break"):
			doc.set(df.fieldname, df.default)
	doc.format_name = "TSL Standard"
	doc.is_default = 1
	doc.insert(ignore_permissions=True)
	print("[tsl_reports] created header format: TSL Standard")


def after_install():
	setup_fields()
	install_header_formats()
	install_templates()
	install_phrases()


def after_migrate():
	setup_fields()
	install_header_formats()
	# your own templates / header formats / phrases exported with setup.library.export_library
	from .library import import_library

	import_library()
	# adds templates shipped in new versions; templates you deleted don't come back
	install_templates(only_new=True)
	if not frappe.db.count(PHRASE_DOCTYPE):
		install_phrases()


def before_uninstall():
	"""Forget which starter templates were installed, so a later re-install creates them again."""
	frappe.db.set_default(SEEDED_KEY, "[]")

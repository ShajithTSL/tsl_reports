# Copyright (c) 2026, TSL Electronics Services LLC
"""Server helpers for block-based technical reports."""

import base64
import json
import os

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc

from .constants import (
	BLOCK_FIELDS,
	HEADER_FIELDS,
	SIGNATORY_FIELDS,
	TARGET_DOCTYPE,
	TEMPLATE_DOCTYPE,
)

# Candidate fieldnames for the customer on the report DocType (first match wins)
CUSTOMER_FIELDS = ("customer", "client", "customer_name", "client_name")


def _row(src, fields):
	return {f: src.get(f) for f in fields if src.get(f) is not None}


def apply_template(doc, template_name, mode="Replace"):
	"""Copy a template's header settings, extra header rows, blocks and signatories onto `doc`."""
	tpl = frappe.get_doc(TEMPLATE_DOCTYPE, template_name)

	doc.tr_template = tpl.name
	doc.tr_report_type = tpl.report_type
	for src, dst in (
		("report_title", "tr_report_title"),
		("report_subtitle", "tr_report_subtitle"),
		("header_layout", "tr_header_layout"),
		("show_end_marker", "tr_show_end_marker"),
		("signoff_note", "tr_signoff_note"),
		("header_format", "tr_header_format"),
	):
		if mode == "Replace" or not doc.get(dst):
			doc.set(dst, tpl.get(src))

	if mode == "Replace":
		doc.set("tr_blocks", [])
		doc.set("tr_signatories", [])

	# Header rows: keep existing values, add missing labels
	existing = {(r.label or "").strip().lower() for r in doc.get("tr_extra_fields") or []}
	for r in tpl.extra_fields:
		if (r.label or "").strip().lower() not in existing:
			doc.append("tr_extra_fields", _row(r, HEADER_FIELDS))

	for r in tpl.blocks:
		doc.append("tr_blocks", _row(r, BLOCK_FIELDS))

	if not doc.get("tr_signatories"):
		for r in tpl.signatories:
			doc.append("tr_signatories", _row(r, SIGNATORY_FIELDS))
	return doc


@frappe.whitelist()
def get_default_template(report_type=None, customer=None):
	"""Best template for a report type: customer-specific default > generic default > any."""
	report_type = report_type or "Inspection Report"
	base = {"report_type": report_type, "disabled": 0}
	for extra in (
		{"customer": customer, "is_default": 1} if customer else None,
		{"customer": customer} if customer else None,
		{"customer": ["is", "not set"], "is_default": 1},
		{"is_default": 1},
		{},
	):
		if extra is None:
			continue
		name = frappe.db.get_value(TEMPLATE_DOCTYPE, {**base, **extra}, "name")
		if name:
			return name
	return None


@frappe.whitelist()
def make_work_completion_report(source_name, target_doc=None):
	"""Create a Work Completion Report from an Inspection Report (header copied, WCR template applied)."""

	def postprocess(source, target):
		target.tr_report_type = "Work Completion Report"
		target.tr_inspection_report = source.name
		# start the body fresh; header fields are kept
		target.set("tr_blocks", [])
		target.set("tr_signatories", [])
		target.set("tr_extra_fields", [])
		for r in source.get("tr_extra_fields") or []:
			target.append("tr_extra_fields", _row(r, HEADER_FIELDS))

		customer = next((source.get(f) for f in CUSTOMER_FIELDS if source.get(f)), None)
		tpl = get_default_template("Work Completion Report", customer)
		if tpl:
			apply_template(target, tpl, mode="Replace")
		target.tr_report_type = "Work Completion Report"

		# Body generated from the inspection: actions -> completed checklist steps, findings carried over
		from .wizard import build_wcr_blocks

		target.set("tr_blocks", [])
		for b in build_wcr_blocks(source):
			target.append("tr_blocks", b)

		labels = {(r.label or "").strip().lower(): r for r in target.tr_extra_fields}
		ref = labels.get("inspection report ref.")
		if ref:
			ref.value = ref.value or source.name
		else:
			target.append("tr_extra_fields", {"label": "Inspection Report Ref.", "value": source.name})

	return get_mapped_doc(
		TARGET_DOCTYPE,
		source_name,
		{
			TARGET_DOCTYPE: {
				"doctype": TARGET_DOCTYPE,
				"field_no_map": [
					"tr_template", "tr_report_title", "tr_report_subtitle",
					"tr_signoff_note", "tr_inspection_report",
				],
			}
		},
		target_doc,
		postprocess,
	)


@frappe.whitelist()
def save_as_template(source_name, template_name, report_type=None, customer=None):
	"""Save the current report's layout (blocks, header rows, signatories) as a reusable template."""
	src = frappe.get_doc(TARGET_DOCTYPE, source_name)
	src.check_permission("read")
	if frappe.db.exists(TEMPLATE_DOCTYPE, template_name):
		frappe.throw(_("Template {0} already exists").format(frappe.bold(template_name)))

	tpl = frappe.new_doc(TEMPLATE_DOCTYPE)
	tpl.update({
		"template_name": template_name,
		"report_type": report_type or src.get("tr_report_type") or "Inspection Report",
		"customer": customer,
		"report_title": src.get("tr_report_title"),
		"report_subtitle": src.get("tr_report_subtitle"),
		"header_layout": src.get("tr_header_layout") or "Two Column",
		"show_end_marker": src.get("tr_show_end_marker"),
		"signoff_note": src.get("tr_signoff_note"),
		"header_format": src.get("tr_header_format"),
	})
	for r in src.get("tr_extra_fields") or []:
		tpl.append("extra_fields", {"label": r.label, "full_width": r.full_width, "fetch_field": r.get("fetch_field")})  # values blank
	for r in src.get("tr_blocks") or []:
		row = _row(r, BLOCK_FIELDS)
		row.pop("image", None)  # don't carry job photos into a template
		if r.block_type in ("Checklist Row", "Test Row"):
			row.pop("status", None)  # results are job-specific
		if r.block_type == "Test Row":
			row.pop("value", None)  # actual readings are job-specific
		tpl.append("blocks", row)
	for r in src.get("tr_signatories") or []:
		tpl.append("signatories", _row(r, ("role", "employee", "full_name", "designation", "company_line")))
	tpl.insert()
	return tpl.name


# ----------------------------------------------------------------------------- previews
PRINT_FORMAT = "Technical Report Blocks"

PREVIEW_SHELL = """<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  html, body {{ margin:0; background:#e9ecef; }}
  .sheet {{ background:#fff; width:210mm; max-width:100%; min-height:297mm; margin:12px auto; padding:10mm 14mm;
           box-sizing:border-box; box-shadow:0 1px 6px rgba(0,0,0,.15); }}
  .print-format {{ margin:0 !important; }}
  @media (max-width: 800px) {{ .sheet {{ padding:6mm; }} }}
</style></head><body><div class="sheet"><div class="print-format">{body}</div></div></body></html>"""


def _fill_header(d):
	try:
		from tsl_reports.header_fill import fill

		fill(d)
	except Exception:
		frappe.log_error(title="tsl_reports: header auto-fill failed")


def _doc_from_client(doc):
	if isinstance(doc, str):
		doc = json.loads(doc)
	if (doc or {}).get("doctype") != TARGET_DOCTYPE:
		frappe.throw(_("Invalid document"))
	frappe.has_permission(TARGET_DOCTYPE, "read", throw=True)
	return frappe.get_doc(doc)


def _print_format_html():
	"""Same source Frappe uses: the app's .html file for a standard format, else the DB copy."""
	pf = frappe.get_cached_doc("Print Format", PRINT_FORMAT)
	if pf.standard == "Yes":
		here = os.path.dirname(os.path.abspath(__file__))
		rel = ("print_format", "technical_report_blocks", "technical_report_blocks.html")
		# works both as the stand-alone app and when merged into another app's module folder
		path = next((c for c in (os.path.join(here, "tsl_reports", *rel), os.path.join(here, *rel)) if os.path.exists(c)), "")
		if os.path.exists(path):
			with open(path) as fh:
				return fh.read()
	return pf.html


@frappe.whitelist()
def preview_html(doc):
	"""Render the (possibly unsaved) report as HTML for the live preview panel.
	Uses exactly the same pipeline as the PDF (frappe.get_print), so both always show the same content."""
	d = _doc_from_client(doc)
	_fill_header(d)
	try:
		html = frappe.get_print(TARGET_DOCTYPE, d.name, PRINT_FORMAT, doc=d, no_letterhead=1)
		if html and "print-format" in html:
			return html.replace("</head>", PREVIEW_SCREEN_CSS + "</head>", 1) if "</head>" in html else PREVIEW_SCREEN_CSS + html
	except Exception:
		frappe.log_error(title="tsl_reports: preview_html via get_print failed")
	body = frappe.render_template(_print_format_html(), {"doc": d})
	return PREVIEW_SHELL.format(body=body)


PREVIEW_SCREEN_CSS = """<style>
  html, body { background:#e9ecef !important; margin:0; }
  .print-format-gutter { padding:12px 0 !important; margin:0 !important; background:transparent !important; }
  .print-format { background:#fff !important; width:210mm !important; max-width:100% !important; min-height:297mm;
                  margin:0 auto !important; padding:10mm 14mm !important; box-sizing:border-box;
                  box-shadow:0 1px 6px rgba(0,0,0,.15) !important; }
  .action-banner, .print-preview-toolbar { display:none !important; }
</style>"""


@frappe.whitelist()
def preview_pdf(doc):
	"""Exact PDF of the (possibly unsaved) report, returned base64-encoded."""
	d = _doc_from_client(doc)
	_fill_header(d)
	try:
		pdf = frappe.get_print(TARGET_DOCTYPE, d.name, PRINT_FORMAT, doc=d, as_pdf=True, no_letterhead=1)
	except Exception:
		# fall back to rendering the format directly (e.g. if printview rejects an unsaved doc)
		frappe.log_error(title="tsl_reports: preview_pdf via get_print failed")
		from frappe.utils.pdf import get_pdf

		body = frappe.render_template(_print_format_html(), {"doc": d})
		pdf = get_pdf(f'<div class="print-format">{body}</div>')
	return base64.b64encode(pdf).decode()


# ----------------------------------------------------------------------------- header formats
HEADER_DOCTYPE = "Report Header Format"


@frappe.whitelist()
def get_header_format(customer=None):
	"""Header format for a customer: customer-specific > default."""
	if customer:
		name = frappe.db.get_value(HEADER_DOCTYPE, {"customer": customer, "disabled": 0}, "name")
		if not name:
			cid = frappe.db.get_value("Customer", {"customer_name": customer}, "name")
			if cid:
				name = frappe.db.get_value(HEADER_DOCTYPE, {"customer": cid, "disabled": 0}, "name")
		if name:
			return name
	return frappe.db.get_value(HEADER_DOCTYPE, {"is_default": 1, "disabled": 0}, "name")


@frappe.whitelist()
def save_header_format(source_name, format_name, customer=None, base_format=None):
	"""Save a new header format: copies the base format's look plus this report's header references."""
	src = frappe.get_doc(TARGET_DOCTYPE, source_name)
	src.check_permission("read")
	if frappe.db.exists(HEADER_DOCTYPE, format_name):
		frappe.throw(_("Header format {0} already exists").format(frappe.bold(format_name)))
	base = base_format or src.get("tr_header_format") or get_header_format()
	new = frappe.copy_doc(frappe.get_doc(HEADER_DOCTYPE, base)) if base else frappe.new_doc(HEADER_DOCTYPE)
	new.format_name = format_name
	new.is_default = 0
	new.customer = customer
	new.set("references", [])
	for r in src.get("tr_header_refs") or []:
		if r.label:
			new.append("references", {"label": r.label, "value": r.value})
	new.insert()
	return new.name


# ----------------------------------------------------------------------------- photo rotation
@frappe.whitelist()
def rotate_image(file_url, degrees=90, doctype=None, docname=None):
	"""Rotate a photo (and fix phone EXIF orientation). Saves a rotated copy and returns its URL,
	so the editor, previews and PDF all show the same, correctly turned picture."""
	from io import BytesIO

	from PIL import Image, ImageOps

	frappe.has_permission(TARGET_DOCTYPE, "write", throw=True)
	degrees = int(degrees) % 360
	name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not name:
		frappe.throw(_("File not found: {0}").format(file_url))
	src = frappe.get_doc("File", name)
	img = Image.open(BytesIO(src.get_content()))
	fmt = (img.format or "JPEG").upper()
	img = ImageOps.exif_transpose(img)  # phones store "rotate me" in EXIF; PDFs ignore it
	if degrees:
		img = img.rotate(-degrees, expand=True)  # PIL rotates counter-clockwise
	if fmt not in ("PNG", "WEBP", "GIF"):
		fmt = "JPEG"
		if img.mode not in ("RGB", "L"):
			img = img.convert("RGB")
	out = BytesIO()
	img.save(out, format=fmt, **({"quality": 90} if fmt == "JPEG" else {}))

	base = (src.file_name or "photo").rsplit(".", 1)[0]
	base = base.split("_rot")[0]
	ext = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp", "GIF": "gif"}[fmt]
	new = frappe.get_doc({
		"doctype": "File",
		"file_name": f"{base}_rot{frappe.generate_hash(length=6)}.{ext}",
		"content": out.getvalue(),
		"is_private": src.is_private,
		"attached_to_doctype": doctype if docname and not str(docname).startswith("new-") else None,
		"attached_to_name": docname if docname and not str(docname).startswith("new-") else None,
	})
	new.insert(ignore_permissions=True)
	return new.file_url

# Copyright (c) 2026, TSL Electronics Services LLC
"""Carry your own report templates, header formats and phrases to other servers inside your app.

On the site where you made them:
    bench --site <site> execute <app>.tsl_reports.setup.library.export_library
    -> writes  apps/<app>/<app>/tsl_reports_library/   (commit this folder to git)

On every other server, after deploying the app:
    bench --site <site> migrate
    -> anything in the library that the site doesn't have yet is added automatically.
       Existing records are never overwritten by migrate.

To overwrite a server's copies with the library (e.g. after you changed a template):
    bench --site <site> execute <app>.tsl_reports.setup.library.import_library --kwargs "{'overwrite': 1}"

The library folder sits next to (not inside) the tsl_reports module folder, so updating
TSL Reports with move_to_app.sh never touches it.
"""

import json
import os

import frappe

TEMPLATE = "Technical Report Template"
HEADER = "Report Header Format"
PHRASE = "Report Phrase"
LOGO_FIELDS = ("our_logo", "customer_logo")


def library_path():
	# .../<pkg>/tsl_reports/setup/library.py  (merged)  or  .../tsl_reports/setup/library.py (stand-alone)
	setup_dir = os.path.dirname(os.path.abspath(__file__))
	parent = os.path.dirname(setup_dir)
	base = os.path.dirname(parent) if os.path.basename(parent) == "tsl_reports" and os.path.exists(
		os.path.join(os.path.dirname(parent), "hooks.py")) else parent
	return os.path.join(base, "tsl_reports_library")


def _clean(doc):
	d = doc.as_dict(no_default_fields=True, no_child_table_fields=True, convert_dates_to_str=True)
	for k in ("_user_tags", "_comments", "_assign", "_liked_by", "_seen"):
		d.pop(k, None)
	for v in d.values():
		if isinstance(v, list):
			for row in v:
				if isinstance(row, dict):
					for k in ("name", "doctype"):
						row.pop(k, None)
	return d


def _safe(name):
	return "".join(c if c.isalnum() or c in "-_ " else "_" for c in name).strip().replace(" ", "_")


def _write(path, data):
	os.makedirs(os.path.dirname(path), exist_ok=True)
	with open(path, "w", encoding="utf-8") as fh:
		json.dump(data, fh, indent=1, ensure_ascii=False, sort_keys=True)
		fh.write("\n")


def _export_file(url, files_dir):
	"""Copy an uploaded /files/... image into the library so it travels with the app."""
	if not url or not (url.startswith("/files/") or url.startswith("/private/files/")):
		return None
	src = frappe.get_site_path(("private" if url.startswith("/private/") else "public"), "files", os.path.basename(url))
	if not os.path.exists(src):
		return None
	os.makedirs(files_dir, exist_ok=True)
	with open(src, "rb") as fh, open(os.path.join(files_dir, os.path.basename(url)), "wb") as out:
		out.write(fh.read())
	return os.path.basename(url)


def export_library():
	lib = library_path()
	files_dir = os.path.join(lib, "files")
	counts = {}

	for dt, sub, key in ((TEMPLATE, "templates", "template_name"), (HEADER, "header_formats", "format_name")):
		folder = os.path.join(lib, sub)
		os.makedirs(folder, exist_ok=True)
		for old in os.listdir(folder):
			if old.endswith(".json"):
				os.remove(os.path.join(folder, old))
		names = frappe.get_all(dt, pluck="name")
		for name in names:
			d = _clean(frappe.get_doc(dt, name))
			if dt == HEADER:
				for f in LOGO_FIELDS:
					fn = _export_file(d.get(f), files_dir)
					if fn:
						d[f] = "library-file:" + fn
			_write(os.path.join(folder, _safe(name) + ".json"), d)
		counts[sub] = len(names)

	phrases = []
	for name in frappe.get_all(PHRASE, pluck="name", order_by="sort_order asc, creation asc"):
		d = _clean(frappe.get_doc(PHRASE, name))
		d["name"] = name  # keep names so 'Suggests Actions' links stay valid
		phrases.append(d)
	_write(os.path.join(lib, "phrases.json"), phrases)
	counts["phrases"] = len(phrases)

	print(f"[tsl_reports] library exported to {lib}: " + ", ".join(f"{v} {k}" for k, v in counts.items()))
	print("[tsl_reports] commit this folder to your app's git repository.")
	return lib


def _import_file(token, files_dir):
	fn = token.split(":", 1)[1]
	existing = frappe.db.get_value("File", {"file_name": fn, "is_private": 0}, "file_url")
	if existing:
		return existing
	path = os.path.join(files_dir, fn)
	if not os.path.exists(path):
		return None
	with open(path, "rb") as fh:
		f = frappe.get_doc({"doctype": "File", "file_name": fn, "is_private": 0, "content": fh.read()})
		f.insert(ignore_permissions=True)
	return f.file_url


def import_library(overwrite=False):
	lib = library_path()
	if not os.path.isdir(lib):
		return
	overwrite = frappe.utils.cint(overwrite)
	files_dir = os.path.join(lib, "files")
	added = updated = 0

	# phrases first: templates don't need them, but keep the order predictable
	ppath = os.path.join(lib, "phrases.json")
	if os.path.exists(ppath) and frappe.db.table_exists(PHRASE):
		with open(ppath, encoding="utf-8") as fh:
			items = json.load(fh)
		pending = []
		for item in items:
			item = dict(item)
			name = item.pop("name", None)
			suggests = item.pop("suggests", []) or []
			exists = name and frappe.db.exists(PHRASE, name)
			if exists and not overwrite:
				continue
			if exists:
				doc = frappe.get_doc(PHRASE, name)
				doc.update(item)
				doc.set("suggests", [])
				doc.save(ignore_permissions=True)
				updated += 1
			else:
				doc = frappe.get_doc({"doctype": PHRASE, **item})
				if name:
					doc.insert(ignore_permissions=True, set_name=name)
				else:
					doc.insert(ignore_permissions=True)
				added += 1
			pending.append((doc.name, suggests))
		for name, suggests in pending:  # links after all phrases exist
			doc = frappe.get_doc(PHRASE, name)
			for s in suggests:
				if s.get("phrase") and frappe.db.exists(PHRASE, s["phrase"]):
					doc.append("suggests", {"phrase": s["phrase"]})
			if doc.get("suggests"):
				doc.save(ignore_permissions=True)

	for dt, sub, key in ((HEADER, "header_formats", "format_name"), (TEMPLATE, "templates", "template_name")):
		folder = os.path.join(lib, sub)
		if not os.path.isdir(folder) or not frappe.db.table_exists(dt):
			continue
		for fname in sorted(os.listdir(folder)):
			if not fname.endswith(".json"):
				continue
			with open(os.path.join(folder, fname), encoding="utf-8") as fh:
				data = json.load(fh)
			name = data.get(key)
			if not name:
				continue
			if dt == HEADER:
				for f in LOGO_FIELDS:
					if str(data.get(f) or "").startswith("library-file:"):
						data[f] = _import_file(data[f], files_dir)
				if not overwrite and frappe.db.get_value(HEADER, {"is_default": 1, "name": ["!=", name]}):
					data["is_default"] = 0  # never take the default away from a format already on this site
			if frappe.db.exists(dt, name):
				if not overwrite:
					continue
				doc = frappe.get_doc(dt, name)
				for table in [df.fieldname for df in doc.meta.get_table_fields()]:
					doc.set(table, [])
				doc.update(data)
				doc.save(ignore_permissions=True)
				updated += 1
			else:
				frappe.get_doc({"doctype": dt, **data}).insert(ignore_permissions=True)
				added += 1

	frappe.db.commit()
	if added or updated:
		print(f"[tsl_reports] library: {added} added, {updated} updated")

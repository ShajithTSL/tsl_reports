# Copyright (c) 2026, TSL Electronics Services LLC
"""Self-repair: makes sure every TSL Reports DocType, field, print format and starter record exists.

Safe to run any time – it never deletes your reports, templates, phrases or header formats.
    bench --site <site> execute tsl_reports.setup.repair.run
(install.sh runs it automatically at the end.)
"""

import glob
import os

import frappe

APP = "tsl_reports"
MODULE = "TSL Reports"
# child tables first, so parents that use them import cleanly
FIRST = [
	"technical_report_block", "technical_report_header_field", "technical_report_signatory",
	"report_phrase_link", "tsl_report_field_map",
]


def _module_dir():
	return frappe.get_app_path(APP, "tsl_reports")


def _fix_registration():
	if APP not in frappe.get_installed_apps():
		from frappe.installer import add_to_installed_apps

		add_to_installed_apps(APP)
		print(f"  registered {APP} as installed on this site")
	md = frappe.db.get_value("Module Def", MODULE, ["name", "app_name"], as_dict=True)
	if not md:
		frappe.get_doc({"doctype": "Module Def", "module_name": MODULE, "app_name": APP}).insert(ignore_permissions=True)
		print(f"  created Module Def '{MODULE}'")
	elif md.app_name != APP:
		frappe.db.set_value("Module Def", MODULE, "app_name", APP)
		print(f"  Module Def '{MODULE}' belonged to '{md.app_name}' – handed back to {APP}")
	frappe.db.commit()


def _sync_doctypes():
	from frappe.modules.import_file import import_file_by_path

	base = os.path.join(_module_dir(), "doctype")
	folders = sorted(d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d)) and not d.startswith("_"))
	ordered = [d for d in FIRST if d in folders] + [d for d in folders if d not in FIRST]
	for d in ordered:
		path = os.path.join(base, d, f"{d}.json")
		if not os.path.exists(path):
			continue
		import_file_by_path(path, force=True, reset_permissions=True)
		frappe.db.commit()
	for path in glob.glob(os.path.join(_module_dir(), "print_format", "*", "*.json")):
		import_file_by_path(path, force=True)
	frappe.db.commit()
	return ordered


def run():
	print("[tsl_reports] repair: checking registration")
	_fix_registration()

	print("[tsl_reports] repair: syncing DocTypes and print format")
	folders = _sync_doctypes()
	frappe.clear_cache()

	from tsl_reports.setup import install

	print("[tsl_reports] repair: fields and starter records")
	install.setup_fields()
	install.install_header_formats()
	if hasattr(install, "install_templates"):
		install.install_templates()  # adds any missing starter template; never overwrites yours
	if hasattr(install, "install_phrases"):
		install.install_phrases()  # adds missing phrases only
	frappe.db.commit()
	frappe.clear_cache()

	print("\n[tsl_reports] status")
	ok = True
	for d in folders:
		with open(os.path.join(_module_dir(), "doctype", d, f"{d}.json")) as fh:
			name = frappe.parse_json(fh.read()).get("name")
		exists = frappe.db.exists("DocType", name)
		table = frappe.db.table_exists(name)
		ok = ok and bool(exists) and table
		count = ""
		if exists and table and not frappe.get_meta(name).istable and not frappe.get_meta(name).issingle:
			count = f"{frappe.db.count(name)} records"
		print(f"  {'OK ' if exists and table else 'MISSING'}  {name:32} {count}")
	print("\n" + ("All good." if ok else "Something is still missing – send this output to support."))

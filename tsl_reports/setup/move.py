# Copyright (c) 2026, TSL Electronics Services LLC
"""Database steps when TSL Reports moves from the stand-alone `tsl_reports` app into another app.

Called by move_to_app.sh:  bench --site <site> execute <app>.tsl_reports.setup.move.pre_move --kwargs "{'app': '<app>'}"
Nothing is deleted: doctypes, templates, phrases, header formats and reports all stay.
"""

import frappe

MODULE = "TSL Reports"
OLD_ASSETS = "/assets/" + "tsl_reports/"  # split so move_to_app.py does not rewrite it


def pre_move(app):
	new_assets = f"/assets/{app}/tsl_reports/"

	# 1. the module now belongs to the target app
	if frappe.db.exists("Module Def", MODULE):
		frappe.db.set_value("Module Def", MODULE, "app_name", app)
	else:
		frappe.get_doc({"doctype": "Module Def", "module_name": MODULE, "app_name": app}).insert(ignore_permissions=True)

	# 2. patches that already ran under the old app name must not run again under the new one
	for patch in frappe.get_all("Patch Log", filters={"patch": ["like", "tsl_reports.patches.%"]}, pluck="patch"):
		new = f"{app}.{patch}"
		if not frappe.db.exists("Patch Log", {"patch": new}):
			frappe.get_doc({"doctype": "Patch Log", "patch": new}).insert(ignore_permissions=True)

	# 3. stored image paths that pointed at the old app's assets (logo in header formats)
	if frappe.db.table_exists("Report Header Format"):
		for field in ("our_logo", "customer_logo"):
			frappe.db.sql(
				f"update `tabReport Header Format` set `{field}` = replace(`{field}`, %s, %s) where `{field}` like %s",
				(OLD_ASSETS, new_assets, OLD_ASSETS + "%"),
			)
	frappe.db.commit()
	print(f"[tsl_reports] module '{MODULE}' now belongs to app '{app}'")


def move_back(from_app):
	"""Reverse of pre_move: TSL Reports becomes the stand-alone `tsl_reports` app again. No data is touched."""
	from frappe.installer import add_to_installed_apps

	old_assets = f"/assets/{from_app}/tsl_reports/"

	if frappe.db.exists("Module Def", MODULE):
		frappe.db.set_value("Module Def", MODULE, "app_name", "tsl_reports")
	else:
		frappe.get_doc({"doctype": "Module Def", "module_name": MODULE, "app_name": "tsl_reports"}).insert(ignore_permissions=True)

	prefix = f"{from_app}.tsl_reports.patches."
	for patch in frappe.get_all("Patch Log", filters={"patch": ["like", prefix + "%"]}, pluck="patch"):
		old = patch[len(from_app) + 1:]
		if not frappe.db.exists("Patch Log", {"patch": old}):
			frappe.get_doc({"doctype": "Patch Log", "patch": old}).insert(ignore_permissions=True)

	if frappe.db.table_exists("Report Header Format"):
		for field in ("our_logo", "customer_logo"):
			frappe.db.sql(
				f"update `tabReport Header Format` set `{field}` = replace(`{field}`, %s, %s) where `{field}` like %s",
				(old_assets, OLD_ASSETS, old_assets + "%"),
			)

	if "tsl_reports" not in frappe.get_installed_apps():
		try:
			add_to_installed_apps("tsl_reports", rebuild_website=False)
		except TypeError:  # older/newer Frappe signature
			add_to_installed_apps("tsl_reports")
	frappe.db.commit()
	print(f"[tsl_reports] module '{MODULE}' moved back from '{from_app}' to the tsl_reports app")

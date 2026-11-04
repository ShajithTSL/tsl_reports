import json
import os

import frappe

NAME = "Inspection Report - Branch (Component Level)"


def execute():
	"""Re-install the branch inspection template so Tools and Equipment uses a 3-column table."""
	frappe.reload_doc("tsl_reports", "doctype", "technical_report_block")
	if not frappe.db.exists("Technical Report Template", NAME):
		return
	path = os.path.join(os.path.dirname(__file__), "..", "..", "setup", "templates", "05_inspection_branch.json")
	with open(path) as fh:
		data = json.load(fh)
	data.pop("doctype", None)
	doc = frappe.get_doc("Technical Report Template", NAME)
	doc.set("blocks", [])
	for b in data["blocks"]:
		doc.append("blocks", b)
	doc.save(ignore_permissions=True)

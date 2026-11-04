import frappe

NAME = "Inspection Report - Branch (Component Level)"
APPEAR = "Clean, Corroded, Dirty, Dust, Watermarks, Heat sink clogged, Gasoline Stains, Oil Stains, Burnt Components Signs, Burnt PCB Signs"


def execute():
	"""Visual Inspection in the branch template: tick boxes instead of free text."""
	frappe.reload_doc("tsl_reports", "doctype", "technical_report_block")
	if not frappe.db.exists("Technical Report Template", NAME):
		return
	doc = frappe.get_doc("Technical Report Template", NAME)
	changed = False
	for b in doc.blocks:
		if b.block_type == "Key-Value" and b.title == "Shipping Damage":
			b.update({"block_type": "Options Row", "choices": "Yes, No", "value": "No", "col_labels": "Cosmetic Appearance, Status"})
			changed = True
		elif b.block_type == "Key-Value" and b.title == "General Appearance":
			b.update({"block_type": "Options Row", "choices": APPEAR, "value": "", "col_labels": ""})
			changed = True
	if changed:
		doc.save(ignore_permissions=True)

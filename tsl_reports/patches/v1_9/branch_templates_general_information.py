import frappe

NAMES = ("Inspection Report - Branch (Component Level)", "Repair Report - Branch")


def execute():
	"""Put a 'General Information' heading + Info Table at the top of the two branch templates."""
	frappe.reload_doc("tsl_reports", "doctype", "technical_report_block")
	for name in NAMES:
		if not frappe.db.exists("Technical Report Template", name):
			continue
		doc = frappe.get_doc("Technical Report Template", name)
		if any(b.block_type == "Info Table" for b in doc.blocks):
			continue
		old = [b.as_dict() for b in doc.blocks]
		doc.set("blocks", [])
		doc.append("blocks", {"block_type": "Heading", "title": "General Information"})
		doc.append("blocks", {"block_type": "Info Table"})
		for b in old:
			for k in ("name", "idx", "parent", "parentfield", "parenttype", "creation", "modified", "owner", "modified_by", "doctype"):
				b.pop(k, None)
			doc.append("blocks", b)
		doc.save(ignore_permissions=True)

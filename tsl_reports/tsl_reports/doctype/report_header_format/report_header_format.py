# Copyright (c) 2026, TSL Electronics Services LLC

import frappe
from frappe.model.document import Document


class ReportHeaderFormat(Document):
	def validate(self):
		if self.is_default:
			for name in frappe.get_all(self.doctype, filters={"is_default": 1, "name": ["!=", self.name]}, pluck="name"):
				frappe.db.set_value(self.doctype, name, "is_default", 0)
		if self.logo_height and not (6 <= self.logo_height <= 30):
			frappe.throw("Logo height must be between 6 and 30 mm")

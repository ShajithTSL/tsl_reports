# Copyright (c) 2026, TSL Electronics Services LLC

import frappe
from frappe.model.document import Document


class TechnicalReportTemplate(Document):
	def validate(self):
		# Only one default per (report type, customer) pair
		if self.is_default:
			others = frappe.get_all(
				self.doctype,
				filters={
					"is_default": 1,
					"report_type": self.report_type,
					"customer": self.customer or ["is", "not set"],
					"name": ["!=", self.name],
				},
				pluck="name",
			)
			for name in others:
				frappe.db.set_value(self.doctype, name, "is_default", 0)

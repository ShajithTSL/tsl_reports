# Copyright (c) 2026, TSL Electronics Services LLC

from frappe.model.document import Document


class ReportPhrase(Document):
	def validate(self):
		base = self.label or (self.text or "")
		self.title = (base[:110] + "…") if len(base) > 112 else base

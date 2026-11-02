// Copyright (c) 2026, TSL Electronics Services LLC
frappe.ui.form.on("Report Header Format", {
	refresh(frm) {
		frm.set_intro(__("This controls the top and bottom of every page: logos, company / customer name, references (contract no., PO…), footer lines and colours. Pick it on a report under Report Setup ▸ Header Format."));
		if (frm.is_new()) return;
		frm.add_custom_button(__("Preview on Latest Report"), async () => {
			const rows = await frappe.db.get_list("Evaluation - Technical Report", { fields: ["name"], limit: 1, order_by: "modified desc" });
			if (!rows.length) return frappe.msgprint(__("Create a report first."));
			const doc = await frappe.db.get_doc("Evaluation - Technical Report", rows[0].name);
			doc.tr_header_format = frm.doc.name;
			doc.tr_header_refs = (frm.doc.references || []).map((r) => ({ label: r.label, value: r.value }));
			frappe.call({
				method: "tsl_reports.api.preview_pdf", args: { doc }, freeze: true, freeze_message: __("Generating PDF…"),
				callback: (r) => {
					if (!r.message) return;
					const bytes = Uint8Array.from(atob(r.message), (c) => c.charCodeAt(0));
					const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
					const d = new frappe.ui.Dialog({ title: __("Header Preview – {0}", [rows[0].name]), size: "extra-large" });
					$(d.body).html(`<iframe src="${url}" style="width:100%;height:78vh;border:0"></iframe>`);
					d.show();
				},
			});
		});
	},
});

// Copyright (c) 2026, TSL Electronics Services LLC
frappe.ui.form.on("Technical Report Template", {
	refresh(frm) {
		if (window.tsl_reports && tsl_reports.mount_editor) {
			tsl_reports.mount_editor(frm, { field: "blocks", html_field: "editor", preview: false });
		}
		frm.set_intro(__("Blocks here are copied into a report when this template is chosen. Photo blocks without a file act as placeholders with ready-made captions."));
	},
});

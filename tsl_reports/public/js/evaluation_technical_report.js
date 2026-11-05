// TSL Reports – form behaviour for the block-based technical report
// Loaded via hooks.doctype_js on "Evaluation - Technical Report".

const TR_TEMPLATE = "Technical Report Template";
const TR_BLOCK_FIELDS = ["block_type", "title", "content", "value", "expected", "status",
	"image", "columns", "image_height", "col_labels", "no_number", "col4", "image_from", "choices", "allow_break", "status_labels"];
const TR_CUSTOMER_FIELDS = ["customer", "client", "customer_name", "client_name"];

const tr = {
	customer(frm) {
		const f = TR_CUSTOMER_FIELDS.find((f) => frm.fields_dict[f] && frm.doc[f]);
		return f ? frm.doc[f] : null;
	},

	async load_template(frm, template, mode) {
		const tpl = await frappe.db.get_doc(TR_TEMPLATE, template);
		const replace = mode !== "Append";
		frm.__tr_loading = true;
		try {
			await frm.set_value("tr_template", tpl.name);
			await frm.set_value("tr_report_type", tpl.report_type);
			const map = {
				report_title: "tr_report_title", report_subtitle: "tr_report_subtitle",
				header_layout: "tr_header_layout", show_end_marker: "tr_show_end_marker",
				signoff_note: "tr_signoff_note", header_format: "tr_header_format",
			};
			for (const [src, dst] of Object.entries(map)) {
				if (replace || !frm.doc[dst]) await frm.set_value(dst, tpl[src]);
			}

			// header rows: keep existing values, add labels that are missing
			const have = new Set((frm.doc.tr_extra_fields || []).map((r) => (r.label || "").trim().toLowerCase()));
			(tpl.extra_fields || []).forEach((r) => {
				if (!have.has((r.label || "").trim().toLowerCase())) {
					frm.add_child("tr_extra_fields", { label: r.label, value: r.value, full_width: r.full_width, fetch_field: r.fetch_field });
				}
			});

			if (replace) frm.clear_table("tr_blocks");
			(tpl.blocks || []).forEach((r) => {
				const row = {};
				TR_BLOCK_FIELDS.forEach((f) => { if (r[f] !== undefined && r[f] !== null) row[f] = r[f]; });
				frm.add_child("tr_blocks", row);
			});

			if (replace || !(frm.doc.tr_signatories || []).length) {
				frm.clear_table("tr_signatories");
				(tpl.signatories || []).forEach((r) => frm.add_child("tr_signatories", {
					role: r.role, employee: r.employee, full_name: r.full_name,
					designation: r.designation, signature: r.signature, company_line: r.company_line,
				}));
			}
			["tr_extra_fields", "tr_blocks", "tr_signatories"].forEach((f) => frm.refresh_field(f));
			tr.fill_header(frm);
			tr.mount(frm);
			frappe.show_alert({ message: __("Template {0} loaded", [tpl.name]), indicator: "green" });
		} finally {
			frm.__tr_loading = false;
		}
	},

	choose_template(frm) {
		const d = new frappe.ui.Dialog({
			title: __("Load Report Template"),
			fields: [
				{ fieldname: "template", fieldtype: "Link", label: __("Template"), options: TR_TEMPLATE, reqd: 1,
				  default: frm.doc.tr_template,
				  get_query: () => ({ filters: { disabled: 0 } }) },
				{ fieldname: "mode", fieldtype: "Select", label: __("Mode"), options: "Replace\nAppend", default: "Replace",
				  description: __("Replace clears the current blocks. Append adds the template's blocks at the end.") },
			],
			primary_action_label: __("Load"),
			primary_action: async (v) => {
				d.hide();
				await tr.load_template(frm, v.template, v.mode);
			},
		});
		d.show();
	},

	save_as_template(frm) {
		frappe.prompt([
			{ fieldname: "template_name", fieldtype: "Data", label: __("Template Name"), reqd: 1 },
			{ fieldname: "customer", fieldtype: "Link", options: "Customer", label: __("Only for Customer (optional)"),
			  default: tr.customer(frm) },
		], (v) => {
			frappe.call({
				method: "tsl_reports.api.save_as_template",
				args: { source_name: frm.doc.name, template_name: v.template_name,
					report_type: frm.doc.tr_report_type, customer: v.customer },
				freeze: true,
				callback: (r) => r.message && frappe.show_alert({
					message: __("Template {0} created", [r.message]), indicator: "green" }),
			});
		}, __("Save Layout as Template"));
	},

	async apply_header_format(frm) {
		// copy the format's reference labels (and default values) into this report, keeping values already typed
		if (!frm.doc.tr_header_format) return;
		const hf = await frappe.db.get_doc("Report Header Format", frm.doc.tr_header_format);
		const have = new Set((frm.doc.tr_header_refs || []).map((r) => (r.label || "").trim().toLowerCase()));
		let added = 0;
		(hf.references || []).forEach((r) => {
			if (!have.has((r.label || "").trim().toLowerCase())) {
				frm.add_child("tr_header_refs", { label: r.label, value: r.value });
				added++;
			}
		});
		if (added) frm.refresh_field("tr_header_refs");
		if (frm.__tre && frm.__tre.show_preview) frm.__tre.refresh_preview(true);
	},

	async pick_header_format(frm) {
		if (frm.doc.tr_header_format) return;
		const r = await frappe.call("tsl_reports.api.get_header_format", { customer: tr.customer(frm) });
		if (r.message) await frm.set_value("tr_header_format", r.message);
	},

	save_header_format(frm) {
		frappe.prompt([
			{ fieldname: "format_name", fieldtype: "Data", label: __("New Header Format Name"), reqd: 1,
			  default: tr.customer(frm) ? `${tr.customer(frm)} Header` : "" },
			{ fieldname: "customer", fieldtype: "Link", options: "Customer", label: __("Use automatically for Customer (optional)"),
			  default: frm.fields_dict.customer ? frm.doc.customer : null },
		], (v) => {
			frappe.call({
				method: "tsl_reports.api.save_header_format",
				args: { source_name: frm.doc.name, format_name: v.format_name, customer: v.customer },
				freeze: true,
				callback: async (r) => {
					if (!r.message) return;
					await frm.set_value("tr_header_format", r.message);
					frappe.show_alert({ message: __("Header format {0} saved – open it to change logo, names or colours", [r.message]), indicator: "green" });
				},
			});
		}, __("Save Header as Format"), __("Save"));
	},

	async fill_header(frm, force, quiet) {
		// fill Extra Header Info / Header References values from the report and its job document
		const img_slots = (frm.doc.tr_blocks || []).some((b) => b.block_type === "Image" && b.image_from && !b.image);
		if (!(frm.doc.tr_extra_fields || []).length && !(frm.doc.tr_header_refs || []).length && !img_slots) return;
		const r = await frappe.call({ method: "tsl_reports.header_fill.fill_values", args: { doc: frm.doc, force: force ? 1 : 0 } });
		let n = 0;
		let imgs = 0;
		((r.message || {}).tr_blocks || []).forEach((x) => {
			const b = (frm.doc.tr_blocks || []).find((d) => d.name === x.name);
			if (b && !b.image && x.image) { b.image = x.image; imgs++; }
		});
		if (imgs) {
			frm.dirty();
			if (frm.__tre) frm.__tre.render();
			frappe.show_alert({ message: __("{0} photo(s) taken from the report", [imgs]), indicator: "green" });
		}
		delete (r.message || {}).tr_blocks;
		Object.entries(r.message || {}).forEach(([table, rows]) => {
			rows.forEach((x) => {
				const row = (frm.doc[table] || []).find((d) => d.name === x.name);
				if (row && row.value !== x.value) { row.value = x.value; row.auto_filled = 1; n++; }
			});
			if (rows.length) frm.refresh_field(table);
		});
		if (n && quiet) return; // shown only; saved with the next save
		if (n) { frm.dirty(); frappe.show_alert({ message: __("{0} header value(s) filled", [n]), indicator: "green" }); }
		else if (force) frappe.show_alert({ message: __("No matching values found – set 'Fill From' on the row"), indicator: "orange" });
	},

	mount(frm) {
		if (!frm.fields_dict.tr_editor) {
			frm.dashboard.set_headline_alert(
				__("TSL Reports: the visual editor field is missing. Run <b>bench --site {0} migrate</b>.", [frappe.boot.sitename || "your-site"]),
				"orange");
			return;
		}
		if (!window.tsl_reports || !tsl_reports.mount_editor) {
			frm.fields_dict.tr_editor.$wrapper.html(
				`<div class="alert alert-warning">${__("Visual editor script not loaded. Run <b>bench clear-cache</b> and hard-refresh the browser (Ctrl+Shift+R).")}</div>`);
			return;
		}
		tsl_reports.mount_editor(frm, {
			field: "tr_blocks", html_field: "tr_editor", preview: true, template_picker: true,
			on_load_template: (frm, name, mode) => tr.load_template(frm, name, mode),
			on_choose_template: (frm) => tr.choose_template(frm),
			on_wizard: (frm) => tsl_reports.open_wizard(frm),
		});
	},
};

frappe.ui.form.on("Evaluation - Technical Report", {
	onload(frm) {
		if (frm.is_new()) setTimeout(() => tr.pick_header_format(frm), 300);
		// "New Report (Wizard)" from the list view opens the wizard straight away
		if (frm.is_new() && tsl_reports.open_wizard_on_new) {
			tsl_reports.open_wizard_on_new = false;
			setTimeout(() => tsl_reports.open_wizard(frm), 400);
		}
	},

	tr_header_format(frm) { tr.apply_header_format(frm); },
	customer(frm) { if (frm.is_new()) { frm.set_value("tr_header_format", null).then(() => tr.pick_header_format(frm)); } },

	onload_post_render(frm) { if (!frm.is_new()) tr.fill_header(frm, false, true); },

	tr_source_name(frm) {
		if (frm.__tr_loading || !frm.doc.tr_source_doctype || !frm.doc.tr_source_name) return;
		frappe.call({
			method: "tsl_reports.wizard.get_autofill",
			args: { source_doctype: frm.doc.tr_source_doctype, source_name: frm.doc.tr_source_name },
		}).then(async (r) => {
			let n = 0;
			for (const [k, v] of Object.entries(r.message || {})) {
				if (!frm.doc[k] && v != null && v !== "") { await frm.set_value(k, v); n++; }
			}
			if (n) frappe.show_alert({ message: __("{0} fields filled from {1}", [n, frm.doc.tr_source_name]), indicator: "green" });
			tr.fill_header(frm);
		});
	},

	refresh(frm) {
		tr.mount(frm);
		// if (frm.fields_dict.tr_editor) {
		// 	frm.add_custom_button(__("Edit Report"), () => {
		// 		const $w = frm.fields_dict.tr_editor.$wrapper;
		// 		frappe.utils.scroll_to($w, true, 120);
		// 	}).removeClass("btn-default").addClass("btn-primary");
		// }
		// const wiz = frm.add_custom_button(frm.doc.tr_wizard_data ? __("Edit with Wizard") : __("Quick Report Wizard"),
		// 	() => tsl_reports.open_wizard(frm));
		if (!(frm.doc.tr_blocks || []).length) wiz.removeClass("btn-default").addClass("btn-primary");
		frm.add_custom_button(__("Load Template"), () => tr.choose_template(frm), __("Report"));
		frm.add_custom_button(__("Fill Header Info"), () => tr.fill_header(frm, true), __("Report"));
		frm.add_custom_button(__("Header Format…"), () => {
			if (frm.doc.tr_header_format) frappe.set_route("Form", "Report Header Format", frm.doc.tr_header_format);
			else frappe.new_doc("Report Header Format");
		}, __("Report"));
		if (!frm.is_new()) {
			frm.add_custom_button(__("Save Layout as Template"), () => tr.save_as_template(frm), __("Report"));
			frm.add_custom_button(__("Save Header as Format"), () => tr.save_header_format(frm), __("Report"));
			if ((frm.doc.tr_report_type || "Inspection Report") === "Inspection Report") {
				frm.add_custom_button(__("Work Completion Report"), () => frappe.model.open_mapped_doc({
					method: "tsl_reports.api.make_work_completion_report", frm,
				}), __("Create"));
			}
		}
	},

	tr_template(frm) {
		if (frm.__tr_loading || !frm.doc.tr_template) return;
		const has_blocks = (frm.doc.tr_blocks || []).length;
		const go = () => tr.load_template(frm, frm.doc.tr_template, "Replace");
		if (has_blocks) {
			frappe.confirm(__("Replace the current report blocks with template {0}?", [frm.doc.tr_template]), go);
		} else {
			go();
		}
	},
});

frappe.ui.form.on("Technical Report Block", {
	tr_blocks_add(frm, cdt, cdn) {
		const rows = frm.doc.tr_blocks || [];
		const row = locals[cdt][cdn];
		const prev = rows[rows.length - 2];
		// a new row after an image/checklist/test row continues that group by default
		if (prev && ["Image", "Checklist Row", "Test Row", "Key-Value", "Table Row", "Options Row"].includes(prev.block_type)) {
			frappe.model.set_value(cdt, cdn, "block_type", prev.block_type);
			if (prev.block_type === "Image") frappe.model.set_value(cdt, cdn, "columns", prev.columns);
		} else if (!row.block_type) {
			frappe.model.set_value(cdt, cdn, "block_type", "Text");
		}
	},
});

// typing a value by hand stops it from being refilled automatically
frappe.ui.form.on("Technical Report Header Field", {
	value(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!frm.__tr_filling) row.auto_filled = 0;
	},
	label(frm) { tr.fill_header(frm); },
	fetch_field(frm) { tr.fill_header(frm); },
});

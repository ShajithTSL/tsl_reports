// TSL Reports – list view shortcuts
frappe.provide("tsl_reports");

frappe.listview_settings["Evaluation - Technical Report"] = Object.assign(frappe.listview_settings["Evaluation - Technical Report"] || {}, {
	onload(listview) {
		listview.page.add_inner_button(__("New Report (Wizard)"), () => {
			tsl_reports.open_wizard_on_new = true;
			frappe.new_doc("Evaluation - Technical Report", { tr_report_type: "Inspection Report" });
		}).removeClass("btn-default").addClass("btn-primary");

		listview.page.add_inner_button(__("Work Completion from Inspection"), () => {
			frappe.prompt([{
				fieldname: "source", fieldtype: "Link", label: __("Inspection Report"), reqd: 1,
				options: "Evaluation - Technical Report",
				get_query: () => ({ filters: { tr_report_type: "Inspection Report" } }),
			}], (v) => {
				frappe.call({
					method: "tsl_reports.api.make_work_completion_report",
					args: { source_name: v.source }, freeze: true,
					callback: (r) => {
						if (!r.message) return;
						const doc = frappe.model.sync(r.message)[0];
						frappe.set_route("Form", doc.doctype, doc.name);
					},
				});
			}, __("Create Work Completion Report"), __("Create"));
		});
	},
});

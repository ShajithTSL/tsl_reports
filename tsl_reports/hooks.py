from tsl_reports.constants import TARGET_DOCTYPE

app_name = "tsl_reports"
app_title = "TSL Reports"
app_publisher = "TSL Electronics Services LLC"
app_description = "Block-based, fully customisable technical report PDFs"
app_email = "info-uae@tsl-me.com"
app_license = "MIT"

# Visual block editor + form buttons. Loaded straight from these files
# (no `bench build` needed - `bench clear-cache` is enough after an update).
doctype_js = {
	TARGET_DOCTYPE: [
		"public/js/tr_block_editor.js",
		"public/js/tr_wizard.js",
		"public/js/evaluation_technical_report.js",
	],
	"Technical Report Template": ["public/js/tr_block_editor.js"],
}

# Creates the tr_* custom fields on the report DocType + Employee signature field,
# and installs the starter templates (only if they don't already exist).
after_install = "tsl_reports.setup.install.after_install"
after_migrate = "tsl_reports.setup.install.after_migrate"
before_uninstall = "tsl_reports.setup.install.before_uninstall"

# Fill the values of "Extra Header Info" / "Header References" rows from the report and its job document
doc_events = {TARGET_DOCTYPE: {"validate": "tsl_reports.header_fill.on_validate"}}

# The existing report DocType this app extends.
# Change this one line if your DocType is renamed.
TARGET_DOCTYPE = "Evaluation - Technical Report"

TEMPLATE_DOCTYPE = "Technical Report Template"

# Fields copied from a template onto a report (and from one report to another)
BLOCK_FIELDS = (
    "block_type", "title", "content", "value", "expected", "status",
    "image", "columns", "image_height", "col_labels", "no_number", "col4", "image_from", "choices",
)
HEADER_FIELDS = ("label", "value", "full_width", "fetch_field")
SIGNATORY_FIELDS = ("role", "employee", "full_name", "designation", "signature", "company_line")

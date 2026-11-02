"""Copy technical_report_blocks.html into the print format JSON (run after editing the HTML)."""
import json, os
d = os.path.join(os.path.dirname(__file__), "..", "tsl_reports", "tsl_reports", "print_format", "technical_report_blocks")
j = os.path.join(d, "technical_report_blocks.json")
data = json.load(open(j))
data["html"] = open(os.path.join(d, "technical_report_blocks.html")).read()
json.dump(data, open(j, "w"), indent=1, ensure_ascii=False)
print("synced")

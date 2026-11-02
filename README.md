# TSL Reports – block-based technical report PDFs for ERPNext

The app makes **Evaluation - Technical Report** fully customisable. You build each report out of blocks: headings, text, photos, checklists, test tables and key/value tables. One print format turns any combination of blocks into a branded TSL PDF, with header, footer and "Page X of Y".

Works on Frappe/ERPNext v14 and v15.

## Install or update (one command)

Copy `tsl_reports.zip` to the server, log in as the bench user (usually `sudo su - frappe`), then run:

```bash
unzip -o tsl_reports.zip -d ~ && bash ~/tsl_reports/install.sh
```

The script does everything itself: it finds your frappe-bench folder and your site (and asks you to pick if you have several), copies the app, installs it the first time or updates it after that, clears the cache and restarts. Run exactly the same command again whenever you get a new version.

If it can't find your bench or site, tell it where they are: `bash ~/tsl_reports/install.sh <site-name> /path/to/frappe-bench`

Afterwards, press **Ctrl+Shift+R** once in the browser and click the blue **Edit Report** button at the top of any report.

## Moving TSL Reports into your own app (e.g. `tsl`)

```bash
unzip -o tsl_reports.zip -d ~ && bash ~/tsl_reports/move_to_app.sh tsl
```
Optional arguments: `bash move_to_app.sh <app> <site> <path-to-frappe-bench>`.

The script:
1. backs up `apps/tsl` to `~/tsl_backup_<date>.tar.gz`;
2. copies TSL Reports into `apps/tsl/tsl/tsl_reports/` (module **TSL Reports**) and `apps/tsl/tsl/public/tsl_reports/`, adds the module to `modules.txt`, the patch to `patches.txt`, and three marked lines at the end of `hooks.py` that *add* to your existing hooks (your own `doctype_js`, `after_migrate`… are kept; original saved as `hooks.py.bak-before-tsl_reports`);
3. if the stand-alone `tsl_reports` app is installed, hands its module over to `tsl` **without deleting any data** (reports, templates, phrases, header formats stay), removes it from the site's installed apps and moves the old folder to `~/tsl_reports_old_app_<date>`;
4. migrates, clears the cache and restarts.

Then commit the new files in your `tsl` repo (`cd apps/tsl && git add -A && git commit -m "Add TSL Reports"`) and deploy `tsl` to other servers as you normally do – no separate app needed there. After the move, don't use `install.sh` any more. For a later TSL Reports update, run `move_to_app.sh tsl` again with the new zip – it replaces `tsl/tsl_reports/` and `tsl/public/tsl_reports/`, so keep your own changes outside those two folders.

## Undoing the move (back to the separate app)

```bash
unzip -o tsl_reports_v1.7.1.zip -d ~ && bash ~/tsl_reports/move_back.sh tsl <site> <path-to-frappe-bench>
```
Removes everything TSL Reports added to `tsl` (moved to a backup folder, not deleted), puts `apps/tsl_reports` back, hands the module back and migrates. No data is touched.

## Taking your own templates, header formats and phrases to other servers

Templates, header formats and phrases you create are stored in the site's database, not in the code. To ship them with your app:

```bash
# on the site where you made them
bench --site <site> execute tsl.tsl_reports.setup.library.export_library
cd apps/tsl && git add tsl/tsl_reports_library && git commit -m "TSL Reports library"
```
(For the stand-alone app use `tsl_reports.setup.library.export_library`.)

It writes `apps/tsl/tsl/tsl_reports_library/` – one file per template and header format, `phrases.json`, and uploaded logos in `files/`. On every other server, after deploying the app, `bench --site <site> migrate` adds anything that site doesn't have yet. It never overwrites a template someone changed on that server, and never takes the "Default" flag from that server's own default header. To deliberately replace a server's copies with the library versions:

```bash
bench --site <site> execute tsl.tsl_reports.setup.library.import_library --kwargs "{'overwrite': 1}"
```

Run the export again whenever you add or change templates, then commit. The library folder is outside `tsl/tsl_reports/`, so `move_to_app.sh` updates never touch it.

When you install the app, it does three things:

1. It adds a **Report Layout / Report Body / Sign-Off** section to *Evaluation - Technical Report*. All new fields start with `tr_`, so they can't clash with your existing fields.
   - If your DocType was created in the UI (a "custom" DocType), the fields are added to it directly.
   - Otherwise they are added as Custom Fields.
2. It adds a **Signature (for reports)** image field to **Employee**.
3. It installs six starter templates, built from your sample reports:

| Template | Based on |
|---|---|
| Inspection Report - Standard *(default)* | R-4694 |
| Inspection Report - Awaiting Fault Details | R-4605 |
| Inspection Report - VFD (Oilfield / ADNOC) | 4568 IR |
| Work Completion Report - VFD *(default WCR)* | WCR-4568 |
| Inspection Report - Branch (Component Level) | TR-D-26-00297 |
| Repair Report - Branch | TR-D-26-00252 |

**Your DocType has a different name?** Change `TARGET_DOCTYPE` in `tsl_reports/constants.py`. Also change the `doc_type` in the print format JSON and the name in `frappe.ui.form.on(...)` in the JS file.

## Writing a report – the quick way (wizard)

**Report list ▸ New Report (Wizard)** – or **Quick Report Wizard** on any report. Seven short steps, mostly ticking boxes:

1. **Job** – pick the job document (e.g. the Serial No.) and client, equipment, model, serial… fill in by themselves. Check/adjust the header.
2. **Complaint** – tick what was reported and how it was inspected; the paragraph writes itself (or type your own).
3. **Findings** – tick what you found, grouped by section (Power Section, PCB Assemblies, …). Only phrases for this equipment type are shown. Blanks like "___ found burnt" ask for the missing words. Not in the list? Type it, optionally *Save to phrase library*.
4. **Actions** – the matching recommended actions are already ticked (marked *suggested*) and inherit your details, e.g. "Replace the burnt MOSFET on the fan supply board…". Untick or add more.
5. **Photos** – choose or drag in several photos, add captions from a list or type them. The first photo can be the full-width "overall unit" picture.
6. **Conclusion** – pick *Repairable / Preventive service / Awaiting fault details / Not economical*; the text is written for you with the equipment name filled in.
7. **Sign-off** – you are pre-selected as inspector, the default approver as approver.

**Create Report** builds the report with numbered sections and sub-headings, saves it and opens the PDF. You can still fine-tune anything in the editor, or reopen the wizard (**Edit with Wizard**) – your ticks are remembered.

### Work Completion Report in one click
On an inspection report: **Create ▸ Work Completion Report** (or *Work Completion from Inspection* on the list). It is written for you:
- *Work Overview* lists everything done; *Summary of Inspection Findings* is carried over.
- Every recommended action becomes a **Done** checklist step in its "completed" wording (e.g. "Interface board replaced with a new board"), plus the standard preparation and reassembly steps.
- The standard tests for that equipment are listed with expected results – just click Pass/Fail and type the readings.
- The inspection's overall photo is reused; add the after-repair photos.

### Phrase library (Report Phrase)
All wizard sentences live in the **Report Phrase** list (≈70 phrases seeded from your past reports). Admins can add or edit them:
- **Type**: Complaint, Assessment, Finding, Recommended Action, Conclusion, Work Step, Test, Photo Caption.
- **Section** groups them and becomes the sub-heading in the report.
- **Equipment Types** (e.g. `VFD, Drive`) – shown only for matching equipment; empty = all.
- **Suggests Actions** (findings) – actions ticked automatically when the finding is ticked.
- **Step Text in Work Completion Report** (actions) – the "done" wording.
- Use `{detail}` for a blank the engineer fills in, `{equipment}` in conclusions.

### Settings (TSL Report Settings)
- **Job / Source Document Type** – where your jobs live (Serial No, Issue, Work Order, Job Card…). Same-named fields and common ones (customer, brand, item_code, serial no.) are copied automatically; add a *Field Mapping* row only when names differ.
- **Default Approver**, role labels, photos per row, overall-photo option.

## Editing a report by hand (visual editor)

The form has four simple sections: **Report Setup**, **Extra Header Info**, **Report Content** (the visual editor) and **Sign-Off**. Technical options are tucked away in two collapsed *Advanced* sections.

1. **New report**: the best template loads by itself (customer-specific > default). If the report is empty, the editor shows clickable template cards.
2. **Edit in the visual editor**
   - Click any text to type. Text blocks open a rich editor (bold, bullets…) – click **Done** when finished.
   - **Drag ⋮⋮** to reorder, or use ↑ ↓. **⧉** duplicates, **✕** deletes.
   - Add blocks with the buttons at the bottom (they go after the selected block), or hover between two blocks and click **+ insert**.
   - Press **Enter** in a checklist / test / table row to add the next row. Enter in a heading starts a text block under it.
   - Click **Done / N/A** or **Pass / Fail**. **All steps Done** / **All tests Pass** fill every empty one at once.
3. **Photos**
   - **+ Add Photos** – pick many photos at once. They fill the template's empty photo slots first (in order), then new photo blocks are added.
   - Or **drag photos from your computer** straight onto the editor (dropped on a block = inserted after it; dropped on an empty photo slot = fills it).
   - Click a thumbnail to replace it. *Photos per row* (1/2/3) and *Size* apply to the whole photo group.
   - Photos are compressed on upload. Empty photo slots are skipped when printing.
4. **Preview**
   - **Live Preview** shows the report side-by-side and updates as you type (your choice is remembered).
   - **PDF Preview** shows the exact PDF – including unsaved changes – with a Download button.
5. **Sign-Off**: pick the employees; name, designation and signature fill in.
6. **Print**: print format **Technical Report Blocks**, letterhead **No Letterhead**.
7. **Create ▸ Work Completion Report** (on an inspection report) copies the header, loads the WCR template and fills *Inspection Report Ref.*
8. **Report ▸ Save Layout as Template** turns any report into a new template (photos, statuses and readings are not copied).

Templates (**Technical Report Template** list) use the same visual editor.

### Block types

| Block | Prints as | Grouping |
|---|---|---|
| Heading | `1. Title` (auto-numbered; tick *no number* to skip) | – |
| Sub heading | `1.1 Title` | – |
| Text | rich text – paragraphs, bullets, bold | – |
| Table row (Key-Value) | 2-column table (*Item / Details*) | consecutive rows → one table |
| Table (3–4 columns) | any table, e.g. *Description / Model / Calibration Date* – the number of column headers on the first row sets the columns | consecutive rows → one table |
| Checklist | *Step / Status (Done, N/A) / Notes* | consecutive rows → one table |
| Test result | *Test / Expected / Actual / Pass-Fail* | consecutive rows → one table |
| Photos | photo + automatic "Fig. N – caption" | consecutive photos → one grid |
| Page break | forces a new page | – |

Rename a table's columns via the *Column headers* box on the first row (e.g. `Component, Inspection Type`).

## Header formats (logo, company / customer name, references)

**Report Header Format** list – one record per header style. A default **TSL Standard** is created on install.

- **Layout**: *Our Logo + Company Name* (classic), *Our Logo + Customer Logo*, *Customer Logo + Our Logo*, or *Company Name Only*.
- **Our Logo**, logo height, **Company Name** (English / Arabic) and an extra line (branch, licence no., "Approved contractor of …").
- **Customer Logo** – upload one, or leave empty to use the image on the report's Customer record. Tick **Show Customer Name** to print "Prepared for: …".
- **References** – e.g. Contract No., PO No., Call-off No. Printed in a strip under the logos **on every page**. Values here are defaults.
- **Footer** lines (address in English / Arabic) and the "Report No. | Page X of Y" line.
- **Colours** for tables/lines and headings.
- **Use Automatically for Customer** – that customer's reports get this header without anyone choosing it.

On a report: **Report Setup ▸ Header Format** picks the header (customer-specific > default, chosen automatically on new reports). The **Header References** section holds this report's contract / PO numbers – filled from the format, edit per report. **Report ▸ Save Header as Format** saves the current header and its references as a new format (e.g. one per customer contract). **Preview on Latest Report** on a header format shows it as a PDF. Templates can carry a header format too.

## Customising the PDF

Edit `tsl_reports/tsl_reports/print_format/technical_report_blocks/technical_report_blocks.html`:

- **Section 1 (CONFIG)** holds fallback header values (normally set in *Report Header Format* instead) and the **HEADER** list: each header row lists possible fieldnames on your DocType, and the first one with a value is printed. Add your real fieldnames there if they differ (for example `custom_job_no`).
- **Colours, fonts and margins** are in the `<style>` block. The `.print-format` margins control the PDF page margins.

After editing, run `python tools/sync_print_format.py`, then `bench --site <site> migrate`. The print format is a Standard format, so it can only be edited in the UI when Developer Mode is on. If you want a UI-editable copy, duplicate it from Print Format.

## Server notes

- PDFs need wkhtmltopdf **0.12.6 with patched qt**, the standard Frappe requirement. Without it the header and footer are not printed.
- To print the Arabic text, the server needs a font with Arabic glyphs. `fonts-dejavu` is usually already installed.

## Something missing? (repair)

If a list such as **Technical Report Template** is missing after an uninstall / re-install or a move between apps, run the normal install command again – it ends with a repair step. Or run it alone:

```bash
bench --site <site> execute tsl_reports.setup.repair.run
```

It re-registers the app, re-creates every TSL Reports DocType and the print format, re-adds the fields and any missing starter templates / phrases / header format, and prints a status list. It never deletes your data.

## Useful commands

```bash
bench --site <site> execute tsl_reports.setup.install.setup_fields       # re-create fields
bench --site <site> execute tsl_reports.setup.install.install_templates  # re-add missing starter templates
```

## Photo privacy

Photos are uploaded as public files so they always render in PDFs. To store them as private files, set `UPLOAD_PRIVATE = 1` at the top of `public/js/tr_block_editor.js` and rebuild.
# tsl_reports

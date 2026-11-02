// TSL Reports – visual block editor
// Renders a report's block table as a document-style editor:
// cards, drag-to-reorder, inline editing, photo upload (multi-select & drag-drop),
// live HTML preview and on-demand PDF preview.
//
// Usage:  tsl_reports.mount_editor(frm, { field: "tr_blocks", html_field: "tr_editor", preview: true })

frappe.provide("tsl_reports");

(() => {
	if (tsl_reports.BlockEditor) return; // already loaded
	const CDT = "Technical Report Block";
	const UPLOAD_PRIVATE = 0; // 1 = upload photos as private files
	const GROUPED = ["Checklist Row", "Test Row", "Key-Value", "Table Row", "Image"];

	const TYPES = {
		"Heading":       { label: __("Heading"),     short: "H1",  color: "#1F3864" },
		"Sub Heading":   { label: __("Sub heading"), short: "H2",  color: "#2E5C8A" },
		"Text":          { label: __("Text"),        short: "Text", color: "#5A6B7B" },
		"Image":         { label: __("Photos"),      short: "Photo", color: "#16835C" },
		"Checklist Row": { label: __("Checklist"),   short: "Step", color: "#8A5A00" },
		"Test Row":      { label: __("Test result"), short: "Test", color: "#7A3E9D" },
		"Key-Value":     { label: __("2-column row"), short: "Row",  color: "#A23B5A" },
		"Table Row":     { label: __("Table (3–4 columns)"), short: "Table", color: "#B5651D" },
		"Page Break":    { label: __("Page break"),  short: "Break", color: "#888" },
	};

	const esc = (s) => frappe.utils.escape_html(s == null ? "" : String(s));

	// ------------------------------------------------------------------ styles
	function inject_css() {
		if (document.getElementById("tre-css")) return;
		const css = `
.tre { --tre-blue:#1F4E79; }
.tre-toolbar { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:10px; }
.tre-toolbar .tre-sp { flex:1; }
.tre-layout.with-preview { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; }
@media (max-width: 991px) { .tre-layout.with-preview { grid-template-columns:1fr; } }
.tre-preview { display:none; }
.tre-layout.with-preview .tre-preview { display:block; }
.tre-preview .tre-pv-frame { width:100%; height:78vh; border:1px solid var(--border-color); border-radius:8px; background:#e9ecef; position:sticky; top:80px; }
.tre-preview .tre-pv-status { font-size:11px; color:var(--text-muted); margin-bottom:4px; min-height:16px; }
.tre-list { min-height:40px; }
.tre-card { display:flex; gap:8px; align-items:flex-start; border:1px solid var(--border-color); border-radius:8px;
            padding:8px 8px 8px 6px; background:var(--card-bg, #fff); position:relative; }
.tre-card.tre-cont { border-top-left-radius:0; border-top-right-radius:0; margin-top:-1px; }
.tre-card.tre-has-next { border-bottom-left-radius:0; border-bottom-right-radius:0; }
.tre-card.selected { border-color:var(--primary, #2490ef); box-shadow:0 0 0 2px rgba(36,144,239,.18); z-index:1; }
.tre-card.drop-before { box-shadow:0 -3px 0 0 var(--primary, #2490ef); }
.tre-card.drop-after { box-shadow:0 3px 0 0 var(--primary, #2490ef); }
.tre-card.is-heading { background:var(--subtle-fg, #f8fafc); }
.tre-handle { cursor:grab; color:var(--text-muted); padding:4px 2px; user-select:none; font-size:14px; line-height:1; letter-spacing:-2px; }
.tre-badge { font-size:10px; font-weight:600; padding:2px 7px; border-radius:10px; color:#fff; white-space:nowrap; margin-top:4px; min-width:42px; text-align:center; }
.tre-body { flex:1; min-width:0; }
.tre-actions { display:flex; gap:1px; opacity:.25; transition:opacity .15s; }
.tre-card:hover .tre-actions, .tre-card.selected .tre-actions { opacity:1; }
.tre-actions button { border:none; background:none; padding:2px 6px; color:var(--text-muted); border-radius:4px; font-size:13px; }
.tre-actions button:hover { background:var(--control-bg, #f3f3f3); color:var(--text-color); }
.tre-actions button.danger:hover { color:#c0392b; }
.tre-in { width:100%; border:1px solid transparent; background:transparent; padding:4px 6px; border-radius:5px; outline:none; color:var(--text-color); }
.tre-in:hover { border-color:var(--border-color); }
.tre-in:focus { border-color:var(--primary, #2490ef); background:var(--control-bg, #f6f7f8); }
.tre-in::placeholder { color:var(--text-light, #aaa); }
.tre-h .tre-in { font-size:16px; font-weight:600; }
.tre-sh .tre-in { font-size:14px; font-weight:600; }
.tre-num { color:var(--text-muted); font-weight:600; margin-right:2px; white-space:nowrap; padding-top:5px; }
.tre-row { display:flex; gap:6px; align-items:center; }
.tre-row > .grow { flex:1; min-width:0; }
.tre-seg { display:inline-flex; border:1px solid var(--border-color); border-radius:6px; overflow:hidden; flex-shrink:0; }
.tre-seg button { border:none; background:transparent; font-size:11px; padding:3px 9px; color:var(--text-muted); }
.tre-seg button + button { border-left:1px solid var(--border-color); }
.tre-seg button.on { background:var(--tre-blue); color:#fff; }
.tre-seg button.on.bad { background:#c0392b; }
.tre-text-view { padding:4px 6px; border-radius:5px; cursor:text; min-height:28px; border:1px solid transparent; }
.tre-text-view:hover { border-color:var(--border-color); }
.tre-text-view ul, .tre-text-view ol { margin-bottom:0; padding-left:20px; }
.tre-text-view p:last-child { margin-bottom:0; }
.tre-ph { color:var(--text-light, #aaa); font-style:italic; }
.tre-text-edit .ql-editor { min-height:80px; }
.tre-text-done { margin-top:4px; }
.tre-img { display:flex; gap:10px; align-items:flex-start; }
.tre-thumb { width:132px; height:96px; border-radius:6px; flex-shrink:0; cursor:pointer; overflow:hidden; position:relative;
             background:var(--control-bg, #f3f3f3); display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:11px; text-align:center; }
.tre-thumb img { width:100%; height:100%; object-fit:cover; }
.tre-thumb:hover::after { content:"${__("Replace")}"; position:absolute; inset:0; background:rgba(0,0,0,.45); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; }
.tre-meta { font-size:11px; color:var(--text-muted); display:flex; gap:8px; align-items:center; margin-top:4px; flex-wrap:wrap; }
.tre-pb { border-top:2px dashed var(--border-color); margin:10px 0 6px; text-align:center; }
.tre-pb span { position:relative; top:-10px; background:var(--card-bg, #fff); padding:0 8px; font-size:11px; color:var(--text-muted); }
.tre-gap { height:8px; position:relative; }
.tre-gap .tre-plus { display:none; position:absolute; left:50%; top:-7px; transform:translateX(-50%); z-index:2;
                     border:1px solid var(--border-color); background:var(--card-bg, #fff); border-radius:10px; font-size:11px; padding:0 8px; line-height:18px; color:var(--text-muted); }
.tre-gap:hover .tre-plus { display:block; }
.tre-palette { display:flex; flex-wrap:wrap; gap:6px; padding:10px; border:1px dashed var(--border-color); border-radius:8px; margin:8px 0; background:var(--subtle-fg, #fafbfc); }
.tre-palette .tre-hint { width:100%; font-size:11px; color:var(--text-muted); }
.tre-palette button .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:5px; }
.tre.files-over .tre-list { outline:2px dashed var(--primary, #2490ef); outline-offset:4px; border-radius:8px; }
.tre-drophint { font-size:11px; color:var(--text-muted); text-align:center; margin-top:6px; }
.tre-empty { text-align:center; padding:24px 10px; border:1px dashed var(--border-color); border-radius:10px; }
.tre-empty h5 { margin-bottom:4px; }
.tre-tpls { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:12px; }
.tre-tpl { border:1px solid var(--border-color); border-radius:8px; padding:10px 14px; background:var(--card-bg, #fff); cursor:pointer; text-align:left; min-width:200px; }
.tre-tpl:hover { border-color:var(--primary, #2490ef); }
.tre-tpl small { display:block; color:var(--text-muted); }
.tre-count { font-size:11px; color:var(--text-muted); }
.tre-gap.tight { height:0; }
.tre-gap.tight .tre-plus { top:-9px; }
@media (max-width: 600px) {
  .tre-card { flex-wrap:wrap; }
  .tre-body { order:3; flex-basis:100%; }
  .tre-actions { margin-left:auto; opacity:1; }
  .tre-row { flex-wrap:wrap; }
  .tre-row > .grow { flex-basis:100%; }
  .tre-img { flex-direction:column; }
  .tre-thumb { width:100%; height:180px; }
}
`;
		const el = document.createElement("style");
		el.id = "tre-css";
		el.textContent = css;
		document.head.appendChild(el);
	}

	// ------------------------------------------------------------------ editor
	class BlockEditor {
		constructor(frm, opts) {
			this.frm = frm;
			this.field = opts.field;
			this.html_field = opts.html_field;
			this.preview_enabled = !!opts.preview;
			this.template_picker = !!opts.template_picker;
			this.on_load_template = opts.on_load_template; // (frm, template_name, mode)
			this.on_choose_template = opts.on_choose_template; // (frm)
			this.on_wizard = opts.on_wizard; // (frm) – opens the Quick Report Wizard
			this.selected = null; // row name
			this.palette_at = null; // index where the inline palette is open
			this.editing_text = null; // row name with open text editor
			this.show_preview = false;
			try { this.show_preview = this.preview_enabled && localStorage.getItem("tre-preview") === "1"; } catch (e) { /* ignore */ }
			inject_css();
		}

		get wrapper() { return this.frm.fields_dict[this.html_field].$wrapper; }
		rows() { return this.frm.doc[this.field] || []; }
		row(name) { return this.rows().find((r) => r.name === name); }

		// --------------------------------------------------------- render
		render() {
			const $w = this.wrapper.empty();
			this.$root = $(`<div class="tre"></div>`).appendTo($w);
			this.render_toolbar();
			this.$layout = $(`<div class="tre-layout ${this.show_preview ? "with-preview" : ""}">
				<div class="tre-main"><div class="tre-list"></div><div class="tre-bottom"></div></div>
				<div class="tre-preview"><div class="tre-pv-status"></div><iframe class="tre-pv-frame"></iframe></div>
			</div>`).appendTo(this.$root);
			this.$list = this.$layout.find(".tre-list");
			this.render_list();
			this.bind_file_drop();
			if (this.show_preview) this.refresh_preview(true);
		}

		render_toolbar() {
			const n = this.rows().length;
			const $t = $(`<div class="tre-toolbar"></div>`).appendTo(this.$root);
			const btn = (label, cls, fn, title) => $(`<button class="btn btn-xs ${cls}" title="${esc(title || "")}">${label}</button>`)
				.appendTo($t).on("click", (e) => { e.preventDefault(); fn(); });

			if (this.template_picker && this.on_choose_template) btn(__("Load Template"), "btn-default", () => this.on_choose_template(this.frm));
			btn(`+ ${__("Add Photos")}`, "btn-default", () => this.pick_photos(this.insert_index()), __("Select several photos at once"));
			if (this.has_type("Checklist Row")) btn(__("All steps Done"), "btn-default", () => this.fill_status("Checklist Row", "Done"), __("Marks every checklist step without a status as Done"));
			if (this.has_type("Test Row")) btn(__("All tests Pass"), "btn-default", () => this.fill_status("Test Row", "Pass"), __("Marks every test without a result as Pass"));
			$(`<span class="tre-sp"></span><span class="tre-count">${n} ${n === 1 ? __("block") : __("blocks")}</span>`).appendTo($t);
			if (this.preview_enabled) {
				btn(this.show_preview ? __("Hide Preview") : __("Live Preview"), this.show_preview ? "btn-primary" : "btn-default", () => this.toggle_preview());
				btn(__("PDF Preview"), "btn-default", () => this.pdf_preview(), __("Shows the exact PDF, including unsaved changes"));
			}
		}

		has_type(t) { return this.rows().some((r) => r.block_type === t); }

		render_list() {
			const rows = this.rows();
			const $l = this.$list.empty();
			this.$layout.find(".tre-bottom").empty();

			if (!rows.length) {
				this.render_empty($l);
				this.render_palette(this.$layout.find(".tre-bottom"), 0, __("Or add your first block:"));
				return;
			}

			// numbering like the PDF
			let h = 0, s = 0;
			const nums = {};
			rows.forEach((r) => {
				if (r.block_type === "Heading" && !r.no_number) { h++; s = 0; nums[r.name] = `${h}.`; }
				if (r.block_type === "Sub Heading" && !r.no_number) { s++; nums[r.name] = `${h}.${s}`; }
			});

			let fig = 0;
			let head = null;
			rows.forEach((r, i) => {
				if (r.block_type === "Image" && r.image) fig++;
				const prev = rows[i - 1], next = rows[i + 1];
				const cont = prev && GROUPED.includes(r.block_type) && prev.block_type === r.block_type;
				this.render_gap($l, i, cont);
				const has_next = next && GROUPED.includes(r.block_type) && next.block_type === r.block_type;
				if (!cont) head = r;
				const $c = this.render_card(r, i, { num: nums[r.name], fig, cont, has_next, first_of_group: !cont, head });
				$l.append($c);
			});
			this.render_gap($l, rows.length);

			const sel = this.selected && this.row(this.selected);
			const hint = sel ? __("New blocks are added after the selected block") : __("New blocks are added at the end");
			this.render_palette(this.$layout.find(".tre-bottom"), this.insert_index(), hint);
			$(`<div class="tre-drophint">${__("Tip: drag photos from your computer straight onto the blocks. Drag ⋮⋮ to reorder.")}</div>`)
				.appendTo(this.$layout.find(".tre-bottom"));
		}

		render_empty($l) {
			const $e = $(`<div class="tre-empty">
				<h5>${__("This report is empty")}</h5>
				<div class="text-muted small">${__("Use the wizard (tick boxes, almost no typing) or start from a template.")}</div>
				<div class="tre-tpls"></div></div>`).appendTo($l);
			if (this.on_wizard) {
				$(`<div class="tre-tpl" style="border-color:var(--primary,#2490ef);background:rgba(36,144,239,.06)"><b>✨ ${__("Quick Report Wizard")}</b><small>${__("Recommended – tick findings, add photos, done")}</small></div>`)
					.appendTo($e.find(".tre-tpls")).on("click", () => this.on_wizard(this.frm));
			}
			if (!this.template_picker) { $e.find(".tre-tpls").remove(); $e.find(".small").text(__("Add blocks below.")); return; }
			frappe.db.get_list("Technical Report Template", {
				fields: ["name", "report_type", "customer"], filters: { disabled: 0 }, limit: 50, order_by: "report_type asc, name asc",
			}).then((tpls) => {
				const $t = $e.find(".tre-tpls");
				tpls.forEach((t) => {
					$(`<div class="tre-tpl"><b>${esc(t.name)}</b><small>${esc(__(t.report_type))}${t.customer ? " · " + esc(t.customer) : ""}</small></div>`)
						.appendTo($t).on("click", () => this.on_load_template && this.on_load_template(this.frm, t.name, "Replace"));
				});
			});
		}

		render_gap($l, index, tight) {
			if (this.palette_at === index) {
				const $p = $(`<div></div>`).appendTo($l);
				this.render_palette($p, index, __("Insert here:"), true);
				return;
			}
			const $g = $(`<div class="tre-gap${tight ? " tight" : ""}"><span class="tre-plus">+ ${__("insert")}</span></div>`).appendTo($l);
			$g.find(".tre-plus").on("click", () => { this.palette_at = index; this.render_list(); });
		}

		render_palette($p, index, hint, closable) {
			const $pal = $(`<div class="tre-palette"><div class="tre-hint">${esc(hint)}</div></div>`).appendTo($p);
			Object.entries(TYPES).forEach(([t, d]) => {
				$(`<button class="btn btn-default btn-xs"><span class="dot" style="background:${d.color}"></span>${esc(d.label)}</button>`)
					.appendTo($pal).on("click", (e) => {
						e.preventDefault();
						this.palette_at = null;
						if (t === "Image") return this.pick_photos(index);
						const row = this.add(t, index);
						this.select(row.name, true);
					});
			});
			if (closable) {
				$(`<button class="btn btn-link btn-xs">${__("Cancel")}</button>`).appendTo($pal)
					.on("click", (e) => { e.preventDefault(); this.palette_at = null; this.render_list(); });
			}
		}

		// --------------------------------------------------------- cards
		render_card(r, i, ctx) {
			const d = TYPES[r.block_type] || TYPES.Text;
			const classes = ["tre-card"];
			if (ctx.cont) classes.push("tre-cont");
			if (ctx.has_next) classes.push("tre-has-next");
			if (this.selected === r.name) classes.push("selected");
			if (["Heading", "Sub Heading"].includes(r.block_type)) classes.push("is-heading");

			const $c = $(`<div class="${classes.join(" ")}" data-name="${esc(r.name)}">
				<div class="tre-handle" draggable="true" title="${__("Drag to reorder")}">⋮⋮</div>
				<div class="tre-badge" style="background:${d.color}">${esc(d.short)}</div>
				<div class="tre-body"></div>
				<div class="tre-actions">
					<button data-act="up" title="${__("Move up")}">↑</button>
					<button data-act="down" title="${__("Move down")}">↓</button>
					<button data-act="dup" title="${__("Duplicate")}">⧉</button>
					<button data-act="del" class="danger" title="${__("Delete")}">✕</button>
				</div></div>`);
			const $b = $c.find(".tre-body");

			const input = (field, placeholder, cls = "") => {
				const $i = $(`<input class="tre-in ${cls}" data-field="${field}" placeholder="${esc(placeholder)}">`).val(r[field] || "");
				$i.on("input", () => this.set(r, field, $i.val()));
				return $i;
			};
			const seg = (options, bad) => {
				const $s = $(`<div class="tre-seg"></div>`);
				options.forEach((o) => {
					$(`<button class="${r.status === o ? "on" : ""} ${o === bad ? "bad" : ""}">${esc(__(o))}</button>`).appendTo($s)
						.on("click", (e) => {
							e.preventDefault();
							const v = r.status === o ? "" : o;
							this.set(r, "status", v);
							$s.find("button").removeClass("on");
							if (v) $(e.currentTarget).addClass("on");
						});
				});
				return $s;
			};

			switch (r.block_type) {
				case "Heading":
				case "Sub Heading": {
					const $row = $(`<div class="tre-row ${r.block_type === "Heading" ? "tre-h" : "tre-sh"}"></div>`).appendTo($b);
					if (ctx.num) $row.append(`<span class="tre-num">${ctx.num}</span>`);
					$row.append($(`<div class="grow"></div>`).append(input("title", r.block_type === "Heading" ? __("Section heading, e.g. Inspection Findings") : __("Sub heading"))));
					const $no = $(`<label class="tre-meta" style="margin:0"><input type="checkbox" ${r.no_number ? "checked" : ""}> ${__("no number")}</label>`).appendTo($row);
					$no.find("input").on("change", (e) => { this.set(r, "no_number", e.target.checked ? 1 : 0); this.render_list(); });
					break;
				}
				case "Text":
					this.render_text($b, r);
					break;
				case "Checklist Row": {
					const $row = $(`<div class="tre-row"></div>`).appendTo($b);
					$row.append($(`<div class="grow"></div>`).append(input("title", __("Step performed"))));
					$row.append(seg(["Done", "N/A"]));
					$b.append(input("value", __("Notes / observations (optional)"), "small"));
					break;
				}
				case "Test Row": {
					const $row = $(`<div class="tre-row"></div>`).appendTo($b);
					$row.append($(`<div class="grow"></div>`).append(input("title", __("Test / verification"))));
					$row.append(seg(["Pass", "Fail"], "Fail"));
					const $r2 = $(`<div class="tre-row"></div>`).appendTo($b);
					$r2.append($(`<div class="grow"></div>`).append(input("expected", __("Expected result"), "small")));
					$r2.append($(`<div class="grow"></div>`).append(input("value", __("Actual reading"), "small")));
					break;
				}
				case "Key-Value": {
					const $row = $(`<div class="tre-row"></div>`).appendTo($b);
					$row.append($(`<div class="grow"></div>`).append(input("title", __("Item"))));
					$row.append($(`<div class="grow"></div>`).append(input("value", __("Details"))));
					if (ctx.first_of_group) $b.append(input("col_labels", __("Column headers (optional), e.g. Component, Inspection Type"), "small"));
					break;
				}
				case "Table Row": {
					const labels = (ctx.head.col_labels || "").split(",").map((x) => x.trim()).filter(Boolean);
					const n = labels.length ? Math.min(4, Math.max(2, labels.length)) : 3;
					if (ctx.first_of_group) {
						const $h = $(`<input class="tre-in small" data-field="col_labels" placeholder="${__("Column headers, comma separated – e.g. Description, Model, Calibration Date")}">`)
							.val(r.col_labels || "");
						$h.on("input", () => this.set(r, "col_labels", $h.val()));
						$h.on("change", () => this.render_list()); // column count may change
						$b.append($(`<div class="tre-meta" style="margin:0 0 4px">${__("Columns")}: </div>`).append($h));
					}
					const $row = $(`<div class="tre-row"></div>`).appendTo($b);
					["title", "value", "expected", "col4"].slice(0, n).forEach((f, i) => {
						$row.append($(`<div class="grow"></div>`).append(input(f, labels[i] || __("Column {0}", [i + 1]))));
					});
					break;
				}
				case "Image":
					this.render_image($b, r, ctx);
					break;
				case "Page Break":
					$b.append(`<div class="tre-pb"><span>${__("Page break – next block starts on a new page")}</span></div>`);
					break;
			}

			// keyboard: Enter in a table row adds another row of the same type
			$b.on("keydown", "input.tre-in", (e) => {
				if (e.key !== "Enter") return;
				e.preventDefault();
				const t = r.block_type;
				const idx = this.rows().indexOf(r) + 1;
				if (["Checklist Row", "Test Row", "Key-Value", "Table Row"].includes(t)) {
					const nr = this.add(t, idx);
					this.select(nr.name, true);
				} else if (t === "Heading" || t === "Sub Heading") {
					const nr = this.add("Text", idx);
					this.editing_text = nr.name;
					this.select(nr.name, false);
				} else if (t === "Image") {
					const next = this.rows()[idx];
					if (next) this.select(next.name, true);
				}
			});

			$c.on("mousedown", (e) => {
				if (this.selected !== r.name) {
					this.selected = r.name;
					this.$list.find(".tre-card.selected").removeClass("selected");
					$c.addClass("selected");
					const $hint = this.$layout.find(".tre-bottom .tre-hint");
					$hint.text(__("New blocks are added after the selected block"));
				}
			});
			$c.find(".tre-actions button").on("click", (e) => {
				e.preventDefault();
				const act = $(e.currentTarget).data("act");
				const idx = this.rows().indexOf(r);
				if (act === "up") this.move(idx, idx - 1);
				if (act === "down") this.move(idx, idx + 1);
				if (act === "dup") this.duplicate(r);
				if (act === "del") this.remove(r);
			});
			this.bind_drag($c, r);
			return $c;
		}

		render_text($b, r) {
			if (this.editing_text === r.name) {
				const $ed = $(`<div class="tre-text-edit"></div>`).appendTo($b);
				const ctrl = frappe.ui.form.make_control({
					df: { fieldtype: "Text Editor", fieldname: `tre_${r.name}`, label: "" },
					parent: $ed, render_input: true, only_input: true,
				});
				ctrl.set_value(r.content || "");
				const sync = () => this.set(r, "content", ctrl.get_value());
				const hook = () => {
					if (ctrl.quill) {
						ctrl.quill.on("text-change", frappe.utils.debounce(sync, 300));
						ctrl.quill.focus();
					} else {
						setTimeout(hook, 100);
					}
				};
				hook();
				$(`<button class="btn btn-xs btn-primary tre-text-done">${__("Done")}</button>`).appendTo($b)
					.on("click", (e) => { e.preventDefault(); sync(); this.editing_text = null; this.render_list(); });
				return;
			}
			const html = (r.content || "").replace(/<p><br><\/p>/g, "").trim();
			const $v = $(`<div class="tre-text-view"></div>`).appendTo($b);
			if (html && $("<div>").html(html).text().trim()) $v.html(html);
			else $v.html(`<span class="tre-ph">${__("Click to write text or bullet points…")}</span>`);
			$v.on("click", () => { this.editing_text = r.name; this.selected = r.name; this.render_list(); });
		}

		render_image($b, r, ctx) {
			const $wrap = $(`<div class="tre-img"></div>`).appendTo($b);
			const $th = $(`<div class="tre-thumb">${r.image ? `<img src="${esc(r.image)}">` : __("Click to add photo")}</div>`).appendTo($wrap);
			$th.on("click", () => this.pick_photos(null, r));
			const $right = $(`<div class="grow" style="flex:1;min-width:0"></div>`).appendTo($wrap);
			const $cap = $(`<input class="tre-in" data-field="title" placeholder="${__("Caption, e.g. Fan supply board (full view)")}">`).val(r.title || "");
			$cap.on("input", () => this.set(r, "title", $cap.val()));
			$right.append($cap);
			const $meta = $(`<div class="tre-meta"></div>`).appendTo($right);
			if (r.image) $meta.append(`<span>${__("Fig.")} ${ctx.fig}</span>`);
			if (ctx.first_of_group) {
				const cols = String(r.columns || "2");
				const $s = $(`<span>${__("Photos per row")}: </span>`).appendTo($meta);
				const $seg = $(`<div class="tre-seg"></div>`).appendTo($s);
				["1", "2", "3"].forEach((c) => $(`<button class="${cols === c ? "on" : ""}">${c}</button>`).appendTo($seg)
					.on("click", (e) => { e.preventDefault(); this.set_group(r, "columns", c); this.render_list(); }));
				const size = r.image_height || "Medium";
				const $z = $(`<span>${__("Size")}: </span>`).appendTo($meta);
				const $seg2 = $(`<div class="tre-seg"></div>`).appendTo($z);
				["Small", "Medium", "Large"].forEach((c) => $(`<button class="${size === c ? "on" : ""}">${__(c)}</button>`).appendTo($seg2)
					.on("click", (e) => { e.preventDefault(); this.set_group(r, "image_height", c); this.render_list(); }));
			}
			if (!r.image) $meta.append(`<span class="tre-ph">${__("No photo yet – this block is skipped when printing")}</span>`);
		}

		// --------------------------------------------------------- data ops
		set(r, field, value) {
			if ((r[field] || "") === (value || "")) return;
			r[field] = value;
			this.frm.dirty();
			this.after_change(false);
		}

		set_group(r, field, value) {
			// apply to the whole run of consecutive same-type blocks
			const rows = this.rows();
			let i = rows.indexOf(r);
			while (i > 0 && rows[i - 1].block_type === r.block_type) i--;
			for (; i < rows.length && rows[i].block_type === r.block_type; i++) rows[i][field] = value;
			this.frm.dirty();
			this.after_change(false);
		}

		fill_status(type, status) {
			let n = 0;
			this.rows().forEach((r) => { if (r.block_type === type && !r.status) { r.status = status; n++; } });
			this.frm.dirty();
			this.after_change(true);
			frappe.show_alert({ message: __("{0} rows marked {1}", [n, __(status)]), indicator: "green" });
		}

		insert_index() {
			const rows = this.rows();
			const sel = this.selected && this.row(this.selected);
			return sel ? rows.indexOf(sel) + 1 : rows.length;
		}

		add(type, index, values = {}) {
			const row = frappe.model.add_child(this.frm.doc, CDT, this.field);
			const rows = this.rows();
			const prev = rows[index - 1];
			Object.assign(row, { block_type: type }, values);
			if (type === "Image" && prev && prev.block_type === "Image" && !values.columns) {
				row.columns = prev.columns;
				row.image_height = prev.image_height;
			}
			rows.splice(rows.indexOf(row), 1);
			rows.splice(Math.min(index, rows.length), 0, row);
			this.renumber();
			this.frm.dirty();
			this.after_change(true);
			return row;
		}

		duplicate(r) {
			const vals = {};
			tsl_reports.BLOCK_FIELDS.forEach((f) => { if (f !== "block_type" && r[f] != null) vals[f] = r[f]; });
			const nr = this.add(r.block_type, this.rows().indexOf(r) + 1, vals);
			this.select(nr.name, true);
		}

		remove(r) {
			const doit = () => {
				const idx = this.rows().indexOf(r);
				frappe.model.clear_doc(r.doctype, r.name);
				this.frm.doc[this.field] = this.rows().filter((x) => x.name !== r.name);
				this.renumber();
				const next = this.rows()[idx] || this.rows()[idx - 1];
				this.selected = next ? next.name : null;
				this.frm.dirty();
				this.after_change(true);
			};
			const has_content = r.title || r.content || r.image || r.value;
			if (has_content && r.block_type !== "Page Break") {
				frappe.confirm(__("Delete this {0} block?", [(TYPES[r.block_type] || {}).label || r.block_type]), doit);
			} else {
				doit();
			}
		}

		move(from, to) {
			const rows = this.rows();
			if (to < 0 || to >= rows.length || from === to) return;
			const [r] = rows.splice(from, 1);
			rows.splice(to, 0, r);
			this.renumber();
			this.frm.dirty();
			this.after_change(true);
		}

		renumber() { this.rows().forEach((r, i) => { r.idx = i + 1; }); }

		select(name, focus) {
			this.selected = name;
			this.render_list();
			if (focus) {
				const $c = this.$list.find(`.tre-card[data-name="${CSS.escape(name)}"]`);
				const $i = $c.find("input.tre-in").first();
				if ($i.length) $i.trigger("focus");
				if ($c.length && $c[0].scrollIntoView) $c[0].scrollIntoView({ block: "nearest" });
			}
		}

		after_change(structural) {
			if (structural) {
				this.render_toolbar_only();
				this.render_list();
			}
			// keep the advanced grid in sync (it lives in a collapsed section)
			clearTimeout(this._grid_t);
			this._grid_t = setTimeout(() => {
				this._silent = true;
				this.frm.refresh_field(this.field);
				this._silent = false;
			}, 600);
			if (this.show_preview) this.refresh_preview();
		}

		render_toolbar_only() {
			const $old = this.$root.find(".tre-toolbar");
			const $tmp = $("<div>");
			const root = this.$root;
			this.$root = $tmp;
			this.render_toolbar();
			this.$root = root;
			$old.replaceWith($tmp.children());
		}

		// --------------------------------------------------------- drag & drop
		bind_drag($c, r) {
			const $h = $c.find(".tre-handle");
			$h.on("dragstart", (e) => {
				this._drag = r.name;
				const dt = e.originalEvent.dataTransfer;
				dt.effectAllowed = "move";
				dt.setData("text/plain", r.name);
				if (dt.setDragImage) dt.setDragImage($c[0], 20, 20);
			});
			$h.on("dragend", () => { this._drag = null; this.$list.find(".drop-before,.drop-after").removeClass("drop-before drop-after"); });
			$c.on("dragover", (e) => {
				if (!this._drag) return;
				e.preventDefault();
				const rect = $c[0].getBoundingClientRect();
				const after = e.originalEvent.clientY > rect.top + rect.height / 2;
				this.$list.find(".drop-before,.drop-after").removeClass("drop-before drop-after");
				$c.addClass(after ? "drop-after" : "drop-before");
			});
			$c.on("drop", (e) => {
				if (!this._drag) return;
				e.preventDefault();
				e.stopPropagation();
				const rows = this.rows();
				const from = rows.findIndex((x) => x.name === this._drag);
				let to = rows.indexOf(r) + ($c.hasClass("drop-after") ? 1 : 0);
				if (from < to) to--;
				this._drag = null;
				this.move(from, to);
			});
		}

		bind_file_drop() {
			const el = this.$root[0];
			const has_files = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
			el.addEventListener("dragover", (e) => { if (has_files(e)) { e.preventDefault(); this.$root.addClass("files-over"); } });
			el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) this.$root.removeClass("files-over"); });
			el.addEventListener("drop", (e) => {
				if (!has_files(e)) return;
				e.preventDefault();
				this.$root.removeClass("files-over");
				const card = e.target.closest && e.target.closest(".tre-card");
				let idx = this.rows().length;
				if (card) {
					const r = this.row(card.dataset.name);
					// dropping onto an empty photo block fills it
					if (r && r.block_type === "Image" && !r.image && e.dataTransfer.files.length === 1) {
						return this.upload_files(e.dataTransfer.files, null, r);
					}
					idx = this.rows().indexOf(r) + 1;
				}
				this.upload_files(e.dataTransfer.files, idx);
			});
		}

		// --------------------------------------------------------- photos
		pick_photos(index, replace_row) {
			const $f = $(`<input type="file" accept="image/*" ${replace_row ? "" : "multiple"} style="display:none">`).appendTo(document.body);
			$f.on("change", () => {
				this.upload_files($f[0].files, index, replace_row);
				$f.remove();
			});
			$f.trigger("click");
		}

		async upload_files(files, index, replace_row) {
			files = Array.from(files || []).filter((f) => /^image\//.test(f.type));
			if (!files.length) return frappe.show_alert({ message: __("Please choose image files"), indicator: "orange" });

			// fill empty photo placeholders (from templates) first, in order
			const start = index == null ? this.rows().length : index;
			const placeholders = replace_row ? [replace_row] : this.empty_image_run(start);
			let at = start;
			let done = 0;
			frappe.show_progress(__("Uploading photos"), 0, files.length, __("Please wait…"));
			try {
				for (const f of files) {
					const url = await this.upload(f);
					const target = placeholders.shift();
					if (target) {
						target.image = url;
						this.frm.dirty();
						at = this.rows().indexOf(target) + 1;
					} else {
						this.add("Image", at, { image: url, title: "" });
						at++;
					}
					done++;
					frappe.show_progress(__("Uploading photos"), done, files.length, `${done} / ${files.length}`);
				}
			} catch (e) {
				console.error(e);
				frappe.msgprint(__("Upload failed: {0}", [e.message || e]));
			} finally {
				frappe.hide_progress();
				this.after_change(true);
				if (done) frappe.show_alert({ message: __("{0} photo(s) added – add a caption to each", [done]), indicator: "green" });
			}
		}

		empty_image_run(index) {
			// empty photo placeholders (e.g. from a template) after index, else anywhere in the report
			const empty = (r) => r.block_type === "Image" && !r.image;
			const rows = this.rows();
			const after = rows.slice(index).filter(empty);
			return after.length ? after : rows.filter(empty);
		}

		async upload(file) {
			const fd = new FormData();
			fd.append("file", file, file.name);
			fd.append("is_private", UPLOAD_PRIVATE);
			fd.append("folder", "Home/Attachments");
			fd.append("optimize", 1);
			if (!this.frm.is_new()) {
				fd.append("doctype", this.frm.doctype);
				fd.append("docname", this.frm.docname);
			}
			const res = await fetch("/api/method/upload_file", {
				method: "POST",
				headers: { "X-Frappe-CSRF-Token": frappe.csrf_token, Accept: "application/json" },
				body: fd,
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok || !j.message) {
				let msg = res.statusText;
				try { msg = JSON.parse(JSON.parse(j._server_messages)[0]).message; } catch (e) { /* ignore */ }
				throw new Error(msg || "Upload failed");
			}
			return j.message.file_url;
		}

		// --------------------------------------------------------- preview
		toggle_preview() {
			this.show_preview = !this.show_preview;
			try { localStorage.setItem("tre-preview", this.show_preview ? "1" : "0"); } catch (e) { /* ignore */ }
			this.render();
		}

		refresh_preview(now) {
			clearTimeout(this._pv_t);
			const run = () => {
				const seq = (this._pv_seq = (this._pv_seq || 0) + 1); // ignore late, out-of-order replies
				const $st = this.$layout.find(".tre-pv-status").text(__("Updating preview…"));
				frappe.call({
					method: "tsl_reports.api.preview_html",
					args: { doc: this.frm.doc },
					callback: (r) => {
						if (seq !== this._pv_seq) return;
						const frame = this.$layout.find(".tre-pv-frame")[0];
						if (!frame || r.message == null) return;
						// keep scroll position between refreshes
						let y = 0;
						try { y = frame.contentWindow.scrollY; } catch (e) { /* ignore */ }
						frame.onload = () => { try { frame.contentWindow.scrollTo(0, y); } catch (e) { /* ignore */ } };
						frame.srcdoc = r.message;
						$st.html(`${__("Preview – page breaks and page numbers are shown in PDF Preview")} · <a href="#" class="tre-pv-reload">${__("Refresh")}</a>`);
						$st.find(".tre-pv-reload").on("click", (e) => { e.preventDefault(); this.refresh_preview(true); });
					},
					error: (r) => {
						if (seq !== this._pv_seq) return;
						$st.html(`<span class="text-danger">${__("Preview failed – use PDF Preview, and send the error shown to your administrator.")}</span>`);
					},
				});
			};
			if (now) run();
			else this._pv_t = setTimeout(run, 1200);
		}

		pdf_preview() {
			frappe.call({
				method: "tsl_reports.api.preview_pdf",
				args: { doc: this.frm.doc },
				freeze: true,
				freeze_message: __("Generating PDF…"),
				callback: (r) => {
					if (!r.message) return;
					const bytes = Uint8Array.from(atob(r.message), (c) => c.charCodeAt(0));
					const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
					const d = new frappe.ui.Dialog({ title: __("PDF Preview"), size: "extra-large" });
					$(d.body).html(`<iframe src="${url}" style="width:100%;height:78vh;border:0"></iframe>`);
					d.set_primary_action(__("Download"), () => {
						const a = document.createElement("a");
						a.href = url;
						a.download = `${this.frm.doc.name || "report"}.pdf`;
						a.click();
					});
					d.onhide = () => setTimeout(() => URL.revokeObjectURL(url), 1000);
					d.show();
				},
			});
		}
	}

	// ------------------------------------------------------------------ public API
	tsl_reports.BLOCK_FIELDS = ["block_type", "title", "content", "value", "expected", "status",
		"image", "columns", "image_height", "col_labels", "no_number", "col4"];
	tsl_reports.BlockEditor = BlockEditor;

	tsl_reports.mount_editor = function (frm, opts) {
		if (!frm.fields_dict[opts.html_field]) return null;
		if (!frm.__tre || frm.__tre.frm !== frm) frm.__tre = new BlockEditor(frm, opts);
		frm.__tre.render();
		return frm.__tre;
	};

	tsl_reports.rerender = function (frm) {
		const ed = frm.__tre;
		if (!ed || ed._silent) return;
		clearTimeout(ed._rr);
		ed._rr = setTimeout(() => ed.render(), 250);
	};

	// edits made in the advanced grid -> refresh the visual editor
	const rr = (frm) => tsl_reports.rerender(frm);
	const handlers = { tr_blocks_remove: rr, tr_blocks_move: rr, blocks_remove: rr, blocks_move: rr };
	tsl_reports.BLOCK_FIELDS.forEach((f) => { handlers[f] = rr; });
	frappe.ui.form.on(CDT, handlers);

	// header references / extra header rows changed -> refresh live preview
	const pv = (frm) => { if (frm.__tre && frm.__tre.show_preview) frm.__tre.refresh_preview(); };
	frappe.ui.form.on("Technical Report Header Field", { label: pv, value: pv, full_width: pv,
		tr_header_refs_remove: pv, tr_extra_fields_remove: pv });
})();

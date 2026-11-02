// TSL Reports – Quick Report Wizard
// Step-by-step, tick-box report writing: Job → Complaint → Findings → Actions → Photos → Conclusion → Sign-off.
// Usage: tsl_reports.open_wizard(frm)

frappe.provide("tsl_reports");

(() => {
	if (tsl_reports.Wizard) return;

	const STEPS = [
		{ key: "job", label: __("Job"), hint: __("Who and what is this report for?") },
		{ key: "complaint", label: __("Complaint"), hint: __("What was reported and how was it inspected?") },
		{ key: "findings", label: __("Findings"), hint: __("Tick everything you found. Add your own if it's not in the list.") },
		{ key: "actions", label: __("Actions"), hint: __("Recommended actions are ticked automatically from your findings – adjust as needed.") },
		{ key: "photos", label: __("Photos"), hint: __("Add photos and a short caption for each.") },
		{ key: "conclusion", label: __("Conclusion"), hint: __("Pick the outcome – the text is written for you and can be edited.") },
		{ key: "signoff", label: __("Sign-off"), hint: __("Who inspected and who approves?") },
	];
	const esc = (s) => frappe.utils.escape_html(s == null ? "" : String(s));
	const UPLOAD_PRIVATE = 0;

	function inject_css() {
		if (document.getElementById("trw-css")) return;
		const el = document.createElement("style");
		el.id = "trw-css";
		el.textContent = `
.trw-steps { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:14px; }
.trw-step { flex:1; min-width:84px; text-align:center; font-size:12px; padding:6px 4px; border-radius:6px; cursor:pointer;
            background:var(--control-bg, #f3f3f3); color:var(--text-muted); border:1px solid transparent; }
.trw-step.done { color:var(--text-color); }
.trw-step.done::before { content:"✓ "; color:#16835C; }
.trw-step.active { background:var(--primary, #2490ef); color:#fff; }
.trw-hint { color:var(--text-muted); margin:-4px 0 12px; }
.trw-body { min-height:340px; }
.trw-nav { display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:12px; margin-top:16px; }
.trw-sec { font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.4px; color:var(--text-muted); margin:14px 0 6px; }
.trw-item { display:flex; gap:10px; align-items:flex-start; padding:7px 10px; border:1px solid var(--border-color); border-radius:7px;
            margin-bottom:5px; cursor:pointer; background:var(--card-bg, #fff); }
.trw-item:hover { border-color:var(--gray-400, #c0c6cc); }
.trw-item.on { border-color:var(--primary, #2490ef); background:rgba(36,144,239,.06); }
.trw-item input[type=checkbox], .trw-item input[type=radio] { margin-top:3px; flex-shrink:0; width:16px; height:16px; }
.trw-item .txt { flex:1; }
.trw-item .det { margin-top:5px; }
.trw-item .det input { width:100%; max-width:420px; }
.trw-pill { font-size:10px; padding:1px 7px; border-radius:9px; background:#E6F4EA; color:#16835C; margin-left:6px; white-space:nowrap; }
.trw-pill.custom { background:#FFF4E5; color:#8A5A00; }
.trw-tools { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px; }
.trw-tools input[type=search] { flex:1; min-width:180px; }
.trw-add { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:10px; padding:10px; border:1px dashed var(--border-color); border-radius:7px; }
.trw-add input[type=text] { flex:1; min-width:220px; }
.trw-text { width:100%; min-height:90px; }
.trw-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:10px; }
.trw-photo { border:1px solid var(--border-color); border-radius:8px; overflow:hidden; background:var(--card-bg, #fff); }
.trw-photo .im { height:120px; background:#eee center/cover no-repeat; position:relative; }
.trw-photo .im .cover { position:absolute; left:6px; top:6px; background:#1F4E79; color:#fff; font-size:10px; padding:1px 6px; border-radius:8px; }
.trw-photo .ctl { padding:6px; }
.trw-photo .ctl input { width:100%; font-size:12px; }
.trw-photo .row2 { display:flex; justify-content:space-between; margin-top:4px; }
.trw-photo .row2 button { border:none; background:none; color:var(--text-muted); padding:0 4px; }
.trw-drop { border:2px dashed var(--border-color); border-radius:10px; padding:22px; text-align:center; color:var(--text-muted); margin-bottom:12px; }
.trw-drop.over { border-color:var(--primary, #2490ef); background:rgba(36,144,239,.05); }
.trw-fields { display:grid; grid-template-columns:1fr 1fr; gap:4px 16px; }
@media (max-width: 700px) { .trw-fields { grid-template-columns:1fr; } }
.trw-box { border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:12px; }
.trw-box h6 { margin:0 0 8px; }
.trw-summary td { padding:3px 10px 3px 0; }
`;
		document.head.appendChild(el);
	}

	class Wizard {
		constructor(frm) {
			this.frm = frm;
			this.step = 0;
			this.visited = new Set([0]);
			inject_css();
		}

		async open() {
			const r = await frappe.call({ method: "tsl_reports.wizard.get_wizard_context", freeze: true, freeze_message: __("Opening wizard…") });
			this.ctx = r.message;
			this.byName = {};
			this.ctx.phrases.forEach((p) => { this.byName[p.name] = p; });
			this.state = this.load_state() || this.fresh_state();

			this.d = new frappe.ui.Dialog({
				title: __("Quick Report Wizard"),
				size: "extra-large",
				fields: [{ fieldtype: "HTML", fieldname: "body" }],
			});
			this.$w = this.d.fields_dict.body.$wrapper;
			this.d.show();
			this.render();
		}

		// ---------------------------------------------------------------- state
		fresh_state() {
			const defaults = (type) => {
				const o = {};
				this.phrases(type).filter((p) => p.default_checked).forEach((p) => { o[p.name] = { detail: "" }; });
				return o;
			};
			const concl = this.phrases("Conclusion").find((p) => p.default_checked) || this.phrases("Conclusion")[0];
			return {
				equipment: "",
				complaint: defaults("Complaint"), complaint_text: "", complaint_manual: false,
				assessment: defaults("Assessment"), assessment_text: "", assessment_manual: false,
				findings: {}, custom_findings: [],
				actions: {}, custom_actions: [], actions_off: {}, actions_init: false,
				photos: [], photo_columns: String(this.ctx.photo_columns || "2"), overall_photo_first: !!this.ctx.overall_photo_first,
				conclusion: concl ? concl.name : null, conclusion_text: "", conclusion_manual: false,
				inspected_by: this.ctx.me || null, approved_by: this.ctx.default_approver || null,
				show_all: false,
			};
		}

		load_state() {
			try {
				const j = JSON.parse(this.frm.doc.tr_wizard_data || "{}");
				if (j && j.state) return Object.assign(this.fresh_state(), j.state);
			} catch (e) { /* ignore */ }
			return null;
		}

		equipment() {
			const hf = this.ctx.header_fields.find((f) => /equipment/i.test(f.label) || f.fieldname === "equipment_type");
			return ((hf && this.frm.doc[hf.fieldname]) || this.state.equipment || "").toString();
		}

		applies(p) {
			if (this.state.show_all || !p.equipment_types) return true;
			const eq = this.equipment().toLowerCase();
			if (!eq) return true;
			return p.equipment_types.split(",").some((t) => t.trim() && eq.includes(t.trim().toLowerCase()));
		}

		phrases(type) { return this.ctx.phrases.filter((p) => p.phrase_type === type); }

		resolve(text, detail) {
			return (text || "").replace(/\{detail\}/g, (detail || "").trim() || "[…]");
		}

		equipment_phrase() {
			const get = (re) => {
				const f = this.ctx.header_fields.find((h) => re.test(h.label));
				return f ? (this.frm.doc[f.fieldname] || "").toString().trim() : "";
			};
			const s = [get(/manufacturer|make|brand/i), get(/equipment/i) || this.state.equipment].filter(Boolean).join(" ");
			return s || __("unit");
		}

		// ---------------------------------------------------------------- frame
		render() {
			const s = STEPS[this.step];
			this.$w.html(`
				<div class="trw-steps">${STEPS.map((x, i) => `<div class="trw-step ${i === this.step ? "active" : ""} ${this.visited.has(i) && i !== this.step ? "done" : ""}" data-i="${i}">${i + 1}. ${esc(x.label)}</div>`).join("")}</div>
				<div class="trw-hint">${esc(s.hint)}</div>
				<div class="trw-body"></div>
				<div class="trw-nav">
					<button class="btn btn-default btn-sm trw-back" ${this.step === 0 ? "disabled" : ""}>← ${__("Back")}</button>
					<span class="text-muted small">${__("Step {0} of {1}", [this.step + 1, STEPS.length])}</span>
					${this.step < STEPS.length - 1
						? `<button class="btn btn-primary btn-sm trw-next">${__("Next")} →</button>`
						: `<button class="btn btn-primary btn-sm trw-finish">✓ ${__("Create Report")}</button>`}
				</div>`);
			this.$body = this.$w.find(".trw-body");
			this.$w.find(".trw-step").on("click", (e) => this.go(+e.currentTarget.dataset.i));
			this.$w.find(".trw-back").on("click", () => this.go(this.step - 1));
			this.$w.find(".trw-next").on("click", () => this.go(this.step + 1));
			this.$w.find(".trw-finish").on("click", () => this.finish());
			this["step_" + s.key]();
		}

		go(i) {
			if (i < 0 || i >= STEPS.length) return;
			if (i > this.step && !this.validate_step()) return;
			this.step = i;
			this.visited.add(i);
			this.render();
		}

		validate_step() {
			const key = STEPS[this.step].key;
			const missing = (sel) => Object.entries(sel).filter(([n, v]) => this.byName[n] && /\{detail\}/.test(this.byName[n].text) && !(v.detail || "").trim());
			let m = [];
			if (key === "complaint") m = missing(this.state.complaint).concat(missing(this.state.assessment));
			if (key === "findings") m = missing(this.state.findings);
			if (key === "actions") m = missing(this.state.actions);
			if (m.length) {
				frappe.show_alert({ message: __("Please fill in the highlighted blank(s)"), indicator: "orange" });
				this.$body.find(".trw-item.on .det input").filter((i, el) => !el.value.trim()).first().trigger("focus");
				return false;
			}
			return true;
		}

		// ---------------------------------------------------------------- reusable tick list
		tick_list($into, phrases, sel, opts = {}) {
			let last_section = null;
			phrases.forEach((p) => {
				if (opts.sections && (p.section || "") !== last_section) {
					last_section = p.section || "";
					$into.append(`<div class="trw-sec">${esc(last_section || __("General"))}</div>`);
				}
				const on = !!sel[p.name];
				const has_detail = /\{detail\}/.test(p.text);
				const pill = opts.pill ? opts.pill(p) : "";
				const $it = $(`<label class="trw-item ${on ? "on" : ""}" data-name="${esc(p.name)}">
					<input type="${opts.radio ? "radio" : "checkbox"}" name="${opts.radio || ""}" ${on ? "checked" : ""}>
					<div class="txt">${esc(p.text).replace(/\{detail\}/g, `<b>___</b>`)}${pill}
						${has_detail && on ? `<div class="det"><input class="form-control input-xs" placeholder="${__("Type the missing words, e.g. MOSFET on the fan supply board")}" value="${esc(sel[p.name].detail || "")}"></div>` : ""}
					</div></label>`).appendTo($into);
				$it.find("input[type=checkbox],input[type=radio]").on("change", (e) => {
					if (opts.radio) Object.keys(sel).forEach((k) => delete sel[k]);
					if (e.target.checked) sel[p.name] = sel[p.name] || { detail: opts.detail_default ? opts.detail_default(p) : "" };
					else delete sel[p.name];
					if (opts.on_change) opts.on_change(p, e.target.checked);
					opts.rerender();
				});
				$it.find(".det input").on("click", (e) => e.preventDefault()).on("input", (e) => {
					sel[p.name].detail = e.target.value;
					if (opts.on_detail) opts.on_detail(p);
				});
			});
		}

		custom_adder($into, list, sections, rerender, placeholder) {
			const $a = $(`<div class="trw-add">
				<input type="text" class="form-control input-sm" placeholder="${esc(placeholder)}">
				<select class="form-control input-sm" style="width:auto">${sections.map((s) => `<option>${esc(s)}</option>`).join("")}</select>
				${this.ctx.can_add_phrases ? `<label class="small" style="margin:0"><input type="checkbox" class="sv"> ${__("Save to phrase library")}</label>` : ""}
				<button class="btn btn-default btn-sm">+ ${__("Add")}</button></div>`).appendTo($into);
			const add = () => {
				const text = $a.find("input[type=text]").val().trim();
				if (!text) return;
				list.push({ text, section: $a.find("select").val() === __("General") ? "" : $a.find("select").val(),
					save_to_library: $a.find(".sv").is(":checked") ? 1 : 0, on: true });
				rerender();
			};
			$a.find("button").on("click", add);
			$a.find("input[type=text]").on("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
		}

		custom_list($into, list, rerender) {
			list.forEach((c, i) => {
				const $it = $(`<label class="trw-item ${c.on ? "on" : ""}"><input type="checkbox" ${c.on ? "checked" : ""}>
					<div class="txt">${esc(c.text)}<span class="trw-pill custom">${__("your own")}${c.section ? " · " + esc(c.section) : ""}</span></div>
					<button class="btn btn-link btn-xs text-muted" title="${__("Remove")}">✕</button></label>`).appendTo($into);
				$it.find("input").on("change", (e) => { c.on = e.target.checked; rerender(); });
				$it.find("button").on("click", (e) => { e.preventDefault(); list.splice(i, 1); rerender(); });
			});
		}

		sections_of(type) {
			const s = [];
			this.phrases(type).forEach((p) => { if (p.section && !s.includes(p.section)) s.push(p.section); });
			return [__("General")].concat(s);
		}

		// ---------------------------------------------------------------- step 1: job
		step_job() {
			const $b = this.$body;
			const $src = $(`<div class="trw-box"><h6>${__("Fill from a job document (optional)")}</h6>
				<div class="row"><div class="col-sm-5 dt"></div><div class="col-sm-7 dn"></div></div>
				<div class="small text-muted af"></div></div>`).appendTo($b);
			const dt_ctrl = frappe.ui.form.make_control({
				df: { fieldtype: "Link", options: "DocType", label: __("Document Type"), fieldname: "trw_dt",
					description: this.ctx.source_doctype ? "" : __("Tip: set a default in TSL Report Settings") },
				parent: $src.find(".dt"), render_input: true,
			});
			const make_dn = (dt) => {
				$src.find(".dn").empty();
				if (!dt) return;
				const dn = frappe.ui.form.make_control({
					df: { fieldtype: "Link", options: dt, label: __(dt), fieldname: "trw_dn",
						change: () => { const v = dn.get_value(); if (v && v !== this._last_src) { this._last_src = v; this.autofill(dt, v); } } },
					parent: $src.find(".dn"), render_input: true,
				});
				if (this.frm.doc.tr_source_name && this.frm.doc.tr_source_doctype === dt) dn.set_value(this.frm.doc.tr_source_name);
			};
			const dt0 = this.frm.doc.tr_source_doctype || this.ctx.source_doctype || "";
			dt_ctrl.df.change = () => make_dn(dt_ctrl.get_value());
			dt_ctrl.set_value(dt0);
			make_dn(dt0);

			const $f = $(`<div class="trw-box"><h6>${__("Report header")}</h6><div class="trw-fields"></div></div>`).appendTo($b);
			this.ctx.header_fields.forEach((h) => {
				const $c = $("<div>").appendTo($f.find(".trw-fields"));
				const ctrl = frappe.ui.form.make_control({
					df: { fieldtype: ["Small Text", "Text", "Long Text"].includes(h.fieldtype) ? "Data" : h.fieldtype,
						options: h.options, label: h.label, fieldname: "trw_" + h.fieldname, read_only: h.read_only },
					parent: $c, render_input: true,
				});
				ctrl.set_value(this.frm.doc[h.fieldname] || "");
				ctrl.df.change = () => this.frm.set_value(h.fieldname, ctrl.get_value());
			});
			if (!this.ctx.header_fields.some((h) => /equipment/i.test(h.label))) {
				const $c = $("<div>").appendTo($f.find(".trw-fields"));
				const ctrl = frappe.ui.form.make_control({
					df: { fieldtype: "Data", label: __("Equipment type (used to suggest phrases)"), fieldname: "trw_eq" },
					parent: $c, render_input: true,
				});
				ctrl.set_value(this.state.equipment || "");
				ctrl.df.change = () => { this.state.equipment = ctrl.get_value(); };
			}
		}

		async autofill(dt, dn) {
			const r = await frappe.call({ method: "tsl_reports.wizard.get_autofill", args: { source_doctype: dt, source_name: dn } });
			const vals = r.message || {};
			let n = 0;
			for (const [k, v] of Object.entries(vals)) {
				if (!this.frm.doc[k] && v != null && v !== "") { await this.frm.set_value(k, v); n++; }
			}
			await this.frm.set_value({ tr_source_doctype: dt, tr_source_name: dn });
			frappe.show_alert({ message: n ? __("{0} header fields filled from {1}", [n, dn]) : __("Nothing new to fill from {0}", [dn]), indicator: n ? "green" : "blue" });
			if (STEPS[this.step].key === "job") this.render();
		}

		// ---------------------------------------------------------------- step 2: complaint + assessment
		step_complaint() {
			const part = (title, type, selkey, textkey, manualkey) => {
				const $box = $(`<div class="trw-box"><h6>${esc(title)}</h6><div class="lst"></div>
					<textarea class="form-control trw-text" placeholder="${__("…or just type here")}"></textarea>
					<div class="small text-muted mt-1 rb" style="display:none"><a href="#">${__("Rebuild text from ticks")}</a></div></div>`).appendTo(this.$body);
				const compose = () => Object.entries(this.state[selkey])
					.filter(([n]) => this.byName[n]).map(([n, v]) => this.resolve(this.byName[n].text, v.detail)).join(" ");
				const $t = $box.find("textarea");
				const sync = () => {
					if (!this.state[manualkey]) { this.state[textkey] = compose(); $t.val(this.state[textkey]); }
					$box.find(".rb").toggle(!!this.state[manualkey]);
				};
				this.tick_list($box.find(".lst"), this.phrases(type).filter((p) => this.applies(p)), this.state[selkey], {
					rerender: () => this.render(), on_detail: () => sync(),
				});
				$t.on("input", () => { this.state[textkey] = $t.val(); this.state[manualkey] = true; $box.find(".rb").show(); });
				$box.find(".rb a").on("click", (e) => { e.preventDefault(); this.state[manualkey] = false; sync(); });
				if (this.state[manualkey]) $t.val(this.state[textkey]);
				sync();
			};
			part(__("What was reported?"), "Complaint", "complaint", "complaint_text", "complaint_manual");
			part(__("How was it inspected?"), "Assessment", "assessment", "assessment_text", "assessment_manual");
		}

		// ---------------------------------------------------------------- step 3: findings
		step_findings() {
			const $tools = $(`<div class="trw-tools">
				<input type="search" class="form-control input-sm" placeholder="${__("Search findings…")}">
				<label class="small" style="margin:0"><input type="checkbox" ${this.state.show_all ? "checked" : ""}> ${__("Show phrases for all equipment")}</label>
				<span class="small text-muted cnt"></span></div>`).appendTo(this.$body);
			const $list = $(`<div></div>`).appendTo(this.$body);
			const draw = () => {
				$list.empty();
				const q = ($tools.find("input[type=search]").val() || "").toLowerCase();
				const items = this.phrases("Finding").filter((p) => this.applies(p) && (!q || p.text.toLowerCase().includes(q) || (p.section || "").toLowerCase().includes(q)));
				this.tick_list($list, items, this.state.findings, { sections: true, rerender: () => { const y = this.$w.closest(".modal").scrollTop(); draw(); this.$w.closest(".modal").scrollTop(y); } });
				this.custom_list($list, this.state.custom_findings, () => draw());
				const n = Object.keys(this.state.findings).length + this.state.custom_findings.filter((c) => c.on).length;
				$tools.find(".cnt").text(__("{0} selected", [n]));
			};
			$tools.find("input[type=search]").on("input", frappe.utils.debounce(draw, 150));
			$tools.find("input[type=checkbox]").on("change", (e) => { this.state.show_all = e.target.checked; draw(); });
			draw();
			this.custom_adder(this.$body, this.state.custom_findings, this.sections_of("Finding"), () => draw(),
				__("Add your own finding, e.g. Relay K2 contacts found pitted."));
		}

		// ---------------------------------------------------------------- step 4: actions
		suggested() {
			// action name -> [finding phrases that suggest it]
			const out = {};
			Object.keys(this.state.findings).forEach((fn) => {
				const f = this.byName[fn];
				(f ? f.suggests : []).forEach((a) => { (out[a] = out[a] || []).push(fn); });
			});
			return out;
		}

		sync_actions() {
			const sug = this.suggested();
			Object.entries(sug).forEach(([a, fins]) => {
				if (!this.byName[a] || this.state.actions[a] || this.state.actions_off[a]) return;
				const det = fins.map((f) => (this.state.findings[f] || {}).detail).find((d) => d);
				this.state.actions[a] = { detail: det || "" };
			});
			if (!this.state.actions_init) {
				this.phrases("Recommended Action").filter((p) => p.default_checked && this.applies(p)).forEach((p) => {
					if (!this.state.actions[p.name] && !this.state.actions_off[p.name]) this.state.actions[p.name] = { detail: "" };
				});
				this.state.actions_init = true;
			}
		}

		step_actions() {
			this.sync_actions();
			const sug = this.suggested();
			const $list = $(`<div></div>`).appendTo(this.$body);
			const draw = () => {
				$list.empty();
				const items = this.phrases("Recommended Action").filter((p) => this.applies(p) || this.state.actions[p.name]);
				// suggested first, then the rest – each group keeps its sections
				this.tick_list($list, items, this.state.actions, {
					sections: true,
					pill: (p) => (sug[p.name] ? `<span class="trw-pill" title="${esc(sug[p.name].map((f) => this.byName[f].text).join("\n"))}">${__("suggested")}</span>` : ""),
					on_change: (p, on) => { if (on) delete this.state.actions_off[p.name]; else this.state.actions_off[p.name] = 1; },
					rerender: () => { const y = this.$w.closest(".modal").scrollTop(); draw(); this.$w.closest(".modal").scrollTop(y); },
				});
				this.custom_list($list, this.state.custom_actions, () => draw());
			};
			draw();
			this.custom_adder(this.$body, this.state.custom_actions, this.sections_of("Recommended Action"), () => draw(),
				__("Add your own action, e.g. Replace relay K2."));
		}

		// ---------------------------------------------------------------- step 5: photos
		step_photos() {
			const caps = this.phrases("Photo Caption").map((p) => p.text);
			const $opts = $(`<div class="trw-tools">
				<button class="btn btn-default btn-sm pick">+ ${__("Choose photos")}</button>
				<span class="small">${__("Photos per row")}:</span>
				<select class="form-control input-sm" style="width:auto">${["1", "2", "3"].map((c) => `<option ${this.state.photo_columns === c ? "selected" : ""}>${c}</option>`).join("")}</select>
				<label class="small" style="margin:0"><input type="checkbox" class="ov" ${this.state.overall_photo_first ? "checked" : ""}> ${__("First photo = overall unit (full width at the top)")}</label>
			</div>
			<datalist id="trw-caps">${caps.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>`).appendTo(this.$body);
			const $drop = $(`<div class="trw-drop">${__("Drag & drop photos here")}</div>`).appendTo(this.$body);
			const $grid = $(`<div class="trw-grid"></div>`).appendTo(this.$body);

			$opts.find("select").on("change", (e) => { this.state.photo_columns = e.target.value; });
			$opts.find(".ov").on("change", (e) => { this.state.overall_photo_first = e.target.checked; draw(); });
			$opts.find(".pick").on("click", () => {
				const $f = $(`<input type="file" accept="image/*" multiple style="display:none">`).appendTo(document.body);
				$f.on("change", () => { this.upload($f[0].files).then(draw); $f.remove(); });
				$f.trigger("click");
			});
			$drop.on("dragover", (e) => { e.preventDefault(); $drop.addClass("over"); })
				.on("dragleave", () => $drop.removeClass("over"))
				.on("drop", (e) => { e.preventDefault(); $drop.removeClass("over"); this.upload(e.originalEvent.dataTransfer.files).then(draw); });

			const draw = () => {
				$grid.empty();
				this.state.photos.forEach((p, i) => {
					const $c = $(`<div class="trw-photo">
						<div class="im" style="background-image:url('${encodeURI(p.image)}')">${i === 0 && this.state.overall_photo_first ? `<span class="cover">${__("Overall")}</span>` : ""}</div>
						<div class="ctl"><input class="form-control input-xs" list="trw-caps" placeholder="${__("Caption")}" value="${esc(p.caption || "")}">
						<div class="row2"><span><button data-a="l" title="${__("Move left")}">←</button><button data-a="r" title="${__("Move right")}">→</button></span>
						<button data-a="x" title="${__("Remove")}">✕</button></div></div></div>`).appendTo($grid);
					$c.find("input").on("input", (e) => { p.caption = e.target.value; });
					$c.find("button").on("click", (e) => {
						const a = e.currentTarget.dataset.a, ph = this.state.photos;
						if (a === "x") ph.splice(i, 1);
						if (a === "l" && i > 0) [ph[i - 1], ph[i]] = [ph[i], ph[i - 1]];
						if (a === "r" && i < ph.length - 1) [ph[i + 1], ph[i]] = [ph[i], ph[i + 1]];
						draw();
					});
				});
				if (!this.state.photos.length) $grid.html(`<div class="text-muted small">${__("No photos yet. You can also skip this step and add photos later.")}</div>`);
			};
			draw();
		}

		async upload(files) {
			files = Array.from(files || []).filter((f) => /^image\//.test(f.type));
			if (!files.length) return;
			let done = 0;
			frappe.show_progress(__("Uploading photos"), 0, files.length);
			try {
				for (const f of files) {
					const fd = new FormData();
					fd.append("file", f, f.name);
					fd.append("is_private", UPLOAD_PRIVATE);
					fd.append("folder", "Home/Attachments");
					fd.append("optimize", 1);
					if (!this.frm.is_new()) { fd.append("doctype", this.frm.doctype); fd.append("docname", this.frm.docname); }
					const res = await fetch("/api/method/upload_file", {
						method: "POST", body: fd,
						headers: { "X-Frappe-CSRF-Token": frappe.csrf_token, Accept: "application/json" },
					});
					const j = await res.json().catch(() => ({}));
					if (!res.ok || !j.message) throw new Error(res.statusText || "Upload failed");
					this.state.photos.push({ image: j.message.file_url, caption: "" });
					done++;
					frappe.show_progress(__("Uploading photos"), done, files.length);
				}
			} catch (e) {
				frappe.msgprint(__("Upload failed: {0}", [e.message || e]));
			} finally {
				frappe.hide_progress();
			}
		}

		// ---------------------------------------------------------------- step 6: conclusion
		step_conclusion() {
			const $box = $(`<div class="trw-box"><h6>${__("Outcome")}</h6><div class="lst"></div></div>`).appendTo(this.$body);
			const sel = {};
			if (this.state.conclusion) sel[this.state.conclusion] = { detail: "" };
			const eqp = this.equipment_phrase();
			const items = this.phrases("Conclusion").map((p) => {
				const t = p.text.replace(/\{equipment\}/g, eqp);
				return Object.assign({}, p, { text: p.label ? `${p.label} — ${t}` : t });
			});
			const compose = () => {
				const p = this.byName[this.state.conclusion];
				return p ? p.text.replace(/\{equipment\}/g, this.equipment_phrase()).replace(/\{detail\}/g, "[…]") : "";
			};
			this.tick_list($box.find(".lst"), items, sel, {
				radio: "trw-concl",
				on_change: (p, on) => { if (on) { this.state.conclusion = p.name; this.state.conclusion_manual = false; } },
				rerender: () => this.render(),
			});
			const $t = $(`<div class="trw-box"><h6>${__("Conclusion text")}</h6><textarea class="form-control trw-text" style="min-height:120px"></textarea>
				<div class="small text-muted mt-1">${__("Edit freely. Changing the outcome above rewrites this text.")}</div></div>`).appendTo(this.$body).find("textarea");
			if (!this.state.conclusion_manual) this.state.conclusion_text = compose();
			$t.val(this.state.conclusion_text);
			$t.on("input", () => { this.state.conclusion_text = $t.val(); this.state.conclusion_manual = true; });
		}

		// ---------------------------------------------------------------- step 7: sign-off + summary
		step_signoff() {
			const $box = $(`<div class="trw-box"><div class="trw-fields"><div class="a"></div><div class="b"></div></div>
				<div class="small text-muted">${__("Signatures come from the Employee record (field: Signature for reports).")}</div></div>`).appendTo(this.$body);
			const mk = (parent, label, key) => {
				const c = frappe.ui.form.make_control({
					df: { fieldtype: "Link", options: "Employee", label, fieldname: "trw_" + key }, parent, render_input: true,
				});
				c.set_value(this.state[key] || "");
				c.df.change = () => { this.state[key] = c.get_value(); };
			};
			mk($box.find(".a"), this.ctx.inspector_role, "inspected_by");
			mk($box.find(".b"), this.ctx.approver_role, "approved_by");

			const d = this.collect();
			const n = (a) => a.length;
			$(`<div class="trw-box"><h6>${__("Summary")}</h6><table class="trw-summary small">
				<tr><td>${__("Complaint")}</td><td>${d.complaint ? "✓" : "—"}</td></tr>
				<tr><td>${__("Findings")}</td><td>${n(d.findings)}</td></tr>
				<tr><td>${__("Recommended actions")}</td><td>${n(d.actions)}</td></tr>
				<tr><td>${__("Photos")}</td><td>${n(d.photos)}</td></tr>
				<tr><td>${__("Conclusion")}</td><td>${d.conclusion ? "✓" : "—"}</td></tr></table>
				<div class="small text-muted mt-2">${__("Create Report builds the report, saves it and opens the PDF. You can still edit everything afterwards, or open this wizard again.")}</div></div>`)
				.appendTo(this.$body);
		}

		// ---------------------------------------------------------------- finish
		collect() {
			const st = this.state;
			const ordered = (sel, type) => this.phrases(type).filter((p) => sel[p.name]);
			const findings = ordered(st.findings, "Finding").map((p) => ({ text: this.resolve(p.text, st.findings[p.name].detail), section: p.section || "" }))
				.concat(st.custom_findings.filter((c) => c.on).map((c) => ({ text: c.text, section: c.section || "", save_to_library: c.save_to_library })));
			const actions = ordered(st.actions, "Recommended Action").map((p) => ({
				text: this.resolve(p.text, st.actions[p.name].detail), section: p.section || "",
				completion_step: p.completion_step ? this.resolve(p.completion_step, st.actions[p.name].detail) : "",
			})).concat(st.custom_actions.filter((c) => c.on).map((c) => ({ text: c.text, section: c.section || "", save_to_library: c.save_to_library })));
			return {
				complaint: st.complaint_text, assessment: st.assessment_text, findings, actions,
				photos: st.photos, photo_columns: st.photo_columns, overall_photo_first: st.overall_photo_first ? 1 : 0,
				conclusion: st.conclusion_text, inspected_by: st.inspected_by, approved_by: st.approved_by,
				inspector_role: this.ctx.inspector_role, approver_role: this.ctx.approver_role, equipment_type: this.equipment(),
			};
		}

		async finish() {
			const data = this.collect();
			if (!data.findings.length && !data.actions.length && !data.complaint) {
				frappe.msgprint(__("Please tick at least one finding or action."));
				return;
			}
			const has_manual = (this.frm.doc.tr_blocks || []).length && !this.frm.doc.tr_wizard_data;
			if (has_manual && !(await new Promise((ok) => frappe.confirm(__("This replaces the report's current content. Continue?"), () => ok(true), () => ok(false))))) return;

			const r = await frappe.call({ method: "tsl_reports.wizard.build_from_wizard", args: { data }, freeze: true, freeze_message: __("Writing report…") });
			const out = r.message;
			const frm = this.frm;
			frm.__tr_loading = true;
			try {
				await frm.set_value("tr_report_type", out.report_type);
				frm.clear_table("tr_blocks");
				out.blocks.forEach((b) => frm.add_child("tr_blocks", b));
				if (out.signatories.length) {
					frm.clear_table("tr_signatories");
					out.signatories.forEach((s) => frm.add_child("tr_signatories", s));
				}
				if (!frm.doc.tr_signoff_note) {
					await frm.set_value("tr_signoff_note", __("This report has been prepared in accordance with TSL Electronics Services LLC inspection procedures and is subject to review and approval by the designated branch authority prior to submission to the client."));
				}
				await frm.set_value("tr_wizard_data", JSON.stringify({ v: 1, state: this.state, findings: data.findings, actions: data.actions }));
				["tr_blocks", "tr_signatories"].forEach((f) => frm.refresh_field(f));
			} finally {
				frm.__tr_loading = false;
			}
			this.d.hide();
			try {
				await frm.save();
			} catch (e) {
				frappe.show_alert({ message: __("Report written – please complete the required fields and save."), indicator: "orange" });
				return;
			}
			frappe.show_alert({ message: __("Report created"), indicator: "green" });
			if (frm.__tre && frm.__tre.pdf_preview) frm.__tre.pdf_preview();
		}
	}

	tsl_reports.Wizard = Wizard;
	tsl_reports.open_wizard = (frm) => new Wizard(frm).open();
})();

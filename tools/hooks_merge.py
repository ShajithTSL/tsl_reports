# Copyright (c) 2026, TSL Electronics Services LLC
"""Adds TSL Reports' hooks to the host app's hooks.py without overwriting the host app's own hooks.

hooks.py of the host app ends with:
    from <app>.tsl_reports.hooks_merge import merge as _tsl_reports_merge
    _tsl_reports_merge(globals())
"""

from .constants import TARGET_DOCTYPE

_BASE = __name__.rsplit(".", 1)[0]  # e.g. "tsl.tsl_reports"
_JS = "public/tsl_reports/js/"


def _as_list(v):
	if v is None:
		return []
	return list(v) if isinstance(v, (list, tuple)) else [v]


def _add_map(g, name, mapping):
	d = g.get(name)
	if not isinstance(d, dict):
		d = {}
	for key, paths in mapping.items():
		cur = _as_list(d.get(key))
		for p in _as_list(paths):
			if p not in cur:
				cur.append(p)
		d[key] = cur
	g[name] = d


def _add_hook(g, name, path):
	cur = _as_list(g.get(name))
	if path not in cur:
		cur.append(path)
	g[name] = cur


def merge(g):
	_add_map(g, "doctype_js", {
		TARGET_DOCTYPE: [_JS + "tr_block_editor.js", _JS + "tr_wizard.js", _JS + "evaluation_technical_report.js"],
		"Technical Report Template": [_JS + "tr_block_editor.js"],
	})
	_add_map(g, "doctype_list_js", {TARGET_DOCTYPE: [_JS + "evaluation_technical_report_list.js"]})
	_add_hook(g, "after_install", f"{_BASE}.setup.install.after_install")
	_add_hook(g, "after_migrate", f"{_BASE}.setup.install.after_migrate")

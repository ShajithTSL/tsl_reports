#!/usr/bin/env python3
"""Copy TSL Reports into another Frappe app (e.g. `tsl`) as its module "TSL Reports".

    python3 tools/move_to_app.py <path-to-target-app-repo> [--dry-run]

<path-to-target-app-repo> is e.g. ~/frappe-bench/apps/tsl (the folder that contains the
python package `tsl/`). The script only touches:
  apps/<app>/<app>/tsl_reports/            (the module: doctypes, print format, api, wizard, setup, patches)
  apps/<app>/<app>/public/tsl_reports/     (js + images)
  apps/<app>/<app>/modules.txt             (+ "TSL Reports")
  apps/<app>/<app>/patches.txt             (+ our patches)
  apps/<app>/<app>/hooks.py                (+ 3 marked lines at the end)
It is safe to run again (e.g. for an update): it replaces the two tsl_reports folders and
skips lines that are already there.
"""

import argparse
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_ROOT = os.path.abspath(os.path.join(HERE, ".."))          # the tsl_reports repo
SRC_PKG = os.path.join(SRC_ROOT, "tsl_reports")                 # python package
SRC_MOD = os.path.join(SRC_PKG, "tsl_reports")                  # module folder (doctypes, print format)

MODULE_NAME = "TSL Reports"
MARK_START = "# >>> tsl_reports (added by move_to_app.py – do not edit between the markers) >>>"
MARK_END = "# <<< tsl_reports <<<"
PKG_FILES = ["api.py", "wizard.py", "constants.py"]
PKG_DIRS = ["setup", "patches"]
IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc")


def say(msg):
	print(f"  {msg}")


def rewrite_text(text, app):
	# whitelisted method paths used from JavaScript: "tsl_reports.api.x" -> "tsl.tsl_reports.api.x"
	text = re.sub(r"""(["'])tsl_reports\.(api|wizard|setup)\.""", rf"\1{app}.tsl_reports.\2.", text)
	# static files: /assets/tsl_reports/... -> /assets/tsl/tsl_reports/...
	text = text.replace("/assets/tsl_reports/", f"/assets/{app}/tsl_reports/")
	# documentation strings for bench execute
	text = text.replace("execute tsl_reports.", f"execute {app}.tsl_reports.")
	return text


def rewrite_tree(root, app, dry):
	n = 0
	for dirpath, _, files in os.walk(root):
		for f in files:
			if not f.endswith((".py", ".js", ".json", ".html", ".md", ".txt")):
				continue
			p = os.path.join(dirpath, f)
			with open(p, encoding="utf-8") as fh:
				old = fh.read()
			new = rewrite_text(old, app)
			if new != old:
				n += 1
				if not dry:
					with open(p, "w", encoding="utf-8") as fh:
						fh.write(new)
	return n


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("target_repo", help="e.g. ~/frappe-bench/apps/tsl")
	ap.add_argument("--app", help="python package name of the target app (default: folder name)")
	ap.add_argument("--dry-run", action="store_true")
	a = ap.parse_args()

	repo = os.path.abspath(os.path.expanduser(a.target_repo))
	app = a.app or os.path.basename(repo.rstrip("/"))
	pkg = os.path.join(repo, app)
	dry = a.dry_run
	for need in (os.path.join(pkg, "hooks.py"), os.path.join(pkg, "modules.txt")):
		if not os.path.exists(need):
			sys.exit(f"ERROR: {need} not found – is '{repo}' a Frappe app folder and '{app}' its package name?")
	if app == "tsl_reports":
		sys.exit("ERROR: target must be another app, not tsl_reports itself")

	print(f"Moving TSL Reports into app '{app}' ({pkg}){' [dry run]' if dry else ''}")

	# 1. module folder = module files + python files
	mod = os.path.join(pkg, "tsl_reports")
	if not dry:
		if os.path.exists(mod):
			shutil.rmtree(mod)
		shutil.copytree(SRC_MOD, mod, ignore=IGNORE)
		for f in PKG_FILES:
			shutil.copy2(os.path.join(SRC_PKG, f), os.path.join(mod, f))
		for d in PKG_DIRS:
			shutil.copytree(os.path.join(SRC_PKG, d), os.path.join(mod, d), ignore=IGNORE)
		shutil.copy2(os.path.join(HERE, "hooks_merge.py"), os.path.join(mod, "hooks_merge.py"))
		shutil.copy2(os.path.join(SRC_ROOT, "README.md"), os.path.join(mod, "README.md"))
		open(os.path.join(mod, "__init__.py"), "a").close()
	say(f"module folder  -> {os.path.relpath(mod, repo)}/")

	# 2. public files
	pub = os.path.join(pkg, "public", "tsl_reports")
	if not dry:
		if os.path.exists(pub):
			shutil.rmtree(pub)
		os.makedirs(pub)
		shutil.copytree(os.path.join(SRC_PKG, "public", "js"), os.path.join(pub, "js"), ignore=IGNORE)
		shutil.copytree(os.path.join(SRC_PKG, "public", "images"), os.path.join(pub, "images"), ignore=IGNORE)
		bundle = os.path.join(pub, "js", "tsl_reports.bundle.js")
		if os.path.exists(bundle):
			os.remove(bundle)
	say(f"js + images    -> {os.path.relpath(pub, repo)}/")

	# 3. rewrite method paths and asset URLs for the new location
	if not dry:
		n = rewrite_tree(mod, app, dry) + rewrite_tree(pub, app, dry)
		say(f"updated paths in {n} files")

	# 4. modules.txt
	mt = os.path.join(pkg, "modules.txt")
	lines = [l.strip() for l in open(mt, encoding="utf-8").read().splitlines()]
	if MODULE_NAME not in lines:
		if not dry:
			content = open(mt, encoding="utf-8").read()
			with open(mt, "a", encoding="utf-8") as fh:
				fh.write(("" if content.endswith("\n") or not content else "\n") + MODULE_NAME + "\n")
		say(f"modules.txt    + {MODULE_NAME}")
	else:
		say("modules.txt    already has TSL Reports")

	# 5. patches.txt
	pt = os.path.join(pkg, "patches.txt")
	ours = [l.strip() for l in open(os.path.join(SRC_PKG, "patches.txt")).read().splitlines()
			if l.strip() and not l.startswith("[") and not l.startswith("#")]
	ours = [f"{app}.{p}" for p in ours]
	text = open(pt, encoding="utf-8").read() if os.path.exists(pt) else ""
	missing = [p for p in ours if p not in text]
	if missing:
		if "[post_model_sync]" in text:
			text = text.replace("[post_model_sync]", "[post_model_sync]\n" + "\n".join(missing), 1)
		else:
			text = text.rstrip("\n") + ("\n" if text else "") + "\n".join(missing) + "\n"
		if not dry:
			with open(pt, "w", encoding="utf-8") as fh:
				fh.write(text if text.endswith("\n") else text + "\n")
		say(f"patches.txt    + {len(missing)} patch(es)")
	else:
		say("patches.txt    already up to date")

	# 6. hooks.py – three marked lines at the end, merged at import time
	hp = os.path.join(pkg, "hooks.py")
	hooks = open(hp, encoding="utf-8").read()
	block = (f"\n\n{MARK_START}\nfrom {app}.tsl_reports.hooks_merge import merge as _tsl_reports_merge\n"
			 f"_tsl_reports_merge(globals())\n{MARK_END}\n")
	if MARK_START in hooks:
		say("hooks.py       already merged")
	else:
		if not dry:
			shutil.copy2(hp, hp + ".bak-before-tsl_reports")
			with open(hp, "w", encoding="utf-8") as fh:
				fh.write(hooks.rstrip("\n") + block)
		say("hooks.py       + TSL Reports hooks (backup: hooks.py.bak-before-tsl_reports)")

	print("Files done.")


if __name__ == "__main__":
	main()

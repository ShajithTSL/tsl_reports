#!/usr/bin/env bash
# Undo move_to_app.sh: take TSL Reports out of your app (default: tsl) and run it as the
# separate tsl_reports app again. No data is deleted – reports, templates, phrases and
# header formats all stay.
#
#   unzip -o tsl_reports_v1.7.1.zip -d ~ && bash ~/tsl_reports/move_back.sh tsl <site> <path-to-frappe-bench>
#
# Run it as the bench user. Everything removed from the tsl app is moved to a backup folder, not deleted.

set -euo pipefail
FROM="${1:-tsl}"
SITE="${2:-}"
BENCH="${3:-${BENCH_DIR:-}}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m%s\033[0m\n' "$*"; }
warn(){ printf '\033[1;33m%s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

is_bench() { [ -n "$1" ] && [ -d "$1/apps/frappe" ] && [ -d "$1/sites" ]; }
if ! is_bench "$BENCH"; then
	BENCH=""
	for d in "$PWD" "$PWD/.." "$HOME/frappe-bench" /home/frappe/frappe-bench /home/*/frappe-bench /opt/frappe-bench; do
		if is_bench "$d"; then BENCH="$(cd "$d" && pwd)"; break; fi
	done
fi
is_bench "$BENCH" || die "frappe-bench not found. Run: bash $0 $FROM <site> /path/to/frappe-bench"
command -v bench >/dev/null || die "'bench' not found. Log in as the bench user."
cd "$BENCH"
PKG="apps/$FROM/$FROM"
[ -f "$PKG/hooks.py" ] || die "App '$FROM' not found in $BENCH/apps"
[ -f "$SRC/tsl_reports/hooks.py" ] || die "Run this from the unpacked tsl_reports zip (~/tsl_reports/move_back.sh)"
[ -f "$SRC/tsl_reports/setup/move.py" ] && grep -q "def move_back" "$SRC/tsl_reports/setup/move.py" \
	|| die "This copy of tsl_reports is too old. Unpack tsl_reports_v1.7.1.zip (or newer) and run again."
[ "$SRC" = "$BENCH/apps/tsl_reports" ] && die "Run it from the unpacked zip (e.g. ~/tsl_reports), not from apps/tsl_reports"

if [ -z "$SITE" ]; then
	mapfile -t SITES < <(for f in sites/*/site_config.json; do [ -f "$f" ] && basename "$(dirname "$f")"; done)
	if [ "${#SITES[@]}" -eq 1 ]; then SITE="${SITES[0]}"
	else
		echo "Sites found:"; for i in "${!SITES[@]}"; do echo "  $((i+1))) ${SITES[$i]}"; done
		read -rp "Which site? [1] " n; SITE="${SITES[$(( ${n:-1} - 1 ))]:-}"
	fi
fi
[ -f "sites/$SITE/site_config.json" ] || die "Site '$SITE' not found"
ok "Bench: $BENCH   Site: $SITE   Taking TSL Reports out of: $FROM"

# ---------------------------------------------------------------- 1. backup + clean the host app
BKDIR="$HOME/tsl_reports_removed_from_${FROM}_${STAMP}"
say "Backing up apps/$FROM to $BKDIR.tar.gz"
tar czf "$BKDIR.tar.gz" -C apps --exclude='node_modules' --exclude='__pycache__' "$FROM"
mkdir -p "$BKDIR"

say "Removing TSL Reports from apps/$FROM (moved to $BKDIR)"
python3 - "$PKG" "$FROM" <<'PY'
import re, sys
pkg, app = sys.argv[1], sys.argv[2]
# hooks.py: drop the marked block
p = f"{pkg}/hooks.py"
s = open(p, encoding="utf-8").read()
s2 = re.sub(r"\n*# >>> tsl_reports.*?# <<< tsl_reports <<<\n?", "\n", s, flags=re.S)
if s2 != s:
    open(p, "w", encoding="utf-8").write(s2.rstrip("\n") + "\n")
    print("  hooks.py      - TSL Reports lines")
# modules.txt
p = f"{pkg}/modules.txt"
lines = open(p, encoding="utf-8").read().splitlines()
if "TSL Reports" in [l.strip() for l in lines]:
    open(p, "w", encoding="utf-8").write("\n".join(l for l in lines if l.strip() != "TSL Reports") + "\n")
    print("  modules.txt   - TSL Reports")
# patches.txt
p = f"{pkg}/patches.txt"
try:
    lines = open(p, encoding="utf-8").read().splitlines()
    keep = [l for l in lines if not l.strip().startswith(f"{app}.tsl_reports.")]
    if len(keep) != len(lines):
        open(p, "w", encoding="utf-8").write("\n".join(keep) + "\n")
        print(f"  patches.txt   - {len(lines) - len(keep)} line(s)")
except FileNotFoundError:
    pass
PY
[ -e "$PKG/tsl_reports" ] && { mv "$PKG/tsl_reports" "$BKDIR/module_tsl_reports"; echo "  moved $FROM/tsl_reports/"; } || true
[ -e "$PKG/public/tsl_reports" ] && { mv "$PKG/public/tsl_reports" "$BKDIR/public_tsl_reports"; echo "  moved $FROM/public/tsl_reports/"; } || true
[ -e "$PKG/tsl_reports_library" ] && { mv "$PKG/tsl_reports_library" "$BKDIR/tsl_reports_library"; echo "  moved $FROM/tsl_reports_library/ (your exported library)"; } || true
[ -f "$PKG/hooks.py.bak-before-tsl_reports" ] && mv "$PKG/hooks.py.bak-before-tsl_reports" "$BKDIR/" || true

# ---------------------------------------------------------------- 2. separate app back on the bench
say "Putting the tsl_reports app back on the bench"
if [ -d apps/tsl_reports ]; then mv apps/tsl_reports "$BKDIR/old_apps_tsl_reports"; fi
mkdir -p apps/tsl_reports
(cd "$SRC" && tar cf - --exclude=.git --exclude=__pycache__ .) | (cd apps/tsl_reports && tar xf -)
./env/bin/pip install -q -e apps/tsl_reports || die "pip install failed"
grep -qx tsl_reports sites/apps.txt || { sed -i -e '$a\' sites/apps.txt; echo tsl_reports >> sites/apps.txt; }

# ---------------------------------------------------------------- 3. database: module + installed app (no data touched)
say "Handing the TSL Reports module back to tsl_reports (data is kept)"
# Frappe only runs code of apps installed on the site, so register tsl_reports first (frappe's own function)
bench --site "$SITE" execute frappe.installer.add_to_installed_apps --args "['tsl_reports']"
bench --site "$SITE" execute tsl_reports.setup.move.move_back --kwargs "{'from_app': '$FROM'}"

# ---------------------------------------------------------------- 4. migrate
say "Migrating $SITE"
bench --site "$SITE" migrate
bench build --app tsl_reports >/dev/null 2>&1 || true
bench --site "$SITE" clear-cache
bench restart >/dev/null 2>&1 || warn "Restart manually (or stop/start 'bench start')."

ok "
Done! TSL Reports is the separate app 'tsl_reports' again; '$FROM' is back to your own code.
 - Removed files are in: $BKDIR   (full backup: $BKDIR.tar.gz)
 - In apps/$FROM run 'git status' – it should show no TSL Reports changes left.
 - Future updates: unzip the new version and run  bash ~/tsl_reports/install.sh
 - Press Ctrl+Shift+R once in the browser."

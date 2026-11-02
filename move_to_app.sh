#!/usr/bin/env bash
# Move TSL Reports into your own app (default: tsl) – one command.
#
#   unzip -o tsl_reports.zip -d ~ && bash ~/tsl_reports/move_to_app.sh tsl
#
# Optional:  bash move_to_app.sh <app> <site> <path-to-frappe-bench>
#
# What it does:
#  1. backs up apps/<app>
#  2. copies TSL Reports into apps/<app> as the module "TSL Reports" (hooks/modules/patches merged, nothing of yours removed)
#  3. if the stand-alone tsl_reports app is installed on the site: hands its module over to <app>
#     WITHOUT deleting any data, then removes the old app from the bench
#  4. migrate, clear cache, restart
# Run it as the bench user (usually: sudo su - frappe). Safe to run again for later updates.

set -euo pipefail
TARGET="${1:-tsl}"
SITE="${2:-}"
BENCH="${3:-${BENCH_DIR:-}}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m%s\033[0m\n' "$*"; }
warn(){ printf '\033[1;33m%s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- bench + site
is_bench() { [ -n "$1" ] && [ -d "$1/apps/frappe" ] && [ -d "$1/sites" ]; }
if ! is_bench "$BENCH"; then
	BENCH=""
	for d in "$PWD" "$PWD/.." "$HOME/frappe-bench" /home/frappe/frappe-bench /home/*/frappe-bench /opt/frappe-bench; do
		if is_bench "$d"; then BENCH="$(cd "$d" && pwd)"; break; fi
	done
fi
is_bench "$BENCH" || die "frappe-bench not found. Run: bash $0 $TARGET <site> /path/to/frappe-bench"
command -v bench >/dev/null || die "'bench' not found. Log in as the bench user (sudo su - frappe)."
cd "$BENCH"
[ -f "apps/$TARGET/$TARGET/hooks.py" ] || die "App '$TARGET' not found in $BENCH/apps"

if [ -z "$SITE" ]; then
	mapfile -t SITES < <(for f in sites/*/site_config.json; do [ -f "$f" ] && basename "$(dirname "$f")"; done)
	if [ "${#SITES[@]}" -eq 1 ]; then SITE="${SITES[0]}"
	else
		echo "Sites found:"; for i in "${!SITES[@]}"; do echo "  $((i+1))) ${SITES[$i]}"; done
		read -rp "Which site? [1] " n; SITE="${SITES[$(( ${n:-1} - 1 ))]:-}"
	fi
fi
[ -f "sites/$SITE/site_config.json" ] || die "Site '$SITE' not found"
bench --site "$SITE" list-apps 2>/dev/null | grep -qw "$TARGET" || die "App '$TARGET' is not installed on site '$SITE'. Install it first."
ok "Bench: $BENCH   Site: $SITE   Target app: $TARGET"

# ---------------------------------------------------------------- 1. backup
say "Backing up apps/$TARGET"
BK="$HOME/${TARGET}_backup_${STAMP}.tar.gz"
tar czf "$BK" -C apps --exclude='node_modules' --exclude='__pycache__' "$TARGET"
ok "Backup: $BK"
if [ -d "apps/$TARGET/.git" ] && [ -n "$(git -C "apps/$TARGET" status --porcelain 2>/dev/null)" ]; then
	warn "Note: apps/$TARGET has uncommitted changes (they are kept, and are in the backup)."
fi

# ---------------------------------------------------------------- 2. files
say "Copying TSL Reports into apps/$TARGET"
python3 "$SRC/tools/move_to_app.py" "apps/$TARGET" --app "$TARGET"

# ---------------------------------------------------------------- 3. hand over from the old app (no data deleted)
# First take tsl_reports off the bench's app list, so no bench command tries to import it any more
say "Taking the old tsl_reports app off the bench (data is kept)"
sed -i '/^tsl_reports$/d' sites/apps.txt
if [ -f sites/apps.json ]; then
	python3 - <<'PY' || true
import json
p = "sites/apps.json"
d = json.load(open(p))
if isinstance(d, dict) and d.pop("tsl_reports", None) is not None:
    json.dump(d, open(p, "w"), indent=4)
PY
fi
./env/bin/pip uninstall -y -q tsl_reports >/dev/null 2>&1 || true
[ -L sites/assets/tsl_reports ] && rm -f sites/assets/tsl_reports || true

say "Handing the TSL Reports module over to $TARGET"
bench --site "$SITE" execute "$TARGET.tsl_reports.setup.move.pre_move" --kwargs "{'app': '$TARGET'}"
bench --site "$SITE" remove-from-installed-apps tsl_reports >/dev/null 2>&1 || true

if [ -d apps/tsl_reports ]; then
	mv apps/tsl_reports "$HOME/tsl_reports_old_app_${STAMP}"
	ok "Old app folder moved to ~/tsl_reports_old_app_${STAMP} (delete it once you're happy)"
fi

# ---------------------------------------------------------------- 4. migrate
say "Migrating $SITE"
bench --site "$SITE" migrate
say "Clearing cache and restarting"
bench --site "$SITE" clear-cache
bench restart >/dev/null 2>&1 || warn "Restart manually (or stop/start 'bench start')."

ok "
Done! TSL Reports is now part of '$TARGET' (module: TSL Reports).
 - Code:  apps/$TARGET/$TARGET/tsl_reports/   and   apps/$TARGET/$TARGET/public/tsl_reports/
 - Commit these to your '$TARGET' git repo:  cd apps/$TARGET && git add -A && git commit -m 'Add TSL Reports'
 - Press Ctrl+Shift+R once in the browser."

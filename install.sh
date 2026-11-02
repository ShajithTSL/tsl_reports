#!/usr/bin/env bash
# TSL Reports – one-command install / update
#
#   unzip -o tsl_reports.zip -d ~ && bash ~/tsl_reports/install.sh
#
# Works for both a first install and an update. Run it as the user that owns
# frappe-bench (usually "frappe"), not root. Optional arguments:
#   bash install.sh [site-name] [path-to-frappe-bench]

set -euo pipefail

APP=tsl_reports
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="${1:-}"
BENCH="${2:-${BENCH_DIR:-}}"

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- find bench
is_bench() { [ -n "$1" ] && [ -d "$1/apps/frappe" ] && [ -d "$1/sites" ]; }
if ! is_bench "$BENCH"; then
	BENCH=""
	for d in "$PWD" "$PWD/.." "$HOME/frappe-bench" /home/frappe/frappe-bench /home/*/frappe-bench /opt/frappe-bench /opt/bench/frappe-bench; do
		if is_bench "$d"; then BENCH="$(cd "$d" && pwd)"; break; fi
	done
fi
is_bench "$BENCH" || die "Could not find your frappe-bench folder. Run:  bash $0 <site> /path/to/frappe-bench"
command -v bench >/dev/null || die "'bench' command not found. Log in as the frappe user (e.g. 'sudo su - frappe') and run again."
[ "$(id -u)" -eq 0 ] && printf '\033[1;33mWarning: running as root. Prefer the frappe user (sudo su - frappe).\033[0m\n'
ok "Bench: $BENCH"

# ---------------------------------------------------------------- pick site
cd "$BENCH"
if [ -z "$SITE" ]; then
	mapfile -t SITES < <(for f in sites/*/site_config.json; do [ -f "$f" ] && basename "$(dirname "$f")"; done)
	if [ "${#SITES[@]}" -eq 1 ]; then
		SITE="${SITES[0]}"
	elif [ "${#SITES[@]}" -gt 1 ]; then
		echo "Sites found:"; for i in "${!SITES[@]}"; do echo "  $((i+1))) ${SITES[$i]}"; done
		read -rp "Install on which site? [1] " n; n="${n:-1}"
		SITE="${SITES[$((n-1))]:-}"
	fi
fi
[ -n "$SITE" ] && [ -f "sites/$SITE/site_config.json" ] || die "Site '$SITE' not found in $BENCH/sites"
ok "Site:  $SITE"

# ---------------------------------------------------------------- copy files
DEST="$BENCH/apps/$APP"
if [ "$SRC" != "$DEST" ]; then
	say "Copying app files to apps/$APP"
	mkdir -p "$DEST"
	if command -v rsync >/dev/null; then
		rsync -a --delete --exclude '.git' --exclude '__pycache__' "$SRC/" "$DEST/"
	else
		find "$DEST" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
		(cd "$SRC" && tar cf - --exclude=.git --exclude=__pycache__ .) | (cd "$DEST" && tar xf -)
	fi
fi

say "Installing Python package"
"$BENCH/env/bin/pip" install -q -e "$DEST" || die "pip install failed (see above)"

if ! grep -qx "$APP" sites/apps.txt; then
	sed -i -e '$a\' sites/apps.txt
	echo "$APP" >> sites/apps.txt
fi

# ---------------------------------------------------------------- install or migrate
if bench --site "$SITE" list-apps 2>/dev/null | grep -qw "$APP"; then
	say "Updating $APP on $SITE (migrate)"
	bench --site "$SITE" migrate
else
	say "Installing $APP on $SITE"
	bench --site "$SITE" install-app "$APP"
fi

say "Checking everything is in place (repair)"
bench --site "$SITE" execute tsl_reports.setup.repair.run || die "Repair step failed – send the output above to support"

say "Clearing cache"
bench --site "$SITE" clear-cache
bench --site "$SITE" clear-website-cache >/dev/null 2>&1 || true

say "Restarting"
if ! bench restart >/dev/null 2>&1; then
	printf '\033[1;33mCould not restart automatically. If you use "bench start", stop it (Ctrl+C) and start it again.\033[0m\n'
fi

ok "
Done! TSL Reports $(grep -oP '(?<=__version__ = \")[^\"]+' "$DEST/$APP/__init__.py" || true) is ready on $SITE.
Open any 'Evaluation - Technical Report' and press Ctrl+Shift+R once in the browser.
Click the blue 'Edit Report' button at the top of the form to open the editor."

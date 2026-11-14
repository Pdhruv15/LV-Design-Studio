#!/bin/bash
# Quit the app before update-app replaces it, and wait until it has really closed. A question the app asks first
# (unsaved changes) keeps it open, and replacing the app under a running copy leaves that copy on the old version
# while the install reports success. Exits 0 once the app is closed (or was not open); 1, saying why, when it is
# still open after the wait, so update-app stops without replacing anything.
# Usage: bash scripts/quit-app.sh "<app name>" [seconds to wait, default 60]
set -euo pipefail
APP="$1"; WAIT="${2:-60}"

pgrep -xq "$APP" || exit 0
echo "Waiting for $APP to close — if it asks about unsaved changes, answer it."
osascript -e "quit app \"$APP\"" >/dev/null 2>&1 || true
for _ in $(seq 1 "$WAIT"); do
  sleep 1
  pgrep -xq "$APP" || exit 0
done
echo "$APP is still open, perhaps asking about unsaved changes. Nothing was replaced: answer it or quit the app, then run npm run update-app again."
exit 1

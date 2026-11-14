#!/usr/bin/env bash
# Builds and (re)starts the PRODUCTION stack. Run via `npm run prod`.
#
# Sequence: stop prod service (if installed) -> build -> start.
# We stop BEFORE building because `tsc --build` / `vite build` rewrite dist/, and
# a live backend/Caddy serving a half-written dist is exactly the kind of
# mid-service glitch this project exists to prevent.
#
# Dev processes are killed (and verified dead) by run-prod.sh -> stop-dev.sh.
#
# If the boot service is installed (scripts/auto-launch-prod.sh) it is restarted,
# so what you just built is what runs at the next boot too. Otherwise the stack
# runs in this terminal; Ctrl+C stops it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE="invisible-av.service"

cd "$PROJECT_ROOT"

service_installed() {
  systemctl --user list-unit-files "$SERVICE" 2>/dev/null | grep -q "^$SERVICE"
}

if service_installed; then
  echo "[prod] Stopping $SERVICE for the rebuild..."
  systemctl --user stop "$SERVICE"
fi

echo "[prod] Building..."
npm run build

if service_installed; then
  # Dev processes must be gone BEFORE the service starts; the service also runs
  # stop-dev itself, but doing it here gives the operator immediate, visible failure.
  bash "$SCRIPT_DIR/stop-dev.sh"

  echo "[prod] Starting $SERVICE..."
  systemctl --user start "$SERVICE" --no-block

  # Verify: the unit being "active" only means the script is running; confirm Caddy + backend answer.
  for _ in $(seq 1 90); do
    api_code="$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/api/auth/me 2>/dev/null || true)"
    if [[ "$api_code" =~ ^[1-4][0-9][0-9]$ ]]; then
      echo "[prod] Verified: production is up at https://localhost (service: $SERVICE)"
      exit 0
    fi
    if ! systemctl --user is-active --quiet "$SERVICE"; then
      echo "[prod] ERROR: $SERVICE stopped. See: journalctl --user -u $SERVICE -n 50" >&2
      exit 1
    fi
    sleep 1
  done
  echo "[prod] ERROR: production did not answer within 90s. See: journalctl --user -u $SERVICE -n 50" >&2
  exit 1
fi

echo "[prod] Boot service not installed (run scripts/auto-launch-prod.sh to enable start-at-boot). Running in foreground."
exec bash "$SCRIPT_DIR/run-prod.sh"

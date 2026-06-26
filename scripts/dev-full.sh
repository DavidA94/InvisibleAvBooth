#!/usr/bin/env bash
# Starts Caddy (if not already running) + backend + frontend for local development.
# Access the app at https://localhost
#
# Prerequisites:
#   - Caddy installed: https://caddyserver.com/docs/install
#   - Run `caddy trust` once to install the local CA
#
# Usage: ./scripts/dev-full.sh
#        Or: npm run dev:full

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $(jobs -p) 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

cd "$PROJECT_ROOT"

# Ensure Caddy is running
bash scripts/ensure-caddy.sh

# Start backend
echo "Starting backend..."
npm run dev --workspace=packages/backend &

# Start frontend
echo "Starting frontend..."
npm run dev --workspace=packages/frontend &

echo ""
echo "═══════════════════════════════════════════"
echo "  App running at https://invisible.av"
echo "  (also: https://localhost)"
echo "  Press Ctrl+C to stop all services"
echo "═══════════════════════════════════════════"
echo ""

wait

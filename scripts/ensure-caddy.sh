#!/usr/bin/env bash
# Ensures Caddy is running with the dev config. Safe to call multiple times.
# If Caddy is already running, does nothing (no sudo prompt).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CADDY_CONFIG="$PROJECT_ROOT/Caddyfile.dev"

if ! command -v caddy &>/dev/null; then
  echo "Warning: Caddy is not installed. API routing will not work."
  echo "Install from https://caddyserver.com/docs/install"
  exit 0
fi

if [ ! -f "$PROJECT_ROOT/certs/localhost.crt" ]; then
  echo "No TLS certificate found. Generating..."
  bash "$PROJECT_ROOT/scripts/generate-cert.sh"
fi

if pgrep caddy &>/dev/null; then
  exit 0
fi

echo "Starting Caddy (requires sudo for port 443)..."
sudo caddy start --config "$CADDY_CONFIG"

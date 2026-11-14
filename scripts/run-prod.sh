#!/usr/bin/env bash
# Runs the PRODUCTION stack in the foreground: Caddy (static frontend + reverse
# proxy) and the compiled backend (`node dist/index.js`).
#
# This is the process the boot-time systemd service executes
# (see scripts/auto-launch-prod.sh) and what `npm run prod` runs when the service
# is not installed. It deliberately does NOT build: building at boot is slow and
# can fail, and a half-built dist would take the booth down. Building happens in
# `npm run prod` (scripts/prod.sh) before this is started.
#
# If either child exits, this script exits non-zero so systemd restarts the whole
# stack — a Caddy without a backend (or the reverse) is a confusing half-working
# state for a volunteer, so it's all-or-nothing.
#
# Never prompts for a password. Anything needing privileges (binding ports 80/443)
# is arranged once, by scripts/auto-launch-prod.sh.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/packages/backend/.env"

# Caddy needs 80 (auto HTTP->HTTPS redirect even with manual certs) and 443.
REQUIRED_BIND_PORT=80
# 2019 = Caddy admin API, 3001 = backend, 3080 = overlay, 1935 = RTMP relay.
PORTS_TO_VERIFY="80 443 3080 3001 2019 1935"
VERIFY_TIMEOUT_SECONDS=60

log() { echo "[run-prod] $*"; }
die() { echo "[run-prod] ERROR: $*" >&2; exit 1; }

cd "$PROJECT_ROOT" || die "Cannot cd to $PROJECT_ROOT"

# 1. Kill any dev stack, with verification (exits non-zero if it can't).
bash "$SCRIPT_DIR/stop-dev.sh" || die "Could not stop the dev stack; refusing to start production on top of it."

# 2. Preflight — fail loudly now rather than mysteriously later.
command -v caddy >/dev/null || die "Caddy is not installed (https://caddyserver.com/docs/install)."
command -v node >/dev/null || die "node not found on PATH."
[ -f packages/backend/dist/index.js ] || die "Backend is not built. Run: npm run prod"
[ -f packages/frontend/dist/index.html ] || die "Frontend is not built. Run: npm run prod"
[ -f "$ENV_FILE" ] || die "Missing $ENV_FILE (copy .env.example and set DEVICE_SECRET_KEY)."
[ -f certs/localhost.crt ] && [ -f certs/localhost.key ] || die "TLS certs missing. Run once: bash scripts/generate-cert.sh"

# The backend falls back to a hardcoded, public JWT secret when JWT_SECRET is unset,
# which would let anyone forge a login cookie. Dev tolerates that; production must
# not. Generate once and persist (not per-boot, or every restart would log everyone out).
if ! grep -Eq '^JWT_SECRET=.+' "$ENV_FILE"; then
  log "JWT_SECRET not set — generating one and saving it to packages/backend/.env"
  JWT_SECRET_VALUE="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
  { [ -s "$ENV_FILE" ] && [ -n "$(tail -c1 "$ENV_FILE")" ] && echo; echo "JWT_SECRET=$JWT_SECRET_VALUE"; } >>"$ENV_FILE"
fi

# Binding 80/443 without root requires net.ipv4.ip_unprivileged_port_start <= 80.
if [ "$EUID" -ne 0 ]; then
  # Read /proc directly: `sysctl` lives in /usr/sbin, which is not on the systemd
  # user service's PATH, and a failed lookup here would wrongly report "cannot bind".
  unprivileged_start="$(cat /proc/sys/net/ipv4/ip_unprivileged_port_start 2>/dev/null || echo 1024)"
  if [ "$unprivileged_start" -gt "$REQUIRED_BIND_PORT" ]; then
    die "This user cannot bind port $REQUIRED_BIND_PORT/443. Run once: bash scripts/auto-launch-prod.sh"
  fi
fi

# 3. Make sure nothing else is holding our ports (e.g. a stale prod instance).
for port in $PORTS_TO_VERIFY; do
  if [ -n "$(ss -ltnH "sport = :$port" 2>/dev/null)" ]; then
    die "Port $port is already in use: $(ss -ltnpH "sport = :$port" 2>/dev/null | head -1)"
  fi
done

# 4. Start. The backend must run with `--conditions=compiled`: @invisible-av-booth/shared
# exports raw .ts source by default (fine for tsx/Vite, fatal for plain node). The
# `compiled` export condition points node at shared's tsc output in dist/ instead.
# Paths in the Caddyfile are relative, so Caddy runs from the repo root;
# the backend runs from packages/backend so dotenv finds .env and data/app.db resolves
# exactly as it does in dev.
CADDY_PID=""
BACKEND_PID=""

cleanup() {
  trap - EXIT INT TERM
  log "Shutting down production stack..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  [ -n "$CADDY_PID" ] && kill "$CADDY_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT
trap 'exit 0' INT TERM

log "Starting Caddy (production Caddyfile)..."
caddy run --config "$PROJECT_ROOT/Caddyfile" &
CADDY_PID=$!

log "Starting backend (NODE_ENV=production)..."
(cd "$PROJECT_ROOT/packages/backend" && NODE_ENV=production exec node --conditions=compiled dist/index.js) &
BACKEND_PID=$!

# 5. Verify it is really serving. 000 = nothing listening, 502/503/504 = Caddy up but
# backend not. Anything else from /api (e.g. 401) proves the whole chain works.
verify_serving() {
  local deadline=$((SECONDS + VERIFY_TIMEOUT_SECONDS))
  # Not local: the caller reports the last-seen codes if verification times out.
  site_code=""
  api_code=""
  while [ "$SECONDS" -lt "$deadline" ]; do
    kill -0 "$CADDY_PID" 2>/dev/null || return 2
    kill -0 "$BACKEND_PID" 2>/dev/null || return 2
    site_code="$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/ 2>/dev/null || true)"
    api_code="$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/api/auth/me 2>/dev/null || true)"
    if [ "$site_code" = "200" ] && [[ "$api_code" =~ ^[1-4][0-9][0-9]$ ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

verify_serving
case $? in
  0) log "Verified: production stack is serving at https://localhost" ;;
  2) log "A production process exited during startup." ;;
  *) log "WARNING: not serving after ${VERIFY_TIMEOUT_SECONDS}s (frontend=${site_code:-?}, api=${api_code:-?}). Still running; check logs." ;;
esac

# Exit as soon as either child dies so the supervisor restarts both.
wait -n
status=$?
log "A production process exited (status $status)."
exit 1

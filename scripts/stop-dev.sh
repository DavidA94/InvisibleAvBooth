#!/usr/bin/env bash
# Stops every DEVELOPMENT process for this project and VERIFIES they are gone.
#
# Why this exists: the dev stack (`npm run dev:full`) and the production stack
# (`npm run prod` / the boot service) fight over the same ports (3001, 443, 3080,
# Caddy's admin API on 2019). If a leftover dev process survives, the production
# stack either fails to start or — worse — appears to start while a dev server
# (with a hot-reloading backend that drops OBS/mixer connections) is actually
# the thing serving the booth. So we kill, then prove it worked, and exit
# non-zero if anything is still alive.
#
# What counts as "dev" (only processes whose working directory is inside this
# repo are touched, so other projects' Vite/tsx are never killed):
#   - scripts/dev-full.sh and its `npm run dev` wrappers
#   - `tsx watch` (backend dev server)
#   - `vite` (frontend dev server)
#   - Caddy running Caddyfile.dev (may be root-owned; stopped via its admin API,
#     which needs no sudo)
#
# Usage: bash scripts/stop-dev.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GRACE_SECONDS=10
VITE_PORT=5173

log() { echo "[stop-dev] $*"; }
fail() { echo "[stop-dev] ERROR: $*" >&2; exit 1; }

# Prints PIDs of project-local dev processes (never this script or its parent,
# so `npm run prod` -> run-prod.sh -> stop-dev.sh cannot kill its own caller).
find_dev_pids() {
  local pattern pid cwd
  for pattern in 'scripts/dev-full\.sh' 'npm run dev' 'tsx( .*)? watch' '(^|/| )vite( |$)'; do
    for pid in $(pgrep -f "$pattern" 2>/dev/null || true); do
      [ "$pid" = "$$" ] && continue
      [ "$pid" = "$PPID" ] && continue
      cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
      case "$cwd" in
        "$PROJECT_ROOT" | "$PROJECT_ROOT"/*) echo "$pid" ;;
      esac
    done
  done | sort -un
}

# Prints PIDs of Caddy instances running the dev config.
find_dev_caddy_pids() {
  pgrep -f 'caddy.*Caddyfile\.dev' 2>/dev/null || true
}

port_in_use() {
  [ -n "$(ss -ltnH "sport = :$1" 2>/dev/null)" ]
}

wait_until_gone() {
  # $1 = description, remaining args = PIDs. Returns 0 if all exited in time.
  local description="$1"
  shift
  local deadline=$((SECONDS + GRACE_SECONDS)) pid alive
  while [ "$SECONDS" -lt "$deadline" ]; do
    alive=0
    for pid in "$@"; do
      kill -0 "$pid" 2>/dev/null && alive=1
    done
    [ "$alive" -eq 0 ] && return 0
    sleep 0.5
  done
  log "$description did not exit within ${GRACE_SECONDS}s"
  return 1
}

stop_node_dev_processes() {
  local pids
  pids="$(find_dev_pids)"
  if [ -z "$pids" ]; then
    log "No dev Node processes running."
    return 0
  fi

  log "Stopping dev processes: $(echo "$pids" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true

  # shellcheck disable=SC2086
  if ! wait_until_gone "dev processes" $pids; then
    log "Forcing remaining dev processes to stop (SIGKILL)"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi
}

stop_dev_caddy() {
  local pids
  pids="$(find_dev_caddy_pids)"
  if [ -z "$pids" ]; then
    log "Dev Caddy not running."
    return 0
  fi

  log "Stopping dev Caddy (pid $(echo "$pids" | tr '\n' ' '))"
  # `caddy stop` talks to the admin API on localhost:2019, so it works even when
  # Caddy was started with sudo and is owned by root. No password needed.
  # `caddy stop` BLOCKS while Caddy drains open connections (browser keep-alives,
  # websockets), which can be forever — so it is always wrapped in a timeout.
  timeout 5 caddy stop >/dev/null 2>&1 || true

  # shellcheck disable=SC2086
  if wait_until_gone "dev Caddy" $pids; then
    return 0
  fi

  # Caddy is stuck draining. Escalate: passwordless sudo if configured, else prompt
  # when a human is at the terminal. At boot there is never a dev Caddy, so the
  # non-interactive path only matters for scripted use.
  log "Dev Caddy is stuck shutting down; killing it"
  # shellcheck disable=SC2086
  if ! sudo -n kill $pids 2>/dev/null; then
    # shellcheck disable=SC2086
    [ -t 0 ] && sudo kill $pids
  fi
  # shellcheck disable=SC2086
  wait_until_gone "dev Caddy" $pids || true
}

verify_clean() {
  local leftover caddy_leftover
  leftover="$(find_dev_pids)"
  caddy_leftover="$(find_dev_caddy_pids)"

  if [ -n "$leftover" ]; then
    fail "Dev processes still running after stop attempt: $(echo "$leftover" | tr '\n' ' ')"
  fi
  if [ -n "$caddy_leftover" ]; then
    fail "Dev Caddy still running (pid $(echo "$caddy_leftover" | tr '\n' ' ')). Stop it with: sudo kill $(echo "$caddy_leftover" | tr '\n' ' ')"
  fi
  if port_in_use "$VITE_PORT"; then
    fail "Port $VITE_PORT (Vite) is still in use: $(ss -ltnpH "sport = :$VITE_PORT" 2>/dev/null | head -1)"
  fi
}

stop_node_dev_processes
stop_dev_caddy
verify_clean
log "Verified: no dev processes remain."

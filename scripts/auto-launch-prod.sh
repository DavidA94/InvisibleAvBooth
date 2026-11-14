#!/bin/bash
# One-time installer: makes the PRODUCTION stack start automatically at boot,
# with no password prompt. Companion to auto-launch-obs.sh (which handles
# auto-login + OBS); run both on the booth machine.
#
# What it sets up, and why:
#   1. sysctl net.ipv4.ip_unprivileged_port_start=80
#        Caddy must bind ports 80/443. Rather than run as root (and need sudo at
#        boot, which can't be answered), we let ordinary users bind >= 80. This
#        survives `apt upgrade` of Caddy, unlike `setcap` on the binary, which is
#        silently wiped on upgrade and would break the next boot. Tradeoff:
#        any local user process may bind ports 80+; acceptable on a single-purpose
#        booth machine.
#   2. Disable the distro `caddy.service` if enabled
#        It would grab ports 80/443 at boot with /etc/caddy/Caddyfile before ours.
#   3. systemd USER service `invisible-av.service`
#        Runs scripts/run-prod.sh as this user (no root, no password). Restarts on
#        failure. A user service is used because the backend needs the user's
#        .env, data/ directory and OBS/NDI session.
#   4. loginctl enable-linger
#        Starts the user service at boot even before the desktop login completes.
#        (auto-launch-obs.sh already configures GDM auto-login.)
#
# Usage: bash scripts/auto-launch-prod.sh      (as your normal user, NOT sudo)
# Safe to re-run; it rewrites the unit and re-applies settings.

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

if [ "$EUID" -eq 0 ]; then
    error "Please run this script as your regular user (WITHOUT sudo); it uses sudo internally where needed."
    exit 1
fi

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="invisible-av.service"
UNIT_DIR="$HOME/.config/systemd/user"
SYSCTL_FILE="/etc/sysctl.d/99-invisible-av.conf"

info "=== Installing Invisible A/V production auto-launch ==="

# Preflight: fail now, not at 9am Sunday.
command -v caddy >/dev/null || { error "Caddy is not installed (https://caddyserver.com/docs/install)."; exit 1; }
command -v node >/dev/null || { error "node not found on PATH."; exit 1; }
[ -f "$PROJECT_ROOT/packages/backend/.env" ] || { error "packages/backend/.env is missing (set DEVICE_SECRET_KEY first)."; exit 1; }
if [ ! -f "$PROJECT_ROOT/certs/localhost.crt" ]; then
    info "No TLS certificate found. Generating..."
    bash "$SCRIPT_DIR/generate-cert.sh"
fi

# Build now if needed so the service has something to run at first boot.
if [ ! -f "$PROJECT_ROOT/packages/backend/dist/index.js" ] || [ ! -f "$PROJECT_ROOT/packages/frontend/dist/index.html" ]; then
    info "No production build found. Building..."
    (cd "$PROJECT_ROOT" && npm run build)
fi

# 1. Allow binding 80/443 without root.
info "Allowing unprivileged binding of ports >= 80 (sudo required once)..."
echo "net.ipv4.ip_unprivileged_port_start=80" | sudo tee "$SYSCTL_FILE" > /dev/null
sudo sysctl -w net.ipv4.ip_unprivileged_port_start=80 > /dev/null

# 2. Make sure the distro Caddy service does not compete for the ports.
if systemctl is-enabled --quiet caddy.service 2>/dev/null; then
    warn "System caddy.service is enabled; disabling it so it doesn't take ports 80/443 at boot."
    sudo systemctl disable --now caddy.service
fi

# 3. User service. PATH is baked in from this shell because systemd user services
# don't load ~/.bashrc, so an nvm-installed node would otherwise not be found.
NODE_DIR="$(dirname "$(command -v node)")"
SERVICE_PATH="$NODE_DIR:/usr/local/bin:/usr/bin:/bin"

mkdir -p "$UNIT_DIR"
tee "$UNIT_DIR/$SERVICE_NAME" > /dev/null << EOF
[Unit]
Description=Invisible A/V Booth (production: Caddy + backend)
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_ROOT
Environment=NODE_ENV=production
Environment=PATH=$SERVICE_PATH
ExecStart=/bin/bash $PROJECT_ROOT/scripts/run-prod.sh
# Come back by itself after a crash; a volunteer should never have to touch a terminal.
Restart=always
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"

# 4. Start at boot even if the desktop session isn't up yet.
info "Enabling user lingering (starts the service at boot)..."
sudo loginctl enable-linger "$USER"

info "=== Install Complete ==="
info ""
info "What was configured:"
info "  • $SYSCTL_FILE (ports >= 80 bindable without root)"
info "  • $UNIT_DIR/$SERVICE_NAME (enabled, starts at boot)"
info "  • User lingering for '$USER'"
info ""
info "Useful commands:"
info "  npm run prod                                  # rebuild + restart production"
info "  systemctl --user status $SERVICE_NAME"
info "  journalctl --user -u $SERVICE_NAME -f         # live logs"
info "  systemctl --user disable --now $SERVICE_NAME  # undo auto-launch"
info ""

while true; do
    read -p "${GREEN}Start production now? This stops any running dev stack. (Y/N): ${NC}" response
    case "$response" in
        [Yy]* ) cd "$PROJECT_ROOT" && bash "$SCRIPT_DIR/prod.sh"; break;;
        [Nn]* ) info "Not started. It will start automatically at next boot."; break;;
        * ) error "Invalid selection. Please answer Y or N.";;
    esac
done

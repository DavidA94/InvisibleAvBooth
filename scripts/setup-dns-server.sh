#!/usr/bin/env bash
#
# Turns this Ubuntu machine into a LAN DNS server that answers for exactly one
# name, invisible.av, with this machine's own LAN IP. Every other query is
# forwarded upstream, so devices that use this machine as their DNS server
# behave as if it were not there.
#
# WHY: the router cannot define custom domains. The router's DHCP is pointed at
# this machine instead (a manual router step, see docs/setup.md section 2), and
# this machine supplies the one record the router can't.
#
# DESIGN DECISIONS (what breaks if you change them):
#   - dnsmasq binds only the LAN IP and 127.0.0.1 (bind-interfaces). systemd-resolved
#     already owns 127.0.0.53/127.0.0.54:53, so the two coexist without disabling
#     its stub listener. Disabling the stub would leave /etc/resolv.conf pointing
#     at a dead address and take down the host's own DNS (and Tailscale MagicDNS).
#   - The host itself reaches dnsmasq via a resolved drop-in that routes ONLY
#     invisible.av to 127.0.0.1. Everything else keeps using resolved's normal
#     per-link DNS, so Tailscale and the router's DHCP DNS are untouched.
#   - Upstream servers are captured ONCE here and written into the dnsmasq config.
#     After the router hands out this machine as DNS, DHCP will list this machine
#     itself as a resolver; reading upstreams live would make dnsmasq forward to
#     itself in a loop. This script excludes its own IP and loopback for that reason.
#   - strict-order: try the ISP/router servers first, then Google, then Cloudflare.
#     Without it dnsmasq sprays queries at all upstreams and ISP-first is lost.
#   - dns-loop-detect: if the router's own forwarder is later changed to point at
#     this machine, loop detection keeps lookups failing over to the public backups.
#   - Only invisible.av exactly (host-record), not *.invisible.av (address=/.../).
#   - Port 53 is opened only to the local subnet so this is never an open resolver.
#
# Safe to re-run: the config is regenerated and existing upstreams are preserved
# if the live DHCP DNS list no longer contains any usable ones.

set -euo pipefail

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

DOMAIN="invisible.av"
DNSMASQ_CONF="/etc/dnsmasq.d/invisible-av.conf"
RESOLVED_DROPIN="/etc/systemd/resolved.conf.d/invisible-av.conf"
# Google first, Cloudflare second: only used when the ISP/router servers fail.
BACKUP_DNS=("8.8.8.8" "1.1.1.1")

if ! command -v apt &>/dev/null; then
  error "apt not found. This script requires a Debian/Ubuntu-based system."
  exit 1
fi

# ── Detect the LAN interface and address ─────────────────────────────────────
INTERFACE="$(ip -4 route show default | awk '{print $5; exit}')"
if [[ -z "$INTERFACE" ]]; then
  error "No default route found. Connect to the LAN and re-run."
  exit 1
fi

ADDRESS_LINE="$(ip -4 -o addr show dev "$INTERFACE" scope global | awk '{print $4; exit}')"
SERVER_IP="${ADDRESS_LINE%/*}"
SUBNET="$(ip -4 route show dev "$INTERFACE" scope link | awk '{print $1; exit}')"
MAC_ADDRESS="$(cat "/sys/class/net/${INTERFACE}/address")"

if [[ -z "$SERVER_IP" || -z "$SUBNET" ]]; then
  error "Could not determine the IPv4 address or subnet of ${INTERFACE}."
  exit 1
fi

info "Interface: ${INTERFACE}  IP: ${SERVER_IP}  Subnet: ${SUBNET}"
info "${DOMAIN} will resolve to ${SERVER_IP}"

if ip -4 -o addr show dev "$INTERFACE" | grep -q "dynamic"; then
  warn "${SERVER_IP} is DHCP-assigned. If the lease changes, ${DOMAIN} will point at a dead address."
  warn "Create a DHCP reservation on your router for MAC ${MAC_ADDRESS} -> ${SERVER_IP}."
fi

# ── Collect upstream DNS servers ─────────────────────────────────────────────
# Skip loopback and our own IP: once the router hands out this machine as DNS,
# DHCP will report ourselves as a resolver and forwarding to it would loop.
UPSTREAMS=()
if [[ -r /run/systemd/resolve/resolv.conf ]]; then
  while read -r _ server; do
    [[ -z "$server" || "$server" == 127.* || "$server" == "$SERVER_IP" || "$server" == *:* ]] && continue
    UPSTREAMS+=("$server")
  done < <(grep -E '^nameserver ' /run/systemd/resolve/resolv.conf)
fi

# Re-run after the router already points at us: DHCP no longer lists the real
# upstreams, so keep the ones recorded last time instead of losing them.
if [[ ${#UPSTREAMS[@]} -eq 0 && -r "$DNSMASQ_CONF" ]]; then
  while read -r server; do
    skip=false
    for backup in "${BACKUP_DNS[@]}"; do [[ "$server" == "$backup" ]] && skip=true; done
    [[ "$server" == "$SERVER_IP" || "$server" == 127.* ]] && skip=true
    $skip || UPSTREAMS+=("$server")
  done < <(sed -n 's/^server=//p' "$DNSMASQ_CONF")
  [[ ${#UPSTREAMS[@]} -gt 0 ]] && info "Reusing upstream DNS servers from the previous run: ${UPSTREAMS[*]}"
fi

if [[ ${#UPSTREAMS[@]} -eq 0 ]]; then
  warn "No ISP/router DNS servers found; only the public backups (${BACKUP_DNS[*]}) will be used."
else
  info "ISP/router upstream DNS: ${UPSTREAMS[*]}"
fi

# ── Install dnsmasq ──────────────────────────────────────────────────────────
# Config is written before install so the package's first start already uses
# bind-interfaces instead of failing on a wildcard bind of port 53.
info "Writing ${DNSMASQ_CONF}"
sudo mkdir -p /etc/dnsmasq.d
{
  echo "# Generated by scripts/setup-dns-server.sh - re-run the script instead of editing."
  echo "listen-address=127.0.0.1,${SERVER_IP}"
  echo "bind-interfaces"
  echo "no-resolv"
  echo "no-hosts"
  echo "domain-needed"
  echo "bogus-priv"
  echo "strict-order"
  echo "dns-loop-detect"
  echo "cache-size=1000"
  echo "host-record=${DOMAIN},${SERVER_IP}"
  for server in "${UPSTREAMS[@]}" "${BACKUP_DNS[@]}"; do
    echo "server=${server}"
  done
} | sudo tee "$DNSMASQ_CONF" >/dev/null

info "Installing dnsmasq"
sudo apt-get install -y --no-install-recommends dnsmasq bind9-dnsutils

sudo dnsmasq --test --conf-file=/etc/dnsmasq.conf >/dev/null
sudo systemctl enable dnsmasq
sudo systemctl restart dnsmasq

# ── Let this machine resolve invisible.av through its own dnsmasq ────────────
info "Routing ${DOMAIN} lookups on this machine to dnsmasq"
sudo mkdir -p "$(dirname "$RESOLVED_DROPIN")"
printf '[Resolve]\nDNS=127.0.0.1\nDomains=~%s\n' "$DOMAIN" | sudo tee "$RESOLVED_DROPIN" >/dev/null
sudo systemctl restart systemd-resolved

# ── Firewall: local subnet only ──────────────────────────────────────────────
info "Allowing DNS (port 53) from ${SUBNET} only"
sudo ufw allow from "$SUBNET" to any port 53 proto udp
sudo ufw allow from "$SUBNET" to any port 53 proto tcp

# ── Verify ───────────────────────────────────────────────────────────────────
FAILED=false
verify() {
  local description="$1" expected="$2"
  shift 2
  local actual
  actual="$("$@" 2>/dev/null | head -n1 || true)"
  if [[ -n "$actual" && ( -z "$expected" || "$actual" == "$expected" ) ]]; then
    info "OK: ${description} -> ${actual}"
  else
    error "FAILED: ${description} (got '${actual}')"
    FAILED=true
  fi
}

sleep 1
verify "dnsmasq answers ${DOMAIN}" "$SERVER_IP" dig +short +time=3 +tries=1 @"$SERVER_IP" "$DOMAIN"
verify "dnsmasq forwards other names" "" dig +short +time=3 +tries=1 @"$SERVER_IP" example.com
verify "this machine resolves ${DOMAIN}" "$SERVER_IP" dig +short +time=3 +tries=1 "$DOMAIN"

if $FAILED; then
  error "DNS setup finished with failures. Check: sudo journalctl -u dnsmasq -n 50"
  exit 1
fi

echo
info "DNS server is ready."
info "Last manual step: in your router's DHCP settings, set the DNS server to ${SERVER_IP}."
info "Then renew the lease on a client and check: nslookup ${DOMAIN}"

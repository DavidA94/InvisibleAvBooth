#!/usr/bin/env bash
# Generates a self-signed TLS certificate for local development.
# Valid for: localhost, invisible.av, 127.0.0.1
# Run once. Import certs/localhost.crt on tablets to trust it.

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
NC=$'\033[0m'

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/../certs"
CERT_PATH="$SCRIPT_DIR/../certs/localhost.crt"

mkdir -p "$CERTS_DIR"

if [ -f "$CERT_PATH" ]; then
  echo "${RED}Certificate already exists at certs/localhost.crt${NC}"
  echo "Delete certs/ and re-run to regenerate."
  exit 0
fi

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
  -keyout "$CERTS_DIR/localhost.key" \
  -out "$CERTS_DIR/localhost.crt" \
  -days 3650 -nodes \
  -subj "/CN=invisible.av/O=Invisible AV Booth/OU=Development" \
  -addext "subjectAltName=DNS:invisible.av,DNS:localhost,IP:127.0.0.1"

## Install for the system
sudo cp $CERT_PATH /usr/local/share/ca-certificates/invisible-av.crt
sudo update-ca-certificates

# Install for Firefox

if ! command -v certutil &>/dev/null; then
  sudo apt install -y libnss3-tools
fi

FIREFOX_FOUND=0

for dir in \
  "$HOME/.mozilla/firefox" \
  "$HOME/snap/firefox/common/.mozilla/firefox" \
  "$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox" \
  "$HOME/.var/app/org.mozilla.Firefox/.mozilla/firefox"; do

  if [ -d "$dir" ]; then
    for profile in "$dir"/*.default* "$dir"/*.nightly*; do
      if [ -d "$profile" ] && { [ -f "$profile/cert9.db" ] || [ -f "$profile/cert8.db" ]; }; then
        certutil -d sql:"$profile" -D -n "Invisible AV" 2>/dev/null || true
        certutil -d sql:"$profile" -A -t "CT,C,C" -n "Invisible AV" -i "$CERT_PATH"
        echo "${GREEN}[OK] Certificate installed into Firefox profile: $profile${NC}"
        echo "Restart Firefox for the changes to take effect"
        FIREFOX_FOUND=$((FIREFOX_FOUND + 1))
      fi
    done
  fi
done

if [ "$FIREFOX_FOUND" -eq 0 ]; then
  echo "${RED}[ERROR] No Firefox profile databases found. Checked:${NC}"
  echo "         ~/.mozilla/firefox"
  echo "         ~/snap/firefox/common/.mozilla/firefox"
  echo "         ~/.var/app/org.mozilla.firefox/.mozilla/firefox"
  echo "         ~/.var/app/org.mozilla.Firefox/.mozilla/firefox"
  echo "       Open Firefox once to create a profile, then re-run."
fi

# Install for OBS
OBS_FOUND=0

if flatpak list --app 2>/dev/null | grep -q "com.obsproject.Studio"; then
  sudo flatpak override com.obsproject.Studio --filesystem=/etc/ssl/certs:ro
  sudo flatpak override com.obsproject.Studio --env=SSL_CERT_DIR=/etc/ssl/certs
  flatpak override --user com.obsproject.Studio --filesystem=/etc/ssl/certs:ro
  flatpak override --user com.obsproject.Studio --env=SSL_CERT_DIR=/etc/ssl/certs
  echo "${GREEN}[OK] OBS Flatpak configured to trust system certificates${NC}"
  OBS_FOUND=1
fi

if snap list obs-studio &>/dev/null 2>&1; then
  # Snap OBS uses the system store if connected to the right interface
  sudo snap connect obs-studio:desktop :desktop 2>/dev/null || true
  echo "${GREEN}[OK] OBS Snap connected to desktop interface for cert access${NC}"
  OBS_FOUND=1
fi

if [ "$OBS_FOUND" -eq 0 ]; then
  # Check if OBS is installed natively (uses system certs automatically)
  if command -v obs &>/dev/null; then
    echo "${GREEN}[OK] OBS installed natively — uses system certificate store (no action needed)${NC}"
  else
    echo "${RED}[ERROR] OBS not found via Flatpak, Snap, or native install${NC}"
  fi
fi
#!/usr/bin/env bash

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Verify the system
info "Verifying we can run on this system"
if [[ "$(uname -m)" != "x86_64" ]]; then
  error "This script supports x86_64 only. Detected: $(uname -m)"
  exit 1
fi

if ! command -v apt &>/dev/null; then
  error "apt not found. This script requires a Debian/Ubuntu-based system."
  exit 1
fi

# Get the absolute path of the directory where THIS script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Change directory to the parent of the scripts folder
# This sets your working directory to the root of your project
cd "$SCRIPT_DIR/.." || exit 1

info "Installing required libraries"
sudo apt update
sudo apt install \
    caddy \
    flatpak \
    avahi-daemon avahi-discover avahi-utils mdns-scan \
    curl \
    -y --no-install-recommends

# Node / NPM
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.5/install.sh | bash
source ~/.bashrc
nvm install --lts

# ffmpeg v7
sudo add-apt-repository ppa:ubuntuhandbook1/ffmpeg7 -y
sudo apt update
sudo apt install ffmpeg

# Gstreamer
sudo apt-get install -y --no-install-recommends \
  gstreamer1.0-tools \
  gstreamer1.0-plugins-base \
  gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-plugins-ugly \
  gstreamer1.0-libav \
  libgstreamer1.0-dev \
  libgstreamer-plugins-base1.0-dev \
  gstreamer1.0-vaapi \
  libavahi-client3 \
  intel-media-va-driver-non-free \
  libmfx-gen1.2 \
  libvpl2 \
  vainfo

sudo usermod -aG render,video $(whoami)

# ── PipeWire (multi-consumer USB audio capture for the Sound Board) ───────────
# The mixer's USB interface is owned by PipeWire and shared among consumers
# (OBS's main-mix source + our per-channel capture) without exclusive-open
# conflicts. gstreamer1.0-pipewire provides the `pipewiresrc` element the
# Audio Capture Layer uses. See docs/setup.md for the required USB routing.
info "Installing PipeWire and the GStreamer PipeWire plugin"
sudo apt-get install -y --no-install-recommends \
  pipewire \
  pipewire-pulse \
  wireplumber \
  gstreamer1.0-pipewire

info "Verifying the pipewiresrc GStreamer element is available"
if gst-inspect-1.0 pipewiresrc &>/dev/null; then
  info "pipewiresrc is available — per-channel audio capture (gain window) can run."
else
  warn "pipewiresrc NOT found. The gain window will fall back to the slider tier."
  warn "Ensure gstreamer1.0-pipewire installed correctly and PipeWire is running."
fi

info "Checking for a class-compliant USB audio device (informational only)"
# The X Air presents as an 18-in USB audio interface. This is a soft check —
# the device may not be plugged in during setup. See docs/setup.md.
if command -v pw-cli &>/dev/null; then
  if pw-cli list-objects Node 2>/dev/null | grep -qi "audio"; then
    info "PipeWire reports at least one audio node. Verify the mixer appears when plugged in."
  else
    warn "No PipeWire audio nodes detected yet. Plug in the mixer's USB and re-check with: pw-cli list-objects Node"
  fi
else
  warn "pw-cli not found; skipping USB device enumeration check."
fi

info "Ensuring avahi-daemon is running..."
sudo systemctl enable --now avahi-daemon 2>/dev/null || true

info "Disabling caddy service"
sudo systemctl stop caddy
sudo systemctl disable caddy.service

info "Generating and installing the cert"
./scripts/generate-cert.sh

info "Opening ports 80, 443, and 3080 in the firewall"
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
sudo ufw allow 3080/tcp

./scripts/create-secret-key.sh

info "Installing NPM packages"
npm install

while true; do
    read -p "${GREEN}Do you want to seed the dashboard? (Y/N): ${NC}" response
    case "$response" in
        [Yy]* ) 
            cd packages/backend
            npx tsx scripts/seed-dashboard.ts
            cd ../../ # Back to the original spot
            break;;
        [Nn]* ) info "Skipped seeding the dashboard."; break;;
        * ) error "Invalid selection. Please answer Y or N.";;
    esac
done

info "Installing OBS"
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install flathub com.obsproject.Studio -y
flatpak install com.obsproject.Studio com.obsproject.Studio.Plugin.DistroAV -y
# Override the system and the user, to ensure NDI discovery works
sudo flatpak override com.obsproject.Studio --system-talk-name=org.freedesktop.Avahi
flatpak override --user com.obsproject.Studio --system-talk-name=org.freedesktop.Avahi
./scripts/auto-launch-obs.sh

info "Installing NDI"
NDI_TEMP_DIR="$(mktemp -d)"
NDI_SOURCE_DIR="NDI Advanced SDK for Linux/lib/x86_64-linux-gnu/"
cd "$NDI_TEMP_DIR"
wget https://downloads.ndi.tv/SDK/NDI_SDK_Linux/Install_NDI_Advanced_SDK_v6_Linux.tar.gz
tar xf Install_NDI_Advanced_SDK_v6_Linux.tar.gz
chmod +x Install_NDI_Advanced_SDK_v6_Linux.sh
yes | ./Install_NDI_Advanced_SDK_v6_Linux.sh
sudo cp -P "./${NDI_SOURCE_DIR}"*.* /usr/local/lib
sudo ldconfig
cd "$SCRIPT_DIR/.."

info "Instaling LibNDI"
LIB_NDI_TEMP_DIR="$(mktemp -d)"
cd "$LIB_NDI_TEMP_DIR"
wget https://raw.githubusercontent.com/DistroAV/DistroAV/refs/heads/master/CI/libndi-get.sh
chmod +x libndi-get.sh
sudo ./libndi-get.sh install
cd "$SCRIPT_DIR/.."

info "Installing Gstreamer NDI Plugin"
./scripts/install-gstreamer-ndi.sh

info "Opening the firewall for NDI"
sudo systemctl enable avahi-daemon
sudo systemctl start avahi-daemon
sudo ufw allow 5353/udp
sudo ufw allow 5959:5969/tcp
sudo ufw allow 5959:5969/udp
sudo ufw allow 6960:6970/tcp
sudo ufw allow 6960:6970/udp
sudo ufw allow 7960:7970/tcp
sudo ufw allow 7960:7970/udp
sudo ufw allow 5960/tcp


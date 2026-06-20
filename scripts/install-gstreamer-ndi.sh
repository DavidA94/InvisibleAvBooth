#!/usr/bin/env bash
# Install GStreamer with NDI plugin support for Invisible A/V Booth.
#
# This script:
#   1. Installs GStreamer core + plugins via apt
#   2. Installs the NDI runtime library (from DistroAV)
#   3. Installs Rust via rustup (for building the NDI plugin)
#   4. Builds gst-plugin-ndi from the official GStreamer gst-plugins-rs repo
#   5. Installs the compiled plugin into the GStreamer plugin path
#   6. Verifies the installation
#
# Usage: bash scripts/install-gstreamer-ndi.sh
# Requires: sudo, internet access, Ubuntu/Debian-based system (x86_64)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Preflight checks ─────────────────────────────────────────────────────────

if [[ "$(uname -m)" != "x86_64" ]]; then
  error "This script supports x86_64 only. Detected: $(uname -m)"
  exit 1
fi

if ! command -v apt-get &>/dev/null; then
  error "apt-get not found. This script requires a Debian/Ubuntu-based system."
  exit 1
fi

# ── Step 1: GStreamer core + plugins ──────────────────────────────────────────

info "Installing GStreamer packages..."
sudo apt-get update -qq
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
  avahi-daemon \
  libavahi-client3

info "Ensuring avahi-daemon is running..."
sudo systemctl enable --now avahi-daemon 2>/dev/null || true

# ── Step 2: NDI runtime library ───────────────────────────────────────────────

NDI_DEB_URL="https://sourceforge.net/projects/distroav.mirror/files/6.0.0/libndi6_6.0.0-1_amd64.deb/download"
NDI_DEB="/tmp/libndi6_6.0.0-1_amd64.deb"

if ldconfig -p | grep -q libndi; then
  info "NDI runtime library already installed, skipping."
else
  info "Downloading NDI runtime library..."
  wget -q --show-progress -O "$NDI_DEB" "$NDI_DEB_URL"
  info "Installing NDI runtime..."
  sudo dpkg -i "$NDI_DEB" || sudo apt-get install -f -y
  rm -f "$NDI_DEB"
  sudo ldconfig
fi

# ── Step 3: Rust toolchain ────────────────────────────────────────────────────

if command -v cargo &>/dev/null; then
  info "Rust/Cargo already installed ($(cargo --version))."
else
  info "Installing Rust via rustup..."
  sudo apt-get install -y --no-install-recommends curl
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
  info "Rust installed: $(cargo --version)"
fi

# Ensure cargo is on PATH for the rest of this script
export PATH="$HOME/.cargo/bin:$PATH"

# ── Step 4: Build gst-plugin-ndi ──────────────────────────────────────────────

GST_PLUGIN_PATH="/usr/lib/x86_64-linux-gnu/gstreamer-1.0"
BUILD_DIR="$(mktemp -d)"

# Build dependencies
info "Installing build dependencies..."
sudo apt-get install -y --no-install-recommends \
  build-essential \
  pkg-config \
  git

info "Cloning gst-plugins-rs (sparse, net/ndi only)..."
cd "$BUILD_DIR"
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/GStreamer/gst-plugins-rs.git
cd gst-plugins-rs
git sparse-checkout set net/ndi

info "Building gst-plugin-ndi (this may take a few minutes on first run)..."
cargo build --release -p gst-plugin-ndi

info "Installing plugin to ${GST_PLUGIN_PATH}..."
sudo install -o root -g root -m 644 \
  target/release/libgstndi.so \
  "$GST_PLUGIN_PATH/"
sudo ldconfig

# Cleanup
rm -rf "$BUILD_DIR"

# ── Step 5: Verify ────────────────────────────────────────────────────────────

info "Verifying GStreamer NDI plugin..."
echo ""

if gst-inspect-1.0 ndi &>/dev/null; then
  echo -e "${GREEN}✅ GStreamer NDI plugin installed successfully!${NC}"
  echo ""
  echo "Available elements:"
  gst-inspect-1.0 ndi | grep -E "^\s+(ndisrc|ndisink|ndisrcdemux)" || true
  echo ""
  echo "Test NDI source discovery:"
  echo "  gst-device-monitor-1.0 -f Source/Network:application/x-ndi"
  echo ""
  echo "Test pipeline (headless):"
  echo "  gst-launch-1.0 ndisrc ndi-name=\"YOUR-SOURCE\" ! ndisrcdemux name=d d.video ! queue ! fakesink sync=false"
else
  error "GStreamer NDI plugin verification failed."
  echo "Try running: GST_PLUGIN_PATH=$GST_PLUGIN_PATH gst-inspect-1.0 ndi"
  exit 1
fi

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

NDI_DEB_URL="https://sourceforge.net/projects/distroav.mirror/files/6.2.1/distroav-6.2.1-x86_64-linux-gnu.deb/download"
NDI_DEB="/tmp/distroav-6.2.1-x86_64-linux-gnu.deb"

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
echo "Done with NDI runtime"

info "Installing the NDI Advanced SDK"

NDI_SDK_TEMP_DIR="$(mktemp -d)"
cd "$NDI_SDK_TEMP_DIR"

wget https://downloads.ndi.tv/SDK/NDI_SDK_Linux/Install_NDI_Advanced_SDK_v6_Linux.tar.gz

tar xf Install_NDI_Advanced_SDK_v6_Linux.tar.gz

chmod +x Install_NDI_Advanced_SDK_v6_Linux.sh
yes | ./Install_NDI_Advanced_SDK_v6_Linux.sh

NDI_SRC="NDI Advanced SDK for Linux/lib/x86_64-linux-gnu"
NDI_DST="/opt/ndi/lib"

info "Installing NDI libraries to ${NDI_DST}"

sudo mkdir -p "$NDI_DST"

# Find actual library versions supplied by SDK
NDI_LIB=$(find "$NDI_SRC" -maxdepth 1 -name 'libndi.so.*.*.*' -type f | head -n1)
NDI_HX_LIB=$(find "$NDI_SRC" -maxdepth 1 -name 'libndi-hx.so.*.*.*' -type f | head -n1)

if [[ -z "$NDI_LIB" ]]; then
    echo "ERROR: Could not find libndi.so in SDK"
    exit 1
fi

if [[ -z "$NDI_HX_LIB" ]]; then
    echo "ERROR: Could not find libndi-hx.so in SDK"
    exit 1
fi

# Install real files
sudo install -m 755 "$NDI_LIB" "$NDI_DST/"
sudo install -m 755 "$NDI_HX_LIB" "$NDI_DST/"

# Extract filenames
NDI_FILE=$(basename "$NDI_LIB")
NDI_HX_FILE=$(basename "$NDI_HX_LIB")

# Create SONAME symlinks
sudo ln -sf "$NDI_FILE" "$NDI_DST/libndi.so.6"
sudo ln -sf "libndi.so.6" "$NDI_DST/libndi.so"

sudo ln -sf "$NDI_HX_FILE" "$NDI_DST/libndi-hx.so.6"
sudo ln -sf "libndi-hx.so.6" "$NDI_DST/libndi-hx.so"

# Register with loader
echo "$NDI_DST" | sudo tee /etc/ld.so.conf.d/ndi.conf >/dev/null

sudo ldconfig

info "Installed NDI libraries:"
ls -l "$NDI_DST"/libndi*
ldconfig -p | grep ndi


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

# 1. Install cargo-c system-wide (Do this once, or add it to dependencies)
cargo install cargo-c

# 2. Update your shell script to look like this:
info "Cloning complete gst-plugins-rs repository..."
cd "$BUILD_DIR"
git clone --depth 1 https://github.com/GStreamer/gst-plugins-rs.git
cd gst-plugins-rs

info "Building gst-plugin-ndi using official cargo-c toolchain..."
# Build the specific NDI package safely from the workspace root
cargo cbuild --release -p gst-plugin-ndi


info "Installing plugin to ${GST_PLUGIN_PATH}..."
TARGET_TRIPLE=$(rustc -vV | grep host | awk '{print $2}')
sudo install -o root -g root -m 644 \
  "target/${TARGET_TRIPLE}/release/libgstndi.so" \
  "$GST_PLUGIN_PATH/"
sudo ldconfig

# CRITICAL: Force GStreamer to clear its registry cache and scan the new plugin
info "Clearing GStreamer plugin registry cache..."
rm -rf ~/.cache/gstreamer-1.0/

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

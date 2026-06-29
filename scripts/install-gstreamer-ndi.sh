#!/usr/bin/env bash

set -euo pipefail

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }


# Install the dependencies
info "Installing Gstreamer NDI dependencies"
sudo apt install -y --no-install-recommends \
  rustup \
  build-essential \
  pkg-config \
  git

info "Setting up Rust"
rustup default stable

info "Beginning process to install the Gstreamer NDI plugin"
GST_PLUGIN_PATH="/usr/lib/x86_64-linux-gnu/gstreamer-1.0"
BUILD_DIR="$(mktemp -d)"
ORIGINAL_DIR=$(pwd)

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
cd "$ORIGINAL_DIR"

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

#!/usr/bin/env bash
# Build FFmpeg 4.4 with NDI input support for Linux.
# FFmpeg 5.0+ removed NDI support, so we use 4.4 (last supported version).
# This builds a separate binary at /usr/local/bin/ffmpeg-ndi to avoid
# conflicting with the system FFmpeg.
#
# Prerequisites: NDI SDK headers in /usr/local/include, libs in /usr/local/lib
# Run: bash scripts/build-ffmpeg-ndi.sh

set -e

echo "=== Building FFmpeg 4.4 with NDI support ==="

# Install build dependencies
sudo apt-get update
sudo apt-get install -y build-essential nasm yasm pkg-config \
  libx264-dev libx265-dev libfdk-aac-dev libavahi-client-dev

FFMPEG_VERSION="4.4.5"
BUILD_DIR="/tmp/ffmpeg-ndi-build"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

echo "=== Downloading FFmpeg $FFMPEG_VERSION ==="
wget -q "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz"
tar xf "ffmpeg-${FFMPEG_VERSION}.tar.xz"
cd "ffmpeg-${FFMPEG_VERSION}"

echo "=== Configuring ==="
./configure \
  --enable-nonfree \
  --enable-libndi_newtek \
  --enable-libx264 \
  --enable-libfdk-aac \
  --enable-gpl \
  --extra-cflags="-I/usr/local/include" \
  --extra-ldflags="-L/usr/local/lib" \
  --prefix=/usr/local \
  --bindir=/usr/local/bin

echo "=== Compiling (this may take several minutes) ==="
make -j"$(nproc)"

echo "=== Installing ==="
sudo make install
sudo ldconfig
hash -r

# Rename to avoid conflict with system ffmpeg
sudo mv /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg-ndi
sudo mv /usr/local/bin/ffprobe /usr/local/bin/ffprobe-ndi

echo ""
echo "=== Verifying NDI support ==="

if /usr/local/bin/ffmpeg-ndi -f libndi_newtek -i "dummy" 2>&1 | grep -qi "no NDI sources\|option extra_ips"; then
  echo "✅ FFmpeg NDI support confirmed! Binary at /usr/local/bin/ffmpeg-ndi"
  echo ""
  echo "Test with:"
  echo "  /usr/local/bin/ffmpeg-ndi -f libndi_newtek -extra_ips \"CAMERA_IP\" -i \"Camera (BMBC Main Camera)\" -t 2 -f mp4 -movflags frag_keyframe+empty_moov /tmp/ndi_test.mp4"
else
  echo ""
  /usr/local/bin/ffmpeg-ndi -f libndi_newtek -i "dummy" 2>&1 | tail -5
  echo ""
  echo "⚠️  NDI may not be working. Check output above."
fi

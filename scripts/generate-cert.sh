#!/usr/bin/env bash
# Generates a self-signed TLS certificate for local development.
# Valid for: localhost, invisible.av, 127.0.0.1
# Run once. Import certs/localhost.crt on tablets to trust it.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/../certs"

mkdir -p "$CERTS_DIR"

if [ -f "$CERTS_DIR/localhost.crt" ]; then
  echo "Certificate already exists at certs/localhost.crt"
  echo "Delete certs/ and re-run to regenerate."
  exit 0
fi

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
  -keyout "$CERTS_DIR/localhost.key" \
  -out "$CERTS_DIR/localhost.crt" \
  -days 3650 -nodes \
  -subj "/CN=invisible.av/O=Invisible AV Booth/OU=Development" \
  -addext "subjectAltName=DNS:invisible.av,DNS:localhost,IP:127.0.0.1"

echo ""
echo "Certificate generated:"
echo "  certs/localhost.crt"
echo "  certs/localhost.key"
echo ""
echo "To trust on this machine:"
echo "  sudo cp certs/localhost.crt /usr/local/share/ca-certificates/invisible-av.crt"
echo "  sudo update-ca-certificates"
echo ""
echo "To trust on tablets: import certs/localhost.crt as a trusted CA."

#!/usr/bin/env bash
# ─── Generate a self-signed certificate ───
# For staging/smoke-testing the TLS configuration before a real domain and
# certificate exist. NEVER use in production for real traffic.
#
# Usage: ./infrastructure/scripts/generate-self-signed-cert.sh [common-name]
set -euo pipefail

CN="${1:-localhost}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SSL_DIR="${REPO_ROOT}/infrastructure/nginx/ssl"

mkdir -p "${SSL_DIR}"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "${SSL_DIR}/privkey.pem" \
  -out "${SSL_DIR}/fullchain.pem" \
  -subj "/CN=${CN}" \
  -addext "subjectAltName=DNS:${CN},IP:127.0.0.1"

chmod 600 "${SSL_DIR}/privkey.pem"

echo "✅ Self-signed certificate written to ${SSL_DIR} (CN=${CN}, valid 365 days)"
echo "   Switch nginx to TLS with: SKIP_ISSUE=1 ./infrastructure/scripts/enable-tls.sh ${CN} noreply@example.com"

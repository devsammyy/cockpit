#!/usr/bin/env bash
# ─── Enable TLS on the production stack ───
# Obtains a Let's Encrypt certificate via the ACME webroot already served by
# nginx on port 80, installs it into infrastructure/nginx/ssl/, switches nginx
# to the TLS configuration, and reloads. Run on the ECS host from the repo root.
#
# Usage:   ./infrastructure/scripts/enable-tls.sh <domain> <email>
# Renewal: ./infrastructure/scripts/enable-tls.sh <domain> <email>  (idempotent)
#
# Alternative: issue a free cert in the Alibaba Cloud SSL Certificates console
# and copy fullchain.pem/privkey.pem into infrastructure/nginx/ssl/ manually,
# then run this script with SKIP_ISSUE=1 to only switch configs.
set -euo pipefail

DOMAIN="${1:?Usage: enable-tls.sh <domain> <email>}"
EMAIL="${2:?Usage: enable-tls.sh <domain> <email>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SSL_DIR="${REPO_ROOT}/infrastructure/nginx/ssl"
COMPOSE="docker compose -f ${REPO_ROOT}/docker-compose.production.yml"
WEBROOT_VOLUME="qwen-autopilot-production_certbot-webroot"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Enabling TLS for ${DOMAIN}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "${SKIP_ISSUE:-0}" != "1" ]; then
  echo "[1/3] Requesting certificate from Let's Encrypt (webroot challenge)..."
  docker run --rm \
    -v "${WEBROOT_VOLUME}:/var/www/certbot" \
    -v "${SSL_DIR}:/certs" \
    docker.io/certbot/certbot:latest certonly \
    --webroot --webroot-path /var/www/certbot \
    --domain "${DOMAIN}" \
    --email "${EMAIL}" \
    --agree-tos --non-interactive \
    --cert-path /certs

  # certbot writes to /etc/letsencrypt inside the container; copy out via a
  # second run that has the live directory mounted
  docker run --rm \
    -v "${WEBROOT_VOLUME}:/var/www/certbot" \
    -v "${SSL_DIR}:/certs" \
    --entrypoint sh \
    docker.io/certbot/certbot:latest \
    -c "cp -L /etc/letsencrypt/live/${DOMAIN}/fullchain.pem /certs/ && cp -L /etc/letsencrypt/live/${DOMAIN}/privkey.pem /certs/" \
    2>/dev/null || true
fi

if [ ! -f "${SSL_DIR}/fullchain.pem" ] || [ ! -f "${SSL_DIR}/privkey.pem" ]; then
  echo "❌ ${SSL_DIR}/fullchain.pem or privkey.pem missing."
  echo "   Issue a certificate first (or place one from the Alibaba Cloud SSL console)."
  exit 1
fi

echo "[2/3] Switching nginx to the TLS configuration..."
cp "${REPO_ROOT}/infrastructure/nginx/nginx-tls.conf" "${REPO_ROOT}/infrastructure/nginx/nginx.conf"

echo "[3/3] Reloading nginx..."
${COMPOSE} exec nginx nginx -t
${COMPOSE} exec nginx nginx -s reload

echo "✅ TLS enabled: https://${DOMAIN}"
echo "   Add a cron entry to renew (certs last 90 days):"
echo "   0 3 * * 1  cd ${REPO_ROOT} && ./infrastructure/scripts/enable-tls.sh ${DOMAIN} ${EMAIL} >> /var/log/qwen-autopilot-tls.log 2>&1"

#!/usr/bin/env bash
# ─── Enable TLS with Let's Encrypt ───
# Obtains and installs a Let's Encrypt certificate using certbot,
# updates nginx configuration for HTTPS, and sets up auto-renewal.
#
# Usage: ./infrastructure/scripts/enable-tls.sh <domain> <email>
#   domain  - Fully qualified domain name (e.g., api.example.com)
#   email   - Email address for Let's Encrypt registration and renewal notices
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <domain> <email>"
  echo "Example: $0 api.example.com admin@example.com"
  exit 1
fi

DOMAIN="$1"
EMAIL="$2"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NGINX_CONF_DIR="${REPO_ROOT}/infrastructure/nginx"
SSL_DIR="/etc/letsencrypt/live/${DOMAIN}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Enabling TLS for ${DOMAIN} via Let's Encrypt"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Install certbot if not present
if ! command -v certbot >/dev/null 2>&1; then
  echo "[1/5] Installing certbot..."
  apt-get update && apt-get install -y certbot python3-certbot-nginx
else
  echo "[1/5] certbot already installed"
fi

# Obtain certificate (nginx plugin handles challenge + nginx reload)
echo "[2/5] Obtaining Let's Encrypt certificate for ${DOMAIN}..."
certbot certonly --nginx -d "${DOMAIN}" --email "${EMAIL}" --agree-tos --non-interactive

# Copy certs to nginx ssl directory for docker-compose volume mount
echo "[3/5] Copying certificates to nginx ssl directory..."
mkdir -p "${REPO_ROOT}/infrastructure/nginx/ssl"
cp "${SSL_DIR}/fullchain.pem" "${REPO_ROOT}/infrastructure/nginx/ssl/fullchain.pem"
cp "${SSL_DIR}/privkey.pem" "${REPO_ROOT}/infrastructure/nginx/ssl/privkey.pem"
chmod 600 "${REPO_ROOT}/infrastructure/nginx/ssl/privkey.pem"

# Switch nginx to TLS config
echo "[4/5] Switching nginx to TLS configuration..."
if [ -f "${NGINX_CONF_DIR}/nginx-tls.conf" ]; then
  cp "${NGINX_CONF_DIR}/nginx-tls.conf" "${NGINX_CONF_DIR}/nginx.conf"
  echo "  ✅ Using nginx-tls.conf"
else
  echo "  ⚠️  nginx-tls.conf not found at ${NGINX_CONF_DIR}/nginx-tls.conf"
  echo "     Please create nginx-tls.conf with TLS server block"
fi

# Reload nginx in the running container
echo "[5/5] Reloading nginx..."
if docker ps --format '{{.Names}}' | grep -q '^nginx$'; then
  docker exec nginx nginx -s reload
  echo "  ✅ Nginx reloaded"
else
  echo "  ⚠️  Nginx container not running — start stack first"
fi

# Auto-renewal: certbot installs a systemd timer by default, but add cron as backup
echo ""
echo "Setting up auto-renewal cron (daily at 03:00)..."
(crontab -l 2>/dev/null | grep -v "certbot renew"; echo "0 3 * * * certbot renew --quiet --nginx && docker exec nginx nginx -s reload 2>/dev/null || true") | crontab -

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ TLS enabled for ${DOMAIN}"
echo "  Certificate: ${SSL_DIR}/fullchain.pem"
echo "  Private key: ${SSL_DIR}/privkey.pem"
echo "  Auto-renewal: certbot systemd timer + daily cron"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

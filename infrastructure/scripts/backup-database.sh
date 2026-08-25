#!/usr/bin/env bash
# ─── PostgreSQL Backup with OSS Upload ───
# Creates a compressed pg_dump custom-format archive, prunes local copies past
# the retention window, and (when ossutil is configured) uploads to Alibaba
# Cloud Object Storage Service for off-host durability.
#
# Usage:    ./infrastructure/scripts/backup-database.sh
# Schedule: ./infrastructure/scripts/install-backup-cron.sh
#
# Environment:
#   BACKUP_DIR            local backup directory        (default /opt/qwen-autopilot/backups)
#   BACKUP_RETENTION_DAYS local retention window        (default 14)
#   OSS_BACKUP_BUCKET     e.g. oss://qwen-autopilot-backups (empty = skip upload)
#   POSTGRES_USER / POSTGRES_DB  match docker-compose.production.yml defaults
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/qwen-autopilot/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
OSS_BUCKET="${OSS_BACKUP_BUCKET:-}"
POSTGRES_USER="${POSTGRES_USER:-autopilot}"
POSTGRES_DB="${POSTGRES_DB:-autopilot}"
CONTAINER="${POSTGRES_CONTAINER:-qwen-autopilot-postgres}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/autopilot-${TIMESTAMP}.dump.gz"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Dumping ${POSTGRES_DB} from container ${CONTAINER}..."
docker exec "${CONTAINER}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --format=custom \
  | gzip > "${BACKUP_FILE}"

SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
echo "[backup] Wrote ${BACKUP_FILE} (${SIZE})"

# Integrity check: a valid gzip stream that pg_restore can list
gzip -t "${BACKUP_FILE}"
gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER}" pg_restore --list > /dev/null
echo "[backup] Archive integrity verified"

# Off-host copy to Alibaba Cloud OSS
if [ -n "${OSS_BUCKET}" ]; then
  if command -v ossutil > /dev/null 2>&1; then
    echo "[backup] Uploading to ${OSS_BUCKET}..."
    ossutil cp "${BACKUP_FILE}" "${OSS_BUCKET}/database/$(basename "${BACKUP_FILE}")"
    echo "[backup] OSS upload complete"
  else
    echo "[backup] WARNING: OSS_BACKUP_BUCKET set but ossutil not installed — skipping upload" >&2
  fi
else
  echo "[backup] OSS_BACKUP_BUCKET not set — local backup only"
fi

# Prune old local backups
DELETED="$(find "${BACKUP_DIR}" -name "autopilot-*.dump.gz" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)"
echo "[backup] Pruned ${DELETED} local backup(s) older than ${RETENTION_DAYS} days"

# Also back up the environment/config (secrets excluded — .env stays on-host only)
CONFIG_BACKUP="${BACKUP_DIR}/config-${TIMESTAMP}.tar.gz"
tar -czf "${CONFIG_BACKUP}" \
  -C "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" \
  docker-compose.production.yml docker-compose.monitoring.yml infrastructure/nginx infrastructure/monitoring \
  2>/dev/null || true
echo "[backup] Config snapshot written to ${CONFIG_BACKUP}"

echo "[backup] ✅ Done"

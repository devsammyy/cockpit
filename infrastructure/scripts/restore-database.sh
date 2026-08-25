#!/usr/bin/env bash
# ─── PostgreSQL Restore ───
# Restores a backup created by backup-database.sh into the running postgres
# container. DESTRUCTIVE: drops and recreates application objects (--clean).
#
# Usage: ./infrastructure/scripts/restore-database.sh <backup-file.dump.gz>
#        To fetch from OSS first:
#        ossutil cp oss://<bucket>/database/<file> ./ && ./restore-database.sh <file>
set -euo pipefail

BACKUP_FILE="${1:?Usage: restore-database.sh <backup-file.dump.gz>}"
POSTGRES_USER="${POSTGRES_USER:-autopilot}"
POSTGRES_DB="${POSTGRES_DB:-autopilot}"
CONTAINER="${POSTGRES_CONTAINER:-qwen-autopilot-postgres}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "⚠️  This will OVERWRITE database '${POSTGRES_DB}' with ${BACKUP_FILE}"
read -r -p "Type 'restore' to continue: " CONFIRM
if [ "${CONFIRM}" != "restore" ]; then
  echo "Aborted."
  exit 1
fi

echo "[restore] Stopping backend to prevent writes during restore..."
docker stop qwen-autopilot-backend > /dev/null 2>&1 || true

echo "[restore] Restoring ${BACKUP_FILE} into ${POSTGRES_DB}..."
gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER}" \
  pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists --no-owner

echo "[restore] Restarting backend..."
docker start qwen-autopilot-backend > /dev/null

echo "[restore] Waiting for backend readiness..."
for _ in $(seq 1 30); do
  if curl -sf http://localhost/api/v1/health/ready > /dev/null 2>&1; then
    echo "[restore] ✅ Restore complete and backend is ready"
    exit 0
  fi
  sleep 2
done

echo "[restore] ⚠️  Restore finished but backend readiness check timed out — inspect logs:"
echo "  docker logs qwen-autopilot-backend --tail 100"
exit 1

#!/usr/bin/env bash
# ─── Backup Restore Verification ───
# Proves the latest backup is actually restorable: restores it into a
# temporary database inside the postgres container, counts tables and rows,
# then drops the temporary database. Run weekly (see install-backup-cron.sh)
# so a corrupt backup is discovered before you need it.
#
# Usage: ./infrastructure/scripts/verify-backup.sh [backup-file.dump.gz]
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/qwen-autopilot/backups}"
POSTGRES_USER="${POSTGRES_USER:-autopilot}"
CONTAINER="${POSTGRES_CONTAINER:-qwen-autopilot-postgres}"
VERIFY_DB="autopilot_restore_verify"

BACKUP_FILE="${1:-$(ls -t "${BACKUP_DIR}"/autopilot-*.dump.gz 2>/dev/null | head -1)}"

if [ -z "${BACKUP_FILE}" ] || [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ No backup file found in ${BACKUP_DIR}"
  exit 1
fi

echo "[verify] Verifying restorability of $(basename "${BACKUP_FILE}")"

cleanup() {
  docker exec "${CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres \
    -c "DROP DATABASE IF EXISTS ${VERIFY_DB};" > /dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec "${CONTAINER}" psql -U "${POSTGRES_USER}" -d postgres \
  -c "DROP DATABASE IF EXISTS ${VERIFY_DB}; CREATE DATABASE ${VERIFY_DB};" > /dev/null

gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER}" \
  pg_restore -U "${POSTGRES_USER}" -d "${VERIFY_DB}" --no-owner > /dev/null 2>&1 || true

TABLE_COUNT="$(docker exec "${CONTAINER}" psql -U "${POSTGRES_USER}" -d "${VERIFY_DB}" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"

if [ "${TABLE_COUNT}" -lt 1 ]; then
  echo "[verify] ❌ FAILED: restored database contains no tables"
  exit 1
fi

USER_COUNT="$(docker exec "${CONTAINER}" psql -U "${POSTGRES_USER}" -d "${VERIFY_DB}" -tAc \
  "SELECT count(*) FROM \"User\";" 2>/dev/null || echo "n/a")"

echo "[verify] ✅ PASSED: ${TABLE_COUNT} tables restored (User rows: ${USER_COUNT})"

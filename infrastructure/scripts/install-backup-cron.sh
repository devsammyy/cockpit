#!/usr/bin/env bash
# ─── Install Backup Cron Jobs ───
# Installs the nightly database backup (02:30) and weekly restore verification
# (Sunday 04:00) as /etc/cron.d entries on the ECS host. Run once as root.
#
# Usage: sudo ./infrastructure/scripts/install-backup-cron.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON_FILE="/etc/cron.d/qwen-autopilot-backup"
LOG_DIR="/var/log/qwen-autopilot"

mkdir -p "${LOG_DIR}"

cat > "${CRON_FILE}" << CRON
# Qwen Autopilot — database backup & restore verification
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

30 2 * * * root cd ${REPO_ROOT} && ./infrastructure/scripts/backup-database.sh >> ${LOG_DIR}/backup.log 2>&1
0  4 * * 0 root cd ${REPO_ROOT} && ./infrastructure/scripts/verify-backup.sh >> ${LOG_DIR}/verify-backup.log 2>&1
CRON

chmod 644 "${CRON_FILE}"

echo "✅ Cron installed at ${CRON_FILE}:"
cat "${CRON_FILE}"

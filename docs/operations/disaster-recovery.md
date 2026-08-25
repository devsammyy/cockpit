# Disaster Recovery Guide

## Objectives

| Metric  | Target | Mechanism                                        |
| ------- | ------ | ------------------------------------------------ |
| **RPO** | ≤ 24h  | Nightly `pg_dump` (02:30) + OSS off-host copy    |
| **RTO** | ≤ 1h   | Scripted restore; scripted full-instance rebuild |

Tighten RPO by raising backup frequency in `/etc/cron.d/qwen-autopilot-backup`
or migrating to ApsaraDB RDS (continuous WAL archiving, point-in-time restore).

## Backup Inventory

| What             | Where                                                       | Cadence    | Retention                            |
| ---------------- | ----------------------------------------------------------- | ---------- | ------------------------------------ |
| PostgreSQL dump  | `/opt/qwen-autopilot/backups/` + OSS                        | Nightly    | 14 days local, OSS lifecycle-managed |
| Config snapshot  | same directory (`config-*.tar.gz`)                          | Nightly    | 14 days                              |
| Container images | Alibaba Cloud ACR (every CI SHA + releases)                 | Per push   | registry-managed                     |
| Infrastructure   | This git repository (everything is code)                    | Per commit | forever                              |
| Secrets (`.env`) | ECS host only — **back up manually to KMS Secrets Manager** | manual     | —                                    |

Restore verification runs automatically every Sunday 04:00
(`verify-backup.sh` restores the latest dump into a scratch database and
counts tables). Check `/var/log/qwen-autopilot/verify-backup.log`.

## Scenario 1: Bad deployment

GitHub → Actions → **Rollback / Redeploy** → last good image tag. ~2 min.

## Scenario 2: Database corruption / accidental data loss

```bash
cd /opt/qwen-autopilot
ls -t backups/autopilot-*.dump.gz | head          # pick a backup
./infrastructure/scripts/restore-database.sh backups/autopilot-<ts>.dump.gz
```

The script stops the backend, restores with `--clean`, restarts, and waits for
readiness. Data written after the chosen backup is lost (see RPO).

## Scenario 3: Total ECS instance loss

Everything except `.env` and local backups is reproducible from git + ACR + OSS.

```bash
# 1. Provision a fresh instance (from any machine with aliyun CLI)
ECS_SECURITY_GROUP_ID=sg-xxx ECS_VSWITCH_ID=vsw-xxx \
  ./infrastructure/alibaba-cloud/deploy-ecs.sh

# 2. Restore secrets: copy .env from your KMS Secrets Manager backup
#    (or regenerate secrets — all sessions/tokens invalidate)

# 3. Fetch the latest database backup from OSS and restore
ossutil cp oss://<bucket>/database/<latest>.dump.gz /opt/qwen-autopilot/backups/
./infrastructure/scripts/restore-database.sh backups/<latest>.dump.gz

# 4. Repoint DNS to the new public IP, re-enable TLS
./infrastructure/scripts/enable-tls.sh <domain> <email>

# 5. Update the ECS_HOST GitHub secret so CI deploys target the new instance
```

Measured end-to-end: ~30–45 minutes, dominated by instance provisioning and
image pulls.

## Scenario 4: Region unavailability

Current posture: single-region (ap-southeast-1), accepted risk for this stage.
Escalation path: OSS cross-region replication for backups + a warm standby
compose stack in a second region behind Alibaba Cloud DNS failover.

## Quarterly DR Drill Checklist

- [ ] Run `verify-backup.sh` manually and confirm PASS
- [ ] Restore latest OSS (not local) backup into a scratch database
- [ ] Execute Scenario 3 against a temporary instance; record wall-clock time
- [ ] Confirm rollback workflow deploys a 30-day-old tag successfully
- [ ] Verify `.env` secret copies in KMS Secrets Manager are current

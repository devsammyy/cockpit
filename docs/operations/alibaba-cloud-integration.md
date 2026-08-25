# Alibaba Cloud Integration Guide

Machine-readable summary: [infrastructure/alibaba-cloud/services-manifest.yml](../../infrastructure/alibaba-cloud/services-manifest.yml).
Judge-facing evidence walkthrough: [hackathon-evidence.md](hackathon-evidence.md).

## Services in use

### 1. Model Studio / DashScope (Qwen) — core AI layer

- Endpoint: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- Every AI feature (goal interpretation, workflow planning, agent runtime)
  routes through `apps/backend/src/modules/ai-provider/qwen-provider.service.ts`
  with models `qwen-max` / `qwen-plus` / `qwen-turbo` and automatic fallback.
- Config: `QWEN_API_KEY` + `QWEN_API_URL` (env-validated at boot).

### 2. Elastic Compute Service (ECS) — production host

- `ecs.g7.xlarge` (4 vCPU / 16 GB), Ubuntu 22.04, 100 GB cloud_essd, in
  region `ap-southeast-1` (matches the DashScope international endpoint).
- Provisioned by `infrastructure/alibaba-cloud/deploy-ecs.sh` via the aliyun
  CLI: instance create → public IP → bootstrap (Docker, repo, generated
  secrets, full stack, backup cron).

### 3. Container Registry (ACR) — image distribution

- `registry.ap-southeast-1.aliyuncs.com/qwen-autopilot/{backend,frontend}`
- CI pushes SHA-tagged + `latest` images; releases push `vX.Y.Z`.
- Create in console: Container Registry → Personal/Enterprise instance →
  namespace `qwen-autopilot` → access credentials → GitHub secrets
  `ACR_USERNAME`/`ACR_PASSWORD`.

### 4. Object Storage Service (OSS) — backup durability

- `backup-database.sh` uploads nightly dumps via `ossutil` when
  `OSS_BACKUP_BUCKET` is set.
- Setup: create bucket (private ACL) → install ossutil on ECS
  (`curl https://gosspublic.alicdn.com/ossutil/install.sh | bash`) →
  `ossutil config` with a RAM user that has `oss:PutObject`/`GetObject` on the
  bucket only → set `OSS_BACKUP_BUCKET=oss://<bucket>` in `.env`.
- Recommended: lifecycle rule transitioning objects >30 days to IA storage.

### 5. Server Load Balancer (SLB) — multi-instance path

- Not required single-instance; nginx terminates TLS today.
- Scale-out design: SLB (TCP 443 or HTTPS listener with an Alibaba cert) →
  ECS instances, health check `GET /health` port 80 — endpoint already served
  by nginx specifically for this ([scaling-guide.md](scaling-guide.md)).

### 6. VPC + Security Groups — network segmentation

- One VPC, one vSwitch; the compose stack adds a second layer: only nginx
  (80/443) attaches to the public network — postgres, redis, and the entire
  monitoring stack live on an `internal: true` network with no route out.
- Security group inbound rules: allow 80/tcp, 443/tcp from 0.0.0.0/0; 22/tcp
  from your admin IP only. Everything else denied by default.

### 7. Cloud Monitor — outer watchdog

- Instance metrics/alarms in the ECS console complement the in-stack
  Prometheus/Grafana ([monitoring-guide.md](monitoring-guide.md)).
- Recommended alarms: CPU > 90% (5m), site monitor on `https://<domain>/health`.

### 8. KMS Secrets Manager — secret escrow (recommended)

- `.env` lives only on the host (chmod 600, never in git). Mirror the values
  into KMS Secrets Manager so instance loss doesn't lose secrets
  ([disaster-recovery.md](disaster-recovery.md) Scenario 3).

### 9. Cloud DNS + SSL Certificates

- Point the domain at the ECS public IP (or SLB) via Cloud DNS.
- TLS: `enable-tls.sh` issues Let's Encrypt via the ACME webroot, or issue a
  free cert in the SSL Certificates console and drop
  `fullchain.pem`/`privkey.pem` into `infrastructure/nginx/ssl/` +
  `SKIP_ISSUE=1 ./infrastructure/scripts/enable-tls.sh <domain> <email>`.

### 10. ActionTrail — audit

- Enable once per account: records every aliyun API call (instance creation,
  security group changes) for compliance and incident forensics.

## RAM (least privilege)

Create separate RAM users/roles instead of using the root account:

| Principal      | Policy scope                                        |
| -------------- | --------------------------------------------------- |
| `ci-acr`       | ACR push/pull on the `qwen-autopilot` namespace     |
| `ecs-backup`   | `oss:PutObject`, `oss:ListObjects` on backup bucket |
| `deploy-admin` | ECS describe/start/stop for the tagged project      |

DashScope API keys are workspace-scoped in Model Studio — create a dedicated
key for production, separate from development.

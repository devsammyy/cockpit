# Operations Runbook

Day-2 operations for the Qwen Autopilot production stack on Alibaba Cloud ECS.
All commands run from `/opt/qwen-autopilot` on the ECS host unless noted.

## Service Map

| Service         | Container                       | Port (internal) | Health                     |
| --------------- | ------------------------------- | --------------- | -------------------------- |
| Reverse proxy   | qwen-autopilot-nginx            | 80/443 (public) | `GET /health`              |
| Backend API     | qwen-autopilot-backend          | 4000            | `GET /api/v1/health/ready` |
| Frontend        | qwen-autopilot-frontend         | 3000            | `GET /api/health`          |
| PostgreSQL      | qwen-autopilot-postgres         | 5432            | `pg_isready`               |
| Redis           | qwen-autopilot-redis            | 6379            | `redis-cli ping`           |
| Prometheus      | qwen-autopilot-prometheus       | 9090            | internal only              |
| Grafana         | qwen-autopilot-grafana          | 3000            | `/grafana/` via nginx      |
| Loki / Promtail | qwen-autopilot-loki / -promtail | 3100            | internal only              |

Backend probes: `/api/v1/health/live` (process up), `/api/v1/health/ready`
(dependencies reachable), `/api/v1/health/startup` (boot complete).
Prometheus scrapes `backend:4000/metrics` (never exposed publicly).

## Routine Operations

```bash
# Status of everything
docker compose -f docker-compose.production.yml -f docker-compose.monitoring.yml ps

# Follow logs (or query Loki via Grafana for history)
docker logs -f qwen-autopilot-backend
make prod-logs

# Restart a single service
docker compose -f docker-compose.production.yml restart backend

# Full stack restart (order-safe: compose respects depends_on/healthchecks)
make prod-down && make monitoring-up

# Manual deploy of a specific version (normally CI does this)
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<sha-or-version>/' .env
docker compose -f docker-compose.production.yml pull backend frontend
docker compose -f docker-compose.production.yml up -d
```

## Deployments & Rollback

- **Normal deploy**: merge to `main` → CI builds, scans, pushes to ACR, deploys
  pinned SHA, runs smoke test. No manual steps.
- **Rollback**: GitHub → Actions → **Rollback / Redeploy** → enter last good
  image tag (any previous CI SHA or release `vX.Y.Z`). Takes ~2 minutes.
- Find the current deployed tag: `grep IMAGE_TAG /opt/qwen-autopilot/.env`

## Incident Playbooks

### API returns 502/503

1. `docker ps` — is `qwen-autopilot-backend` running/healthy?
2. `curl -s localhost:4000/api/v1/health/ready` from inside the network:
   `docker exec qwen-autopilot-nginx curl -s http://backend:4000/api/v1/health/ready`
3. Response shows which dependency is down (`postgres` / `redis`).
4. `docker logs qwen-autopilot-backend --tail 200` — look for env validation
   errors (bad secret) or connection refusals.
5. If the container crash-loops after a deploy → **rollback** (above).

### Database down / corrupted

Follow [disaster-recovery.md](disaster-recovery.md). Short version:
`docker compose -f docker-compose.production.yml restart postgres`, and if
data is corrupted, `./infrastructure/scripts/restore-database.sh <latest>`.

### High latency

1. Grafana → **Platform Overview** → p95 by route: is it one route or all?
2. All routes + high CPU in **Infrastructure** dashboard → host saturation →
   scale up ([scaling-guide.md](scaling-guide.md)).
3. One route → check **Data Stores** dashboard for slow queries
   (`log_min_duration_statement=1000` logs slow statements to postgres logs).
4. AI-heavy routes → **AI Requests by Model** panel; DashScope latency is
   upstream — check quota/throttling in the Model Studio console.

### Queue backlog (alert: QueueBacklog)

1. Grafana → Queue Jobs by State: which queue, how fast is it growing?
2. `docker exec qwen-autopilot-redis redis-cli llen bull:<queue>:wait`
3. Failed jobs pile-up → inspect a job:
   `docker exec qwen-autopilot-redis redis-cli zrange bull:<queue>:failed 0 5`
4. Persistent backlog → scale workers ([scaling-guide.md](scaling-guide.md)).

### Disk almost full (alert: HostDiskAlmostFull)

```bash
df -h /
docker system df
docker image prune -af --filter "until=168h"   # drop images older than 7 days
journalctl --vacuum-size=500M
```

Backups are pruned automatically (14-day retention). If postgres data is the
culprit, expand the cloud disk in the ECS console (supports online resize).

### Certificate expired

`./infrastructure/scripts/enable-tls.sh <domain> <email>` re-issues and
reloads. Verify the renewal cron exists: `cat /etc/cron.d/* | grep tls`.

## Log Correlation

Every request gets an `x-request-id` (nginx generates, backend propagates,
response header returns it). To trace a request end-to-end in Grafana →
Explore → Loki:

```logql
{container=~"qwen-autopilot.*"} |= "<request-id>"
```

Workflow executions log their `executionId` — same technique.

## Maintenance Windows

The stack is single-instance; a deploy causes ≤20s of API unavailability while
the backend container swaps (nginx retries upstream). For zero-downtime
requirements, see the multi-instance path in [scaling-guide.md](scaling-guide.md).

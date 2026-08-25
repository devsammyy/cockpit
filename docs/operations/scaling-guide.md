# Scaling Guide

Current shape: single ECS instance running the full stack. This is right-sized
for launch. Every component below has a designed path to scale without
re-architecture — the order matters, scale what saturates first.

## What saturates first (and what to do)

| Symptom (dashboard)           | Bottleneck        | Action                          |
| ----------------------------- | ----------------- | ------------------------------- |
| Host CPU high, API p95 up     | Instance size     | 1. Resize ECS (vertical)        |
| API CPU-bound, DB fine        | Backend capacity  | 2. Scale backend replicas       |
| Queue waiting grows, API fine | Worker throughput | 3. Dedicated worker containers  |
| DB connections/CPU high       | PostgreSQL        | 4. ApsaraDB RDS + read replicas |
| Redis memory/ops high         | Redis             | 5. ApsaraDB for Redis (Tair)    |

## 1. Vertical scaling (minutes, do this first)

ECS supports stop → resize → start. `ecs.g7.xlarge` (4 vCPU/16 GB) →
`g7.2xlarge`/`g7.4xlarge`. Update postgres `shared_buffers` and container
memory limits in `docker-compose.production.yml` accordingly.

## 2. Horizontal API scaling

The backend is stateless by design (JWT auth, session-free, queues in Redis,
state in PostgreSQL), so replicas are safe:

```bash
docker compose -f docker-compose.production.yml up -d --scale backend=3 --no-recreate
```

Notes:

- Remove `container_name` from the backend service when scaling >1 (compose
  requires unique names) — a one-line change.
- Nginx's `upstream backend` resolves the service DNS and load-balances
  round-robin across replicas.
- Multi-instance: run the app stack on N ECS instances behind an Alibaba
  Cloud SLB (health check: `GET /health` on port 80), move Postgres/Redis to
  managed services (steps 4–5) so instances stay stateless.

## 3. Dedicated workers

BullMQ queues are connected via `BullModule` (Redis-backed). When workflow
volume justifies it, run worker-only containers from the same image:

- Add a `worker` service to the compose file using the backend image with a
  worker entrypoint that registers queue processors but no HTTP listener.
- Scale independently: `--scale worker=4`.
- Queue depth per state is already on the Platform Overview dashboard
  (`bullmq_queue_jobs`) — scale workers when `waiting` trends up faster than
  `active` drains.

## 4. Managed PostgreSQL (ApsaraDB RDS)

Swap is configuration-only — the app reads a single `DATABASE_URL`:

1. Create ApsaraDB RDS for PostgreSQL in the same VPC/zone.
2. Migrate: nightly dump restore, or Alibaba DTS for near-zero-downtime.
3. Point `DATABASE_URL` at the RDS endpoint, remove the postgres service.

Gains: automated backups with PITR (improves RPO from 24h to minutes), read
replicas, failover HA, online storage scaling.

## 5. Managed Redis (Tair)

Same pattern: set `REDIS_HOST`/`REDIS_PASSWORD` to the Tair endpoint, remove
the redis container. Keep `noeviction` policy — BullMQ job data must never be
evicted.

## Already-built safeguards (graceful degradation & backpressure)

- **Rate limiting**: nginx zones (30 r/s API, 5 r/s auth) + Fastify
  `@fastify/rate-limit` in-app — overload answers 429, not cascading failure.
- **Connection pooling**: Prisma pool capped via `connection_limit=20` in
  `DATABASE_URL`; postgres `max_connections=200` leaves headroom for replicas.
- **Queue backpressure**: BullMQ jobs persist in Redis (`noeviction`); bursts
  queue up instead of overwhelming workers; retries use exponential backoff.
- **AI provider fallback**: failed model calls retry on `qwen-plus`; per-org
  token quotas cap runaway consumption.
- **Health-gated routing**: nginx only starts routing after backend/frontend
  containers report healthy; deploys can't blackhole traffic.
- **Resource limits**: every container has CPU/memory limits so one component
  can't starve the host.

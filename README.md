# Qwen Autopilot Platform

**An enterprise AI Autopilot Agent that automates real-world business workflows end-to-end — powered by Qwen on Alibaba Cloud.**

> 🏆 Built for the **Global AI Hackathon Series with Qwen Cloud** — **Track 4: Autopilot Agent**.
> License: **Apache-2.0** · Backend: **Alibaba Cloud ECS + ACR** · AI: **Qwen via Alibaba Cloud Model Studio**

Operators describe a goal in plain language (or pick a template), and the platform plans a workflow DAG with Qwen, executes it step by step with tool calling, pauses at **human-in-the-loop approval gates** for risky actions, and streams every step, token, and cost to a live console. Work arrives three ways: from the console, from **public inbound webhooks** (monitoring alerts, inbound-email parsers, CRMs), or from **cron schedules**.

## What it does

- **Natural-language planning** — "Run a goal" turns a business goal into an executable workflow DAG planned by Qwen.
- **Visual workflow builder** — drag-and-drop steps, type-aware config forms (models, tools, approvers, SLAs), transparent raw-JSON view, Save & run.
- **Real inbound triggers** — `POST /api/v1/hooks/workflows/:id` with a per-workflow secret (timing-safe), cron schedules via BullMQ repeatable jobs, and application events.
- **Human-in-the-loop** — durable approval gates with SLAs; executions pause, survive restarts, and resume exactly where they stopped on approve/reject.
- **Governed tool execution** — tool registry + composable policy engine (rate limits, quotas, business hours, risk ceilings), encrypted credential vault (AES-256-GCM), and a real **MCP client** (JSON-RPC over stdio) that adds external tool servers with zero code changes.
- **Reliability engineering** — checkpointed executions, retries with backoff, timeouts, saga compensation (auto-undo), dead-execution recovery.
- **Full observability** — per-execution tokens/cost/duration, event timeline, audit trail, Prometheus metrics, OpenTelemetry tracing.
- **Multi-tenant SaaS** — organizations, RBAC permissions, JWT auth, per-org isolation on every query.

## Documentation

- **📖 [User Guide](docs/user-guide.md)** — complete operations manual for every screen, written for non-technical operators.
- **🔌 [Tools & Workflows](docs/workflows/tools-and-workflows.md)** — how workflows take real-world actions (Slack, GitHub, Email): credential setup + the end-to-end webhook→approval→action demo chain.

## Architecture

**➡️ [Architecture diagram (submission)](docs/submission/architecture-diagram.md)** — how Qwen Cloud connects to the backend, database, and frontend on Alibaba Cloud.

Deep-dives: [docs/architecture.md](docs/architecture.md) and [docs/architecture/](docs/architecture/) (workflow engine, tools framework, AI provider, memory subsystem, domain model, infrastructure).

## Proof of Alibaba Cloud deployment

| Evidence                                                                           | Where                                                                                                                            |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Qwen API client calling Alibaba Cloud Model Studio (`dashscope-intl.aliyuncs.com`) | [`apps/backend/src/modules/ai-provider/qwen-provider.service.ts`](apps/backend/src/modules/ai-provider/qwen-provider.service.ts) |
| Endpoint + credential configuration                                                | [`apps/backend/src/config/env.schema.ts`](apps/backend/src/config/env.schema.ts)                                                 |
| CI/CD: build → push to **ACR** → deploy to **ECS** → smoke test                    | [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml)                                                                     |
| ECS provisioning script                                                            | [`infrastructure/alibaba-cloud/deploy-ecs.sh`](infrastructure/alibaba-cloud/deploy-ecs.sh)                                       |
| Alibaba Cloud services integration guide                                           | [`docs/operations/alibaba-cloud-integration.md`](docs/operations/alibaba-cloud-integration.md)                                   |
| Consolidated hackathon evidence                                                    | [`docs/operations/hackathon-evidence.md`](docs/operations/hackathon-evidence.md)                                                 |

## Judge testing instructions

1. **Hosted demo** — URL provided on the Devpost submission. Sign in with the judge credentials listed there (or the seeded account below on a fresh deployment).
2. **Run it locally in one command** — see [Getting Started](#getting-started) below (`make dev` brings up PostgreSQL, Redis, backend, and frontend, migrates and seeds automatically).
3. Sign in (`admin@example.com` / `ChangeMe123!` on seeded instances) → **Workflows** → _Seed enterprise templates_ → **Run** any template (e.g. _Resume Screening_): fill the generated input form (paste text or attach a file) → watch the live execution → decide the approval gate → inspect tokens/cost/output.
4. **Autopilot trigger demo (no login required):** enable a webhook via `POST /api/v1/workflows/:id/triggers/webhook`, then fire it like a monitoring system: `curl -X POST <host>/api/v1/hooks/workflows/:id -H 'x-hook-token: <secret>' -d '{"alert":"CPU 97% on prod-db-1"}'` — an execution starts, diagnoses with Qwen, and pauses at the human approval gate.

## Repository layout

```text
apps/
  backend/        NestJS 11 + Fastify + Prisma 7 (PostgreSQL, Redis, BullMQ)
  frontend/       Next.js 16 App Router + React 19 + Tailwind 4
packages/         shared-types · shared-utils · ui
infrastructure/   Alibaba Cloud deploy scripts, nginx, monitoring stack
docs/             architecture · operations runbooks · submission materials
scripts/          dev container entrypoints, health checks
tests/load/       k6 load/smoke/stress suites
```

## Getting Started

### Option A: Containerized Development (Recommended & Plug-and-Play)

The project includes a fully containerized local stack using Docker or Podman Compose. It automatically provisions the PostgreSQL database, Redis cache, applies Prisma migrations, seeds the database with a default admin account, and launches backend/frontend dev servers with live reload/watch mode.

#### 1. Setup Environment

```bash
cp .env.example .env
```

_(Optionally edit the `.env` file to customize passwords or set your `QWEN_API_KEY` for DashScope AI workflow execution)._

#### 2. Start the Stack

Run the following command:

```bash
make dev
```

_(Windows users without `make` can run: `docker compose -f compose.yaml up --build` or `podman compose -f compose.yaml up --build`)_

#### 3. Access Services

- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Backend API Docs (Swagger)**: [http://localhost:4000/docs](http://localhost:4000/docs)
- **Backend API Health Check**: [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

#### 4. Default Seeded Admin Credentials

- **Email**: `admin@example.com`
- **Password**: `ChangeMe123!`

#### 5. Stop and Clean Stack

To stop the environment and completely clean the database volumes for a fresh state reset:

```bash
make clean
```

---

### Option B: Manual Local Development

If you prefer to run services bare-metal on your host:

```bash
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
pnpm setup
pnpm dev
```

Frontend: `http://localhost:3000`
Backend Swagger: `http://localhost:4000/docs`
Backend health: `http://localhost:4000/api/v1/health`

## Development Commands

```bash
pnpm dev
pnpm dev:infra
pnpm dev:apps
```

## Build Commands

```bash
pnpm build
pnpm --filter @qwen-autopilot/backend build
pnpm --filter @qwen-autopilot/frontend build
```

## Testing Commands

```bash
pnpm test
pnpm --filter @qwen-autopilot/backend test
pnpm --filter @qwen-autopilot/backend test:e2e
pnpm --filter @qwen-autopilot/frontend test:e2e
```

## Lint Commands

```bash
pnpm lint
pnpm format:check
pnpm format
```

## Database Commands

```bash
pnpm --filter @qwen-autopilot/backend db:generate
pnpm --filter @qwen-autopilot/backend db:migrate
pnpm reset-db
pnpm seed
```

## Health Check

```bash
pnpm health-check
```

The script expects `jq` locally. Override the endpoint with `API_URL` when needed.

## Production Deployment (Alibaba Cloud)

The platform ships with production-grade infrastructure targeting Alibaba
Cloud ECS, with images in ACR, backups in OSS, and Qwen (DashScope) as the AI
provider.

```bash
# Provision + bootstrap an ECS instance end-to-end
ECS_SECURITY_GROUP_ID=sg-xxx ECS_VSWITCH_ID=vsw-xxx \
  ./infrastructure/alibaba-cloud/deploy-ecs.sh

# On the server: app stack + monitoring (Prometheus/Grafana/Loki)
make monitoring-up

# Enable TLS (Let's Encrypt)
./infrastructure/scripts/enable-tls.sh your-domain.com you@email.com
```

CI/CD (GitHub Actions) lints, tests, scans, builds, pushes to ACR, deploys a
pinned image tag to ECS, and smoke-tests every merge to `main`; rollback is a
one-click workflow. Key documentation:

| Topic                          | Doc                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Architecture & topology        | [docs/architecture/infrastructure-deployment.md](docs/architecture/infrastructure-deployment.md) |
| Day-2 operations & incidents   | [docs/operations/runbook.md](docs/operations/runbook.md)                                         |
| Monitoring, dashboards, alerts | [docs/operations/monitoring-guide.md](docs/operations/monitoring-guide.md)                       |
| Disaster recovery              | [docs/operations/disaster-recovery.md](docs/operations/disaster-recovery.md)                     |
| Scaling                        | [docs/operations/scaling-guide.md](docs/operations/scaling-guide.md)                             |
| CI/CD & rollback               | [docs/operations/ci-cd.md](docs/operations/ci-cd.md)                                             |
| Alibaba Cloud services         | [docs/operations/alibaba-cloud-integration.md](docs/operations/alibaba-cloud-integration.md)     |
| Hackathon evidence             | [docs/operations/hackathon-evidence.md](docs/operations/hackathon-evidence.md)                   |
| Load testing (k6)              | [tests/load/README.md](tests/load/README.md)                                                     |

## Common Troubleshooting

### Podman Compose Cannot Bind Ports

Another local service is using `5432`, `6379`, `3000`, or `4000`. Change the relevant value in `.env` or stop the conflicting process.

### Backend Fails Environment Validation

Copy `apps/backend/.env.example` to `apps/backend/.env` and replace placeholder values. The JWT secret must be at least 32 characters.

### Prisma Client Is Missing

Run:

```bash
pnpm --filter @qwen-autopilot/backend db:generate
```

### Frontend Cannot Reach Backend

Confirm `NEXT_PUBLIC_API_BASE_URL` points to the backend prefix, usually `http://localhost:4000/api/v1`.

## Initialization Commands Used

```bash
mkdir -p apps/backend apps/frontend packages/shared-types packages/shared-utils packages/ui infrastructure docs scripts
pnpm install
pnpm --filter @qwen-autopilot/backend db:generate
```

The files are intentionally hand-scaffolded to keep architecture explicit and avoid framework-generated noise.

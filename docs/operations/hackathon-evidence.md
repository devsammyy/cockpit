# Hackathon Deployment Evidence Guide

How judges can verify, in under ten minutes, that this platform is genuinely
built on and deployed to Alibaba Cloud.

## 1. Qwen (DashScope) is the AI engine — verifiable in source

| Evidence                                               | Where                                                                                                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| DashScope endpoint & Qwen models                       | [`apps/backend/src/modules/ai-provider/qwen-provider.service.ts`](../../apps/backend/src/modules/ai-provider/qwen-provider.service.ts)   |
| Env default pointing at `dashscope-intl.aliyuncs.com`  | [`apps/backend/src/config/env.schema.ts`](../../apps/backend/src/config/env.schema.ts) (`QWEN_API_URL`)                                  |
| Model registry (`qwen-max`, `qwen-plus`, `qwen-turbo`) | [`apps/backend/src/modules/ai-provider/model-registry.service.ts`](../../apps/backend/src/modules/ai-provider/model-registry.service.ts) |
| Live token usage                                       | Model Studio console → usage dashboard (account holder can screen-share)                                                                 |

## 2. Deployed on Alibaba Cloud ECS — verifiable live

```bash
# Replace with the deployed IP/domain from the submission
curl -s https://<deployment>/api/v1/health | jq
# → {"status":"ok","dependencies":{"postgres":"ok","redis":"ok"},...}

curl -s https://<deployment>/api/v1/health/ready -o /dev/null -w "%{http_code}\n"
# → 200
```

- The instance is visible in the ECS console (region ap-southeast-1, name
  `qwen-autopilot-prod`, tags `project=qwen-autopilot`).
- Reverse DNS / IP WHOIS of the deployment address resolves to Alibaba Cloud
  address space (AS45102).

## 3. Images live in Alibaba Cloud Container Registry

- GitHub Actions logs (public): the **Build & Push Containers** job logs in
  every `main` run show pushes to
  `registry.ap-southeast-1.aliyuncs.com/qwen-autopilot/{backend,frontend}`.
- ACR console shows the repositories with SHA-tagged image history.

## 4. Automated pipeline deploying to Alibaba Cloud

- Repository → Actions → any `main` run: Lint → Typecheck → Tests →
  Security scan → ACR push → Trivy image scan → **Deploy to Alibaba Cloud
  ECS** → k6 smoke test. The deploy step's log prints the health-check
  responses from the ECS host.

## 5. Infrastructure-as-code in this repository

| Artifact                                                                                                         | Purpose                                            |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [`infrastructure/alibaba-cloud/deploy-ecs.sh`](../../infrastructure/alibaba-cloud/deploy-ecs.sh)                 | aliyun-CLI provisioning + bootstrap                |
| [`infrastructure/alibaba-cloud/services-manifest.yml`](../../infrastructure/alibaba-cloud/services-manifest.yml) | Every Alibaba service, mapped to integration files |
| [`docker-compose.production.yml`](../../docker-compose.production.yml)                                           | Production stack pulling from ACR                  |
| [`docker-compose.monitoring.yml`](../../docker-compose.monitoring.yml)                                           | Prometheus/Grafana/Loki observability stack        |
| [`.github/workflows/`](../../.github/workflows/)                                                                 | CI/CD, release, rollback targeting ACR + ECS       |
| [`infrastructure/scripts/backup-database.sh`](../../infrastructure/scripts/backup-database.sh)                   | Nightly backups uploaded to Alibaba OSS            |

## 6. Live observability (optional deep-dive)

`https://<deployment>/grafana/` — the **Platform Overview** dashboard shows
real request traffic, Qwen token consumption per organization, and workflow
execution metrics collected from the running system (view-only credentials
available on request).

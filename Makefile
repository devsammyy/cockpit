# ─── Qwen Autopilot Dev & Production Orchestration Makefile ───

# Automatically detect available container runtime
COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || (podman compose version >/dev/null 2>&1 && echo "podman compose" || (podman-compose version >/dev/null 2>&1 && echo "podman-compose" || echo "docker compose")))

PROD_FILES := -f docker-compose.production.yml
MONITOR_FILES := -f docker-compose.production.yml -f docker-compose.monitoring.yml
BASE_URL ?= http://localhost

.PHONY: help dev up down restart logs clean seed db-shell migrate \
	prod-up prod-down prod-logs prod-build monitoring-up monitoring-down \
	backup verify-backup load-smoke load-test load-stress

help:
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "  Qwen Autopilot Development Commands"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "  make dev         - Start stack in foreground (with hot-reload)"
	@echo "  make up          - Start stack in background (detached)"
	@echo "  make down        - Stop all containers"
	@echo "  make restart     - Hard restart the entire dev stack"
	@echo "  make logs        - Follow logs from all containers"
	@echo "  make clean       - Tear down containers and delete db volumes"
	@echo "  make seed        - Run idempotent DB seed script"
	@echo "  make db-shell    - Open interactive PostgreSQL psql shell"
	@echo "  make migrate     - Run Prisma database migration"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "  Production & Operations"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "  make prod-up        - Start production stack (pulls pinned images)"
	@echo "  make prod-build     - Build production images locally and start"
	@echo "  make prod-down      - Stop production stack"
	@echo "  make prod-logs      - Follow production logs"
	@echo "  make monitoring-up  - Start production + monitoring overlay"
	@echo "  make monitoring-down- Stop monitoring overlay services"
	@echo "  make backup         - Run database backup (with OSS upload if configured)"
	@echo "  make verify-backup  - Verify latest backup restores cleanly"
	@echo "  make load-smoke     - k6 smoke test        (BASE_URL=$(BASE_URL))"
	@echo "  make load-test      - k6 sustained load test"
	@echo "  make load-stress    - k6 stress test"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

dev:
	@if [ ! -f .env ]; then cp .env.example .env && echo "Created .env from .env.example"; fi
	$(COMPOSE) -f compose.yaml up --build

up:
	@if [ ! -f .env ]; then cp .env.example .env && echo "Created .env from .env.example"; fi
	$(COMPOSE) -f compose.yaml up -d

down:
	$(COMPOSE) -f compose.yaml down

restart: down up

logs:
	$(COMPOSE) -f compose.yaml logs -f

clean:
	$(COMPOSE) -f compose.yaml down -v

seed:
	$(COMPOSE) -f compose.yaml exec backend pnpm --filter @qwen-autopilot/backend db:seed

db-shell:
	$(COMPOSE) -f compose.yaml exec database psql -U autopilot -d autopilot

migrate:
	$(COMPOSE) -f compose.yaml exec backend pnpm --filter @qwen-autopilot/backend exec prisma migrate dev --schema=/app/apps/backend/prisma/schema.prisma

# ─── Production & Operations ───

prod-up:
	$(COMPOSE) $(PROD_FILES) pull
	$(COMPOSE) $(PROD_FILES) up -d --remove-orphans

prod-build:
	$(COMPOSE) $(PROD_FILES) up -d --build --remove-orphans

prod-down:
	$(COMPOSE) $(PROD_FILES) down

prod-logs:
	$(COMPOSE) $(PROD_FILES) logs -f

monitoring-up:
	$(COMPOSE) $(MONITOR_FILES) up -d --remove-orphans

monitoring-down:
	$(COMPOSE) $(MONITOR_FILES) stop prometheus grafana loki promtail node-exporter cadvisor postgres-exporter redis-exporter

backup:
	./infrastructure/scripts/backup-database.sh

verify-backup:
	./infrastructure/scripts/verify-backup.sh

load-smoke:
	docker run --rm -i --network host docker.io/grafana/k6 run -e BASE_URL=$(BASE_URL) - < tests/load/smoke.js

load-test:
	docker run --rm -i --network host docker.io/grafana/k6 run -e BASE_URL=$(BASE_URL) - < tests/load/load.js

load-stress:
	docker run --rm -i --network host docker.io/grafana/k6 run -e BASE_URL=$(BASE_URL) - < tests/load/stress.js

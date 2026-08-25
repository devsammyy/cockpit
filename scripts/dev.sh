#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env && -f .env.example ]]; then
	cp .env.example .env
	echo "Created .env from .env.example"
fi

if [[ ! -f apps/backend/.env && -f apps/backend/.env.example ]]; then
	cp apps/backend/.env.example apps/backend/.env
	echo "Created apps/backend/.env from apps/backend/.env.example"
fi

if [[ ! -f apps/frontend/.env && -f apps/frontend/.env.example ]]; then
	cp apps/frontend/.env.example apps/frontend/.env
	echo "Created apps/frontend/.env from apps/frontend/.env.example"
fi

podman compose -f podman-compose.yml down || true
podman compose -f podman-compose.yml up -d
pnpm dev:apps

#!/usr/bin/env bash
set -euo pipefail

podman compose -f podman-compose.yml up -d postgres
pnpm --filter @qwen-autopilot/backend db:reset

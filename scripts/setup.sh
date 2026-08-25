#!/usr/bin/env bash
set -euo pipefail

pnpm install
pnpm --filter @qwen-autopilot/backend db:generate

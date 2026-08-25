#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @qwen-autopilot/backend db:seed

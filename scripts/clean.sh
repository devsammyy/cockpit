#!/usr/bin/env bash
set -euo pipefail

pnpm -r --if-present clean
rm -rf node_modules apps/*/node_modules packages/*/node_modules
rm -rf apps/frontend/.next apps/frontend/playwright-report apps/frontend/test-results
rm -rf apps/backend/dist apps/backend/coverage packages/*/dist

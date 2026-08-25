#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:4000/api/v1/health}"

curl --fail --silent --show-error "$API_URL" | jq .

#!/usr/bin/env sh
# ─── Backend Development Container Entrypoint ───
set -e

# The container is non-interactive; CI=true lets pnpm rebuild the mounted
# node_modules volume without a TTY confirmation prompt when the lockfile
# changes (otherwise it aborts with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY).
export CI=true

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 Starting Qwen Autopilot Dev Environment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Install workspace dependencies into the mounted volume.
#    The container image install is masked by the bind-mounted node_modules volume.
#    Fall back to a non-frozen install if the lockfile drifted so dev never wedges.
echo "Dependencies: Installing workspace packages..."
pnpm install --frozen-lockfile || {
  echo "⚠️  Frozen install failed (lockfile drift?); retrying without --frozen-lockfile..."
  pnpm install --no-frozen-lockfile
}

# 2. Wait for PostgreSQL database and Redis (podman-compose does not reliably
#    honor healthcheck-based depends_on, so we gate startup explicitly).
node /app/apps/backend/prisma/wait-for-db.js
node /app/apps/backend/prisma/wait-for-redis.js

# 3. Generate Prisma Client
echo "Prisma: Generating Client..."
pnpm --filter @qwen-autopilot/backend db:generate

# 4. Apply migrations to PostgreSQL database (fatal — a bad schema must stop boot)
echo "Prisma: Applying migrations..."
pnpm --filter @qwen-autopilot/backend exec prisma migrate deploy --schema=/app/apps/backend/prisma/schema.prisma

# 5. Seed database idempotently (non-fatal — a seed hiccup must never block boot)
echo "Prisma: Seeding database (idempotent)..."
pnpm --filter @qwen-autopilot/backend db:seed || echo "⚠️  Seeding reported an issue; continuing (seed is idempotent)."

# 6. Start NestJS Backend in watch mode
echo "NestJS: Launching watch mode dev server..."
pnpm --filter @qwen-autopilot/backend dev

# ─── Backend Production Dockerfile ───
# Multi-stage build optimized for Alibaba Cloud ECS / ACR deployment
# Compatible with Docker and Podman runtimes

# ── Stage 1: Install dependencies ──
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate

# Copy workspace root configs
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/

RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Build ──
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules 2>/dev/null || true
COPY . .

# Generate Prisma client
RUN cd apps/backend && pnpm exec prisma generate --config prisma.config.ts

# Build backend
RUN pnpm --filter @qwen-autopilot/backend build

# ── Stage 3: Production runtime ──
FROM node:22-alpine AS runner
WORKDIR /app

# Security: run as non-root user
RUN addgroup --system --gid 1001 autopilot && \
    adduser --system --uid 1001 autopilot

# Install runtime essentials
RUN apk add --no-cache curl tini

COPY --from=builder --chown=autopilot:autopilot /app/apps/backend/dist ./dist
COPY --from=builder --chown=autopilot:autopilot /app/apps/backend/prisma ./prisma
COPY --from=builder --chown=autopilot:autopilot /app/apps/backend/package.json ./package.json
COPY --from=builder --chown=autopilot:autopilot /app/node_modules ./node_modules

# Environment defaults
ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:4000/api/v1/health || exit 1

USER autopilot

# Use tini for proper signal handling and graceful shutdown
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]

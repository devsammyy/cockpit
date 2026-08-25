# ─── Frontend Production Dockerfile ───
# Multi-stage build for Next.js standalone output
# Optimized for Alibaba Cloud ECS / ACR deployment

# ── Stage 1: Dependencies ──
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-utils/package.json ./packages/shared-utils/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Build ──
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @qwen-autopilot/frontend build

# ── Stage 3: Production runtime ──
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 autopilot && \
    adduser --system --uid 1001 autopilot

RUN apk add --no-cache curl tini

COPY --from=builder --chown=autopilot:autopilot /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=autopilot:autopilot /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder --chown=autopilot:autopilot /app/apps/frontend/public ./apps/frontend/public 2>/dev/null || true

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

USER autopilot

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/frontend/server.js"]

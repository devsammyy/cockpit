#!/usr/bin/env sh
# ─── Frontend Development Container Entrypoint ───
set -e

# The container is non-interactive. CI=true lets pnpm rebuild the mounted
# node_modules volume without a TTY confirmation prompt — otherwise the install
# aborts with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY.
export CI=true

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🎨 Starting Qwen Autopilot Frontend Dev"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Install workspace deps into the mounted volume. Fall back to a non-frozen
# install if the lockfile drifted, so a dev container never wedges on startup.
echo "Dependencies: Installing workspace packages..."
pnpm install --frozen-lockfile || {
  echo "⚠️  Frozen install failed (lockfile drift?); retrying without --frozen-lockfile..."
  pnpm install --no-frozen-lockfile
}

# Guard against a stale production build poisoning Turbopack dev. A top-level
# `.next/BUILD_ID` is written only by `next build` (production). If dev boots on
# top of it, Turbopack fails to write app endpoints ("Next.js package not found")
# and pages hang on the loading fallback. Clear it for a clean dev start; a
# normal dev cache (no BUILD_ID) is preserved so warm restarts stay fast.
NEXT_DIR="/app/apps/frontend/.next"
if [ -f "$NEXT_DIR/BUILD_ID" ]; then
  echo "⚠️  Detected a stale production build in .next; clearing for a clean Turbopack dev start..."
  rm -rf "$NEXT_DIR"
fi

echo "Next.js: Launching dev server..."
pnpm --filter @qwen-autopilot/frontend dev

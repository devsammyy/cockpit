# Frontend Developer Guide

## Running

```bash
make dev                    # full containerized stack (recommended)
# or bare-metal:
pnpm --filter @qwen-autopilot/frontend dev    # http://localhost:3000
```

The console expects the backend at `NEXT_PUBLIC_API_BASE_URL`
(default `http://localhost:4000/api/v1`). Sign in with the seeded admin
(`admin@example.com` / `ChangeMe123!`) or register a fresh workspace.

## Testing

```bash
pnpm --filter @qwen-autopilot/frontend test        # vitest unit + component tests
pnpm --filter @qwen-autopilot/frontend test:watch  # watch mode
pnpm --filter @qwen-autopilot/frontend test:e2e    # Playwright (starts dev server itself)
```

- Unit tests cover the pure logic: formatters, execution aggregations, and the
  workflow `definition-io` conversion/validation.
- Component tests (Testing Library) cover the shared patterns.
- E2E covers auth flows, route guarding, client-side validation, WCAG 2.1 AA
  scans (axe-core), and responsive overflow checks at 360/768/1440px.

## Adding a page

1. Create `src/app/(dashboard)/<route>/page.tsx` (`"use client"` unless static).
2. Register it in `components/shell/nav-config.ts` — sidebar, command palette,
   breadcrumbs, and `g`-key shortcut come for free.
3. Fetch data through a hook in `hooks/use-api.ts` (add the endpoint to
   `lib/api/endpoints.ts` + types to `lib/api/types.ts` if new).
4. Compose from `components/patterns/*` — always render loading, error, and
   empty states (`TableSkeleton` / `ErrorState` / `EmptyState`).
5. Run `pnpm exec next typegen` if type errors appear on `Link`/`router.push`
   (typed routes regenerate during dev/build).

## Adding an API endpoint binding

```ts
// lib/api/types.ts     — add the entity interface (mirror the Prisma model)
// lib/api/endpoints.ts — add the typed function (unwrap the envelope)
// hooks/use-api.ts     — add the query/mutation hook + queryKeys entry
```

Never call axios from a component — pages consume hooks only.

## Extending the workflow builder

- New step type: add a `StepTypeMeta` entry in
  `components/workflow/definition-io.ts` (label, default config, `native` flag)
  and an icon in `step-node.tsx`. Palette, config sheet, and validation pick it
  up automatically.
- New validation rule: extend `validateDefinition()` and add a unit test in
  `definition-io.test.ts`.
- Note: step types marked `native: false` (approval/delay/webhook/memory) are
  authorable and validated, but the current backend engine executes them as
  pass-through steps — the UI labels them accordingly.

## Conventions checklist (PR gate)

- [ ] `pnpm lint` and `pnpm format:check` pass
- [ ] `pnpm exec tsc --noEmit` clean (typed routes regenerated)
- [ ] Loading / error / empty states on every async surface
- [ ] Status strings rendered via `StatusBadge`, never hand-colored
- [ ] New reusable components documented in `docs/frontend/design-system.md`
- [ ] Keyboard: interactive elements reachable and focus-visible

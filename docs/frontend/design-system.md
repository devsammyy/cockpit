# Design System

## Direction

Dense, restrained, operations-grade — closer to Linear/Datadog than a marketing
site. One brand accent (emerald, carried over from earlier phases), neutral
surfaces, semantic status colors, and a dark rail sidebar that anchors the
console in both themes. No decorative gradients on data surfaces; color always
means something.

## Tokens (`src/app/globals.css`)

All colors are HSL CSS variables consumed through Tailwind 4's `@theme inline`
mapping, so every component and chart re-themes automatically.

| Group    | Tokens                                             | Notes                                                         |
| -------- | -------------------------------------------------- | ------------------------------------------------------------- |
| Surfaces | `background`, `card`, `popover`, `muted`, `accent` | Card ≠ background in dark mode for layering                   |
| Brand    | `primary` (emerald 164°)                           | Focus rings share the hue (`ring`)                            |
| Semantic | `success`, `warning`, `destructive`, `info`        | Status badges, alerts, trends                                 |
| Charts   | `chart-1..5`                                       | Categorical ramp tuned per theme; wrappers cycle it           |
| Sidebar  | `sidebar-*`                                        | Independent dark palette so the rail stays dark in light mode |
| Shape    | `radius` (0.5rem base)                             | `sm/md/lg/xl` derived                                         |

Typography: Inter (variable) for UI, system mono stack for ids/code. Type scale
stays small (11–24px) for density; weight and color carry hierarchy.

## Component layers

1. **`components/ui/`** — 20 primitives (button, badge, card, dialog, sheet,
   dropdown, select, tabs, table, tooltip, popover, command, form, input,
   textarea, label, switch, progress, avatar, scroll-area, skeleton, separator,
   alert, sonner). shadcn/ui-style: Radix behavior + token styling, owned in-repo.
2. **`components/patterns/`** — console-specific composites, all reusable:
   - `StatusBadge` — one mapping from every backend status string to semantic
     color; live states pulse.
   - `StatCard` — KPI tile with icon, hint, trend, loading skeleton.
   - `ChartCard` + `TimeSeriesArea`/`CategoryBar`/`Donut` — themed Recharts
     wrappers (token colors, styled tooltips, empty/loading states built in).
   - `Timeline` — execution steps and activity feeds.
   - `CodeBlock`/`JsonBlock` — mono blocks with copy-to-clipboard.
   - `EmptyState`, `ErrorState` (parses API errors, retry affordance),
     `TableSkeleton`, `StatGridSkeleton`, `PageSpinner`, `PageHeader`.
3. **`components/shell/`** — the frame (sidebar, header, breadcrumbs, palette,
   notifications, org switcher, theme toggle, user menu, shortcuts dialog).
4. **`components/workflow/`** — builder canvas, custom step node, config sheet,
   and the pure `definition-io.ts` (conversion/layout/validation — unit tested).

## Conventions

- Every async surface renders all four states: loading (skeleton), error
  (ErrorState with retry), empty (EmptyState with CTA), data.
- Status strings are never colored ad hoc — always `StatusBadge`.
- Numbers use `tabular-nums`; ids use `shortId()` + mono font.
- Icons: Lucide only, `size-4` default, `aria-hidden` unless interactive.
- Focus: every interactive element keeps a visible `ring` focus state.
- Motion: transitions ≤200ms; `prefers-reduced-motion` disables all animation
  globally (see globals.css).

## Accessibility

- Radix primitives supply keyboard/ARIA behavior (menus, dialogs, tabs).
- Landmarks: `nav[aria-label]`, breadcrumbs use `aria-current="page"`,
  loading regions use `role="status"`, alerts `role="alert"`.
- Command palette and all dialogs trap focus and restore it on close.
- Automated WCAG 2.1 AA scans run in Playwright via axe-core
  (`tests/e2e/accessibility.spec.ts`).

# State Management Guide

The console separates state into five buckets. The rule: **server data lives in
TanStack Query, never in Zustand**; Zustand holds only what the server doesn't
know.

| Bucket            | Where                                                | Persisted              | Examples                                                  |
| ----------------- | ---------------------------------------------------- | ---------------------- | --------------------------------------------------------- |
| Server state      | TanStack Query (`hooks/use-api.ts`)                  | cache only             | executions, workflows, models, approvals, members, health |
| Auth session      | `state/auth-store.ts` (Zustand + persist)            | localStorage `qa-auth` | JWT, session user, active org                             |
| UI preferences    | `state/ui-store.ts` (Zustand + persist, partialized) | localStorage `qa-ui`   | sidebar collapsed                                         |
| UI overlays       | `state/ui-store.ts` (not persisted)                  | no                     | command palette open, shortcuts dialog                    |
| Local/route state | `useState` / URL params                              | URL when shareable     | filters (`?run=1`, status selects), builder canvas draft  |

## Server state details

- **Query keys** are centralized in `queryKeys` so invalidation is precise and
  greppable.
- **Polling**: `useExecutions`/`useExecution` poll at 4s only while something is
  RUNNING/PENDING (the `refetchInterval` callback inspects the data), backing off
  to 30s when idle. `useApprovals` polls at 4s because approvals are the primary
  actionable notification.
- **Mutations** invalidate the exact keys they affect, toast on error via a
  single `apiErrorMessage()` parser, and (for approvals) update optimistically
  with rollback safety via `onSettled` invalidation.
- **Org switching** invalidates the entire cache — every query is org-scoped by
  the JWT.

## Why not more global state?

Filters, dialogs, and drafts are deliberately component-local or URL-encoded:
they have exactly one consumer, and URL state (e.g. `/workflows?run=1`,
`/workflows/builder?id=…`) makes views shareable. The builder canvas keeps its
draft in a ref + React Flow's internal state, snapshotting to a local version
list on demand — nothing else needs to observe keystroke-level changes.

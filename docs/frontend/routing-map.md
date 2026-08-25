# Routing Map

All console routes live in the `(dashboard)` group behind `AppShell` (auth
guard + sidebar/header). Auth routes live in `(auth)` with the split brand
layout.

| Route                                   | Purpose                                                                                                                                                 | Data sources                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `/`                                     | Redirects → `/overview` (authed) or `/login`                                                                                                            | —                                         |
| `/login`, `/register`                   | Session + workspace creation                                                                                                                            | `POST /auth/login`, `POST /auth/register` |
| `/overview`                             | Executive dashboard: KPIs, 14-day trend, quota meters, activity feed, workflow shortlist                                                                | executions, quotas, workflows             |
| `/workflows`                            | Template gallery, filter, seed templates, **Run a goal** dialog (`?run=1` opens it)                                                                     | workflows, plan-and-execute               |
| `/workflows/builder`                    | Visual React Flow editor: palette, config sheet, validation, auto-layout, JSON import/export (Monaco), local version snapshots. `?id=` loads a template | workflows                                 |
| `/executions`                           | Run history table with status filter; live rows poll                                                                                                    | executions                                |
| `/executions/[id]`                      | Live run detail: step timeline, read-only graph, variables, input/output, cost/token stats                                                              | execution, workflows                      |
| `/approvals`                            | Pending approval queue (approve/reject with optimistic updates) + recent decisions                                                                      | approvals, tool history                   |
| `/agents`                               | Model catalog (capabilities, pricing), quotas, **sandbox** playground                                                                                   | models, quotas, sandbox                   |
| `/memory`                               | Knowledge base CRUD, semantic search, reflections, category distribution                                                                                | knowledge, search, reflections, explore   |
| `/tools`                                | Tool catalog, runner (full pipeline incl. approval gates), execution history, credential vault                                                          | catalog, execute, history, credentials    |
| `/analytics`                            | 30-day trends: outcomes, tokens, spend, tool usage donut, tool performance table, org usage                                                             | executions, tool history, quotas          |
| `/health`                               | Platform + dependency status from the readiness probe, active workload                                                                                  | health, executions                        |
| `/settings`                             | Profile + appearance (theme)                                                                                                                            | users/me                                  |
| `/settings/organization`                | Members table + invite dialog                                                                                                                           | members, invite                           |
| `/settings/{ai,memory,tools,workflows}` | Legacy redirects → `/agents`, `/memory`, `/tools`, `/workflows`                                                                                         | —                                         |

## Navigation config

`components/shell/nav-config.ts` is the single source of truth: the sidebar,
command palette, breadcrumb labels, and `g`-key shortcuts all derive from it.
Adding a route = add one entry there and create the page.

## Keyboard shortcuts

| Keys                           | Action                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `⌘K` / `Ctrl+K`                | Command palette                                                                                               |
| `?`                            | Shortcuts dialog                                                                                              |
| `g` then `o/w/e/p/a/m/t/n/h/s` | Go to Overview / Workflows / Executions / Approvals / Agents / Memory / Tools / Analytics / Health / Settings |

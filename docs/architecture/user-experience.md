# User Experience & Design System Architecture

This guide describes the UI routing layers, components directory hierarchy, layout switches, state management systems, and command palette logic.

---

## 1. System Topology & Layout Tree

The Next.js App Router utilizes the `(dashboard)` route group to unify headers, sidebar navigations, profile indicators, and organization switchers.

```mermaid
graph TD
    A[Root Layout] --> B[App Providers]
    B --> C[Auth Routing Gate]
    C --> D[(dashboard) Layout]
    D --> E[Sidebar Navigation]
    D --> F[Header & Breadcrumbs]
    D --> G[Command Palette Cmd+K]
    D --> H[Sub-pages (Workflows, Memory, Tools, Settings)]
```

---

## 2. Global State & Caching

1. **Authentication State**: Managed via a Zustand store `useAuthStore` containing current user role, email, active organization token bounds, and sign-out helpers.
2. **Server State Queries**: Dispatched via Axios directly querying target NestJS endpoints (`/api/v1/memory/explore`, `/api/v1/workflows/executions`).
3. **Command Palette Keyboard Shortcuts**: Toggled instantly via Ctrl/Cmd+K shortcuts, displaying context-aware paths matching search query words.

---

## 3. UI Component Guide

- **Executive Cockpit Dashboard**: Embedded directly inside settings overview displaying average latency dials, spend limits, success gauges, and model token bar graphs.
- **RAG & Sandbox Explorer**: Console selectors executing prompt test similarity runs and displaying matching indicators.
- **Approvals & Pause Queue**: Inspects pending tool checkpoints for resumptions.

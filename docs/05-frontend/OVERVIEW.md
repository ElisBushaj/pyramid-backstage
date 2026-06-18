# Frontend — Overview

The **Command Center**: a Vite + React 19 SPA (no SSR) that the Pyramid team lives in — chat-driven intake on one side, a live operational dashboard on the other.

## Stack (locked — [ADR-0006/0007/0008])
React 19 · React Router 7 · Tailwind 4 (CSS-var tokens via `@theme inline`) · Radix primitives · Zustand (on demand) · TanStack Query (server cache) · CVA + clsx + tailwind-merge · lucide-react. Vite build, Vitest, Playwright.

## Folder layout
```
frontend/src/
├── api/            # client.ts (envelope unwrap, Idempotency-Key, typed errors) + types/*  (mirror ops-core/openapi.yaml)
├── components/ui/  # primitives (Button, Input, Dialog, …) — from the design system
├── components/     # command-center components (ConflictBanner, AvailabilityTimeline, CopilotPanel, …)
├── layouts/        # AppShell, AuthShell
├── pages/<area>/   # route pages + page-local components
├── routes/         # createBrowserRouter, RootLayout, lazy route groups
├── hooks/  stores/  lib/  i18n/  styles/
```

## How it's built
1. **Design first**: `DESIGN_SYSTEM.md` + `PAGES.md` → Claude Design → export into `CLAUDE_DESIGN/`.
2. **Tokens**: copy the export's token values into `styles/tokens.css` (already stubbed with the locked palette); Tailwind `@theme inline` bridges them.
3. **Primitives → components → shells → pages**, each verified side-by-side against the artboard ([DESIGN-PARITY.md](../10-qa/DESIGN-PARITY.md)).
4. **Wire to ops-core** via the typed API client + mirrored types — the contract guarantees no drift.

## Data
- Reads use **TanStack Query** (`staleTime 30s`, retry 1). Mutations send `Idempotency-Key` and invalidate the relevant queries.
- **Live updates**: subscribe to NATS-bridged events (a thin WebSocket/SSE relay or polling fallback) to flip the dashboard and surface the copilot's proactive conflict heads-up. Degrades to polling if the realtime channel is down — never blocks the core flow.

## Budgets
Initial JS+CSS < 200 KB gzip per route (lazy-load `/settings`, `/audit`). LCP < 2s on a mid laptop. Light mode only at launch (tokens dark-capable).

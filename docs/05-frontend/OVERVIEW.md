# Frontend — Overview

The **Command Center**: a Vite + React 19 SPA (no SSR) that the Pyramid team lives in — chat-driven intake on one side, a live operational dashboard on the other.

## Stack (locked — [ADR-0006/0007/0008])
React 19 · React Router 7 · Tailwind 4 (CSS-var tokens via `@theme inline`) · Radix primitives · Zustand (on demand) · TanStack Query (server cache) · CVA + clsx + tailwind-merge · lucide-react. Vite build, Vitest, Playwright.

## Folder layout
```
frontend/src/
├── api/            # client.ts (envelope unwrap, Idempotency-Key, typed errors) + types/*  (mirror ops-core/openapi.yaml)
├── components/ui/  # primitives (Button, Input, Dialog, …) — from the design system
├── components/     # command-center components (ConflictBanner, AvailabilityTimeline, CopilotPanel, FloorMap, AssetScanner, AssetLocationWidget, …)
├── layouts/        # AppShell, AuthShell, PortalShell (the stripped partner shell)
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
- **Freshness**: TanStack Query polls the REST contract (background refetch) to flip the dashboard, surface the copilot's proactive conflict heads-up, and refresh the live-location widget. Polling is the only freshness mechanism — never blocks the core flow.

## What's new (F14–F19)
- **CopilotPanel is now live** — wired to the AI service `POST /chat` (stateful via `sessionId`) and `POST /plan` (the deterministic planner → OperationalPlan), per [`../04-api/AI_CONTRACT.md`](../04-api/AI_CONTRACT.md). It **degrades to a canned copilot** when `VITE_AI_URL` is unset or the service is down, so the demo never depends on the AI being live. The panel renders `/plan` output (incl. the FloorMap) and `ProposedActionCard` (`requiresApproval`).
- **`FloorMap`** — the radial digital-twin command component; lights up `/plan` output on RequestDetail and the Dashboard, with a catalog-only v1 fallback. Spec: [`FLOOR_MAP.md`](./FLOOR_MAP.md).
- **Scanner UI** (`AssetScanner`, `/scan`) — mobile QR/NFC asset scan → movement; **live-location widget** (`AssetLocationWidget`, "Where is it?") on the Dashboard + asset detail. Domain: [`../02-domain/ASSET_TRACKING.md`](../02-domain/ASSET_TRACKING.md).
- **Partner portal** — a `PARTNER`-role audience under `PortalShell` (intake + my-requests), feeding the staff Pending Approvals queue. Domain: [`../02-domain/PARTNER_PORTAL.md`](../02-domain/PARTNER_PORTAL.md).

## Budgets
Initial JS+CSS < 200 KB gzip per route (lazy-load `/settings`, `/audit`). LCP < 2s on a mid laptop. Light mode only at launch (tokens dark-capable).

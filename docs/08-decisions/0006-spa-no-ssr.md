# ADR-0006: Vite + React 19 SPA, no SSR

- **Status**: Accepted
- **Date**: 2026-06-18

## Context

The frontend is the **Command Center** — a chat + live-dashboard surface for a small, authenticated venue ops team. It is reached after login; none of it is public, none of it needs to be indexed, and there is no anonymous landing page to optimize for first paint by a search crawler. The build is generated from a Claude Design export against the frozen contract.

The question is whether to invest in server-side rendering / prerendering (SSR) or ship a pure single-page app.

## Decision

**A pure client-rendered SPA: Vite + React 19, no SSR, no prerender.**

- Vite dev server and static build; React 19; React Router 7 for client routing; TanStack Query for server state; Zustand for the little local UI state that needs it.
- The app boots, authenticates against `ops-core` (`GET /private/auth/me`), and renders entirely on the client. Data is fetched via the contract; the live signal arrives over NATS (or polling when degraded).
- No Node render server, no streaming HTML, no hydration step.

See [docs/05-frontend/OVERVIEW.md](../05-frontend/OVERVIEW.md) and [docs/01-architecture/STACK.md](../01-architecture/STACK.md).

## Consequences

- **No SEO need is wasted effort.** Every screen is behind auth; there is nothing to index. SSR would add a render tier and a hydration class of bugs for zero benefit here.
- **Simpler deploy and ops.** The frontend is static assets behind a CDN/static host — no Node process to run, scale, or monitor for the UI. One fewer moving part in the stack.
- **Live-first fits the client model.** A live, stateful dashboard with WebSocket/NATS updates is a client-side concern anyway; there is no "first meaningful paint from the server" story that SSR would improve for an authenticated, real-time tool.
- **Trade-off accepted**: slightly slower cold first paint than SSR for the very first load, and no server-rendered fallback for no-JS clients. Neither matters for an internal staff tool on modern browsers.
- **Bundle discipline still applies**: route-level code splitting keeps the initial payload small; this is a frontend task concern, not an architecture one.

## Alternatives considered

- **Next.js / Remix SSR.** Rejected: an entire render tier and hydration complexity to serve content that is authenticated and non-indexed. The cost is real; the benefit (SEO, fast first paint for anonymous users) does not exist for this product.
- **Static prerender of marketing pages.** Rejected: there are no marketing pages — the app is login-gated end to end.
- **Server components / partial hydration.** Rejected as premature: the live-dashboard interactivity is pervasive, so most of the tree is client-driven anyway; the added build/runtime complexity buys little.

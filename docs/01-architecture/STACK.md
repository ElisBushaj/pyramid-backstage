# Architecture — Stack

> The locked stack, per service, with versions and the reason each was chosen. Locked decisions live in [`docs/08-decisions/`](../08-decisions/); supersede via a new ADR, don't drift. Mirrors `CLAUDE.md` § Tech stack.

## ops-core — the deterministic record (Elis)

| Choice | Version | Why |
|---|---|---|
| **Node** | 20+ | LTS; the runtime the team builds on. |
| **Express** | 5 | Minimal, well-understood HTTP layer; the contract is the structure, not a heavy framework. Express 5's async error handling fits the `@controlledResponse` + `APIError` pattern. |
| **TypeScript** | — | Compile-time safety on the record that authorizes inventory + money; the hand-mirrored DTOs ([ADR-0008](../08-decisions/0008-hand-mirrored-api-types.md)) are typed. |
| **Prisma** | 7 | Typed data access + migrations; the schema is owned here. Supports the serializable transactions + row locks the reservation path needs ([docs/02-domain/RESERVATIONS.md](../02-domain/RESERVATIONS.md)). |
| **Postgres** | 17 | The single source of truth. Relational integrity, serializable isolation, grouped aggregates for the sum-of-holds availability query, `pgcrypto` + `citext`. |
| **Redis** | 7 | Idempotency-key cache (24h TTL) + the session store substrate. |
| **argon2id** (`@node-rs/argon2`) | — | Password hashing for the native session auth ([ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md)). |
| **Vitest** | — | Tests next to the implementation; the engine adds property tests; integration tests run on real Postgres. |

**Why native session auth, not a managed provider:** an internal staff tool with four roles and no public signup is lighter to self-host (no fourth container) and faster to make flawless in three days ([ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md)).

## ai-orchestrator — the reasoning layer (Alvin · scaffold + mock here)

| Choice | Why |
|---|---|
| **Python 3.12** | The LLM/graph ecosystem's native language. |
| **FastAPI** | Typed async HTTP for the `/chat` + `/plan` endpoints; Pydantic mirrors the contract DTOs ([ADR-0008](../08-decisions/0008-hand-mirrored-api-types.md)). |
| **LangGraph** | The deterministic plan DAG (parse → match → check → reserve → quote → tasks → detect → assemble) — a fixed graph, not an open-ended ReAct agent ([docs/02-domain/AI_ORCHESTRATION.md](../02-domain/AI_ORCHESTRATION.md)). |
| **Claude (Anthropic)** | The model behind intake + narrative composition (low temperature; numbers injected from ops-core, never free-generated). |
| **ChromaDB** | RAG vector store for venue knowledge / task templates. |
| **Redis** | Conversation memory (the *only* state the AI holds). |

One coupling: `OPS_CORE_URL`. It holds no domain state — everything true comes from `ops-core` ([ADR-0001](../08-decisions/0001-two-services-one-contract.md)).

## frontend — the Command Center (built from the Claude Design export)

| Choice | Why |
|---|---|
| **Vite + React 19** | Fast SPA build; **no SSR** — every screen is behind auth, nothing to index ([ADR-0006](../08-decisions/0006-spa-no-ssr.md)). |
| **React Router 7** | Client routing for the page set in [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md). |
| **Tailwind 4** | CSS-variable design tokens via `@theme inline`; the near-monochrome calm-blue language ([ADR-0007](../08-decisions/0007-tailwind-radix.md)). |
| **Radix** | Accessible, unstyled interaction primitives (Dialog, Popover, Tooltip, DropdownMenu) under the owned component layer. |
| **CVA** | Variant management for the owned component layer. |
| **Zustand** | The small amount of local UI state that needs it (sidebar, copilot panel). |
| **TanStack Query** | Server-state cache against the contract; the unwrap-`data` API client. |
| **lucide** | Icon set. |

The frontend hand-mirrors the contract DTOs in `frontend/src/api/types/` ([ADR-0008](../08-decisions/0008-hand-mirrored-api-types.md)).

## Backing services & infra

| Service | Image | Role |
|---|---|---|
| **Postgres** | `postgres:17` | ops-core's source of truth. |
| **Redis** | `redis:7-alpine` | Idempotency + sessions (ops-core); conversation memory (AI). |
| **ChromaDB** | `chromadb/chroma:latest` | AI RAG vectors (Alvin's lane). |

All run from one `docker compose` ([`infrastructure/`](../../infrastructure/), [INFRASTRUCTURE.md](./INFRASTRUCTURE.md)). **Independent packages, no monorepo workspaces** — each app ships its own `package.json`/deps, matching the contract-only boundary.

## What's deliberately *not* in the stack

- **No SSR / Next.js** ([ADR-0006](../08-decisions/0006-spa-no-ssr.md)).
- **No Zod** — validation is `express-validator` + `ValidationHelpers` ([docs/04-api/CORE_PATTERNS.md](../04-api/CORE_PATTERNS.md)).
- **No BullMQ / job queue** — ops-core's work is synchronous request/response over REST; there is no background-job need.
- **No managed identity provider** (e.g. SuperTokens) — native sessions ([ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md)).
- **No shared types package / codegen mandate** — hand-mirrored DTOs ([ADR-0008](../08-decisions/0008-hand-mirrored-api-types.md)).
- **No floats on money; no hand-rolled interval math** — `utils/money.ts`, `utils/time.ts`.

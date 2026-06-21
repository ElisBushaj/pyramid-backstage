# Architecture — Overview

> The high-level shape of Pyramid Backstage. Per-area depth lives in [`docs/02-domain/`](../02-domain/); the wire is [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml) + [`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md). This page is the map.

## The diagram, in prose

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Command Center — Vite + React 19 SPA (the client)                         │
│  chat · dashboard · operational-plan view · calendar · audit               │
└───────────────┬──────────────────────────────────┬───────────────────────┘
                │ REST (the contract)               │ chat / plan
                │                                    │
                ▼                                    ▼
┌───────────────────────────────────┐   ┌────────────────────────────────────┐
│  ops-core  (Elis · TS/Express)     │   │  ai-orchestrator (Alvin · Python)   │
│  the deterministic record          │   │  the reasoning layer                │
│                                    │   │                                    │
│  modules: auth spaces assets       │◄──┤  LangGraph plan DAG · /chat copilot │
│    requests reservations quotes    │   │  calls ops-core endpoints AS TOOLS  │
│    tasks conflicts audit approvals │   │  (only coupling: OPS_CORE_URL)      │
│  engines: availability · conflict  │   │                                    │
│    · pricing · reservation         │   │  holds NO domain state:             │
│                                    │   │    Redis  → conversation memory     │
│                                    │   │    ChromaDB → RAG retrieval         │
└───────┬───────────────────────────┘   └──────────────┬─────────────────────┘
        │ Prisma                                        │ (dev only)
        ▼                                               ▼
   ┌─────────┐                                  ┌──────────────┐
   │Postgres │                                  │ mock-ops-core │
   │ (truth) │                                  │ (stateful,    │
   └─────────┘                                  │  :4010)       │
                                                └──────────────┘
```

**Two services, one contract.** The client talks to `ops-core` over REST (the whole tool surface) and to `ai-orchestrator` for chat/plan. `ai-orchestrator` calls `ops-core` endpoints **as LangGraph tools** — the only coupling is `OPS_CORE_URL` ([ADR-0001](../08-decisions/0001-two-services-one-contract.md)). Neither service imports the other's code.

**Where state lives.** `ops-core` owns all domain state in **Postgres** and is the single source of truth. `ai-orchestrator` holds **no domain state** — only conversation context in **Redis** and retrieval vectors in **ChromaDB**. The brain reasons; the record knows.

## The request → plan flow

This is the core loop the whole system exists to serve (mapped beat-by-beat in [`docs/07-operations/DEMO_SCRIPT.md`](../07-operations/DEMO_SCRIPT.md)):

1. **Intake.** A staff member types a messy request to the copilot, or fills the structured form. The AI parses natural language into a validated `EventRequestInput` and creates it via `POST /requests` → `EventRequest` (`DRAFT`). The request is *always* created against the validated contract shape — the AI only proposes.
2. **Match.** The AI calls `GET /spaces?minCapacity&layout&start&end` — `ops-core` returns spaces whose `capacities[layout] ≥ minCapacity`, each annotated with buffer-aware `available`. It calls `GET /assets?type&quantity&start&end` for inventory in the window.
3. **Hold.** The AI proposes a hold; `ops-core` runs `POST /reservations` inside a **serializable, row-locked transaction**: re-validate availability (the authoritative `detectConflicts`), decrement atomically, write audit. Success → a `HELD` `Reservation`; any clash → `409 { conflicts }` (the deterministic conflict branch).
4. **Price.** `POST /quotes` builds line items and **server-computes** `net + 20% VAT = total` ([ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md)).
5. **Tasks.** The AI reasons out a setup/teardown list and persists it via `POST /requests/:id/tasks`; `ops-core` computes each `dueAt` from the reserved window. The request is now `PROPOSED`.
6. **Assemble.** `GET /requests/:id` returns the `RequestAggregate` (request + reservation + quote + tasks + conflicts + audit) — the operational-plan view. The AI wraps it in a narrative whose numbers come from this data, never invented.
7. **Approve.** A **MANAGER+** calls `POST /requests/:id/approve` → held reservations `CONFIRMED`, request `SCHEDULED`, audit written, the task list live. (Or `reject` with a reason → reservations released.)

If a step is infeasible (a conflict on every `preferredDates[]` window), the plan comes back `feasible: false` with `alternatives` — *"Blue is taken; Orange seats 180 in theater and is free."*

## The F14–F19 expansion

Five additions extend the shape above without changing it — each rides the existing module pattern, contract-additive-only:

- **Space catalog (F14).** The 6 seeded spaces grow to a 19-space catalog ([`docs/03-data/spaces.catalog.json`](../03-data/spaces.catalog.json)) with circulation/adjacency/map fields added to `Space` additively (nullable + backfill). This is what the FloorMap and the AI planner read.
- **Partner portal (F15).** A `PARTNER` role **below** `VIEWER` with **row-scoped** intake — partners create requests and see **only their own** (`EventRequest.createdById`). The existing F10 MANAGER+ approve/reject becomes the admin queue that **removes email** from the loop ([SECURITY.md](./SECURITY.md), [docs/02-domain/PARTNER_PORTAL.md](../02-domain/PARTNER_PORTAL.md)).
- **Asset movement (F16).** The `assets` module gains a **scan** endpoint and an `AssetMovement` ledger — QR encodes `assetId`, a scan records a movement + updates the live `Asset.location` (aggregate-with-movement, **not** per-unit serialized identity) ([docs/02-domain/ASSET_TRACKING.md](../02-domain/ASSET_TRACKING.md)).
- **AI contract surface (F17/F18).** `POST /chat` (stateful copilot via `sessionId`) and `POST /plan` (the deterministic planner → `OperationalPlan`) become the wire into the now-live `CopilotPanel`. AI→ops-core auth is a **service token** (system actor) + forwarded acting-user headers, so audit and partner row-scoping stay correct ([SECURITY.md](./SECURITY.md), [docs/04-api/AI_CONTRACT.md](../04-api/AI_CONTRACT.md)).
- **FloorMap (F19).** A frontend command module renders `/plan` output as a v1 radial map keyed off `Space.map` ([docs/05-frontend/FLOOR_MAP.md](../05-frontend/FLOOR_MAP.md)).

**Self-sufficient by design:** the copilot degrades to a canned response and the FloorMap renders from the catalog alone, so the demo never depends on `ai-orchestrator` being live.

## Trust boundary

**AI output is untrusted input.** Anything the AI proposes (`proposedActions`) is re-validated by `ops-core` server-side before it commits ([docs/02-domain/AI_ORCHESTRATION.md](../02-domain/AI_ORCHESTRATION.md), [SECURITY.md](./SECURITY.md)). A hallucinated total can't post (the server recomputes it); an impossible hold can't commit (the transaction aborts with `409`). Human approval gates anything that commits reservations or money.

## Cross-references

- **Stack & versions:** [`STACK.md`](./STACK.md). **Module map:** [`MODULES.md`](./MODULES.md). **Infra:** [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md).
- **Security & trust:** [`SECURITY.md`](./SECURITY.md). **Observability:** [`OBSERVABILITY.md`](./OBSERVABILITY.md). **Patterns:** [`EXISTING_PATTERNS.md`](./EXISTING_PATTERNS.md).
- **The contract:** [`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md). **Domain:** [`docs/02-domain/`](../02-domain/). **Decisions:** [`docs/08-decisions/`](../08-decisions/).

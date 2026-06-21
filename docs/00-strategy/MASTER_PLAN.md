---
id: MASTER_PLAN
created: 2026-06-18
last_updated: 2026-06-18
status: active
owners: [elis]
---

# Master Plan — Pyramid Backstage, the 3-day ops-core build

> Read this **second**, after [`CLAUDE.md`](../../CLAUDE.md) and [`VISION.md`](./VISION.md). This is the orchestration plan that ties the feature tracks (`F00–F13`) into a sequenced, parallelizable build. Individual feature `SPEC.md` files remain the source of truth for their own scope; this file says **what order**, **what runs in parallel**, **what "done" means at the program level**, and **what gets cut first if time runs short**.

## 0. Purpose

Pyramid Backstage turns an event *request* into an operational *plan* (see [`VISION.md`](./VISION.md)). It is **two services, one contract** ([ADR-0001](../08-decisions/0001-two-services-one-contract.md)):

- **`ops-core`** (Elis) — the deterministic system of record. **This is what the 3-day build ships in full**, features `F00`–`F13`.
- **`ai-orchestrator`** (Alvin) — the reasoning layer. **Scaffold + stateful mock + reference backlog (`A00`) only** here; not 3-day-build scope ([R-04](../09-questions/RESOLVED.md)).

The **frontend** Command Center is built **after** the Claude Design export lands, against the frozen contract.

The hardening posture is **production-shaped + full auth/RBAC**: real sessions, real roles, audit-with-actor, transactional correctness — not a toy. The plan is sequenced by dependency (what unblocks the most) and by the demo's critical path (intake → plan → conflict → approve → live).

## 1. Snapshot — 2026-06-18

### 1.1 What's done (Bootstrap)

The repo skeleton, the **contract** ([`ops-core/openapi.yaml`](../../ops-core/openapi.yaml), locked Hour 0), the full docs set (`00`–`10`), the [`infrastructure/`](../../infrastructure/) docker-compose stack (Postgres, Redis, ChromaDB + the three apps + the `mock` profile), the design-system brief for Claude Design, and the feature backlog (`F00`–`F13` + `A00`) — all written. `STATUS.md` is the generated dashboard over it.

### 1.2 What this build ships (ops-core `F00`–`F13`)

Auth + RBAC, spaces, assets, event requests, the availability/conflict engine, reservations (atomic + leased), quotes (server-computed VAT), tasks, audit, approvals, the seed, and the contract test. The headline is the **request→plan→approve** loop with a correct conflict engine.

### 1.3 What's out of scope here

- **`ai-orchestrator` logic** — Alvin's lane (`A00` is a reference backlog, ineligible for the ops-core loop).
- **The frontend pages** — built from the Claude Design export, post-`F13`, against the contract.
- **Production hardening backlog** — auth audit, full observability, multi-space, QR tracking (see [`ROADMAP.md`](./ROADMAP.md)).

### 1.4 What's locked

The decisions in [`docs/08-decisions/`](../08-decisions/) and `CLAUDE.md` stand: two services / one contract, session auth + RBAC in ops-core, integer-minor money + server VAT, idempotency on all mutations, SPA / no SSR, Tailwind+Radix, hand-mirrored types, buffer-aware conflicts. Supersede only via a new ADR.

## 2. Phased plan

Bootstrap is done. The build runs Foundation → Domain → Core → Integration, then Frontend after the design export. Within a phase, disjoint features parallelize; the engine and the schema are serial.

### Phase 0 — Bootstrap ✅ (done)

Contract, docs, infra, design brief, backlog. The baseline every other phase starts from.

### Phase 1 — Foundation (`F00`, `F01`, `F09`)

**Goal:** stand up the spine every feature hangs off — the app skeleton + DB, auth + actor, and the audit writer. After this phase, a mutation can authenticate, identify its actor, and write an `AuditEntry` in the same transaction as its state change.

- **`F00` Bootstrap** — Express 5 app, Prisma schema + migrations, `config/prisma`, `utils/{money,time,validation}`, the `@controlledResponse` core, `APIError`, `ServiceResponse`, locales scaffold, health/ready probes.
- **`F01` Auth & RBAC** — argon2id login, `pb_session` cookie, server sessions, `requireAuth` → `req.actor`, `requireRole`/`requirePermission`, login rate-limit + CSRF, admin user CRUD. ([ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md))
- **`F09` Audit** — the `AuditEntry` writer invoked by every mutation, `GET /audit`. ([docs/02-domain/AUDIT.md](../02-domain/AUDIT.md))

`F00` is the hard prerequisite for everything. `F01` and `F09` can largely parallelize once `F00`'s schema + core are in (they touch different modules; the schema work is sequenced first).

### Phase 2 — Domain (`F02`, `F03`, `F04`)

**Goal:** the CRUD entities the engine and the plan operate on. After this phase, spaces, assets, and requests exist with their validators, routes, audit, and read/list endpoints.

- **`F02` Spaces** — capacities-per-layout, features, rate, buffers; matching + windowed availability annotation. ([docs/02-domain/SPACES.md](../02-domain/SPACES.md))
- **`F03` Assets** — typed inventory, aggregate counts, location, status; windowed availability. ([docs/02-domain/ASSETS.md](../02-domain/ASSETS.md))
- **`F04` Requests** — structured `EventRequest`, lifecycle state machine, the `RequestAggregate` read. ([docs/02-domain/REQUESTS.md](../02-domain/REQUESTS.md))

These three are disjoint modules and parallelize cleanly after Phase 1.

### Phase 3 — Core (`F05`, `F06`, `F07`, `F08`, `F10`)

**Goal:** the engines and the workflow — the part that has to be *exactly right*. After this phase, the system can match a space, hold it and its assets atomically, price it, generate tasks, and approve it.

- **`F05` Availability & Conflict** — the correctness core: half-open overlap, effective windows, the three conflict types, sum-of-holds asset availability, **unit + property tested**. ([ADR-0009](../08-decisions/0009-conflict-window-includes-buffers.md), [docs/02-domain/CONFLICTS.md](../02-domain/CONFLICTS.md)) **This is the highest-risk feature; it gets the most test budget.**
- **`F06` Reservations** — the serializable, row-locked hold/confirm/release, leases + reaper, idempotent. ([docs/02-domain/RESERVATIONS.md](../02-domain/RESERVATIONS.md))
- **`F07` Quotes** — server-computed line items + VAT, versioning. ([docs/02-domain/QUOTES.md](../02-domain/QUOTES.md))
- **`F08` Tasks** — persist AI-generated setup/teardown lists, compute `dueAt`. ([docs/02-domain/TASKS.md](../02-domain/TASKS.md))
- **`F10` Approvals** — `approve`/`reject` (MANAGER+) → confirm/release reservations → audit; the lifecycle transitions.

`F05` is the linchpin (`F06` depends on it for the in-transaction conflict check; `F02`/`F03` availability annotations consume it). `F06`→`F07`/`F08`/`F10` follow. `F07`, `F08` parallelize once `F06` lands.

### Phase 4 — Integration (`F12`, `F13`)

**Goal:** make it demoable and prove the contract holds. After this phase, a `docker compose up` + seed yields a realistic, conflict-planted dataset, and a contract test guards drift.

- **`F12` Seed** — 4 halls (Blue/Orange/Green/Yellow) + transitional areas, realistic inventory, the four staff roles, and a **planted conflict** for the demo. ([README](../../README.md) Quickstart)
- **`F13` Contract test** — validates payloads against `openapi.yaml`; the drift gate for the hand-mirrored types ([ADR-0008](../08-decisions/0008-hand-mirrored-api-types.md)).

### Phase 5 — Frontend (post Claude-Design export)

**Goal:** the Command Center, built to match the Claude Design export against the frozen contract. Out of the 3-day ops-core scope; begins when `CLAUDE_DESIGN/` lands.

- Chassis (routing, API client, TanStack Query, locale store, the design-system component layer per [ADR-0007](../08-decisions/0007-tailwind-radix.md)).
- Pages per [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md) — each pinned to its contract endpoints so the UI cannot drift.
- Parity verified per [`docs/10-qa/DESIGN-PARITY.md`](../10-qa/DESIGN-PARITY.md).

### Phase 6 — Beyond Booking (`F14`–`F19`, post-`F13` expansion)

**Goal:** push the shipped record past the booking loop toward the wider operational picture the [AADF Pyramid Challenge](../../New_Docs/) brief asks for — driven by Alvin's just-merged AI branch. **This is an expansion on top of `F00`–`F13`, not a fresh 3-day build**; the §6 program DoD stands and this phase has its own (below). Lane split and the seam are in [`ASSIGNMENTS.md`](./ASSIGNMENTS.md); the per-feature scope is in `docs/06-features/F14`–`F19`.

- **`F14` Space catalog** — extend `Space` with the catalog-extension fields and grow the seed from 6 to 19 spaces, from [`docs/03-data/spaces.catalog.json`](../03-data/spaces.catalog.json). Additive + nullable + backfill; rows 1–6 stay authoritative; the `F12` planted Blue-hall conflict survives. **Schema-first → keystone for `F18`/`F19`.**
- **`F15` Partner portal** — `PARTNER` role below `VIEWER`, partner-scoped intake (row-scoped by `EventRequest.createdById`), admin approval queue that removes email; reuses `F10` approve/reject (single-step).
- **`F16` Asset tracking** — `AssetMovement` ledger + `POST …/scan` (live `location` update) + `GET …/movements`; mobile scanner UI + "where is it" widget. Aggregate-with-movement, not per-unit identity.
- **`F17` AI auth** — service token (system actor) + forwarded `X-Acting-User-Id`/`X-Acting-User-Role` with a role ceiling, so AI→ops-core calls keep audit + partner scoping correct.
- **`F18` AI wiring** — `POST /chat` + `POST /plan` wired into `CopilotPanel`, with a degrade-to-canned fallback.
- **`F19` Floor map** — Elis's v1 radial `FloorMap` behind the prop contract `<FloorMap floor spaces={[{slug,status}]} />`, rendering `/plan` output; v2 SVG hotspots are post-demo polish.

**Definition of Done (`F14`–`F19`):** all six features' tasks `done`; `pnpm tsc --noEmit` + `pnpm test --run` green; the contract still **additive-only**; the headline plan demo, the **partner-no-email** intake→approval flow, and **QR live asset tracking** each run end-to-end; and the **AI-degrade** path (copilot → canned, map → v1) is verified — the demo never depends on the brain being live. Parallelism is bounded by the same rules as §4: `F14`'s schema work is serial and runs first; `MESSAGE_KEYS`/locales/route-mounts stay pre-staged.

## 3. The 3-day timeline

The build is time-boxed to three days. The mapping (the ops-core agent executes the backlog task-by-task; see [`EXECUTION_PLAYBOOK.md`](./EXECUTION_PLAYBOOK.md)):

| Day | Focus | Features | Exit signal |
|-----|-------|----------|-------------|
| **Day 1** | Foundation + Domain | `F00`, `F01`, `F09`, then `F02`, `F03`, `F04` | A staff user can log in; spaces, assets, requests CRUD with audit; health/ready green. |
| **Day 2** | Core engines | `F05` (with property tests), `F06`, `F07` | A space can be matched, held atomically (two parallel holds → exactly one `409`), and quoted with correct VAT. The conflict engine is property-green. |
| **Day 3** | Workflow + seed + e2e | `F08`, `F10`, then `F12`, `F13` | The full **request → plan → approve → SCHEDULED** loop runs end-to-end against the seed; a planted conflict surfaces and the approval path confirms reservations + writes audit; contract test green. |

Day boundaries are targets, not contracts — eligibility (deps done, no blocking question) drives task order. If a phase slips, the **cut-line** (§5) protects the demo.

## 4. Parallelization

Concrete ownership is in [`ASSIGNMENTS.md`](./ASSIGNMENTS.md). The shape of the work:

- **The ops-core agent (Claude)** executes the `F00`–`F13` backlog task-by-task via the memory system — pick the next eligible task, Research → Build → Test → Finalize, regenerate `STATUS.md`, commit with the `F##-T##` prefix.
- **Disjoint module features parallelize.** `F02`/`F03`/`F04` are independent modules; so are `F07`/`F08` once `F06` lands. When a parallel round runs, pre-stage the write-contended registries first (the orchestrator pattern, below), then spawn focused sub-agents on disjoint directories.

**Constraints that bound parallelism:**
- **Schema work is serial.** Two tasks cannot edit `prisma/schema.prisma` at once. Sequence schema changes first, then let module work parallelize.
- **Shared registries are serial.** `MESSAGE_KEYS` and `locales/{al,en}.json` and the route-mount files (`routes/v1/{public,private,admin}/index.ts`) are write-contended. The orchestrator pre-stages all new keys/mounts before spawning sub-agents.
- **The engine is serial and test-gated.** `F05` is the correctness core; it is built solo and does not ship without its property tests.
- **One commit per task** by default; group only when contention forces it.

## 5. Cut-line — what gives, and what never does

If the three days run short, cut in this order — and **never** cross the floor:

1. **Trim seed richness.** Fewer assets, one planted conflict instead of several. The demo path still runs. *First to go.*
2. **Defer non-critical reads/filters.** A list filter or a secondary read endpoint can wait.

**Never cut:**
- **Auth + RBAC.** The audit trail is worthless without a real decider; approvals must be gated. ([ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md))
- **Correctness.** The conflict engine, the serializable reservation transaction, idempotency, and server-computed money are the product. A double-booked room or an over-allocated asset is a failed demo and a broken promise.
- **Audit-with-actor.** Every mutation writes an `AuditEntry` with `req.actor`, in the same transaction. ([docs/02-domain/AUDIT.md](../02-domain/AUDIT.md))

> The principle: **degrade richness, never correctness or accountability.**

## 6. Definition of Done — program level

The 3-day ops-core build is **demo-ready** when all of the following hold:

1. Every `F00`–`F13` task is `Status: done` in its `TASKS.md` (`A00` excluded — Alvin's lane).
2. `pnpm tsc --noEmit` clean and `pnpm test --run` green in `ops-core/`, including `F05`'s **property tests**.
3. Every endpoint in [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml) is implemented and conforms to [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md) (controlled responses, `APIError`, `ServiceResponse`, idempotency on mutations).
4. **Every mutation writes an `AuditEntry` with `req.actor` in the same transaction as its state change.** No anonymous mutation.
5. **Locale parity**: `MESSAGE_KEYS` present in both `locales/al.json` and `en.json`; key counts match (CI gate).
6. The contract test (`F13`) is green — the hand-mirrored types are aligned.
7. `docker compose up` + `pnpm db:seed` yields the demo dataset; the **full demo path** ([`DEMO_SCRIPT.md`](../07-operations/DEMO_SCRIPT.md)) runs end-to-end, including a surfaced conflict and a MANAGER approval that confirms reservations and writes audit.
8. `GET /health` + `GET /ready` return correctly (ready reflects DB reachability).

The **frontend** has its own program-level DoD (every page in [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md) implemented, both locales, design parity per [`DESIGN-PARITY.md`](../10-qa/DESIGN-PARITY.md)); it begins after the design export and is tracked separately.

## 7. Cross-references

- **Conventions, non-negotiables, session protocol:** [`CLAUDE.md`](../../CLAUDE.md).
- **Why:** [`VISION.md`](./VISION.md). **Phased gates:** [`ROADMAP.md`](./ROADMAP.md). **Ownership:** [`ASSIGNMENTS.md`](./ASSIGNMENTS.md).
- **Per-task workflow:** [`EXECUTION_PLAYBOOK.md`](./EXECUTION_PLAYBOOK.md). **Terms:** [`GLOSSARY.md`](./GLOSSARY.md).
- **Backend patterns:** [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md), [`docs/01-architecture/EXISTING_PATTERNS.md`](../01-architecture/EXISTING_PATTERNS.md).
- **The contract:** [`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md) + [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml).
- **Per-feature scope:** [`docs/06-features/F##-name/SPEC.md`](../06-features/) and `TASKS.md`.
- **Domain detail:** [`docs/02-domain/`](../02-domain/). **Decisions:** [`docs/08-decisions/`](../08-decisions/).
- **Live dashboard:** `STATUS.md` (generated). **Open questions:** [`docs/09-questions/OPEN.md`](../09-questions/OPEN.md). **Assumptions:** [`.planning/ASSUMPTIONS.md`](../../.planning/ASSUMPTIONS.md).

---

This plan is alive. Update it when a phase gate passes, a question resolves, or the design export lands and Phase 5 begins.

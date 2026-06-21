---
id: ASSIGNMENTS
created: 2026-06-18
last_updated: 2026-06-18
status: active
owners: [elis]
---

# Assignments — who owns what

> Lane ownership for Pyramid Backstage. The boundaries here are the same ones the architecture enforces ([ADR-0001](../08-decisions/0001-two-services-one-contract.md)): the record and the brain are owned by different people and built in isolation, coupled only by the contract.

## The lanes

| Lane | Owner | Scope | Built when |
|------|-------|-------|-----------|
| **`ops-core`** | **Elis** | The deterministic system of record — all of `F00`–`F13`. | The 3-day build (now). |
| **`ai-orchestrator`** | **Alvin** | The reasoning layer — `A00`, his lane. | Alvin's timeline; against the mock, integrates via `OPS_CORE_URL`. |
| **The backlog executor** | **Claude (AI agent)** | Executes the ops-core backlog **task-by-task** via the memory system. | Throughout the build. |
| **`frontend`** | Built from the **Claude Design export** | The Command Center SPA, against the frozen contract. | Post-`F13` (Phase 2). |

## Elis — `ops-core` (all of `F00`–`F13`)

Elis owns the deterministic record end to end. That is every ops-core feature:

- **Foundation:** `F00` Bootstrap, `F01` Auth & RBAC, `F09` Audit.
- **Domain:** `F02` Spaces, `F03` Assets, `F04` Requests.
- **Core:** `F05` Availability & Conflict (the correctness core), `F06` Reservations, `F07` Quotes, `F08` Tasks, `F10` Approvals.
- **Integration:** `F12` Seed, `F13` Contract test.

Elis owns the contract ([`ops-core/openapi.yaml`](../../ops-core/openapi.yaml)) — additive-only changes, each breaking change a new ADR. The conventions Elis's code must hold are in [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md) and `CLAUDE.md`.

## Alvin — `ai-orchestrator` (`A00`, his lane)

Alvin owns the reasoning layer: the LangGraph plan DAG, the `/chat` copilot, RAG (ChromaDB), conversation memory (Redis), and the `OperationalPlan` artifact ([docs/02-domain/AI_ORCHESTRATION.md](../02-domain/AI_ORCHESTRATION.md)). In *this* repo that lane is **scaffold + stateful mock + reference backlog (`A00`) only** ([R-04](../09-questions/RESOLVED.md)) — Alvin implements the real logic on his own timeline.

**Lane rule (from `CLAUDE.md`):** tasks under `docs/06-features/A00-ai-orchestrator/` are **ineligible** for the ops-core backlog executor. They are a reference backlog, not 3-day-build work. The executor skips them.

Alvin develops against [`mock-ops-core`](../01-architecture/INFRASTRUCTURE.md) (the stateful contract mock that honors the `409 { conflicts }` path) and integrates by flipping `OPS_CORE_URL` from the mock to the real service — a one-line switch.

## Claude (AI agent) — the backlog executor

The ops-core backlog is executed **task-by-task** by Claude via the self-tracking memory system. The loop (full protocol in [`EXECUTION_PLAYBOOK.md`](./EXECUTION_PLAYBOOK.md) and `CLAUDE.md`):

1. Read `STATUS.md` → pick the next **eligible** task (status `not_started`, deps `done`, no blocking question, **not `A00`**).
2. Read its `SPEC.md` + `TASKS.md`; mark `in_progress`.
3. Implement: **Research → Build → Test → Finalize**, conforming to [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md).
4. Mark `done`, regenerate `STATUS.md`, commit with the `F##-T##` prefix.

When a parallel round is warranted (disjoint modules — e.g. `F02`/`F03`/`F04`), Claude acts as **orchestrator**: pre-stage the write-contended registries (`MESSAGE_KEYS`, locale JSONs, route mounts), then spawn focused sub-agents on disjoint directories, then reconcile and commit. Schema work and the `F05` engine stay serial.

## Frontend — built from the Claude Design export

The Command Center is **not** hand-designed in this repo. It is generated from the Claude Design export (`CLAUDE_DESIGN/`) using the brief in [`docs/05-frontend/DESIGN_SYSTEM.md`](../05-frontend/DESIGN_SYSTEM.md), then built page-by-page against the frozen contract per [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md). Whoever builds it conforms to the design system ([ADR-0007](../08-decisions/0007-tailwind-radix.md)) and verifies parity per [`docs/10-qa/DESIGN-PARITY.md`](../10-qa/DESIGN-PARITY.md). This phase begins after the export lands ([`ROADMAP.md`](./ROADMAP.md) Phase 2).

## Beyond Booking (`F14`–`F19`) — the expansion lane split

The post-`F13` expansion ([`ROADMAP.md`](./ROADMAP.md) Phase 5) keeps the same boundary: Elis owns the record + the face, Alvin owns the brain, they meet at the contract. The new seam is wider, so it is spelled out explicitly.

**Elis owns** — the record and the frontend for the new surfaces:

- **ops-core:** the `Space` catalog-extension fields + the 6→19 seed (`F14`), the `PARTNER` role + partner row-scoping (`F15`), the `AssetMovement` model + `POST …/scan` + `GET …/movements` (`F16`), and the service-token auth path (`F17`). All additive-only on [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml).
- **frontend:** the partner portal, the admin approvals queue, the mobile scanner + "where is it" widget, the AI wiring into `CopilotPanel` (with the degrade-to-canned fallback), and the **v1 `FloorMap`** (`F18`, `F19`).

**Alvin owns** — the AI logic behind the contract: natural-language parse, RAG over `venue_facts`, the `/chat` copilot, and the deterministic `/plan` graph. He may later **swap in his own `FloorMap`** behind Elis's prop contract — Elis's v1 is the self-sufficient fallback, not the final word.

**The seam** — the few touchpoints where the two lanes meet, each frozen as a contract:

- the **`PARTNER` enum** value (added below `VIEWER`);
- the **scan endpoint** `POST /private/assets/:id/scan`;
- the **service-token header** + forwarded `X-Acting-User-Id`/`X-Acting-User-Role` (with the role ceiling);
- the **`FloorMap` prop contract** `<FloorMap floor spaces={[{slug,status}]} />`;
- the shared **[`docs/03-data/spaces.catalog.json`](../03-data/spaces.catalog.json)** (rows 1–6 authoritative; the catalog both lanes read).

`bundleTemplates`/`circulationRules` ship as a frontend constant — no new contract endpoint. Everything else stays as it was: no code sharing across services, additive-only contract, one source of truth.

## The boundary, restated

Elis's record never reasons; Alvin's brain never holds state; they meet only at the contract. The backlog executor moves the record forward one task at a time; the frontend is the face built from the design export. Four lanes, one contract, no code sharing across services — the architecture and the org chart agree.

## Cross-references

- **The plan:** [`MASTER_PLAN.md`](./MASTER_PLAN.md). **The arc:** [`ROADMAP.md`](./ROADMAP.md).
- **The per-task workflow:** [`EXECUTION_PLAYBOOK.md`](./EXECUTION_PLAYBOOK.md).
- **The contract boundary:** [ADR-0001](../08-decisions/0001-two-services-one-contract.md), [`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md).

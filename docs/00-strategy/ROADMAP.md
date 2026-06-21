---
id: ROADMAP
created: 2026-06-18
last_updated: 2026-06-18
status: active
owners: [elis]
---

# Roadmap — Pyramid Backstage

> The arc of the project, phase by phase, with a **gate** at each boundary. [`MASTER_PLAN.md`](./MASTER_PLAN.md) is the detailed orchestration of the current phase (the 3-day ops-core build); this is the wider map from bootstrap to production hardening.

## The arc

```
Bootstrap ──► 3-day ops-core build ──► Frontend build ──► ai-orchestrator (Alvin) ──► Production hardening
   ✅              (this build)          (post design export)     (Alvin's timeline)        (backlog)
                                              │
                                              └──► Phase 5 — Beyond Booking (F14–F19, post-F13 expansion)
```

Each phase has an **exit gate** — the condition that must be true before the next phase is "allowed" to start. Gates are honest, not ceremonial: a phase that hasn't passed its gate is a phase whose downstream work is built on sand.

---

## Phase 0 — Bootstrap ✅

**What:** the contract ([`ops-core/openapi.yaml`](../../ops-core/openapi.yaml), locked Hour 0), the full docs set (`00`–`10`), the docker-compose stack ([`infrastructure/`](../../infrastructure/)), the design-system brief, and the `F00`–`F13` + `A00` feature backlog.

**Gate (passed):** the contract is frozen and additive-only; every feature has a `SPEC.md` + `TASKS.md`; `docker compose up` brings up the stack; `STATUS.md` generates from the backlog.

---

## Phase 1 — The 3-day ops-core build ← *current*

**What:** `ops-core` (`F00`–`F13`) shipped in full — auth/RBAC, spaces, assets, requests, the availability/conflict engine, reservations, quotes, tasks, audit, approvals, seed, contract test. The day-by-day sequencing and the cut-line are in [`MASTER_PLAN.md`](./MASTER_PLAN.md) §3, §5.

**Gate:** the program-level Definition of Done in [`MASTER_PLAN.md`](./MASTER_PLAN.md) §6 — tsc + tests green (incl. `F05` property tests), every endpoint implemented + pattern-conformant, every mutation writes audit-with-actor in one transaction, locale parity, contract test green, and the full demo path runs against the seed (conflict surfaced + MANAGER approval).

---

## Phase 2 — Frontend build (post Claude-Design export)

**What:** the Command Center SPA ([ADR-0006](../08-decisions/0006-spa-no-ssr.md)), built to match the Claude Design export against the frozen contract. Chassis first (routing, API client, TanStack Query, locale store, the Tailwind+Radix+CVA component layer per [ADR-0007](../08-decisions/0007-tailwind-radix.md)), then the pages in [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md), each pinned to its contract endpoints.

**Gate:** every page in `PAGES.md` implemented and rendering without console errors in **both locales (AL + EN)**; design parity verified against the export per [`docs/10-qa/DESIGN-PARITY.md`](../10-qa/DESIGN-PARITY.md) (desktop + mobile, all states); the functional QA checklist ([`CHECKLIST.md`](../10-qa/CHECKLIST.md)) passing on a running stack; tsc + frontend tests green.

**Depends on:** the Claude Design export landing in `CLAUDE_DESIGN/`, and Phase 1's gate (the contract the pages consume must be real and stable).

---

## Phase 3 — ai-orchestrator (Alvin's lane)

**What:** the reasoning layer (`A00`) — LangGraph deterministic plan DAG, the `/chat` copilot, RAG over venue knowledge (ChromaDB), conversation memory (Redis), the `OperationalPlan` artifact. Built by Alvin on his own timeline against [`mock-ops-core`](../01-architecture/INFRASTRUCTURE.md), integrating by flipping `OPS_CORE_URL` ([ADR-0001](../08-decisions/0001-two-services-one-contract.md), [docs/02-domain/AI_ORCHESTRATION.md](../02-domain/AI_ORCHESTRATION.md)). **Not 3-day-build scope** ([R-04](../09-questions/RESOLVED.md)).

**Gate:** `POST /plan` is a deterministic graph (fixed DAG, not open-ended ReAct); narrative numbers are injected from `ops-core` responses (never free-generated); the conflict branch keys off `409 { conflicts }`; `proposedActions` are re-validated by `ops-core` (AI output is untrusted input); the copilot drives the demo's intake + conflict heads-up beats against the real `ops-core`.

**Depends on:** the contract (already frozen) — *not* on Phase 1 finishing, because Alvin develops against the stateful mock. Integration depends on Phase 1's gate.

---

## Phase 4 — Production hardening (backlog)

**What:** turning the demo-shaped build into a deployable system. None of these block the demo; all are tracked here so they aren't forgotten. Several map to open questions in [`docs/09-questions/OPEN.md`](../09-questions/OPEN.md).

- **Auth audit & secrets** — rotate `SESSION_SECRET` off the dev default, session-store hardening, password-policy review, brute-force/lockout review beyond the login rate-limit, a real `create-admin` provisioning flow. (See [SECURITY.md](../01-architecture/SECURITY.md).)
- **Observability** — metrics, traces, and alerts on top of the existing pino logs + `/health`/`/ready` + audit ledger; conflict-rate alerts. (See [OBSERVABILITY.md](../01-architecture/OBSERVABILITY.md) § backlog.)
- **Multi-space events** — events spanning a hall + transitional areas, expanding the conflict engine and quote ([Q-05](../09-questions/OPEN.md)).
- **Per-unit / QR asset tracking** — physical-unit identity + a movement ledger over today's aggregate counts ([Q-06](../09-questions/OPEN.md)); `location` is already first-class.
- **GDPR / DSAR** — data-subject export/erasure for organizer PII if the venue requires it ([Q-04](../09-questions/OPEN.md)).
- **Real rate card & buffers** — replace the seeded day-rates/VAT and the default 240/120 buffers with the venue's real numbers ([Q-01](../09-questions/OPEN.md), [Q-03](../09-questions/OPEN.md)).
- **CI/CD & deploy** — pipeline (lint + tsc + tests on PR, build + deploy on merge), environment matrix, rollback, real-Postgres integration in CI.

**Gate:** scoped per item against its owning question; this phase is demand-driven (what the venue actually needs for launch), not a fixed checklist.

---

## Phase 5 — Beyond Booking (`F14`–`F19`)

**What:** a **post-`F13` expansion**, not a fresh 3-day build — the F00–F13 record ships first and stays the foundation. This phase pushes past the booking loop toward the wider operational picture the [AADF Pyramid Challenge](../../New_Docs/) brief and [`Pyramid_Backstage_Technical_Design.pdf`](../../Pyramid_Backstage_Technical_Design.pdf) describe, driven by Alvin's just-merged AI branch. Six features, all additive to the contract:

- **`F14` Space catalog** — extend `Space` with the catalog-extension fields (`slug`, `category`, `zone`, `isCirculation`, `adjacent[]`, `map`, `ceilingCm`) from [`docs/03-data/spaces.catalog.json`](../03-data/spaces.catalog.json) and grow the seed from 6 to the full 19-space catalog (corridors, atria, entrance, terrace). Additive + nullable + backfill; rows 1–6 stay authoritative.
- **`F15` Partner portal** — a `PARTNER` role below `VIEWER`, partner-scoped intake (row-scoped by `EventRequest.createdById`), and an admin approval queue that **removes email**. Reuses the existing `F10` approve/reject — single-step approval.
- **`F16` Asset tracking** — QR/NFC tags encoding `assetId`; `POST /private/assets/:id/scan` records an `AssetMovement` + updates live `Asset.location`; `GET …/movements`; a mobile scanner UI + a "where is it" widget. Aggregate-with-movement, not per-unit identity.
- **`F17` AI auth** — a **service token** (system actor) + forwarded acting-user headers (`X-Acting-User-Id` / `X-Acting-User-Role`) with a forwarded-role ceiling, so the AI can call ops-core while audit and partner row-scoping stay correct.
- **`F18` AI wiring** — `POST /chat` (stateful copilot via `sessionId`) + `POST /plan` (the deterministic LangGraph planner → `OperationalPlan`) wired into the existing `CopilotPanel`, with a **degrade-to-canned** fallback.
- **`F19` Floor map** — a v1 radial `FloorMap` built by Elis from the catalog `map` field, behind the prop contract `<FloorMap floor spaces={[{slug,status}]} />` (`status ∈ free|main|bundle|conflict|circulation`), rendering `/plan` output. v2 (real-plan SVG hotspots) is post-demo polish.

**Gate (Definition of Done):** all `F14`–`F19` tasks `done`; `tsc` + tests green; the contract still **additive-only**; the headline plan demo, the **partner-no-email** intake→approval flow, and **QR live asset tracking** are each demonstrable end-to-end; and the **AI degrade** path (copilot → canned, map → v1) is verified, so the demo never depends on the brain being live. **Not** a re-run of the F00–F13 gate — that one stands.

**Depends on:** Phase 1's gate (the record this expands), and the merged AI branch for `F17`/`F18`. `F14` is the keystone — the catalog feeds `F19`'s map and `F18`'s plan output.

---

## Dependency summary

| Phase | Blocked by | Unblocks |
|-------|-----------|----------|
| 0 Bootstrap | — | everything |
| 1 ops-core build | Phase 0 | Frontend integration, AI integration |
| 2 Frontend | Phase 0 (contract) + Phase 1 gate + design export | demo UI, QA design-parity |
| 3 ai-orchestrator | Phase 0 (contract) for dev; Phase 1 gate for integration | the copilot demo beats |
| 4 Hardening | Phase 1 (a working system to harden) | production launch |
| 5 Beyond Booking (`F14`–`F19`) | Phase 1 gate + merged AI branch | partner-no-email intake, QR live tracking, the digital-twin floor map, copilot wiring |

## Cross-references

- **Current-phase orchestration:** [`MASTER_PLAN.md`](./MASTER_PLAN.md).
- **Why / north star:** [`VISION.md`](./VISION.md). **Ownership:** [`ASSIGNMENTS.md`](./ASSIGNMENTS.md).
- **Open questions feeding the hardening backlog:** [`docs/09-questions/OPEN.md`](../09-questions/OPEN.md).
- **Decisions:** [`docs/08-decisions/`](../08-decisions/).

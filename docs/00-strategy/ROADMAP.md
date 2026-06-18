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
```

Each phase has an **exit gate** — the condition that must be true before the next phase is "allowed" to start. Gates are honest, not ceremonial: a phase that hasn't passed its gate is a phase whose downstream work is built on sand.

---

## Phase 0 — Bootstrap ✅

**What:** the contract ([`ops-core/openapi.yaml`](../../ops-core/openapi.yaml), locked Hour 0), the full docs set (`00`–`10`), the docker-compose stack ([`infrastructure/`](../../infrastructure/)), the design-system brief, and the `F00`–`F13` + `A00` feature backlog.

**Gate (passed):** the contract is frozen and additive-only; every feature has a `SPEC.md` + `TASKS.md`; `docker compose up` brings up the stack; `STATUS.md` generates from the backlog.

---

## Phase 1 — The 3-day ops-core build ← *current*

**What:** `ops-core` (`F00`–`F13`) shipped in full — auth/RBAC, spaces, assets, requests, the availability/conflict engine, reservations, quotes, tasks, audit, approvals, events/outbox, seed, contract test. The day-by-day sequencing and the cut-line are in [`MASTER_PLAN.md`](./MASTER_PLAN.md) §3, §5.

**Gate:** the program-level Definition of Done in [`MASTER_PLAN.md`](./MASTER_PLAN.md) §6 — tsc + tests green (incl. `F05` property tests), every endpoint implemented + pattern-conformant, every mutation writes audit-with-actor + outbox in one transaction, locale parity, contract test green, the full demo path runs against the seed (conflict surfaced + MANAGER approval), and the `NATS_ENABLED=false` degrade mode verified.

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
- **Observability** — metrics, traces, and alerts on top of the existing pino logs + `/health`/`/ready` + audit ledger; queue-depth/outbox-lag and conflict-rate alerts. (See [OBSERVABILITY.md](../01-architecture/OBSERVABILITY.md) § backlog.)
- **Multi-space events** — events spanning a hall + transitional areas, expanding the conflict engine and quote ([Q-05](../09-questions/OPEN.md)).
- **Per-unit / QR asset tracking** — physical-unit identity + a movement ledger over today's aggregate counts ([Q-06](../09-questions/OPEN.md)); `location` is already first-class.
- **GDPR / DSAR** — data-subject export/erasure for organizer PII if the venue requires it ([Q-04](../09-questions/OPEN.md)).
- **Real rate card & buffers** — replace the seeded day-rates/VAT and the default 240/120 buffers with the venue's real numbers ([Q-01](../09-questions/OPEN.md), [Q-03](../09-questions/OPEN.md)).
- **CI/CD & deploy** — pipeline (lint + tsc + tests on PR, build + deploy on merge), environment matrix, rollback, real-Postgres integration + NATS in CI.

**Gate:** scoped per item against its owning question; this phase is demand-driven (what the venue actually needs for launch), not a fixed checklist.

---

## Dependency summary

| Phase | Blocked by | Unblocks |
|-------|-----------|----------|
| 0 Bootstrap | — | everything |
| 1 ops-core build | Phase 0 | Frontend integration, AI integration |
| 2 Frontend | Phase 0 (contract) + Phase 1 gate + design export | demo UI, QA design-parity |
| 3 ai-orchestrator | Phase 0 (contract) for dev; Phase 1 gate for integration | the copilot demo beats |
| 4 Hardening | Phase 1 (a working system to harden) | production launch |

## Cross-references

- **Current-phase orchestration:** [`MASTER_PLAN.md`](./MASTER_PLAN.md).
- **Why / north star:** [`VISION.md`](./VISION.md). **Ownership:** [`ASSIGNMENTS.md`](./ASSIGNMENTS.md).
- **Open questions feeding the hardening backlog:** [`docs/09-questions/OPEN.md`](../09-questions/OPEN.md).
- **Decisions:** [`docs/08-decisions/`](../08-decisions/).

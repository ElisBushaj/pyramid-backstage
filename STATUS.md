# Project Status

> **This is a generated dashboard.** Do not hand-edit. Regenerate by following the protocol in `CLAUDE.md` § "Status regeneration".

**Last regenerated:** 2026-06-18 — Bootstrap + design-backend alignment. Repo scaffold, locked contract, memory system, full docs, and the F00–F13 + A00 backlog are in place. The Claude Design export was reconciled against the contract → 3 additive tasks added (F04-T06 edit-DRAFT, F04-T07 search, F13-T05 dashboard stats). ops-core scaffold typechecks clean (6/6 tests pass). Ready to execute the build starting at `F00-T01`.

---

## Global counts

| Status | Count |
|--------|-------|
| done | 0 |
| in_progress | 0 |
| blocked | 0 |
| not_started | 86 |
| **Total** | **86** |

> Of the 86: **76 are the ops-core build** (F00–F13, the agent loop). **10 are `A00` — Alvin's ai-orchestrator lane**, scaffold + reference backlog, *excluded* from the ops-core eligible set per `CLAUDE.md`.

---

## In-progress tasks

_(none)_

---

## Blocked tasks

_(none — open questions in `docs/09-questions/OPEN.md` carry defaults, so no task is hard-blocked.)_

---

## Eligible-next tasks

Start here. Dependency order from `CLAUDE.md`: lower phase → earlier feature → earlier task.

| # | Task | Why eligible |
|---|------|--------------|
| 1 | **F00-T01** — Repo scaffold + package.json + tsconfig + vitest config | `Depends on: none` |

After `F00-T01` the F00 chain unblocks (T02 → T03 → …), then F01 (auth) and F09 (audit) open the rest of the graph. `A00-T01` is also zero-dep but is Alvin's lane (not in the ops-core loop).

---

## Per-feature summary

| Feature | Phase | Done | Not started | Total |
|---------|-------|------|-------------|-------|
| F00 Bootstrap & contract | Foundation | 0 | 8 | 8 |
| F01 Auth & RBAC | Foundation | 0 | 8 | 8 |
| F09 Audit & ledger | Foundation | 0 | 4 | 4 |
| F11 Events / NATS | Foundation | 0 | 6 | 6 |
| F02 Spaces | Domain | 0 | 5 | 5 |
| F03 Assets / inventory | Domain | 0 | 4 | 4 |
| F04 Event requests | Domain | 0 | 7 | 7 |
| F05 Availability & conflict | Core | 0 | 6 | 6 |
| F06 Reservations | Core | 0 | 6 | 6 |
| F07 Quotes | Core | 0 | 5 | 5 |
| F08 Tasks | Core | 0 | 4 | 4 |
| F10 Approvals & workflow | Core | 0 | 4 | 4 |
| F12 Seed & demo dataset | Integration | 0 | 4 | 4 |
| F13 Contract finalize + e2e | Integration | 0 | 5 | 5 |
| **ops-core subtotal** | | **0** | **76** | **76** |
| A00 ai-orchestrator _(Alvin's lane)_ | AI | 0 | 10 | 10 |

---

## 3-day build map (see `docs/00-strategy/MASTER_PLAN.md`)

- **Day 1 — Foundation & Domain:** F00, F01, F09, F02, F03, F04 (+ F11 setup).
- **Day 2 — Core engines:** F05 (availability/conflict), F06 (reservations), F07 (quotes), F08 (tasks).
- **Day 3 — Workflow, events, demo:** F10 (approvals), F11 (NATS), F12 (seed + planted conflict), F13 (e2e + contract).
- **Frontend:** built after the Claude Design export lands in `CLAUDE_DESIGN/`.

Cut-line if Day 3 runs tight: degrade NATS realtime → polling (the bus is designed degradable). Auth and the correctness core are never cut.

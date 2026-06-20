# Project Status

> **This is a generated dashboard.** Do not hand-edit. Regenerate via `node .planning/tasks.mjs regen` (the protocol in `CLAUDE.md` § "Status regeneration").

**Last regenerated:** 2026-06-20 — Build in progress. 87/111 ops-core tasks done.

---

## Global counts

| Status | Count |
|--------|-------|
| done | 87 |
| in_progress | 0 |
| blocked | 0 |
| not_started | 34 |
| **Total** | **121** |

> ops-core: **87/111 done**. `A00` (Alvin's ai-orchestrator lane) is excluded from the eligible set.

---

## In-progress tasks

_(none)_

## Blocked tasks

_(none)_

---

## Eligible-next tasks

1. **F15-T01** — add PARTNER to the Role enum + RANK ladder (below VIEWER) _(deps: F01-T05)_
2. **F16-T01** — AssetMovement model + migration + AssetMovementAction enum _(deps: F03-T01)_
3. **F18-T01** — frontend/src/api/ai.ts: VITE_AI_URL client for POST /chat + POST /plan with degrade _(deps: F13-T02, F17-T01)_


…and 2 more eligible.

---

## Per-feature summary

| Feature | Phase | Done | Remaining | Total |
|---------|-------|------|-----------|-------|
| F00 bootstrap | Foundation | 8 | 0 | 8 |
| F01 auth | Foundation | 8 | 0 | 8 |
| F02 spaces | Domain | 5 | 0 | 5 |
| F03 assets | Domain | 4 | 0 | 4 |
| F04 requests | Domain | 7 | 0 | 7 |
| F05 availability-conflict | Core | 6 | 0 | 6 |
| F06 reservations | Core | 6 | 0 | 6 |
| F07 quotes | Core | 5 | 0 | 5 |
| F08 tasks | Core | 4 | 0 | 4 |
| F09 audit | Foundation | 4 | 0 | 4 |
| F10 approvals | Core | 4 | 0 | 4 |
| F11 events | Foundation | 6 | 0 | 6 |
| F12 seed | Integration | 4 | 0 | 4 |
| F13 contract | Integration | 5 | 0 | 5 |
| F14 space-catalog | Foundation | 5 | 0 | 5 |
| F15 partner-portal | Core | 0 | 6 | 6 |
| F16 asset-tracking | Core | 0 | 7 | 7 |
| F17 ai-auth | Integration | 6 | 0 | 6 |
| F18 ai-wiring | Integration | 0 | 6 | 6 |
| F19 floor-map | Integration | 0 | 5 | 5 |
| **ops-core subtotal** | | **87** | **24** | **111** |
| A00 ai-orchestrator | AI | 0 | 10 | 10 |

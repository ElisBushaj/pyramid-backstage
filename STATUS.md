# Project Status

> **This is a generated dashboard.** Do not hand-edit. Regenerate via `node .planning/tasks.mjs regen` (the protocol in `CLAUDE.md` § "Status regeneration").

**Last regenerated:** 2026-06-20 — Build in progress. 97/111 ops-core tasks done.

---

## Global counts

| Status | Count |
|--------|-------|
| done | 97 |
| in_progress | 0 |
| blocked | 0 |
| not_started | 24 |
| **Total** | **121** |

> ops-core: **97/111 done**. `A00` (Alvin's ai-orchestrator lane) is excluded from the eligible set.

---

## In-progress tasks

_(none)_

## Blocked tasks

_(none)_

---

## Eligible-next tasks

1. **F15-T04** — FE partner portal: /portal/* shell + submit flow + my-requests timeline _(deps: F15-T02)_
2. **F15-T05** — FE admin Pending Approvals queue (approve/reject via F10) + AI slot _(deps: F15-T02)_
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
| F15 partner-portal | Core | 3 | 3 | 6 |
| F16 asset-tracking | Core | 7 | 0 | 7 |
| F17 ai-auth | Integration | 6 | 0 | 6 |
| F18 ai-wiring | Integration | 0 | 6 | 6 |
| F19 floor-map | Integration | 0 | 5 | 5 |
| **ops-core subtotal** | | **97** | **14** | **111** |
| A00 ai-orchestrator | AI | 0 | 10 | 10 |

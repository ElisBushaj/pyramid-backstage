# Project Status

> **This is a generated dashboard.** Do not hand-edit. Regenerate via `node .planning/tasks.mjs regen` (the protocol in `CLAUDE.md` § "Status regeneration").

**Last regenerated:** 2026-06-19 — Build in progress. 67/76 ops-core tasks done.

---

## Global counts

| Status | Count |
|--------|-------|
| done | 67 |
| in_progress | 0 |
| blocked | 0 |
| not_started | 19 |
| **Total** | **86** |

> ops-core: **67/76 done**. `A00` (Alvin's ai-orchestrator lane) is excluded from the eligible set.

---

## In-progress tasks

_(none)_

## Blocked tasks

_(none)_

---

## Eligible-next tasks

1. **F12-T01** — seed 4 halls (Blue/Orange/Green/Yellow) + transitional areas with capacities + buffers _(deps: F02-T01)_
2. **F12-T02** — seed ~6 asset lines with realistic counts (chairs 400, tables 80, mics 12, screens 6, projectors 6, stage 10) _(deps: F03-T01)_
3. **F12-T03** — seed staff users (one per role: ADMIN/MANAGER/OPS/VIEWER) _(deps: F01-T02)_


…and 3 more eligible.

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
| F12 seed | Integration | 0 | 4 | 4 |
| F13 contract | Integration | 0 | 5 | 5 |
| **ops-core subtotal** | | **67** | **9** | **76** |
| A00 ai-orchestrator | AI | 0 | 10 | 10 |

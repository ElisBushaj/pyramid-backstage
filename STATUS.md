# Project Status

> **This is a generated dashboard.** Do not hand-edit. Regenerate via `node .planning/tasks.mjs regen` (the protocol in `CLAUDE.md` § "Status regeneration").

**Last regenerated:** 2026-06-21 — Build in progress. 110/129 ops-core tasks done.

---

## Global counts

| Status | Count |
|--------|-------|
| done | 110 |
| in_progress | 0 |
| blocked | 0 |
| not_started | 29 |
| **Total** | **139** |

> ops-core: **110/129 done**. `A00` (Alvin's ai-orchestrator lane) is excluded from the eligible set.

---

## In-progress tasks

_(none)_

## Blocked tasks

_(none)_

---

## Eligible-next tasks

1. **F01-T09** — paginate GET /admin/users (okList page/pageSize) (ADR-0017) _(deps: F01-T03)_
2. **F09-T05** — paginate GET /private/audit (okList page/pageSize) (ADR-0017) _(deps: F09-T02)_
3. **F05-T07** — pass conflicts window on Dashboard + AppShell; restore conflict alert + nav badge (XC-2) _(deps: F05-T03)_


…and 4 more eligible.

---

## Per-feature summary

| Feature | Phase | Done | Remaining | Total |
|---------|-------|------|-----------|-------|
| F00 bootstrap | Foundation | 8 | 0 | 8 |
| F01 auth | Foundation | 8 | 2 | 10 |
| F02 spaces | Domain | 5 | 0 | 5 |
| F03 assets | Domain | 4 | 0 | 4 |
| F04 requests | Domain | 7 | 1 | 8 |
| F05 availability-conflict | Core | 6 | 1 | 7 |
| F06 reservations | Core | 6 | 2 | 8 |
| F07 quotes | Core | 5 | 0 | 5 |
| F08 tasks | Core | 4 | 1 | 5 |
| F09 audit | Foundation | 4 | 1 | 5 |
| F10 approvals | Core | 4 | 2 | 6 |
| F11 events | Foundation | 6 | 1 | 7 |
| F12 seed | Integration | 4 | 0 | 4 |
| F13 contract | Integration | 5 | 3 | 8 |
| F14 space-catalog | Foundation | 5 | 1 | 6 |
| F15 partner-portal | Core | 6 | 1 | 7 |
| F16 asset-tracking | Core | 7 | 1 | 8 |
| F17 ai-auth | Integration | 6 | 0 | 6 |
| F18 ai-wiring | Integration | 6 | 1 | 7 |
| F19 floor-map | Integration | 4 | 1 | 5 |
| **ops-core subtotal** | | **110** | **19** | **129** |
| A00 ai-orchestrator | AI | 0 | 10 | 10 |

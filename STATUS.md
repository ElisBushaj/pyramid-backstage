# Project Status

> **This is a generated dashboard.** Do not hand-edit. Regenerate via `node .planning/tasks.mjs regen` (the protocol in `CLAUDE.md` § "Status regeneration").

**Last regenerated:** 2026-06-21 — Build in progress. 115/129 ops-core tasks done.

---

## Global counts

| Status | Count |
|--------|-------|
| done | 115 |
| in_progress | 0 |
| blocked | 0 |
| not_started | 24 |
| **Total** | **139** |

> ops-core: **115/129 done**. `A00` (Alvin's ai-orchestrator lane) is excluded from the eligible set.

---

## In-progress tasks

_(none)_

## Blocked tasks

_(none)_

---

## Eligible-next tasks

1. **F05-T07** — pass conflicts window on Dashboard + AppShell; restore conflict alert + nav badge (XC-2) _(deps: F05-T03)_
2. **F13-T06** — contract sync: ListEnvelope + Gone + ScheduleEntry; client getList threads meta (ADR-0015/16/17) _(deps: F06-T08, F09-T05, F01-T09)_
3. **F19-T05** — (v2, OPTIONAL, post-demo) real-plan SVG hotspot polygons _(deps: F19-T04)_



---

## Per-feature summary

| Feature | Phase | Done | Remaining | Total |
|---------|-------|------|-----------|-------|
| F00 bootstrap | Foundation | 8 | 0 | 8 |
| F01 auth | Foundation | 9 | 1 | 10 |
| F02 spaces | Domain | 5 | 0 | 5 |
| F03 assets | Domain | 4 | 0 | 4 |
| F04 requests | Domain | 7 | 1 | 8 |
| F05 availability-conflict | Core | 6 | 1 | 7 |
| F06 reservations | Core | 8 | 0 | 8 |
| F07 quotes | Core | 5 | 0 | 5 |
| F08 tasks | Core | 4 | 1 | 5 |
| F09 audit | Foundation | 5 | 0 | 5 |
| F10 approvals | Core | 5 | 1 | 6 |
| F11 events | Foundation | 6 | 1 | 7 |
| F12 seed | Integration | 4 | 0 | 4 |
| F13 contract | Integration | 5 | 3 | 8 |
| F14 space-catalog | Foundation | 5 | 1 | 6 |
| F15 partner-portal | Core | 6 | 1 | 7 |
| F16 asset-tracking | Core | 7 | 1 | 8 |
| F17 ai-auth | Integration | 6 | 0 | 6 |
| F18 ai-wiring | Integration | 6 | 1 | 7 |
| F19 floor-map | Integration | 4 | 1 | 5 |
| **ops-core subtotal** | | **115** | **14** | **129** |
| A00 ai-orchestrator | AI | 0 | 10 | 10 |

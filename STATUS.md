# Project Status

> **This is a generated dashboard.** Do not hand-edit. Regenerate via `node .planning/tasks.mjs regen` (the protocol in `CLAUDE.md` § "Status regeneration").

**Last regenerated:** 2026-06-19 — Build in progress. 20/76 ops-core tasks done.

---

## Global counts

| Status | Count |
|--------|-------|
| done | 20 |
| in_progress | 0 |
| blocked | 0 |
| not_started | 66 |
| **Total** | **86** |

> ops-core: **20/76 done**. `A00` (Alvin's ai-orchestrator lane) is excluded from the eligible set.

---

## In-progress tasks

_(none)_

## Blocked tasks

_(none)_

---

## Eligible-next tasks

1. **F11-T01** — OutboxEvent model + migration _(deps: F00-T06)_
2. **F11-T02** — NATS connect + JetStream config (config/nats) + NATS_ENABLED guard _(deps: F00-T02)_
3. **F02-T01** — Space model + migration (capacities JSON, buffers) _(deps: F00-T06)_


…and 10 more eligible.

---

## Per-feature summary

| Feature | Phase | Done | Remaining | Total |
|---------|-------|------|-----------|-------|
| F00 bootstrap | Foundation | 8 | 0 | 8 |
| F01 auth | Foundation | 8 | 0 | 8 |
| F02 spaces | Domain | 0 | 5 | 5 |
| F03 assets | Domain | 0 | 4 | 4 |
| F04 requests | Domain | 0 | 7 | 7 |
| F05 availability-conflict | Core | 0 | 6 | 6 |
| F06 reservations | Core | 0 | 6 | 6 |
| F07 quotes | Core | 0 | 5 | 5 |
| F08 tasks | Core | 0 | 4 | 4 |
| F09 audit | Foundation | 4 | 0 | 4 |
| F10 approvals | Core | 0 | 4 | 4 |
| F11 events | Foundation | 0 | 6 | 6 |
| F12 seed | Integration | 0 | 4 | 4 |
| F13 contract | Integration | 0 | 5 | 5 |
| **ops-core subtotal** | | **20** | **56** | **76** |
| A00 ai-orchestrator | AI | 0 | 10 | 10 |

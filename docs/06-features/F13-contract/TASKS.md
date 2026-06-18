---
id: F13
name: Contract Finalize + Type-Sharing + E2E
last_updated: 2026-06-19
---

# F13 — Tasks

### F13-T01 — emit ops-core types/api/* + hand-mirror to frontend/src/api/types/*
- Status: done
- Depends on: F00-T07
- Estimate: 0.5d
- Acceptance:
  - `ops-core/src/types/api/*.ts` covers the full contract surface, one file per area (`spaces.ts`, `assets.ts`, `requests.ts`, `reservations.ts`, `quotes.ts`, `tasks.ts`, `conflicts.ts`, `audit.ts`, `auth.ts`), emitted/maintained from `openapi.yaml` via `gen:types` and committed (per `docs/04-api/TYPE_SHARING.md`).
  - `frontend/src/api/types/*.ts` hand-mirrors **only** the consumed surface; the shared `ServiceResponse<T>` envelope type matches `frontend/src/api/types/_envelope.ts` on both sides.
  - Both the backend and frontend type sets compile (tsc clean).
  - Enums are `UPPER_SNAKE` and identical across both mirrors.

### F13-T02 — contract test (openapi examples validate against the TS types)
- Status: done
- Depends on: F13-T01
- Estimate: 0.5d
- Acceptance:
  - A contract test loads every `example` in `openapi.yaml` and asserts it validates against the corresponding `ops-core/src/types/api` type (extending/superseding the F00-T07 test to cover the now-complete surface).
  - The test also asserts the frontend mirrors stay aligned for the consumed surface (e.g. via a shared fixture or a type-level check), so a divergence between `openapi.yaml` and `frontend/src/api/types/*` fails CI.
  - Enum casing and required-field presence are checked; any drift fails the test.
  - tsc clean; the test runs in CI.

### F13-T03 — end-to-end integration test: intake → match → hold → quote → tasks → approve; plus the conflict→alternatives path
- Status: done
- Depends on: F10-T01, F12-T04
- Estimate: 0.75d
- Acceptance:
  - An e2e integration test (real Postgres, NATS available) against the F12 seed drives the full happy path: `POST /requests` → `GET /spaces?minCapacity&layout&start&end` (match) → `POST /reservations` (hold) → `POST /quotes` → `POST /requests/:id/tasks` → `POST /requests/:id/approve`, asserting each response's contract shape and the final `GET /requests/:id` `RequestAggregate`.
  - It asserts the cross-cutting invariants along the way: a `request.create`/`reservation.hold`/`quote.generate`/`request.approve` audit trail exists, the corresponding outbox events are written, and the quote total is the server recomputation.
  - The conflict path: a hold that collides with the planted seed conflict (F12-T04) returns `409 conflict` with `Conflict[]`, and re-holding against an alternative window/space succeeds — proving conflict→alternatives end to end (per `docs/02-domain/CONFLICTS.md`).
  - The test is deterministic against the reset seed and runs in CI; tsc clean.

### F13-T04 — demo-script verification (the 4 demo beats run green)
- Status: done
- Depends on: F13-T03
- Estimate: 0.5d
- Acceptance:
  - A scripted verification runs the four demo beats end to end (reset seed → the happy-path plan, the conflict→alternatives moment, the approval, and the audit/plan readout) and asserts each completes green.
  - It is runnable from a single command (npm script) on a fresh-seeded DB, so the live demo is reproducible.
  - Failures point at the failing beat (clear assertion messages), not an opaque stack trace.
  - Runs in CI (or is CI-runnable); tsc clean.

### F13-T05 — GET /dashboard/stats — KPI read-model for the Command Center
- Status: done
- Depends on: F04-T05, F03-T03, F06-T02
- Estimate: 0.5d
- Acceptance:
  - `GET /private/dashboard/stats` returns `DashboardStats` per `openapi.yaml`: `eventsThisWeek` (+ delta vs last week), `spacesInUse {inUse,total}`, `lowStockAssets`, `pendingApprovals` (count of `PROPOSED`).
  - Each KPI is a single efficient aggregate query (no N+1); backs the design's Dashboard tiles (design §3.1) so the UI needs one call, not four client-side counts.
  - tsc clean; unit test asserts each KPI against a seeded fixture.

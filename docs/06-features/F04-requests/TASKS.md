---
id: F04
name: Event Requests
last_updated: 2026-06-19
---

# F04 — Tasks

### F04-T01 — EventRequest model + lifecycle enum + migration
- Status: done
- Depends on: F00-T06
- Estimate: 0.25d
- Acceptance:
  - `EventRequest` exists in `ops-core/prisma/schema.prisma` with all `openapi.yaml` fields: `id, title, organizerName, contactEmail?, contactPhone?, expectedAttendees (Int), eventType: EventType, preferredDates (Json), requirements (Json), status: RequestStatus, rejectionReason?, createdById, createdAt, updatedAt`.
  - `RequestStatus` enum matches `openapi.yaml` (`DRAFT|PROPOSED|APPROVED|SCHEDULED|COMPLETED|REJECTED`); `EventType` matches too.
  - `@@index([status, createdAt])` is present (per `docs/03-data/SCHEMA.md`).
  - If F00-T06 already shipped the model complete this is a verification no-op; otherwise a gap-fill migration applies cleanly via `prisma migrate deploy`.

### F04-T02 — POST /requests + validators + audit (request.create)
- Status: done
- Depends on: F04-T01, F09-T02
- Estimate: 0.5d
- Acceptance:
  - `POST /private/requests` validates `EventRequestInput` with `ValidationHelpers`: `title`/`organizerName` non-empty, `expectedAttendees ≥ 1`, `eventType ∈ EventType`, `preferredDates` minItems 1 with each a valid `DateRange` (`start < end`, ISO date-time), `requirements.layout` (if present) ∈ `Layout`; failures → `422 validation` with fields keyed.
  - Creates the `EventRequest` at the documented initial status (`DRAFT`) with `createdById = req.actor.id`, returning `ServiceResponse<EventRequest>` (201).
  - Writes a `request.create` `AuditEntry` (after = the created request) in the same transaction via the F09 writer; an `OutboxEvent` `request.created` is written too (relay/publish is F11, but the row is written here per the no-dual-write rule).
  - Controller uses `@controlledResponse`; tsc clean; vitest passing.

### F04-T03 — GET /requests/:id aggregate (request+reservation+quote+tasks+conflicts+audit)
- Status: done
- Depends on: F04-T02
- Estimate: 0.5d
- Acceptance:
  - `GET /private/requests/:id` returns the `RequestAggregate` exactly per `openapi.yaml`: `{ request, reservation?, quote?, tasks: Task[], conflicts: Conflict[], audit: AuditEntry[] }` — the single payload the operational-plan page renders (per `docs/02-domain/REQUESTS.md`).
  - `reservation` and `quote` are the current ones for the request (or omitted/null when none exist yet); `tasks` and `audit` are full lists; `conflicts` reflects the latest detection for the reserved window (empty when none).
  - An unknown id → `404 not_found`.
  - The endpoint composes existing services (reservations, quotes, tasks, audit, conflicts) without duplicating their logic; missing related entities degrade gracefully (empty arrays / absent objects), not 500s.
  - Test: a request with a reservation + quote + tasks + audit returns a fully-populated aggregate; a bare DRAFT request returns the request with empty related collections.

### F04-T04 — Guarded status transitions (409 invalid_transition) + transition audit
- Status: done
- Depends on: F04-T01
- Estimate: 0.5d
- Acceptance:
  - A transition function in `src/modules/requests` enforces the legal graph from `docs/02-domain/REQUESTS.md` (`DRAFT→PROPOSED→APPROVED→SCHEDULED→COMPLETED`, any state `→REJECTED` per the lifecycle); any illegal move throws `APIError` `409 invalid_transition` carrying `from`/`to` per `docs/04-api/ERROR_CONTRACT.md`.
  - Each successful transition updates `status` and writes an `AuditEntry` (dotted action e.g. `request.transition`, before/after status, `req.actor`) in the same transaction.
  - The function is the single chokepoint reused by F10 approve/reject (it does not duplicate guard logic in the approval feature).
  - Unit test matrix: every legal edge succeeds; a representative set of illegal edges (e.g. `APPROVED→DRAFT`, approve a `REJECTED`, `COMPLETED→anything`) each return `409 invalid_transition` with correct `from`/`to`.
  - tsc clean; vitest passing.

### F04-T05 — GET /requests list + filters + tests
- Status: done
- Depends on: F04-T03
- Estimate: 0.5d
- Acceptance:
  - `GET /private/requests?status&page&pageSize` returns a `PaginatedServiceResponse<EventRequest>` filtered by `status` (validated ∈ `RequestStatus`), paginated with defaults `page=1`, `pageSize=20`, max `pageSize=100` per `openapi.yaml`.
  - Ordering is stable (e.g. `createdAt` desc) and uses the `[status, createdAt]` index.
  - Integration tests cover: create → fetch aggregate; list filtered by status with pagination; `422` on bad input; `404` on unknown id; `409 invalid_transition` on an illegal transition; the `request.create` audit row is present.
  - tsc clean; runs in CI.

### F04-T06 — PATCH /requests/:id — edit a DRAFT request (UI "Adjust request")
- Status: done
- Depends on: F04-T04, F09-T02
- Estimate: 0.25d
- Acceptance:
  - `PATCH /private/requests/:id` accepts an `EventRequestInput` (partial) and updates the request **only while `status=DRAFT`**; any other status → `409 invalid_transition { from, to }` per `openapi.yaml`.
  - Re-validates fields (`422` contract), writes a `request.update` `AuditEntry` with before/after, returns the updated `EventRequest`. Idempotent via `Idempotency-Key`.
  - Backs the design's "Adjust request" affordance (design §4.3). tsc clean; tests passing.

### F04-T07 — GET /requests free-text search (`q`)
- Status: done
- Depends on: F04-T05
- Estimate: 0.25d
- Acceptance:
  - `GET /private/requests?q=` does a case-insensitive `contains` match over `title` + `organizerName` (combinable with `status`), per `openapi.yaml`.
  - Backs the design's "Search requests…" box (design §4.1). Indexed/efficient enough for the demo dataset; tests cover match + no-match + combined-with-status.

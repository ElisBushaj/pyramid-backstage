---
id: F04
name: Event Requests
phase: Domain
depends_on: [F00, F01, F09]
status: not_started
last_updated: 2026-06-18
---

# F04 — Event Requests

## Summary

The inquiry that starts everything — "a startup conference for 180 people next month" — captured as a structured `EventRequest`. This feature ships request creation (form or AI-proposed, both against the validated `EventRequestInput`), the full aggregate read that the operational-plan page renders, the guarded lifecycle state machine, and the list endpoint. Every transition is audited; illegal moves return `409 invalid_transition { from, to }`.

The request is the spine the rest of the domain hangs off: a reservation, quote, tasks, conflicts, and audit all attach to a request id, and `GET /requests/:id` assembles them into one `RequestAggregate`.

## Scope

### In scope
- The `EventRequest` model (from F00-T06) + lifecycle enum + any migration gap-fill.
- `POST /private/requests` — create from `EventRequestInput`, validated, audited (`request.create`).
- `GET /private/requests/:id` — the `RequestAggregate` (request + reservation + quote + tasks + conflicts + audit).
- Guarded status transitions in the service layer (`409 invalid_transition`), each writing a transition `AuditEntry`.
- `GET /private/requests` — list + filters (status, pagination).
- Tests.

### Out of scope
- The approve/reject *endpoints* — F10 (they drive transitions but live in their own feature; the transition guard here is what they call).
- Reservations, quotes, tasks, conflicts themselves — F05–F08 (the aggregate read joins them but does not create them).
- AI natural-language intake — Alvin's lane (A00); ops-core only accepts the validated `EventRequestInput`.

## Acceptance criteria

- `POST /private/requests` validates `EventRequestInput` (`title`, `organizerName`, `expectedAttendees ≥ 1`, `eventType ∈ EventType`, `preferredDates` minItems 1 with valid `DateRange`s) and creates the request at status `DRAFT` (or `PROPOSED` per documented default), writing a `request.create` `AuditEntry` with `req.actor`; invalid input → `422 validation`.
- `GET /private/requests/:id` returns the `RequestAggregate` exactly as in `openapi.yaml`: `{ request, reservation?, quote?, tasks[], conflicts[], audit[] }`; an unknown id → `404 not_found`.
- Status transitions follow `DRAFT → PROPOSED → APPROVED → SCHEDULED → COMPLETED` with the `→ REJECTED` branch, guarded in the service layer per `docs/02-domain/REQUESTS.md`; any illegal move (e.g. `APPROVED → DRAFT`, approve a `REJECTED`) throws `APIError` `409 invalid_transition` with `from`/`to`.
- Every successful transition writes an `AuditEntry` (dotted action, before/after status) in the same transaction.
- `GET /private/requests?status&page&pageSize` returns a `PaginatedServiceResponse<EventRequest>` filtered by status, paginated (default page 1, pageSize 20, max 100) per `openapi.yaml`.
- Responses use the envelope; `createdById` is `req.actor.id`; timestamps are RFC-3339 UTC.

## Data model

`EventRequest { id, title, organizerName, contactEmail?, contactPhone?, expectedAttendees (Int), eventType: EventType, preferredDates (JSON [{start,end}]), requirements (JSON {layout?, avNeeded?, cateringNeeded?, notes?}), status: RequestStatus, rejectionReason?, createdById, createdAt, updatedAt }` per `docs/03-data/SCHEMA.md` and the `EventRequest` schema in `openapi.yaml`. Indexed `[status, createdAt]` for the list.

## API surface

- `POST /private/requests` — create a structured event request → `EventRequest`.
- `GET /private/requests/:id` — full aggregate → `RequestAggregate`.
- `GET /private/requests?status&page&pageSize` — list event requests → `EventRequest[]` (paginated).

(`POST /requests/:id/tasks` is F08; `POST /requests/:id/approve|reject` are F10.)

## UI surfaces

None — backend.

## Notes

- Request shape, lifecycle, the aggregate: `docs/02-domain/REQUESTS.md`.
- Transition guard returns `409 invalid_transition { from, to }`: `docs/04-api/ERROR_CONTRACT.md`.
- Audit on every mutation/transition: `docs/02-domain/AUDIT.md`; envelope/validation: `docs/04-api/CORE_PATTERNS.md`.

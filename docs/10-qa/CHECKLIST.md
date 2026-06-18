# Functional Checklist

Area-keyed functional verification, grounded in [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml) + [`docs/04-api/ERROR_CONTRACT.md`](../04-api/ERROR_CONTRACT.md). Work straight down; resume from the **▶ Resume here** pointer. Each `### QA-<AREA>-NN` rolls up a `Status` (see [`README.md`](./README.md)); tick a box only after you **observe** the result. Verify user-facing strings in **both** locales at least once per area.

**▶ Resume here:** QA-AUTH-01

**Areas:** AUTH · SPACE · ASSET · REQ · AVAIL · RESV · QUOTE · TASK · CONFLICT · APPROVE · AUDIT · EVENTS · I18N · A11Y · INFRA

---

## AUTH

### QA-AUTH-01 — Login sets an httpOnly session
**Status:** not_started · **Spec:** F01

- [ ] `POST /public/auth/login` with valid creds → `200` + `UserEnvelope`; an httpOnly `pb_session` cookie is set
- [ ] Wrong password → `401 unauthorized` (localized `messageKey`), **no** cookie set
- [ ] Malformed body (missing email/password) → `422 validation` with `fields`
- [ ] The session cookie is `HttpOnly` (not readable via `document.cookie`)

### QA-AUTH-02 — Session identity & logout
**Status:** not_started · **Spec:** F01

- [ ] `GET /private/auth/me` with the session → the current `User` (id, name, role)
- [ ] `GET /private/auth/me` with no/invalid session → `401 unauthorized`
- [ ] `POST /private/auth/logout` → session destroyed; a subsequent `/me` → `401`

### QA-AUTH-03 — Login rate-limit
**Status:** not_started · **Spec:** F01

- [ ] Repeated failed logins past the threshold → `429 rate_limited` (localized)
- [ ] The limit is per the configured window; a valid login after cool-down succeeds

### QA-AUTH-04 — Admin-tier gate
**Status:** not_started · **Spec:** F01

- [ ] `GET /admin/users` as `ADMIN1` → `200` list of `User`
- [ ] `GET /admin/users` as `MANAGER1` / `OPS1` / `VIEWER1` → `403 forbidden`
- [ ] `POST /admin/users` (ADMIN) creates a staff user; `PATCH /admin/users/:id` updates role/active

## SPACE

### QA-SPACE-01 — Match + filter
**Status:** not_started · **Spec:** F02

- [ ] `GET /private/spaces?minCapacity=180&layout=THEATER` returns only spaces whose `capacities[THEATER] ≥ 180`
- [ ] Each item carries `capacities` (layout → count), `features`, `dayRateMinor`, buffers
- [ ] With no `start`/`end`, items have **no** `available` field

### QA-SPACE-02 — Create/edit is OPS+
**Status:** not_started · **Spec:** F02

- [ ] `POST /private/spaces` as `OPS1`+ → `201` `Space`; as `VIEWER1` → `403 forbidden`
- [ ] `PATCH /private/spaces/:id` updates capacities/rate/buffers; unknown id → `404 not_found`
- [ ] Every create/edit writes an `AuditEntry` (verify via QA-AUDIT-01)

## ASSET

### QA-ASSET-01 — Inventory list + windowed availability
**Status:** not_started · **Spec:** F03

- [ ] `GET /private/assets?type=SEATING` returns assets with `totalQuantity`, `location`, `status`
- [ ] With `start`/`end`, each item carries `availableQuantity`
- [ ] A `MAINTENANCE` / `RETIRED` asset reports `availableQuantity: 0`

### QA-ASSET-02 — Create/edit is OPS+; can't under-provision
**Status:** not_started · **Spec:** F03

- [ ] `POST /private/assets` as OPS+ → `201`; as `VIEWER1` → `403 forbidden`
- [ ] Lowering `totalQuantity` below current overlapping holds → `422 validation`
- [ ] Create/edit writes an `AuditEntry`

## REQ

### QA-REQ-01 — Create a structured request
**Status:** not_started · **Spec:** F04

- [ ] `POST /private/requests` with a valid `EventRequestInput` → `201` `EventRequest`, status `DRAFT`
- [ ] Missing a required field (e.g. `expectedAttendees`) → `422 validation` with the field keyed
- [ ] `preferredDates` with `minItems: 1` enforced; empty array → `422`

### QA-REQ-02 — The aggregate read
**Status:** not_started · **Spec:** F04

- [ ] `GET /private/requests/:id` → `RequestAggregate` (request + reservation + quote + tasks + conflicts + audit)
- [ ] Unknown id → `404 not_found`
- [ ] `GET /private/requests?status=PROPOSED&page&pageSize` paginates and filters

### QA-REQ-03 — Lifecycle transitions are guarded
**Status:** not_started · **Spec:** F04, F10

- [ ] A legal transition (DRAFT → PROPOSED via planning) succeeds and writes audit
- [ ] An illegal transition (e.g. approve a `REJECTED` request) → `409 invalid_transition` with `from`/`to`

## AVAIL

### QA-AVAIL-01 — Buffer-aware space availability
**Status:** not_started · **Spec:** F05

- [ ] `GET /private/spaces/:id/availability?start&end` → `available` + `conflictingRequestIds`
- [ ] A query whose **effective** (buffer-padded) window overlaps a `HELD|CONFIRMED` reservation → `available: false`
- [ ] Touching event windows that don't overlap once buffers are added → `available: true`

### QA-AVAIL-02 — Asset availability is sum-of-holds
**Status:** not_started · **Spec:** F05

- [ ] With 310 of 400 chairs held overlapping the window → `availableQuantity: 90`
- [ ] A non-overlapping hold does **not** reduce availability
- [ ] An expired `HELD` lease (`expiresAt` past) does **not** count against availability

## RESV

### QA-RESV-01 — Atomic hold; two parallel holds → exactly one 409
**Status:** not_started · **Spec:** F06

- [ ] `POST /private/reservations` for a free window → `201` `Reservation` (`HELD`) with `effectiveStart`/`effectiveEnd`/`expiresAt`
- [ ] **Two parallel holds** for the same scarce asset/window → exactly **one** `201` and **one** `409 { conflicts }`
- [ ] Inventory decrements **once**, never twice (verify via QA-AVAIL-02 after)

### QA-RESV-02 — Confirm / release transitions
**Status:** not_started · **Spec:** F06

- [ ] `POST /private/reservations/:id/confirm` on a `HELD` → `CONFIRMED`, `expiresAt` cleared
- [ ] Confirm a `RELEASED` reservation → `409 invalid_transition`
- [ ] `POST /private/reservations/:id/release` returns the inventory (availability rises)

### QA-RESV-03 — Leases expire
**Status:** not_started · **Spec:** F06

- [ ] A `HELD` reservation past `expiresAt` is treated as released (the reaper / check-on-read frees it)
- [ ] Confirming an already-expired hold → `409 conflict` with the re-detected `Conflict[]` (not a stale confirm)

## QUOTE

### QA-QUOTE-01 — Total = net + VAT, server-computed
**Status:** not_started · **Spec:** F07

- [ ] `POST /private/quotes { requestId, reservationId? }` → `Quote` with `lineItems`, `netMinor`, `vatRate: 0.20`, `vatMinor`, `totalMinor`
- [ ] `netMinor == Σ subtotalMinor`; `vatMinor == round(net × 0.20)`; `totalMinor == net + vat` — recomputed, exact
- [ ] A client-supplied total is **ignored** (the server value stands); no field is a float

### QA-QUOTE-02 — Line items & versioning
**Status:** not_started · **Spec:** F07

- [ ] SPACE line = `dayRateMinor × days`; reserved ASSET lines priced per rate (0 if not chargeable); `extraLineItems` appear as SERVICE
- [ ] Regenerating after a scope change produces `version + 1`; the prior version persists in audit

## TASK

### QA-TASK-01 — Persist a task list; dueAt computed
**Status:** not_started · **Spec:** F08

- [ ] `POST /private/requests/:id/tasks { tasks: [...] }` → `201` `Task[]`
- [ ] `SETUP` task with `dueOffsetHours: -4` → `dueAt` = event start − 4h; `TEARDOWN` `+2` → event end + 2h
- [ ] `GET /private/requests/:id/tasks` returns them grouped by `phase`; writing tasks writes audit

## CONFLICT

### QA-CONFLICT-01 — Back-to-back events fire SETUP_WINDOW_OVERLAP
**Status:** not_started · **Spec:** F05

- [ ] Two events whose **event** windows don't overlap but whose **effective** windows do → a `SETUP_WINDOW_OVERLAP` conflict
- [ ] The conflict carries the `window` and a human `detail` string

### QA-CONFLICT-02 — Double-book & over-allocation
**Status:** not_started · **Spec:** F05

- [ ] Same space, overlapping effective windows → `SPACE_DOUBLE_BOOKED` with `conflictingRequestIds`
- [ ] Requesting more of an asset than is free → `ASSET_OVERALLOCATED` with `requested` + `available`
- [ ] `GET /private/conflicts?spaceId&start&end` surfaces these proactively (read-only)

### QA-CONFLICT-03 — Half-open boundary
**Status:** not_started · **Spec:** F05

- [ ] A 10:00–14:00 and a 14:00–18:00 booking with **zero** buffers do **not** conflict (touching is allowed)
- [ ] The same pair **with** buffers that overlap → `SETUP_WINDOW_OVERLAP`

## APPROVE

### QA-APPROVE-01 — VIEWER → 403; MANAGER → SCHEDULED
**Status:** not_started · **Spec:** F10

- [ ] `POST /private/requests/:id/approve` as `VIEWER1` or `OPS1` → `403 forbidden`
- [ ] As `MANAGER1` → `200`; request → `SCHEDULED`; held reservations → `CONFIRMED`; `request.approved` emitted
- [ ] The approval writes an `AuditEntry` with the manager as actor

### QA-APPROVE-02 — Reject requires a reason; releases holds
**Status:** not_started · **Spec:** F10

- [ ] `POST /private/requests/:id/reject` without `reason` → `422 validation`
- [ ] With a reason (as MANAGER+) → request `REJECTED`, reservations released, audit `reason` recorded
- [ ] Approving an expired-hold request → `409 conflict` with the offending `Conflict[]` (re-plan, not confirm-stale)

## AUDIT

### QA-AUDIT-01 — Every mutation is recorded with the real actor
**Status:** not_started · **Spec:** F09

- [ ] After a create/hold/quote/approve, `GET /private/audit?requestId=...` shows an entry per mutation
- [ ] Each entry carries `actorId` + `actorName` (the real staff member — never anonymous), `action` (dotted verb), `entityType`, `entityId`, `at`
- [ ] State-changing entries carry `before`/`after`; a reject carries `reason`
- [ ] The ledger is append-only (no update/delete path)

## EVENTS

### QA-EVENTS-01 — Outbox, no dual-write
**Status:** not_started · **Spec:** F11

- [ ] A mutation writes its `OutboxEvent` in the **same transaction** as the state change (a rolled-back mutation leaves **no** event)
- [ ] The relay publishes unpublished rows to NATS and stamps `publishedAt`; subjects match (`reservation.held`, `request.approved`, `conflict.detected`, …)
- [ ] Re-delivery is tolerated (consumers idempotent — at-least-once)

### QA-EVENTS-02 — Degrade to REST-only
**Status:** not_started · **Spec:** F11

- [ ] With `NATS_ENABLED=false`, the full request→plan→approve loop still works over REST
- [ ] `GET /ready` reflects NATS being down (`503`) while the core loop is unaffected — realtime checks here become `na`

## I18N

### QA-I18N-01 — Locale parity & localized errors
**Status:** not_started · **Spec:** F00

- [ ] `locales/al.json` and `en.json` have **identical key sets** (counts match)
- [ ] Every error `messageKey` (`reservation.conflict`, `validation.failed`, `request.invalid_transition`, …) resolves in both locales
- [ ] A `422` validation body's `fields` values are `messageKey`s that resolve in both locales

## A11Y

### QA-A11Y-01 — Keyboard & focus (frontend)
**Status:** not_started · **Spec:** frontend

- [ ] Every interactive control is keyboard-reachable; focus rings are visible
- [ ] Icon-only buttons (copilot toggle, row actions) have ARIA labels
- [ ] The copilot panel and any modal/drawer trap focus and restore it on close (Radix)

### QA-A11Y-02 — Status is not color-only
**Status:** not_started · **Spec:** frontend, DESIGN_SYSTEM

- [ ] Operational status (conflict / held / confirmed / scheduled) carries a text/label, not color alone
- [ ] Contrast meets AA against the near-monochrome surfaces in both light states

## INFRA

### QA-INFRA-01 — Stack comes up & probes are honest
**Status:** not_started · **Spec:** F00, infra

- [ ] `docker compose up` converges; `docker compose ps` shows db/nats/redis/ops-core healthy
- [ ] `GET /health` → `200`; `GET /ready` → `200` only when DB **and** NATS are reachable
- [ ] `pnpm db:seed` loads 4 halls, inventory, the four staff roles, and the planted conflict

### QA-INFRA-02 — Idempotency on mutations
**Status:** not_started · **Spec:** F00, ADR-0005

- [ ] A mutation replayed with the **same** `Idempotency-Key` + same body → the original response (bit-identical), no duplicate side effect
- [ ] The same key with a **different** body → `409 idempotency_key_mismatch`
- [ ] A mutation with **no** `Idempotency-Key` is rejected (the header is required)

### QA-INFRA-03 — Contract test (the drift gate)
**Status:** not_started · **Spec:** F13

- [ ] The contract test validates representative payloads against `openapi.yaml` and is green
- [ ] Enums are `UPPER_SNAKE`; timestamps are RFC-3339 with a trailing `Z`; money is integer `*Minor`

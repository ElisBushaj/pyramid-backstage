---
id: F09
name: Audit & Ledger
last_updated: 2026-06-21
---

# F09 — Tasks

### F09-T01 — AuditEntry model + migration
- Status: done
- Depends on: F00-T06
- Estimate: 0.25d
- Acceptance:
  - `AuditEntry` exists in `ops-core/prisma/schema.prisma` with all fields from the `openapi.yaml` `AuditEntry` schema: `id, actorId, actorName, action, entityType, entityId, requestId?, before? (Json), after? (Json), reason?, at`.
  - Indexes `@@index([requestId, at])` and `@@index([entityType, entityId])` are present (per `docs/03-data/SCHEMA.md`).
  - If F00-T06 already shipped the model complete this is a verification no-op; otherwise a gap-fill migration applies cleanly via `prisma migrate deploy`.
  - `at` defaults to `now()` (UTC); there is no `updatedAt`/`deletedAt` — the table is append-only by shape.

### F09-T02 — audit writer helper (writes inside the caller's transaction)
- Status: done
- Depends on: F09-T01
- Estimate: 0.5d
- Acceptance:
  - `src/modules/audit/audit.writer.ts` (or equivalent) exposes `writeAudit(tx, { actor, action, entityType, entityId, requestId?, before?, after?, reason? })` taking a `Prisma.TransactionClient` so the row commits with the caller's mutation — no separate transaction, no dual-write (per `docs/04-api/CORE_PATTERNS.md`).
  - `actorId`/`actorName` are taken from the passed `req.actor`; calling without an actor throws (loud failure), never writes an anonymous row (per `docs/02-domain/AUDIT.md`).
  - `action` is a dotted-verb string; `before`/`after` are stored as JSON snapshots; `reason` is passed through (required by callers like reject).
  - Unit test: invoked with a mock `tx`, it issues exactly one `auditEntry.create` carrying the actor, action, and before/after; invoked without an actor it throws.
  - tsc clean; vitest passing.

### F09-T03 — GET /audit?requestId&entityType
- Status: done
- Depends on: F09-T02
- Estimate: 0.25d
- Acceptance:
  - `GET /private/audit` (controller via `@controlledResponse`) accepts optional `requestId` and `entityType` query params, validated with `ValidationHelpers`.
  - Returns `ServiceResponse<AuditEntry[]>` ordered by `at` ascending; `requestId` filters to one request's history, `entityType` filters by entity type, and both combine (AND).
  - Uses the `[requestId, at]` / `[entityType, entityId]` indexes (no full-table scan for the common `requestId` query).
  - Requires auth (`/private` tier); VIEWER+ may read.
  - Test: seeded entries are returned filtered + ordered correctly for each query-param combination.

### F09-T04 — audit tests (actor recorded, before/after diff, append-only)
- Status: done
- Depends on: F09-T03
- Estimate: 0.25d
- Acceptance:
  - Integration test (real Postgres): a mutation that calls `writeAudit` inside its transaction produces an `AuditEntry` with the correct `actorId`/`actorName`, `action`, and a `before`/`after` diff reflecting the change.
  - Atomicity test: when the caller's transaction rolls back, no `AuditEntry` is left behind (the row is bound to the mutation's commit).
  - Append-only test: there is no service/endpoint path that updates or deletes an `AuditEntry`; an attempt to mutate one is not exposed by the API.
  - `GET /audit?requestId` reconstructs the full ordered history for a request created and transitioned across the test.
  - tsc clean; runs in CI.

### F09-T05 — paginate GET /private/audit (okList page/pageSize) (ADR-0017)
- Status: done
- Depends on: F09-T02
- Estimate: 0.5d
- Acceptance:
  - `audit.service.list` returns `okList` with `take`/`skip` + total; `validators` accept bounded `page`/`pageSize` (default 50, max 100); `controller` parses+passes them.
  - `openapi.yaml` documents `page`/`pageSize` params on `GET /private/audit` and points the list response at the shared `ListEnvelope`.
  - Integration test (real Postgres): >pageSize entries paginate with correct `total`/`totalPages`; pageSize clamps to max; existing `requestId`/`entityType` filters still apply. tsc + vitest green.

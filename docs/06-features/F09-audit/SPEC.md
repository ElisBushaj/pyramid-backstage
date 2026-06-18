---
id: F09
name: Audit & Ledger
phase: Foundation
depends_on: [F00, F01]
status: not_started
last_updated: 2026-06-18
---

# F09 — Audit & Ledger

## Summary

The append-only decision/change record. "Maintain a complete record of decisions, changes, and approvals" is an explicit requirement; this feature ships the `AuditEntry` writer that every mutating feature calls **inside its own transaction**, plus the read endpoint that reconstructs an entity's history. It lands early (Foundation phase) because F02, F03, F04, F06, F07, F08, F10 all write audit on mutation — the writer is their shared dependency.

The writer never opens its own transaction: it enlists in the caller's `prisma.$transaction` so the state change and the audit row commit or roll back together. There is no anonymous audit — `actorId` is always `req.actor.id`.

## Scope

### In scope
- The `AuditEntry` model (from F00-T06) + any migration gap-fill.
- An audit writer helper that accepts the caller's transaction client and writes one append-only `AuditEntry` with actor, action (dotted verb), entityType/entityId, optional `requestId`, `before`/`after` diff, and `reason`.
- `GET /private/audit?requestId&entityType` returning `AuditEntry[]`.
- Tests: actor recorded from `req.actor`, before/after diff captured, append-only (no update/delete path).

### Out of scope
- The event bus / outbox — that is F11 (audit and events are siblings, both written in-transaction, but the outbox is its own feature).
- Emitting specific domain events — F11-T04.
- A UI audit timeline — outside ops-core scope.

## Acceptance criteria

- The writer signature takes the caller's transaction client (`Prisma.TransactionClient`) so the audit row is in the **same transaction** as the mutation; called outside a transaction it still writes atomically with its own statement, but the documented usage is in-transaction.
- Every `AuditEntry` carries `actorId` + `actorName` from `req.actor` — never anonymous; a write attempted without an actor is a programmer error that fails loudly, not a silent anonymous row.
- `action` is a dotted verb matching `docs/02-domain/AUDIT.md` (`request.create`, `reservation.hold`, `reservation.confirm`, `quote.generate`, `request.approve`, `request.reject`, `space.update`, `asset.update`, `task.update`, …).
- `before`/`after` capture the state diff for updates/transitions; `reason` is populated where the action requires it (e.g. `request.reject`).
- `GET /private/audit?requestId` returns that request's entries ordered by `at`; `?entityType` filters by entity type; both filters combine. Response is the `ServiceResponse<AuditEntry[]>` envelope.
- There is no code path that updates or deletes an `AuditEntry`; a test asserts append-only behaviour.

## Data model

`AuditEntry { id, actorId, actorName, action, entityType, entityId, requestId?, before? (JSON), after? (JSON), reason?, at }` per `docs/03-data/SCHEMA.md` and the `AuditEntry` schema in `openapi.yaml`. Indexes `[requestId, at]` and `[entityType, entityId]` (from F00-T06) make the read endpoint fast.

## API surface

- `GET /private/audit?requestId&entityType` — decision/change history → `AuditEntry[]`.

(The writer is an internal helper, not an endpoint — it is invoked by the services that mutate state.)

## UI surfaces

None — backend.

## Notes

- Audit semantics and the action vocabulary: `docs/02-domain/AUDIT.md`.
- "Same transaction, no dual-write" discipline: `docs/04-api/CORE_PATTERNS.md` (Events / Audit) — the audit row and the `OutboxEvent` (F11) both enlist in the mutation's transaction.
- `req.actor` comes from F01-T04.

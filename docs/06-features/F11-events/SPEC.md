---
id: F11
name: Events / NATS
phase: Foundation
depends_on: [F00, F09]
status: not_started
last_updated: 2026-06-18
---

# F11 — Events / NATS

## Summary

The real-time signal layer: domain events published to NATS (JetStream) via a **transactional outbox**, so the dashboard feels alive and the proactive AI can react to `conflict.detected`. Events are written to an `OutboxEvent` row **in the same transaction** as the state change (no dual-write), then a relay polls unpublished rows and publishes them, marking `publishedAt`. Delivery is at-least-once; consumers are idempotent.

This layer is **optional and degradable**: with `NATS_ENABLED=false` the core loop works over REST alone — holds, quotes, approvals, conflicts all function; only the live push is absent. That degrade path is a first-class, tested requirement, not an afterthought.

## Scope

### In scope
- The `OutboxEvent` model (from F00-T06) + any migration gap-fill.
- NATS connection + JetStream stream/config in `config/nats`, guarded by `NATS_ENABLED`.
- The outbox relay: poll unpublished → publish to the right subject → mark `publishedAt`; at-least-once.
- Emitting the six domain events (`request.created`, `reservation.held`, `reservation.confirmed`, `conflict.detected`, `request.approved`, `inventory.low`) by writing outbox rows inside the owning mutations.
- The degrade-to-REST guarantee: full system behaviour with `NATS_ENABLED=false`.
- An events integration test (outbox row → relay publishes → a consumer receives).

### Out of scope
- The audit ledger — that is F09 (sibling: both write in-transaction).
- Consuming events in a UI / the AI — outside ops-core scope (the AI subscribes via its own service).
- `/ready`'s NATS branch is *extended* here but the route shape is owned by F00-T08.

## Acceptance criteria

- An `OutboxEvent` is written inside the same `prisma.$transaction` as the state change it describes; if the mutation rolls back, no event row is left (no phantom events).
- The relay publishes every unpublished `OutboxEvent` exactly to its `subject`, sets `publishedAt`, and is safe to run repeatedly (at-least-once; a crash mid-publish re-publishes, never double-marks an unpublished row as published without sending).
- The six subjects fire on the right triggers per `docs/02-domain/AUDIT.md`: `request.created`, `reservation.held`, `reservation.confirmed`, `conflict.detected`, `request.approved`, `inventory.low`.
- `conflict.detected` carries the `Conflict[]` payload so the AI can explain the clash without re-querying.
- With `NATS_ENABLED=false`: the relay no-ops (rows accumulate harmlessly), `GET /ready` does not require NATS, and every domain mutation still succeeds — verified by a test that runs the core flow with NATS disabled.
- The relay polls using the `OutboxEvent [publishedAt]` index (no full-table scan).

## Data model

`OutboxEvent { id, subject, payload (JSON), publishedAt?, createdAt }` per `docs/03-data/SCHEMA.md`, indexed `[publishedAt]` so the relay finds unpublished rows efficiently. Written by the same services that write `AuditEntry`.

## API surface

None — backend. F11 adds no endpoints; it extends `GET /ready` (owned by F00-T08) to include a NATS reachability check when `NATS_ENABLED=true`.

## UI surfaces

None — backend.

## Notes

- Event subjects + consumers table and the no-dual-write rule: `docs/02-domain/AUDIT.md`.
- Outbox discipline: `docs/04-api/CORE_PATTERNS.md` (Events). NATS-as-optional decision: ADR-0002 (NATS JetStream event bus).
- The conflict payload shape is the `Conflict` schema in `openapi.yaml`; the conflict story it powers is in `docs/02-domain/CONFLICTS.md`.

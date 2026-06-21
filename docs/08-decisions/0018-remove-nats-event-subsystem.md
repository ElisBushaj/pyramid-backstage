# ADR-0018: Remove the NATS event bus and the event subsystem

- **Status**: Accepted
- **Date**: 2026-06-21
- **Supersedes**: [ADR-0002](./0002-nats-jetstream-event-bus.md)

## Context

[ADR-0002](./0002-nats-jetstream-event-bus.md) adopted NATS (JetStream) as a real-time event backbone, fed by a transactional **`OutboxEvent`** table and drained by a polling **relay**. The intent was a live dashboard and an unprompted AI heads-up driven by published subjects (`reservation.held`, `conflict.detected`, `inventory.low`, `asset.moved`, and the rest).

In practice the async event layer earned its keep nowhere: the live signal it promised was never wired to a consumer, the dashboard reads the REST contract directly (and degrades to polling), and `ai-orchestrator` keys its conflict branch off the deterministic `409 { conflicts }` payload it already receives over HTTP — not off an event count. The outbox, the relay, the `NATS_ENABLED` degrade switch, and the extra compose container were pure carrying cost: more schema, more code paths, more infra, more tests, with no feature depending on them.

## Decision

**Remove the entire event subsystem.** Concretely, the project no longer contains:

- **NATS / JetStream** — the broker, the `nats` compose service, and `NATS_URL` / `NATS_ENABLED` configuration.
- **The transactional outbox** — the `OutboxEvent` table and the `writeOutbox` / `publishEvent` helpers.
- **The relay** — the polling publisher (`runRelayPass`) that drained the outbox to NATS.
- **Published subjects** as a concept — `request.created`, `reservation.held`, `reservation.confirmed`, `conflict.detected`, `request.approved`, `inventory.low`, `asset.moved`, and any others.

`ops-core` remains the deterministic **system of record** over **Postgres + Prisma**, exposed entirely through the REST contract (`ops-core/openapi.yaml`). The **audit log stays**: every mutation still writes an `AuditEntry` with `req.actor` in the same transaction as the state change. The only thing that goes away is the *second* write — the outbox event. The rule "every mutation is audited" is unchanged; the rule "every mutation also emits an outbox event" is deleted.

## Consequences

- **Simpler system of record.** A mutation is `state change + AuditEntry`, in one transaction — no intent-to-publish row, no dual-path to reason about.
- **One fewer container and one fewer failure mode.** The compose stack drops `nats`; there is no relay to run, monitor, or back-pressure, and no degrade switch to test.
- **The dashboard is REST-driven.** Live freshness comes from the client polling the contract, which was already the degraded-mode behaviour; there is no separate "alive" transport to keep correct.
- **The AI loses no input.** `ai-orchestrator` already derived conflict heads-up from the synchronous `409 { conflicts }` response; nothing it relied on came from the bus.
- **History is preserved.** ADR-0002 and the F11 feature backlog are retained as historical record, marked superseded/removed; task IDs are not renumbered.

## Alternatives considered

- **Keep the broker, drop only the outbox.** Rejected: without the outbox the publish is a dual write — the exact hazard ADR-0002 set out to avoid — and there is still no consumer to justify the broker.
- **Keep the outbox table, drop only NATS.** Rejected: an outbox with no relay and no broker is an audit log under a second name. The `AuditEntry` already records every mutation.
- **Defer removal behind `NATS_ENABLED=false`.** Rejected: leaving dead, gated code and schema in place is the carrying cost we are removing. Delete it cleanly; the history lives in this ADR.

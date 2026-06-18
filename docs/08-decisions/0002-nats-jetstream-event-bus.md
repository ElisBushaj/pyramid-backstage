# ADR-0002: NATS JetStream event bus, written via a transactional outbox

- **Status**: Accepted
- **Date**: 2026-06-18

## Context

Two of the product's strongest moments are *live*. The first is the **command center dashboard** that updates the instant a hold is placed, a conflict appears, or an approval lands — without the operator refreshing. The second is the **proactive AI heads-up**: a colliding request comes in, and the copilot pushes an unprompted *"this clashes with req_5a1 in Blue Hall — want me to re-plan?"* before anyone asked. Both need a real-time signal carried out of `ops-core` to the UI and to `ai-orchestrator`.

The marketplace project chose BullMQ on Redis and deliberately **did not** adopt NATS — its async needs were background jobs (email, reindex), not a live fan-out. We diverge here because our wow factor is a live operational picture, not a job queue.

The classic failure with "write to DB, then publish an event" is the **dual write**: the DB commits and the publish fails (or vice versa), so the event is lost or phantom. Inventory and audit cannot tolerate that.

## Decision

**Adopt NATS (JetStream) as the event backbone, and write every event through a transactional outbox — never a dual write.**

- Domain events are written to an **`OutboxEvent`** row **in the same Prisma transaction** as the state change and its `AuditEntry`. The transaction is the unit of atomicity: state, audit, and the intent-to-publish commit together or not at all.
- A **relay** polls unpublished `OutboxEvent` rows and publishes them to NATS, stamping `publishedAt`. Delivery is **at-least-once**; consumers are idempotent. (See [docs/02-domain/AUDIT.md](../02-domain/AUDIT.md) and [docs/04-api/CORE_PATTERNS.md](../04-api/CORE_PATTERNS.md).)
- Subjects: `request.created`, `reservation.held`, `reservation.confirmed`, `conflict.detected`, `request.approved`, `inventory.low`. `conflict.detected` is the one `ai-orchestrator` consumes for the proactive heads-up; the rest drive the UI.

**The bus is degradable.** `NATS_ENABLED=false` runs `ops-core` REST-only: the core request→plan→approve loop works entirely over HTTP; the outbox simply accumulates (or is skipped) and the dashboard falls back to polling. NATS makes the system feel *alive*; it is never required for *correctness*. See the cut-line in [docs/00-strategy/MASTER_PLAN.md](../00-strategy/MASTER_PLAN.md).

## Consequences

- **No lost or phantom events.** The outbox makes publication a consequence of the committed transaction, not a second write that can disagree with it.
- **The dashboard is live, and the AI can speak unprompted.** `conflict.detected` → an unprompted copilot heads-up is the single best stage moment; it falls out of this design for free.
- **At-least-once means idempotent consumers.** The UI dedupes by event id; `ai-orchestrator`'s conflict branch is keyed off the deterministic `409 { conflicts }` payload, not off event count.
- **Operational floor stays low.** With `NATS_ENABLED=false` the demo still runs end-to-end on Postgres + REST alone — the degrade path is a first-class, tested mode, not a fallback nobody exercised.
- **One more container** (`nats`, JetStream) in the compose stack. Justified by the live-dashboard payoff; gated so it can be turned off.

## Alternatives considered

- **BullMQ on Redis (the marketplace choice).** Rejected for the live path: it's a job queue, not a pub/sub fan-out to many live subscribers. We already use Redis (sessions, idempotency, AI memory); adding NATS for the live signal keeps each tool in its lane.
- **Direct publish after commit (no outbox).** Rejected: the dual-write hazard. A network blip between commit and publish silently drops the event that the dashboard and AI depend on.
- **Postgres `LISTEN/NOTIFY`.** Rejected: payload-size and delivery-guarantee limits, no durable replay, and it couples the live transport to the database. JetStream gives durability and replay; the outbox gives the transactional guarantee.
- **WebSocket push straight from the request handler.** Rejected: couples liveness to a single `ops-core` instance and to the request lifecycle; no durability if the socket is down when the event fires.

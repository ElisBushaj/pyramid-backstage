# Domain — Audit & Events

"Maintain a complete record of decisions, changes, and approvals" is an explicit requirement and an easy, high-value win. Two coupled mechanisms: the **audit ledger** (the record) and the **event bus** (the live signal). Both are written in the **same transaction** as the state change they describe.

## Audit ledger (`AuditEntry`)
Append-only. Written on **every** mutation and decision. Fully defined (the PDF left it as a stub):
```
{ id, actorId, actorName, action, entityType, entityId, requestId?, before?, after?, reason?, at }
```
- `actorId` is the authenticated staff member (real, from `req.actor` — never anonymous). This is *why* auth is in scope: a decision log without a decider is worthless.
- `action` is a dotted verb: `request.create`, `reservation.hold`, `reservation.confirm`, `quote.generate`, `request.approve`, `request.reject`, `space.update`, …
- `before`/`after` capture the diff for state changes; `reason` is required on rejects.
- Never updated or deleted. `GET /audit?requestId` reconstructs an entity's full history.

## Event bus (NATS / JetStream)
Real-time signal for the command center + proactive AI. **Optional and degradable** — the core loop works over REST alone; NATS is the layer that makes the dashboard feel alive ([ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md)).

| Subject | Emitted when | Consumed by |
|---------|--------------|-------------|
| `request.created` | Request created | UI |
| `reservation.held` | Hold placed | UI |
| `reservation.confirmed` | Hold confirmed | UI |
| `conflict.detected` | A hold/check found a clash | **ai-orchestrator** + UI |
| `request.approved` | Approval written | UI |
| `inventory.low` | An asset's availability crosses a threshold | UI |

On `conflict.detected` the AI can push an **unprompted** "heads up — this clashes with X, want me to re-plan?" — the strongest moment on stage.

## No dual-write
The DB write and the event must not be two independent writes (lost/phantom events). Events are written to an **`OutboxEvent`** row inside the state transaction; a relay polls unpublished rows and publishes to NATS, marking `publishedAt`. At-least-once delivery; consumers are idempotent. ([CORE_PATTERNS.md](../04-api/CORE_PATTERNS.md))

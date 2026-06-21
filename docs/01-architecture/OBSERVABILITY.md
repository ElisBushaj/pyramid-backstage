# Architecture — Observability

> What you can see while the system runs, and what to add for production. The 3-day build ships the **floor** — structured logs, health probes, and the audit ledger — which is enough to operate and demo. Metrics/traces/alerts are a deliberate backlog.

## What ships in the build

### Structured logs — pino

`ops-core` logs through **pino** (structured JSON). Each request-scoped log carries enough to trace a request: the route, the actor id, the status, and — for mutations — the action and entity. Errors thrown as `APIError` log with their `messageKey` and structured fields, so a failure is greppable by its canonical machine string ([docs/04-api/ERROR_CONTRACT.md](../04-api/ERROR_CONTRACT.md)), not a free-text message. Logs go to stdout, collected by the container runtime (see [RUNBOOK.md](../07-operations/RUNBOOK.md) § logs).

### Health & readiness probes

Two probes, matching the contract and the compose healthchecks ([INFRASTRUCTURE.md](./INFRASTRUCTURE.md)):

- **`GET /health`** — **liveness**. The process is up. Unauthenticated (`security: []`). Always `200` if the server is running.
- **`GET /ready`** — **readiness**. Dependencies are reachable: **DB**. Returns `200` ready / `503` not-ready. This is the gate orchestration uses before sending traffic, and the signal that tells you *which* dependency is the problem.

(`ai-orchestrator` exposes its own `GET /health`; the frontend is the Vite dev server / static host.)

### The audit ledger — the decision record

The **`AuditEntry`** ledger ([docs/02-domain/AUDIT.md](../02-domain/AUDIT.md)) is observability of a different kind: not "is the system healthy?" but **"what did the system decide, and who decided it?"**. Append-only, written with the real `req.actor` on every mutation, with before/after diffs. `GET /audit?requestId` reconstructs any entity's full history. For an ops tool, this is the most important record there is — it is *why* auth is in scope.

## How to debug a problem with what's here

| Symptom | Where to look |
|---|---|
| Requests failing | pino logs (the `APIError` `messageKey` + status); `GET /ready` for a dependency outage |
| A reservation/approval did something unexpected | `GET /audit?requestId` — the actor + before/after diff |
| A conflict that shouldn't have fired (or didn't) | the `Conflict[]` in the `409` body + the audit entry; the engine's property tests |
| Mutation retried / duplicated | the idempotency cache (Redis) — a replay should return the original |

## Production backlog (not in the 3-day build)

Tracked in [`ROADMAP.md`](../00-strategy/ROADMAP.md) Phase 4. The floor above is enough to demo and operate; production wants:

- **Metrics** — request rate/latency/error-rate per route; reservation hold→confirm conversion; **conflict rate**; lease-reaper backlog.
- **Traces** — distributed tracing across the client → `ai-orchestrator` → `ops-core` hop, so a slow plan can be attributed to the right tool call.
- **Alerts** — `GET /ready` failing, error-rate spike, login-rate-limit saturation, lease reaper not running.
- **Log aggregation + retention** — ship pino logs to a store with search + retention, correlation-id propagation end to end.
- **Dashboards** — the operational metrics above, plus a business view (events scheduled, inventory utilization).

These are additive — the structured-log + probe + audit foundation is the substrate they build on, not something they replace.

## Cross-references

- **Probes & compose healthchecks:** [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md), [`docs/07-operations/RUNBOOK.md`](../07-operations/RUNBOOK.md).
- **The audit ledger:** [`docs/02-domain/AUDIT.md`](../02-domain/AUDIT.md).
- **The error contract (greppable failures):** [`docs/04-api/ERROR_CONTRACT.md`](../04-api/ERROR_CONTRACT.md).

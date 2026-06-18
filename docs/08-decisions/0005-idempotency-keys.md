# ADR-0005: Idempotency keys required on all mutations

- **Status**: Accepted
- **Date**: 2026-06-18

## Context

Mutations on this system have real side effects: a reservation decrements inventory, an approval confirms holds, a quote is generated. Clients retry on network failure, users double-tap buttons, a backgrounded tab re-fires, the AI re-issues a tool call after a timeout. Without protection, a retry can double-hold a room, confirm twice, or create a duplicate request.

The reservation path is the sharpest case: a retried `POST /reservations` must return the **original** hold, never grab a second slice of scarce inventory. The deterministic conflict branch the AI relies on (`409 { conflicts }`) also has to be replay-stable.

Unlike the marketplace — which applied idempotency **per-endpoint**, only where business semantics demanded it (checkout, payments) — this build has a small, uniformly side-effectful mutation surface and a hard "demo must be flawless" bar. Uniform enforcement is simpler to reason about and leaves no gap.

## Decision

**Every mutating request carries an `Idempotency-Key`; replays return the original response.**

- **Header**: `Idempotency-Key: <uuid v4>`, **required** on all unsafe (POST/PATCH) requests in [`openapi.yaml`](../../ops-core/openapi.yaml). Declared once as a shared parameter; applied to every mutation.
- **Substrate**: Redis-backed cache of `(key, request-hash, response)`, **24-hour TTL**. Implemented as a route-level `withIdempotency` middleware (see [docs/04-api/CORE_PATTERNS.md](../04-api/CORE_PATTERNS.md)).
- **Server behavior**:
  - **First arrival** — process, store `(key, request-hash, response)`, return the response.
  - **Replay, matching request-hash** — return the cached response, bit-identical (status + body).
  - **Replay, mismatched request-hash** — `409 idempotency_key_mismatch` (same key, different body is a client bug; rotate the key). See [docs/04-api/ERROR_CONTRACT.md](../04-api/ERROR_CONTRACT.md).
  - **Concurrent retries** — hold-and-replay via a Redis lock keyed on the idempotency key, so two in-flight copies don't both execute.

This composes with the reservation's serializable transaction ([docs/02-domain/RESERVATIONS.md](../02-domain/RESERVATIONS.md)): idempotency stops the *duplicate request* from re-executing; the transaction stops *concurrent distinct requests* from over-allocating. Both guards are needed.

## Consequences

- **Retries are safe everywhere.** A network blip or double-click on any mutation returns the original result; no duplicate holds, confirms, requests, or quotes.
- **Replay is bit-identical.** The cached response includes status and body, so a replayed `201` returns the same created entity, and a replayed `409 { conflicts }` returns the same conflict explanation the AI already branched on.
- **Mismatched body is a hard error**, not a silent overwrite — it forces clients to use a fresh key for a genuinely new operation.
- **Redis is on the mutation hot path.** The middleware degrades **closed** (rejects rather than risks a duplicate side effect) if Redis is unavailable. Redis is already in the stack for sessions and AI memory, so no new dependency.
- **24h TTL** is enough to cover any realistic retry window without unbounded growth.

## Alternatives considered

- **Per-endpoint idempotency (the marketplace pattern).** Reasonable there; here the mutation surface is small and uniformly side-effectful, and a demo-grade correctness bar argues for no gaps. Blanket-on-mutations is the simpler invariant.
- **Trust client retries.** Rejected: data corruption the moment the client misbehaves — and the AI is a client that retries on timeout.
- **Database-backed idempotency keys.** Durable but slower on the hot path; Redis with a 24h TTL fits the replay-window semantics and matches the existing infra.
- **Dedupe by `(actor, body-hash, time-window)`.** Rejected: the window is always wrong, and replay semantics are undefined. An explicit client-supplied key is unambiguous.

# ADR-0001: Two services, one contract

- **Status**: Accepted
- **Date**: 2026-06-18

## Context

Pyramid Backstage has two jobs that pull in opposite directions. One is **knowing what is true** — which room is free, how many chairs are left, what a window costs, who approved what — and enforcing it without ever being wrong. The other is **reasoning over a messy human request** — turning *"startup conference, 180 people, late next month, needs a stage and mics"* into a concrete plan, explaining conflicts in plain language, proposing alternatives.

The first job wants determinism, transactions, row locks, and a relational store. The second wants an LLM, a graph runtime, retrieval, and conversation memory. Forcing both into one process couples a stateless reasoning layer to a stateful system of record: the AI gains the ability to corrupt inventory, and the record inherits a Python/LLM dependency it never needed. It also makes the two impossible to build in parallel, which matters when the deterministic half ships in full in three days and the reasoning half (`ai-orchestrator`, Alvin's lane) is scaffold-plus-mock here.

## Decision

**Split into two services with exactly one coupling: the contract.**

- **`ops-core`** (Elis · Node 20 · Express 5 · Prisma 7 · Postgres 17 · NATS) is the **deterministic system of record**. Spaces, assets, requests, reservations, quotes, tasks, conflicts, audit, auth. **No AI lives here.** It knows what is true and enforces it.
- **`ai-orchestrator`** (Alvin · Python · FastAPI · LangGraph · Claude · ChromaDB · Redis) is the **reasoning layer**. It holds **no domain state** — only conversation context in Redis and retrieval vectors in ChromaDB. Everything true comes from `ops-core`.

The two share **only** the payload shapes in [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml). **Neither service imports the other's code.** The only runtime coupling is one env var on the AI side: `OPS_CORE_URL`. `ai-orchestrator` treats each `ops-core` endpoint as a LangGraph **tool**.

The rule that keeps the split honest: **the brain never holds domain state; the record never reasons.** The AI proposes (`proposedActions`); `ops-core` authorizes (re-validates every proposed mutation server-side). See [docs/04-api/CONTRACT.md](../04-api/CONTRACT.md) and [docs/02-domain/AI_ORCHESTRATION.md](../02-domain/AI_ORCHESTRATION.md).

## Consequences

- **The two build in isolation.** `ai-orchestrator` develops against [`mock-ops-core`](../01-architecture/INFRASTRUCTURE.md) (a stateful contract mock that honors the `409 { conflicts }` path) and integrates by flipping `OPS_CORE_URL` — a one-line switch. The 3-day build ships `ops-core` in full without waiting on the AI.
- **AI output is untrusted input.** Because the record re-validates everything, a hallucinated total or an impossible hold cannot commit. The single source of truth survives even inside the AI's narrative (numbers are injected from `ops-core` responses, never free-generated).
- **The contract is law.** A breaking change is a deliberate, additive-only event recorded as a new ADR — not an accident of refactoring one service.
- **One more network hop** on the AI path (chat → `ops-core` tool call). Acceptable: the record is local, the latency is small, and the isolation is worth it.
- **No shared types package.** DTOs are hand-mirrored on three sides; drift is caught by a contract test and review (see [ADR-0008](./0008-hand-mirrored-api-types.md)).

## Alternatives considered

- **One service, AI embedded in `ops-core`.** Rejected: couples a stateless reasoner to a stateful record, blocks parallel builds, and gives the LLM a direct path to corrupting inventory. The whole hardening story (audit-with-actor, transactional reservations) becomes harder to reason about.
- **Shared monorepo with a common types package.** Rejected: a code-level coupling the contract-only boundary is meant to prevent. A Python service and a TypeScript service do not share a type system cheaply; the openapi.yaml is the lingua franca.
- **AI as a thin proxy with its own small datastore.** Rejected: the moment the AI persists domain facts (even "just the plan"), there are two sources of truth and they drift. Conversation state in Redis is fine; domain state is not.

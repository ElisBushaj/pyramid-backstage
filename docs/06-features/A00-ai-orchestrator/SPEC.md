---
id: A00
name: AI Orchestrator
phase: AI
depends_on: [F13]
status: not_started
last_updated: 2026-06-18
---

> **Alvin's lane — the Python AI service. NOT part of the 3-day ops-core build; the ops-core agent loop treats these as ineligible. ops-core (Elis) ships the tool surface these consume.**

# A00 — AI Orchestrator

## Summary

The reasoning layer that understands a request and decides what to do — and a **reference backlog**, not 3-day-build scope. It holds **no domain state**: everything true comes from ops-core over the contract; the AI reasons *over* it, never *owns* it. This SPEC documents the target so ops-core builds the right tool surface and the frontend knows the AI endpoints; Alvin implements the LangGraph / RAG / copilot logic.

The non-negotiables that make the demo flawless: `POST /plan` is a **deterministic** graph (a fixed DAG, not an open-ended ReAct loop), narrative numbers are **injected from ops-core responses** (never free-generated), the AI **proposes and ops-core authorizes** (AI output is untrusted input, human approval gates commits), structured intake is **schema-validated + retried**, and the conflict branch **keys off `409 { conflicts }`**.

## Scope

### In scope
- FastAPI scaffold + `/health` (already in the scaffold).
- `ops_core_client` — one method per contract endpoint (the LangGraph tools), with `Idempotency-Key` and typed `409` handling.
- `schemas.py` — Pydantic mirrors of the contract.
- NL intake parser → `EventRequestInput` (schema-validated, 1 retry, canned fallback, low temperature).
- A deterministic LangGraph planning DAG (fixed order: parse → match → check → reserve → quote → tasks → detect → assemble).
- RAG over ChromaDB (venue facts, setup templates, pricing rules, past events).
- `POST /chat` copilot (stateful via Redis sessionId; `proposedActions`; `requiresApproval`).
- `POST /plan` + `OperationalPlan` assembly + narrative (numbers injected from ops-core).
- The conflict branch (catch `409` → alternatives + plain-language explanation, keyed off the planted seed conflict).
- A build-against-mock harness with a one-line flip to the real ops-core.

### Out of scope
- Any ops-core domain logic — that's Elis's. The AI never writes domain state directly; it calls the contract.
- Owning task/reservation/quote state — ops-core is the single source of truth; the AI persists through it.
- Changing `openapi.yaml` — the contract is law; the AI consumes it.

## Acceptance criteria

- `POST /plan` is a fixed DAG (parse → match → check availability → reserve → quote → tasks → detect conflicts → assemble), not a re-deciding agent — deterministic per `docs/02-domain/AI_ORCHESTRATION.md`.
- Narrative prose is composed *around* values from the structured plan; the AI never invents a total or a count — every number in the narrative traces to an ops-core response.
- The AI proposes; ops-core authorizes: `proposedActions` payloads are re-validated server-side by ops-core; `requiresApproval` gates anything that commits.
- NL → `EventRequestInput` is schema-validated with one retry + a canned fallback for demo inputs, at low temperature.
- The conflict branch keys off ops-core's `409 { conflicts }` (the typed conflict body), producing alternatives + a plain-language explanation — deterministic, no guessing.
- Until ops-core is live, the AI builds against `mock-ops-core` (a stateful mock that honors the reservation `409` path); flipping `OPS_CORE_URL` to the real service is a one-line switch.

## Data model

None of its own — the AI holds only conversation context in Redis (keyed by `sessionId`). All domain entities come from ops-core via the contract; `schemas.py` mirrors those shapes (Pydantic) per `docs/04-api/TYPE_SHARING.md`.

## API surface

The AI's own endpoints (not part of `ops-core`):
- `POST /chat` — conversational copilot (stateful via `sessionId`) → `{ reply, plan?, proposedActions[], requiresApproval }`.
- `POST /plan` — deterministic plan for a known request (or a full `EventRequestInput`) → `OperationalPlan`.
- `GET /health` — liveness.

It **consumes** the ops-core tool surface (`POST /requests`, `GET /requests/:id`, `GET /spaces`, `GET /spaces/:id/availability`, `GET /assets`, `POST /reservations`, `POST /reservations/:id/confirm`, `POST /quotes`, `GET /conflicts`, `POST /requests/:id/tasks`, `POST /requests/:id/approve|reject`, `GET /audit`) as LangGraph tools.

## UI surfaces

None directly in this repo (the command center calls `/chat` and `/plan`). The frontend integration is outside ops-core's 3-day scope.

## Notes

- The full AI spec — stack, endpoints, `OperationalPlan`, the five non-negotiables, the parallel-dev seam — is `docs/02-domain/AI_ORCHESTRATION.md`. This is the reference backlog around it.
- The contract the AI consumes is `ops-core/openapi.yaml` (`docs/04-api/CONTRACT.md`); the conflict body it branches on is `docs/04-api/ERROR_CONTRACT.md` (`409 conflict`).
- The mock seam: `mock-ops-core/` (stateful, honors the `409` path). LLM provider is Claude (Anthropic).

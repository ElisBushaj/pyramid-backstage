---
id: A00
name: AI Orchestrator
last_updated: 2026-06-18
---

> **Alvin's lane — the Python AI service. NOT part of the 3-day ops-core build; the ops-core agent loop treats these as ineligible. ops-core (Elis) ships the tool surface these consume.**

# A00 — Tasks

### A00-T01 — FastAPI scaffold + /health (DONE in scaffold)
- Status: not_started
- Depends on: none
- Estimate: 0.25d
- Acceptance:
  - `ai-orchestrator/app/main.py` exposes a FastAPI app with `GET /health` returning 200 (already present in the scaffold).
  - `app/config.py` reads `OPS_CORE_URL` and the LLM/Redis/Chroma settings from env (the one coupling to ops-core is `OPS_CORE_URL`).
  - The service boots under uvicorn and `/health` responds; `pyproject.toml` declares the deps (FastAPI, LangGraph, anthropic, chromadb, redis).
  - Reference task — verifies the existing scaffold; no ops-core build work.

### A00-T02 — ops_core_client — the tools (one method per contract endpoint, Idempotency-Key, typed 409)
- Status: not_started
- Depends on: A00-T01
- Estimate: 0.5d
- Acceptance:
  - `app/ops_core_client.py` exposes one method per ops-core endpoint the AI uses as a LangGraph tool (`create_request`, `get_request`, `match_spaces`, `space_availability`, `asset_availability`, `hold_reservation`, `confirm_reservation`, `create_quote`, `get_conflicts`, `persist_tasks`, `approve_request`, `reject_request`, `get_audit`) per `docs/04-api/CONTRACT.md` (the tool-surface table).
  - Every mutating call sends a UUID-v4 `Idempotency-Key`; the client unwraps the `ServiceResponse<T>` envelope's `data`.
  - A `409 conflict` is surfaced as a **typed** exception carrying the parsed `Conflict[]` (so the conflict branch can branch deterministically per `docs/04-api/ERROR_CONTRACT.md`); other error shapes map to typed exceptions too.
  - Base URL is `OPS_CORE_URL` (so the mock↔real flip is one env change); the client targets `mock-ops-core` for development.

### A00-T03 — schemas.py — pydantic mirrors of the contract
- Status: not_started
- Depends on: A00-T01
- Estimate: 0.25d
- Acceptance:
  - `app/schemas.py` provides Pydantic models mirroring the contract shapes the AI consumes/produces (`EventRequestInput`, `EventRequest`, `SpaceWithAvailability`, `AssetWithAvailability`, `ReservationInput`, `Reservation`, `Quote`, `Task`, `Conflict`, `AuditEntry`, `RequestAggregate`) per `docs/04-api/TYPE_SHARING.md` (the AI mirrors the full tool surface).
  - Enums are `UPPER_SNAKE` and match `openapi.yaml` exactly; timestamps are RFC-3339 UTC; money fields are integer minor units.
  - Validation is strict enough to power the intake parser's schema-validation step (A00-T04).
  - These mirrors are hand-written (the Python side stays hand-mirrored per the type-sharing posture).

### A00-T04 — NL intake parser → EventRequestInput (schema-validated, 1 retry, canned fallback, low temp)
- Status: not_started
- Depends on: A00-T03
- Estimate: 0.75d
- Acceptance:
  - A parser turns a natural-language brief ("startup conf, 180 ppl, late next month, needs a stage") into a validated `EventRequestInput` (Pydantic from A00-T03), at **low temperature**.
  - On a schema-validation failure it retries **once**; if still invalid it falls back to a **canned** structure for the known demo inputs — never crashes the flow (per `docs/02-domain/AI_ORCHESTRATION.md`, non-negotiable #4).
  - The parser only ever *proposes* the structured input; the actual request is created against the validated shape via ops-core (`POST /requests`).
  - Uses Claude (Anthropic) as the LLM; the prompt + schema are versioned in the repo.

### A00-T05 — LangGraph deterministic planning DAG (fixed order: parse→match→check→reserve→quote→tasks→detect→assemble)
- Status: not_started
- Depends on: A00-T02, A00-T04
- Estimate: 1d
- Acceptance:
  - `app/graph/planning_graph.py` implements a **fixed** LangGraph DAG in the exact order parse → match → check availability → reserve → quote → tasks → detect conflicts → assemble — not an open-ended ReAct agent that re-decides tool order (per `docs/02-domain/AI_ORCHESTRATION.md`, non-negotiable #1).
  - Each node calls the corresponding `ops_core_client` tool; the graph threads the ops-core responses through to the assembly step (no node invents data).
  - The DAG is deterministic: the same input + same ops-core state always traverses the same path and assembles the same plan.
  - The reserve node's `409` short-circuits into the conflict branch (A00-T09) rather than continuing blindly.

### A00-T06 — RAG over ChromaDB (venue facts, setup templates, pricing rules, past events)
- Status: not_started
- Depends on: A00-T03
- Estimate: 0.75d
- Acceptance:
  - `app/rag/chroma.py` indexes and retrieves over ChromaDB collections for venue facts, setup templates, pricing rules, and past events (per `docs/02-domain/AI_ORCHESTRATION.md`).
  - Retrieval augments the planner/copilot (e.g. setup-template retrieval informs the task list the AI proposes) without becoming a source of domain truth — numbers still come from ops-core.
  - The collections are seedable/reproducible for the demo.
  - RAG context is provided to the LLM as grounding, not as authoritative pricing/availability (which remain ops-core's).

### A00-T07 — POST /chat copilot (stateful via Redis sessionId; proposedActions; requiresApproval)
- Status: not_started
- Depends on: A00-T05
- Estimate: 0.75d
- Acceptance:
  - `POST /chat` accepts `{ sessionId, message }` and returns `{ reply, plan?, proposedActions[], requiresApproval }` per `docs/02-domain/AI_ORCHESTRATION.md`; conversation state is kept in Redis keyed by `sessionId` (the AI holds no domain state).
  - `proposedActions` carry typed payloads (e.g. `hold_reservation`) that ops-core re-validates server-side; `requiresApproval` is true for anything that commits (the AI proposes, ops-core authorizes — non-negotiable #3).
  - Once enough info is gathered, `plan` is populated (the `OperationalPlan` from A00-T08).
  - The copilot never commits a reservation/approval on its own; it surfaces the action for a human + ops-core to authorize.

### A00-T08 — POST /plan + OperationalPlan assembly + narrative (numbers injected from ops-core, never hallucinated)
- Status: not_started
- Depends on: A00-T05, A00-T06
- Estimate: 0.5d
- Acceptance:
  - `POST /plan` accepts `{ requestId }` (or a full `EventRequestInput`) and returns the `OperationalPlan` `{ requestId, feasible, space, reservation, quote, tasks, conflicts, alternatives, narrative }` per `docs/02-domain/AI_ORCHESTRATION.md`.
  - The `narrative` is composed *around* the structured plan's values; every number (total, counts, dates) is **injected from the ops-core responses**, never free-generated (non-negotiable #2) — a test asserts the narrative's figures equal the structured `quote.totalMinor`/counts.
  - `feasible: true` populates space/reservation/quote/tasks; `feasible: false` populates `conflicts` + `alternatives` (from the conflict branch).
  - The assembly is the same artifact the operational-plan page renders.

### A00-T09 — conflict branch (catch 409 → alternatives + plain-language explanation, keyed off the planted seed conflict)
- Status: not_started
- Depends on: A00-T05
- Estimate: 0.5d
- Acceptance:
  - When `ops_core_client.hold_reservation` raises the typed `409 conflict` (carrying `Conflict[]`), the branch produces `alternatives[]` (e.g. the unused `preferredDates[]` window, or another matching space) + a plain-language explanation, **keyed off** the returned conflict data — not re-queried, not guessed (per `docs/04-api/ERROR_CONTRACT.md` + `docs/02-domain/CONFLICTS.md`).
  - The explanation reads like "Blue is taken that week; Orange seats 180 in theater — shall I hold it?" — grounded in the `Conflict.detail` + the alternative's real availability.
  - It is exercised against the F12-T04 planted seed conflict (via the mock or the real ops-core) so the demo's conflict moment is reproducible.
  - The branch is deterministic for a given `409` body.

### A00-T10 — build-against-mock harness + one-line flip to real ops-core
- Status: not_started
- Depends on: A00-T02
- Estimate: 0.25d
- Acceptance:
  - The AI runs end-to-end against `mock-ops-core` (the stateful mock that honors the reservation `409` path so the conflict branch is genuinely testable) per `docs/02-domain/AI_ORCHESTRATION.md` (the parallel-dev seam).
  - Switching from the mock to the real service is a **one-line** change (`OPS_CORE_URL`), with no code edits to the client or graph.
  - A harness/test drives the full `/plan` flow + the conflict branch against the mock and asserts the plan + alternatives assemble.
  - Documented so flipping to real ops-core after F13 is trivial.

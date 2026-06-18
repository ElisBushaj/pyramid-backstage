# Domain — AI Orchestration (ai-orchestrator, Alvin's lane)

> **Scope note:** ops-core (Elis) is built in full over the 3 days. This service is **scaffolded** (skeleton + stateful mock + this spec + `docs/06-features/A00`); the LangGraph / RAG / copilot logic is Alvin's to implement. Documented here so ops-core builds the right tool surface and the frontend knows the AI endpoints.

The brain that understands a request and decides what to do. Holds **no domain state** — only conversation context in Redis. Everything true comes from ops-core via the contract; the AI reasons *over* it, never *owns* it.

## Stack
Python · FastAPI · LangGraph · Claude (Anthropic) · ChromaDB (RAG) · Redis (conversation state). One coupling: `OPS_CORE_URL`.

## Endpoints (what the UI calls)
```jsonc
// POST /chat — conversational copilot (stateful via sessionId)
// in:  { "sessionId": "s1", "message": "startup conf, 180 ppl, late next month, needs a stage" }
// out: { "reply": "Yes — Blue Hall fits 180 with a stage…",
//        "plan": { /* OperationalPlan, once enough info gathered */ },
//        "proposedActions": [{ "type": "hold_reservation", "label": "Hold Blue Hall", "payload": {…} }],
//        "requiresApproval": true }

// POST /plan — deterministic "generate the plan" for a known request
// in:  { "requestId": "req_8x2" }   // or a full EventRequestInput
// out: OperationalPlan
```

## OperationalPlan (the headline artifact)
```jsonc
{ "requestId": "req_8x2", "feasible": true,
  "space": { /* Space */ }, "reservation": { /* Reservation */ },
  "quote": { /* Quote */ }, "tasks": [ /* Task[] */ ],
  "conflicts": [], "alternatives": [],     // alternatives populated when feasible=false
  "narrative": "Blue Hall on 22 Jul, theater for 180, stage + 2 mics reserved. Total 134,000 ALL incl. VAT. No conflicts. 6 setup tasks queued." }
```

## Non-negotiables for the AI build (so the demo is flawless)
1. **`POST /plan` is a deterministic graph** (fixed DAG: parse → match → check availability → reserve → quote → tasks → detect conflicts → assemble), **not** an open-ended ReAct agent that re-decides tool order each run. Determinism is what makes it work every time on stage.
2. **Narrative numbers are injected from ops-core responses, never free-generated.** The AI composes prose *around* values from the structured plan; it never invents a total or a count. This keeps ops-core the single source of truth even in the narrative.
3. **The AI proposes; ops-core authorizes.** `proposedActions` payloads are re-validated server-side by ops-core. AI output is untrusted input. Human approval (`requiresApproval`) gates anything that commits.
4. **Structured intake is validated + retried.** NL → `EventRequestInput` goes through schema validation with one retry + a canned fallback for demo inputs; low temperature.
5. **Conflict branch keys off `409 { conflicts }`** from ops-core — deterministic, no guessing.

## Parallel-dev seam
Until ops-core is live, the AI builds against `mock-ops-core` (a **stateful** mock that honors the reservation `409` path so the conflict branch is genuinely testable). Flip `OPS_CORE_URL` from the mock to the real service — a one-line switch — to integrate.

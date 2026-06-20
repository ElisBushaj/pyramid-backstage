# The AI Contract

> The `/chat` + `/plan` surface lives on **`ai-orchestrator`**, not in `ops-core/openapi.yaml`. These are the reasoning layer's *own* endpoints. The frontend mirrors them in `frontend/src/api/types/ai.ts` — a [consumed-but-AI-owned mirror](./TYPE_SHARING.md), separate from the openapi-derived mirrors.

`ai-orchestrator` holds no domain state. Everything true comes from `ops-core` over [the contract](./CONTRACT.md); the AI reasons *over* it. This page is the prose around the AI's outward surface — the shapes the UI sends and receives. Source of truth for these shapes is `ai-orchestrator/app/schemas.py`; the domain rationale is [`docs/02-domain/AI_ORCHESTRATION.md`](../02-domain/AI_ORCHESTRATION.md).

The same discipline as the core contract applies: enums are `UPPER_SNAKE`, timestamps are RFC-3339 UTC `Z`, money is integer `*Minor` units, and any embedded `Space` / `Reservation` / `Quote` / `Task` / `Conflict` is the **same shape** as in `openapi.yaml` (the AI mirrors them in `schemas.py`).

## Endpoints

| Endpoint | Purpose | Returns |
|---|---|---|
| `POST /chat` | Conversational copilot, stateful via `sessionId` | `ChatResponse` |
| `POST /plan` | Deterministic plan for a known (or inline) request | `OperationalPlan` |
| `GET /health` | Liveness | `HealthResponse` |

### `POST /chat`

Conversational. Statefulness is **server-side** on the AI: the caller passes a stable `sessionId` and the orchestrator keeps the conversation context in Redis. The UI sends only the new message.

```jsonc
// request — ChatRequest
{ "sessionId": "s1",
  "message": "startup conf, 180 ppl, late next month, needs a stage" }

// response — ChatResponse
{ "reply": "Yes — Blue Hall fits 180 with a stage…",
  "plan": { /* OperationalPlan, once enough info is gathered (optional) */ },
  "proposedActions": [
    { "type": "hold_reservation", "label": "Hold Blue Hall", "payload": { /* … */ } }
  ],
  "requiresApproval": true }
```

- `reply` — the natural-language turn rendered in the copilot.
- `plan` — optional; present once the conversation has gathered enough to assemble an [`OperationalPlan`](#operationalplan).
- `proposedActions` — zero or more reversible actions the copilot suggests (see [ProposedAction](#proposedaction)). The AI **proposes**; `ops-core` **authorizes**.
- `requiresApproval` — gates anything that commits. `true` (the default) means a human must confirm before any `proposedAction` runs. Nothing mutates `ops-core` straight off a chat turn.

### `POST /plan`

The deterministic planner. Either resolve a request that already exists, **or** plan an inline intake shape:

```jsonc
// request — one of:
{ "requestId": "req_8x2" }            // plan an existing EventRequest
// — or —
{ /* a full EventRequestInput: title, organizerName, expectedAttendees,
     eventType, preferredDates[], requirements? — the openapi intake shape */ }

// response — OperationalPlan
```

`POST /plan` runs a **fixed LangGraph DAG** — parse → match → check availability → reserve → quote → tasks → detect conflicts → assemble — **not** an open-ended agent that re-decides tool order. Determinism is what makes it repeatable on stage. See [`AI_ORCHESTRATION.md` non-negotiable #1](../02-domain/AI_ORCHESTRATION.md).

## Schemas

### OperationalPlan

The headline artifact. Assembled from `ops-core` responses; the embedded `space` / `reservation` / `quote` / `tasks` / `conflicts` are verbatim contract shapes.

```jsonc
{ "requestId": "req_8x2",
  "feasible": true,
  "space": { /* Space | null */ },
  "reservation": { /* Reservation | null */ },
  "quote": { /* Quote | null */ },
  "tasks": [ /* Task[] */ ],
  "conflicts": [ /* Conflict[] */ ],
  "alternatives": [ /* free windows / candidate spaces — populated when feasible=false */ ],
  "narrative": "Blue Hall on 22 Jul, theater for 180, stage + 2 mics reserved. Total 134,000 ALL incl. VAT. No conflicts. 6 setup tasks queued." }
```

- `feasible` — false when no space/window satisfies the request; `alternatives` then carries the fallbacks (an unused `preferredDates` window, a candidate space).
- `conflicts` — the AI's conflict branch keys off `ops-core`'s `409 { conflicts }` ([error contract](./ERROR_CONTRACT.md)); never guessed.
- **`narrative` numbers are injected from `ops-core` responses, never free-generated.** The prose is composed *around* the structured values — the AI never invents a total or a count. `ops-core` stays the single source of truth even inside the sentence. See [`AI_ORCHESTRATION.md` non-negotiable #2](../02-domain/AI_ORCHESTRATION.md).

### ProposedAction

A reversible action the copilot proposes. The AI proposes; `ops-core` authorizes — `payload` is **re-validated server-side** before anything commits (AI output is untrusted input).

```jsonc
{ "type": "hold_reservation", "label": "Hold Blue Hall", "payload": { /* … */ } }
```

| `type` | Maps to (ops-core) |
|---|---|
| `create_request` | `POST /private/requests` |
| `hold_reservation` | `POST /private/reservations` |
| `confirm_reservation` | `POST /private/reservations/:id/confirm` |
| `generate_quote` | `POST /private/quotes` |
| `persist_tasks` | `POST /private/requests/:id/tasks` |
| `approve_request` | `POST /private/requests/:id/approve` (MANAGER+) |
| `reject_request` | `POST /private/requests/:id/reject` (MANAGER+) |

`label` is the human-readable button text; `payload` is the body the corresponding `ops-core` endpoint expects.

### HealthResponse

```jsonc
{ "status": "ok", "service": "ai-orchestrator", "version": "0.1.0" }
```

## AI → ops-core auth

When the planner or copilot calls back into `ops-core`, it authenticates with a **service token** (`OPS_CORE_SERVICE_TOKEN`) and forwards the acting human via `X-Acting-User-Id` / `X-Acting-User-Role` — so audit attribution and partner row-scoping survive the AI hop, under a forwarded-role ceiling (default `MANAGER`). Locked in [ADR-0012](../08-decisions/0012-ai-ops-core-service-token-auth.md); the `ops-core` side of those headers is summarized in [CONTRACT.md](./CONTRACT.md).

## Degrade-to-canned

The frontend treats the AI as **optional**. When `VITE_AI_URL` is unset or the service is unreachable, the [CopilotPanel](../06-features/F18-ai-wiring/SPEC.md) falls back to a canned, deterministic copilot so the demo never depends on the AI being live. The `/plan` artifact has a [v1 FloorMap](../05-frontend/FLOOR_MAP.md) fallback for the same reason. Wiring + fallbacks are [F18](../06-features/F18-ai-wiring/SPEC.md).

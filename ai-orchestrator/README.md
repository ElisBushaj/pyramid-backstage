# ai-orchestrator

> **SCAFFOLD ONLY — Alvin's lane.**
> The AI logic (LangGraph **graph nodes**, **RAG** seeding/retrieval, the chat
> **copilot**) is the backlog in [`docs/06-features/A00-ai-orchestrator`](../docs/06-features/A00-ai-orchestrator).
> Those pieces are intentionally left as clearly-marked stubs
> (`raise NotImplementedError("Alvin: implement <node> — see …A00")`).
> **ops-core is built in full separately** (Elis); this service only *consumes*
> it via the contract.

The brain that understands a request and decides what to do. It holds **no domain
state** — only conversation context (Redis). Everything true comes from **ops-core**
via the contract (`ops-core/openapi.yaml`); the AI reasons *over* it, never *owns*
it. The single runtime coupling is one env var: **`OPS_CORE_URL`**.

Stack: Python 3.12 · FastAPI · LangGraph · Claude (Anthropic, model
`claude-opus-4-8`) · ChromaDB (RAG) · Redis (conversation state).

---

## What's real vs. stubbed

| Piece | State | Notes |
|---|---|---|
| `GET /health` | ✅ **real** | 200 + status body. |
| `POST /chat` | 🟡 **canned** | Returns a well-formed `ChatResponse` (`reply` + empty `proposedActions` + `requiresApproval=true`). TODO → wire the copilot + graph. |
| `POST /plan` | 🟡 **canned** | Returns a well-formed `OperationalPlan` (`feasible=true` + narrative). TODO → wire the graph. |
| `app/ops_core_client.py` | ✅ **real** | Working `httpx.AsyncClient`; one method per contract endpoint; Idempotency-Key on mutations; typed `OpsCoreConflict` on `409 {conflicts}`. |
| `app/schemas.py` | ✅ **real** | Pydantic mirrors of the contract + AI types; UPPER_SNAKE enums as `Literal`s. |
| `app/graph/planning_graph.py` | 🟡 **wiring real, bodies stubbed** | The fixed DAG is fully wired (incl. the conditional conflict branch); each node body raises `NotImplementedError`. |
| `app/rag/chroma.py` | 🟡 **stubbed** | ChromaDB wrapper + `seed_knowledge()` stub. |

---

## Endpoints

```jsonc
// POST /chat — conversational copilot (stateful via sessionId)
// in:  { "sessionId": "s1", "message": "startup conf, 180 ppl, late next month, needs a stage" }
// out: { "reply": "...", "plan": OperationalPlan | null,
//        "proposedActions": ProposedAction[], "requiresApproval": true }

// POST /plan — deterministic "generate the plan" for a known request
// in:  { "requestId": "req_8x2" }   // or a full EventRequestInput
// out: OperationalPlan
```

`OperationalPlan`: `{ requestId, feasible, space?, reservation?, quote?, tasks[],
conflicts[], alternatives[], narrative }`.

---

## The deterministic planning graph

`POST /plan` is a **fixed DAG**, not an open-ended ReAct agent — determinism is
what makes the demo work every time. The wiring in
[`app/graph/planning_graph.py`](app/graph/planning_graph.py) is complete; only
the node bodies are stubs.

```
parse_intake → match_space → check_availability → hold_reservation
hold_reservation ─┬─(no conflict)─► generate_quote → generate_tasks
                  │                   → detect_conflicts → assemble_plan
                  └─(conflict)──────► alternatives ──────► assemble_plan
assemble_plan → END
```

The conflict branch keys off ops-core's **`409 { conflicts }`** (raised as the
typed `OpsCoreConflict` from `ops_core_client`) — deterministic, no guessing.

**Non-negotiables** (see `docs/02-domain/AI_ORCHESTRATION.md`): deterministic DAG;
narrative numbers injected from ops-core (never free-generated); the AI *proposes*
and ops-core *authorizes* (`requiresApproval` gates commits); intake is validated +
retried; the conflict branch keys off `409 {conflicts}`.

---

## Run it

### The build-against-mock seam

Until ops-core is live, build against the **stateful** [`mock-ops-core`](../mock-ops-core)
(port `4010`) — it honors the same `ServiceEnvelope` + error contract and the
**real reservation `409` conflict path**, so the AI's conflict branch is genuinely
testable in isolation. Flip one env var to integrate with the real service — no
code change:

```bash
# against the mock (isolated AI dev)
OPS_CORE_URL=http://localhost:4010/api/v1

# against the real ops-core
OPS_CORE_URL=http://localhost:4000/api/v1
```

### Local (venv)

```bash
cd ai-orchestrator
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env            # then edit OPS_CORE_URL etc.

uvicorn app.main:app --reload --port 8000
# → GET  http://localhost:8000/health
#   POST http://localhost:8000/chat
#   POST http://localhost:8000/plan
#   docs http://localhost:8000/docs
```

Smoke test:

```bash
curl -s localhost:8000/health
curl -s localhost:8000/plan -H 'content-type: application/json' \
  -d '{"requestId":"req_8x2"}'
curl -s localhost:8000/chat -H 'content-type: application/json' \
  -d '{"sessionId":"s1","message":"startup conf, 180 ppl, needs a stage"}'
```

### Docker (dev)

```bash
docker build -f Dockerfile.dev -t ai-orchestrator:dev .
docker run --rm -p 8000:8000 --env-file .env ai-orchestrator:dev
```

---

## Layout

```
ai-orchestrator/
├── pyproject.toml          # deps (fastapi, langgraph, anthropic, chromadb, redis, …)
├── Dockerfile.dev          # python:3.12-slim, uvicorn --reload :8000
├── .env.example            # OPS_CORE_URL, ANTHROPIC_API_KEY, REDIS_URL, CHROMA_URL, …
└── app/
    ├── config.py           # pydantic-settings Settings
    ├── schemas.py          # contract mirrors + AI types (UPPER_SNAKE Literals)
    ├── ops_core_client.py  # httpx async client = the LangGraph tools (REAL)
    ├── main.py             # FastAPI app: /health, /chat, /plan (+ CORS, lifespan)
    ├── graph/
    │   └── planning_graph.py   # fixed DAG; wiring real, node bodies stubbed
    └── rag/
        └── chroma.py           # ChromaDB wrapper + seed_knowledge() stub
```

## For Alvin (next steps)

1. Implement the graph node bodies in `app/graph/planning_graph.py` (each has a
   `TODO (A00)` docstring describing exactly what to call on `ops_core_client`).
2. Implement `KnowledgeBase` + `seed_knowledge()` in `app/rag/chroma.py`.
3. Wire `POST /chat` (Redis session state + copilot) and `POST /plan`
   (`await app.state.graph.ainvoke(...)`) in `app/main.py`.
4. Keep the contract as law — additive changes only; enums stay UPPER_SNAKE.

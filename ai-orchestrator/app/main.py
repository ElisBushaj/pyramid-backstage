"""FastAPI app for ai-orchestrator.

REAL endpoints in this scaffold:
  • ``GET  /health`` — liveness (200), fully working.
  • ``POST /chat``   — returns a well-formed *canned* ChatResponse (the graph is
                       not wired yet). Shape is correct so the frontend can build
                       against it. TODO points at the planning graph.
  • ``POST /plan``   — returns a well-formed *canned* OperationalPlan
                       (feasible=true, narrative present). TODO to wire the graph.

The ops-core HTTP client and the planning graph are constructed in the lifespan
so they're ready the moment Alvin swaps the canned bodies for real graph runs.
CORS is open to the configured frontend origins.

Run locally::

    uvicorn app.main:app --reload --port 8000
    # or: python -m app.main
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .chat import handle_chat
from .config import settings
from .graph import build_planning_graph
from .ops_core_client import OpsCoreClient
from .planning import build_operational_plan
from .rag.chroma import connect_knowledge_base, seed_knowledge
from .schemas import (
    ChatRequest,
    ChatResponse,
    EventRequestInput,
    HealthResponse,
    OperationalPlan,
)
from .session import create_session_store


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Construct shared singletons on startup; tear them down on shutdown.

    The ops-core client + compiled graph live on ``app.state`` so handlers reuse
    one connection pool and one compiled DAG. (The graph's node bodies are stubs;
    compiling it is cheap and validates the wiring at boot.)
    """
    app.state.ops = OpsCoreClient()  # points at settings.OPS_CORE_URL (mock or real)
    app.state.graph = build_planning_graph()
    # Conversation memory: Redis when reachable, else an in-memory fallback (the call
    # never raises — it pings once and degrades silently). Shared across requests.
    app.state.sessions = await create_session_store()
    # Venue knowledge (RAG): connect to ChromaDB if present, else a no-op KB. Seeding
    # runs in the BACKGROUND so a first-time embedding-model download can't block
    # readiness; early queries just fall back until it finishes.
    app.state.kb = connect_knowledge_base()
    seed_task: asyncio.Task | None = None
    if app.state.kb.available:
        async def _seed() -> None:
            try:
                from .venue import get_venue

                await asyncio.to_thread(seed_knowledge, app.state.kb, get_venue())
            except Exception:
                pass

        seed_task = asyncio.create_task(_seed())
    # Warm the Anthropic connection so the first user request isn't a cold start.
    if settings.ANTHROPIC_API_KEY:
        try:
            from .intake import _anthropic

            await _anthropic().messages.create(
                model=settings.FAST_MODEL, max_tokens=1,
                messages=[{"role": "user", "content": "hi"}],
            )
        except Exception:
            pass
    try:
        yield
    finally:
        if seed_task is not None:
            seed_task.cancel()
        await app.state.ops.aclose()
        await app.state.sessions.aclose()


app = FastAPI(
    title="Pyramid Backstage — ai-orchestrator",
    version=__version__,
    summary="AI copilot + deterministic planner (SCAFFOLD — Alvin's lane).",
    lifespan=lifespan,
)

# ── CORS for the frontend ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═════════════════════════════════════════════════════════════════════════════
# Health — REAL.
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health() -> HealthResponse:
    """Liveness probe. Returns 200 with a small status body."""
    return HealthResponse(version=__version__)


# ═════════════════════════════════════════════════════════════════════════════
# Chat — STUBBED canned response (well-formed shape). TODO: wire the graph.
# ═════════════════════════════════════════════════════════════════════════════
@app.post("/chat", response_model=ChatResponse, tags=["ai"])
async def chat(req: ChatRequest) -> ChatResponse:
    """Conversational copilot (stateful via ``sessionId``).

    Gathers intake across turns (Redis-backed session, in-memory fallback); once it
    has enough, runs the planning DAG and attaches the ``OperationalPlan`` +
    ``proposedActions`` gated by ``requiresApproval`` — the AI proposes; a human +
    ops-core authorize (#3). A standing plan is re-served for conversational
    follow-ups, so a session never spawns duplicate reservation holds.
    """
    return await handle_chat(
        req.sessionId, req.message,
        ops=app.state.ops, graph=app.state.graph,
        sessions=app.state.sessions, kb=app.state.kb,
    )


# ═════════════════════════════════════════════════════════════════════════════
# Plan — STUBBED canned plan (feasible=true + narrative). TODO: wire the graph.
# ═════════════════════════════════════════════════════════════════════════════
class PlanRequest(EventRequestInput):
    """Body for ``POST /plan``.

    Either reference an existing request via ``requestId`` OR pass a full
    ``EventRequestInput`` (this model extends it, so all intake fields are
    accepted). All fields are optional here so the scaffold accepts either form.
    """

    # Make the inherited required intake fields optional for the scaffold so a
    # bare ``{"requestId": "req_8x2"}`` validates. The real handler validates
    # properly per branch (existing-request vs full-intake).
    requestId: str | None = None
    text: str | None = None  # raw NL brief -> parsed to EventRequestInput
    title: str | None = None  # type: ignore[assignment]
    organizerName: str | None = None  # type: ignore[assignment]
    expectedAttendees: int | None = None  # type: ignore[assignment]
    eventType: str | None = None  # type: ignore[assignment]
    preferredDates: list | None = None  # type: ignore[assignment]


@app.post("/plan", response_model=OperationalPlan, tags=["ai"])
async def plan(req: PlanRequest) -> OperationalPlan:
    """Deterministic "generate the plan" via the compiled planning DAG.

    Either references an existing request (``requestId``) or accepts a full
    ``EventRequestInput`` (this model extends it). The fixed DAG threads ops-core
    responses through to assembly — parse → match → check → reserve → quote →
    tasks → detect conflicts → assemble — and every narrative number is injected
    from those responses, never free-generated (non-negotiable #2).
    """
    state: dict = {"ops": app.state.ops}
    if req.requestId:
        state["request_id"] = req.requestId
    elif req.text:
        state["nl_text"] = req.text
    else:
        state["intake"] = EventRequestInput(
            title=req.title or "Untitled event",
            organizerName=req.organizerName or "Unknown",
            contactEmail=req.contactEmail,
            contactPhone=req.contactPhone,
            expectedAttendees=req.expectedAttendees or 1,
            eventType=req.eventType or "OTHER",
            preferredDates=req.preferredDates or [],
            requirements=req.requirements,
        )

    result = await app.state.graph.ainvoke(state)
    return build_operational_plan(result, req.requestId)


def run() -> None:
    """Console-script entrypoint: ``ai-orchestrator`` → uvicorn on :8000."""
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    run()

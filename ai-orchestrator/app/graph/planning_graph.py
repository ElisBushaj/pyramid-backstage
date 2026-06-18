"""Deterministic planning graph — a FIXED DAG (LangGraph ``StateGraph``).

╔══════════════════════════════════════════════════════════════════════════════╗
║ SCAFFOLD ONLY — Alvin's lane.                                                  ║
║                                                                               ║
║ The GRAPH WIRING below is COMPLETE and CORRECT. It encodes the                ║
║ deterministic-DAG requirement (AI_ORCHESTRATION.md non-negotiable #1): the    ║
║ planner is a fixed pipeline of named nodes, NOT an open-ended ReAct agent     ║
║ that re-decides tool order each run. Determinism is what makes the demo work  ║
║ every time on stage.                                                          ║
║                                                                               ║
║ Each node BODY is a stub: a typed function with a docstring describing what   ║
║ to implement and a `raise NotImplementedError(...)` (or a TODO passthrough)   ║
║ pointing at docs/06-features/A00-ai-orchestrator. Implement the bodies;       ║
║ DO NOT change the wiring (the topology IS the spec).                          ║
╚══════════════════════════════════════════════════════════════════════════════╝

The DAG (linear spine + one conditional branch):

    parse_intake
        → match_space
        → check_availability
        → hold_reservation ──(conflict)──► alternatives ─┐
        → generate_quote                                  │
        → generate_tasks                                  │
        → detect_conflicts                                │
        → assemble_plan ◄─────────────────────────────────┘
        → END

``hold_reservation`` is the branch point: on an ops-core 409 conflict
(``OpsCoreConflict``) the conditional edge routes to ``alternatives`` (which
surfaces unused ``preferredDates`` windows / other spaces) and then jumps
straight to ``assemble_plan`` with ``feasible=False``. The happy path continues
down the spine. The conflict branch keys off ``409 {conflicts}`` — deterministic,
no guessing (non-negotiable #5).
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from ..ops_core_client import OpsCoreClient
from ..schemas import (
    Conflict,
    EventRequestInput,
    Quote,
    Reservation,
    Space,
    Task,
)

_A00 = "Alvin: implement {node} — see docs/06-features/A00-ai-orchestrator"


# ═════════════════════════════════════════════════════════════════════════════
# Graph state — threaded through every node. Nodes return partial updates.
# ═════════════════════════════════════════════════════════════════════════════
class PlanState(TypedDict, total=False):
    """Shared state for the planning DAG.

    Inputs (set before invoking the graph):
      ops:          the OpsCoreClient (injected tool handle).
      request_id:   an existing EventRequest id, OR
      intake:       a parsed EventRequestInput (when starting from NL/structured).

    Filled in as the DAG runs:
      space, reservation, quote, tasks, conflicts, alternatives, feasible,
      narrative — these become the OperationalPlan in ``assemble_plan``.
    """

    # ── injected ─────────────────────────────────────────────────────────────
    ops: OpsCoreClient
    request_id: str
    intake: EventRequestInput | None

    # ── working / outputs ────────────────────────────────────────────────────
    chosen_window: dict[str, str] | None  # the preferredDates entry being tried
    space: Space | None
    reservation: Reservation | None
    quote: Quote | None
    tasks: list[Task]
    conflicts: list[Conflict]
    alternatives: list[dict[str, Any]]
    feasible: bool
    narrative: str


# ═════════════════════════════════════════════════════════════════════════════
# NODES — typed stubs. Implement each body; keep the signatures + names.
# Each is ``async def node(state) -> partial-state-update``.
# ═════════════════════════════════════════════════════════════════════════════
async def parse_intake(state: PlanState) -> dict[str, Any]:
    """Node ``parse_intake`` — normalize the request into a structured shape.

    TODO (A00): If ``state['intake']`` is set, validate it against
    ``EventRequestInput`` (one retry + canned fallback for demo inputs; low
    temperature — non-negotiable #4) and ``ops.create_request(...)`` to mint an
    EventRequest, capturing ``request_id``. If ``state['request_id']`` is already
    set, fetch the aggregate to hydrate. Pick the first ``preferredDates`` window
    into ``chosen_window``.
    """
    raise NotImplementedError(_A00.format(node="parse_intake"))


async def match_space(state: PlanState) -> dict[str, Any]:
    """Node ``match_space`` — choose the best-fit space for the request.

    TODO (A00): Call ``ops.match_spaces(min_capacity=..., layout=...,
    start=..., end=...)`` for ``chosen_window`` and pick the first feasible
    Space (RAG can rank on features/past events). Store it in ``state['space']``.
    """
    raise NotImplementedError(_A00.format(node="match_space"))


async def check_availability(state: PlanState) -> dict[str, Any]:
    """Node ``check_availability`` — confirm the space + assets for the window.

    TODO (A00): Call ``ops.check_space_availability(...)`` and
    ``ops.check_assets(...)`` (buffer-aware) for ``chosen_window``. This is a
    pre-flight read; the authoritative re-check happens atomically inside
    ``hold_reservation`` (RESERVATIONS.md — the write re-validates, killing the
    TOCTOU race). If this read already shows no capacity, the planner may try the
    next ``preferredDates`` window before attempting a hold.
    """
    raise NotImplementedError(_A00.format(node="check_availability"))


async def hold_reservation(state: PlanState) -> dict[str, Any]:
    """Node ``hold_reservation`` — atomically hold the space + assets.

    THE BRANCH POINT. TODO (A00): Call ``ops.hold_reservation(ReservationInput)``.
      • Success → store ``state['reservation']`` (HELD, with expiresAt) and let
        the spine continue to ``generate_quote``.
      • ``OpsCoreConflict`` → catch it, write ``state['conflicts'] =
        exc.conflicts`` and ``state['feasible'] = False``; the conditional edge
        (``_after_hold``) then routes to ``alternatives``. DO catch the conflict
        HERE so the branch can read ``conflicts`` off state.
    """
    raise NotImplementedError(_A00.format(node="hold_reservation"))


async def generate_quote(state: PlanState) -> dict[str, Any]:
    """Node ``generate_quote`` — produce a priced quote (server-computed total).

    TODO (A00): Call ``ops.generate_quote(request_id=..., reservation_id=...)``.
    Store ``state['quote']``. Never compute the total client-side — ops-core
    owns ``netMinor``/``vatMinor``/``totalMinor`` (CONTRACT.md rule #6).
    """
    raise NotImplementedError(_A00.format(node="generate_quote"))


async def generate_tasks(state: PlanState) -> dict[str, Any]:
    """Node ``generate_tasks`` — derive + persist a setup/teardown task list.

    TODO (A00): Build a SETUP/TEARDOWN ``TaskInput[]`` (RAG setup templates keyed
    on space + layout + attendees), then ``ops.persist_tasks(request_id, tasks)``.
    Store the returned ``state['tasks']`` (AI-generated, human-owned).
    """
    raise NotImplementedError(_A00.format(node="generate_tasks"))


async def detect_conflicts(state: PlanState) -> dict[str, Any]:
    """Node ``detect_conflicts`` — final proactive conflict sweep (happy path).

    TODO (A00): Call ``ops.detect_conflicts(space_id=..., start=..., end=...)``
    for the reserved window as a belt-and-suspenders check before assembling the
    plan. Append anything found to ``state['conflicts']`` (normally empty here —
    the hold already succeeded). Leave ``feasible`` True unless something fires.
    """
    raise NotImplementedError(_A00.format(node="detect_conflicts"))


async def alternatives(state: PlanState) -> dict[str, Any]:
    """Node ``alternatives`` — build the fallback story when a hold conflicts.

    TODO (A00): Reached only via the conditional edge from ``hold_reservation``
    on conflict. Populate ``state['alternatives']`` from the UNUSED
    ``preferredDates`` windows and/or other matching spaces ("Blue is taken on
    the 22nd, but it's free on your alternate date, the 24th"). Keep
    ``feasible=False`` and the ``conflicts`` already on state. Flows to
    ``assemble_plan``.
    """
    raise NotImplementedError(_A00.format(node="alternatives"))


async def assemble_plan(state: PlanState) -> dict[str, Any]:
    """Node ``assemble_plan`` — compose the OperationalPlan + narrative.

    TODO (A00): Assemble the final ``OperationalPlan`` fields from state. Compose
    the ``narrative`` prose AROUND values pulled from the structured plan —
    NEVER free-generate a total or a count (non-negotiable #2). On the conflict
    path, narrate the conflict + the ``alternatives``. Set ``state['narrative']``
    (and any remaining plan fields). This is the terminal node before END.
    """
    raise NotImplementedError(_A00.format(node="assemble_plan"))


# ═════════════════════════════════════════════════════════════════════════════
# Conditional edge — the conflict branch decision.
# ═════════════════════════════════════════════════════════════════════════════
def _after_hold(state: PlanState) -> str:
    """Route after ``hold_reservation``.

    Deterministic: if a conflict was recorded (``feasible`` False or
    ``conflicts`` non-empty), branch to ``alternatives``; otherwise continue the
    happy-path spine to ``generate_quote``. Keys off ``409 {conflicts}`` state —
    no model call, no guessing (non-negotiable #5).
    """
    if state.get("feasible") is False or state.get("conflicts"):
        return "alternatives"
    return "generate_quote"


# ═════════════════════════════════════════════════════════════════════════════
# Graph builder — COMPLETE, CORRECT WIRING. (Do not change the topology.)
# ═════════════════════════════════════════════════════════════════════════════
def build_planning_graph() -> Any:
    """Build + compile the deterministic planning ``StateGraph``.

    Topology (fixed DAG):

        parse_intake → match_space → check_availability → hold_reservation
        hold_reservation ─┬─(no conflict)─► generate_quote → generate_tasks
                          │                   → detect_conflicts → assemble_plan
                          └─(conflict)──────► alternatives ──────► assemble_plan
        assemble_plan → END

    Returns the compiled graph; ``await graph.ainvoke(PlanState(...))`` runs it.
    """
    g: StateGraph = StateGraph(PlanState)

    # ── register the named nodes ─────────────────────────────────────────────
    g.add_node("parse_intake", parse_intake)
    g.add_node("match_space", match_space)
    g.add_node("check_availability", check_availability)
    g.add_node("hold_reservation", hold_reservation)
    g.add_node("generate_quote", generate_quote)
    g.add_node("generate_tasks", generate_tasks)
    g.add_node("detect_conflicts", detect_conflicts)
    g.add_node("alternatives", alternatives)
    g.add_node("assemble_plan", assemble_plan)

    # ── linear spine up to the branch point ──────────────────────────────────
    g.set_entry_point("parse_intake")
    g.add_edge("parse_intake", "match_space")
    g.add_edge("match_space", "check_availability")
    g.add_edge("check_availability", "hold_reservation")

    # ── the conditional conflict branch ──────────────────────────────────────
    g.add_conditional_edges(
        "hold_reservation",
        _after_hold,
        {
            "generate_quote": "generate_quote",  # happy path
            "alternatives": "alternatives",  # conflict path
        },
    )

    # ── happy-path tail ──────────────────────────────────────────────────────
    g.add_edge("generate_quote", "generate_tasks")
    g.add_edge("generate_tasks", "detect_conflicts")
    g.add_edge("detect_conflicts", "assemble_plan")

    # ── conflict-path tail rejoins at assemble_plan ──────────────────────────
    g.add_edge("alternatives", "assemble_plan")

    # ── terminal ─────────────────────────────────────────────────────────────
    g.add_edge("assemble_plan", END)

    return g.compile()

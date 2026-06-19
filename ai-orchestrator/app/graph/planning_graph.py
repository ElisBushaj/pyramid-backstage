"""Deterministic planning graph — a FIXED DAG (LangGraph ``StateGraph``).

╔══════════════════════════════════════════════════════════════════════════════╗
║ PHASE A — Alvin's lane. The deterministic spine is now IMPLEMENTED.            ║
║                                                                               ║
║ The wiring is unchanged (the topology IS the spec — AI_ORCHESTRATION.md        ║
║ non-negotiable #1: a fixed pipeline, not an open ReAct loop). Each node body   ║
║ now calls the corresponding ``ops_core_client`` tool and threads the real      ║
║ ops-core responses through state. No node invents data; the narrative is       ║
║ composed AROUND injected values (non-negotiable #2).                           ║
║                                                                               ║
║ Phase A intentionally uses NO LLM and NO RAG: ``parse_intake`` takes a         ║
║ structured ``EventRequestInput`` (the NL parser lands in Phase B) and          ║
║ ``generate_tasks`` uses a rule-based template (RAG templates land in Phase C). ║
║ Asset selection + bundles are deliberately simple here.                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

The DAG (linear spine + one conditional branch):

    parse_intake → match_space → check_availability → hold_reservation
    hold_reservation ─┬─(no conflict)─► generate_quote → generate_tasks
                      │                   → detect_conflicts → assemble_plan
                      └─(conflict)──────► alternatives ──────► assemble_plan
    assemble_plan → END
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from ..ops_core_client import OpsCoreClient, OpsCoreConflict
from ..schemas import (
    Conflict,
    DateRange,
    EventRequest,
    EventRequestInput,
    Quote,
    Reservation,
    ReservedAsset,
    ReservationInput,
    Space,
    Task,
    TaskInput,
)


# ═════════════════════════════════════════════════════════════════════════════
# Graph state — threaded through every node. Nodes return partial updates.
# ═════════════════════════════════════════════════════════════════════════════
class PlanState(TypedDict, total=False):
    """Shared state for the planning DAG.

    Inputs (set before invoking the graph):
      ops:          the OpsCoreClient (injected tool handle).
      request_id:   an existing EventRequest id, OR
      intake:       a parsed EventRequestInput (when starting from structured intake).

    Filled in as the DAG runs.
    """

    # ── injected ─────────────────────────────────────────────────────────────
    ops: OpsCoreClient
    request_id: str
    intake: EventRequestInput | None

    # ── hydrated from the request ──────────────────────────────────────────────
    request_obj: EventRequest | None
    windows: list[DateRange]
    chosen_window: DateRange | None
    attendees: int | None
    layout: str | None
    av_needed: bool
    reserved_assets: list[ReservedAsset]

    # ── working / outputs ────────────────────────────────────────────────────
    space: Space | None
    reservation: Reservation | None
    quote: Quote | None
    tasks: list[Task]
    conflicts: list[Conflict]
    alternatives: list[dict[str, Any]]
    feasible: bool
    narrative: str


# ═════════════════════════════════════════════════════════════════════════════
# NODES — each ``async def node(state) -> partial-state-update``.
# ═════════════════════════════════════════════════════════════════════════════
async def parse_intake(state: PlanState) -> dict[str, Any]:
    """Normalize the request into structured state.

    Phase A: if ``intake`` is set, create the request in ops-core; otherwise
    hydrate from an existing ``request_id``. Pick the first preferred window.
    (Phase B replaces the structured-intake assumption with the NL parser.)
    """
    ops = state["ops"]
    intake = state.get("intake")
    if intake is not None:
        req = await ops.create_request(intake)
    else:
        agg = await ops.get_request_aggregate(state["request_id"])
        req = agg.request
        if req is None:
            raise ValueError(f"request {state['request_id']} not found")

    windows = req.preferredDates or []
    requirements = req.requirements
    return {
        "request_id": req.id,
        "request_obj": req,
        "windows": windows,
        "chosen_window": windows[0] if windows else None,
        "attendees": req.expectedAttendees,
        "layout": requirements.layout if requirements else None,
        "av_needed": bool(requirements.avNeeded) if requirements else False,
    }


async def match_space(state: PlanState) -> dict[str, Any]:
    """Choose the best-fit space for the request window.

    Phase A: ask ops-core for spaces matching capacity + layout in the window,
    prefer one flagged available. (RAG ranking + space bundles land in Phase C.)
    """
    win = state.get("chosen_window")
    if win is None:
        return {"feasible": False}

    spaces = await state["ops"].match_spaces(
        min_capacity=state.get("attendees"),
        layout=state.get("layout"),
        start=win.start,
        end=win.end,
    )
    chosen = next((s for s in spaces if s.available is not False), None)
    if chosen is None and spaces:
        # No flagged-free match: take the first fit anyway; the atomic hold will
        # surface the real conflict (TOCTOU-safe — the write re-checks).
        chosen = spaces[0]
    return {"space": chosen}


async def check_availability(state: PlanState) -> dict[str, Any]:
    """Pre-flight read + asset selection for the window.

    Phase A: pick concrete assets to reserve — seating = attendees, plus 2 mics
    when AV is needed — from live windowed inventory. The authoritative re-check
    happens atomically inside ``hold_reservation``.
    """
    ops = state["ops"]
    space = state.get("space")
    win = state.get("chosen_window")
    if space is None or win is None:
        return {}

    reserved: list[ReservedAsset] = []
    attendees = state.get("attendees") or 0
    if attendees > 0:
        seating = await ops.check_assets(asset_type="SEATING", start=win.start, end=win.end)
        if seating:
            reserved.append(ReservedAsset(assetId=seating[0].id, quantity=attendees))
    if state.get("av_needed"):
        mics = await ops.check_assets(asset_type="MICROPHONE", start=win.start, end=win.end)
        if mics:
            reserved.append(ReservedAsset(assetId=mics[0].id, quantity=2))
    return {"reserved_assets": reserved}


async def hold_reservation(state: PlanState) -> dict[str, Any]:
    """Atomically hold space + assets. THE BRANCH POINT.

    Success → ``reservation`` + ``feasible=True`` (spine continues). On
    ``OpsCoreConflict`` (ops-core 409) → record ``conflicts`` + ``feasible=False``
    so ``_after_hold`` routes to ``alternatives`` (non-negotiable #5).
    """
    space = state.get("space")
    win = state.get("chosen_window")
    if space is None or win is None:
        return {"feasible": False, "conflicts": []}

    body = ReservationInput(
        requestId=state["request_id"],
        spaceId=space.id,
        dateRange=win,
        assets=state.get("reserved_assets", []),
        holdMinutes=30,
    )
    try:
        reservation = await state["ops"].hold_reservation(body)
    except OpsCoreConflict as exc:
        return {"feasible": False, "conflicts": exc.conflicts}
    return {"feasible": True, "reservation": reservation}


async def generate_quote(state: PlanState) -> dict[str, Any]:
    """Produce a priced quote — ops-core owns net/VAT/total (CONTRACT.md rule #6)."""
    reservation = state.get("reservation")
    if reservation is None:
        return {}
    quote = await state["ops"].generate_quote(
        request_id=state["request_id"], reservation_id=reservation.id
    )
    return {"quote": quote}


async def generate_tasks(state: PlanState) -> dict[str, Any]:
    """Derive + persist a SETUP/TEARDOWN task list.

    Phase A: rule-based template. (Phase C keys templates on RAG setup templates
    by space + layout + size.)
    """
    reservation = state.get("reservation")
    if reservation is None:
        return {}

    layout = state.get("layout") or "FLEXIBLE"
    attendees = state.get("attendees") or 0
    plan: list[TaskInput] = [
        TaskInput(
            title=f"Set up {layout} seating ({attendees})",
            phase="SETUP",
            owner="ops_team",
            dueOffsetHours=-4,
        )
    ]
    if state.get("av_needed"):
        plan.append(
            TaskInput(title="AV + sound check", phase="SETUP", owner="av_team", dueOffsetHours=-2)
        )
    plan.append(
        TaskInput(title="Strike seating + clean", phase="TEARDOWN", owner="ops_team", dueOffsetHours=2)
    )
    tasks = await state["ops"].persist_tasks(state["request_id"], plan)
    return {"tasks": tasks}


async def detect_conflicts(state: PlanState) -> dict[str, Any]:
    """Final proactive sweep on the happy path (belt-and-suspenders).

    Excludes the reservation we just created (otherwise ops-core reports our own
    hold as a self-conflict).
    """
    space = state.get("space")
    win = state.get("chosen_window")
    if not state.get("feasible") or space is None or win is None:
        return {}

    found = await state["ops"].detect_conflicts(space_id=space.id, start=win.start, end=win.end)
    rid = state["request_id"]
    found = [c for c in found if rid not in (c.conflictingRequestIds or [])]
    if found:
        return {"conflicts": state.get("conflicts", []) + found}
    return {}


async def alternatives(state: PlanState) -> dict[str, Any]:
    """Build the fallback story when a hold conflicts.

    Keyed off the conflict already on state. Offers unused preferred windows and
    any other space free in the chosen window — grounded, not guessed.
    """
    ops = state["ops"]
    alts: list[dict[str, Any]] = []

    for w in state.get("windows", [])[1:]:
        alts.append(
            {
                "type": "ALTERNATE_WINDOW",
                "dateRange": {"start": w.start, "end": w.end},
                "detail": f"Your alternate date {w.start[:10]} may be free.",
            }
        )

    win = state.get("chosen_window")
    booked_id = state["space"].id if state.get("space") else None
    if win is not None:
        spaces = await ops.match_spaces(
            min_capacity=state.get("attendees"),
            layout=state.get("layout"),
            start=win.start,
            end=win.end,
        )
        for s in spaces:
            if s.id != booked_id and s.available is True:
                alts.append(
                    {
                        "type": "ALTERNATE_SPACE",
                        "spaceId": s.id,
                        "spaceName": s.name,
                        "detail": f"{s.name} is free for your window and fits {state.get('attendees')}.",
                    }
                )

    return {"alternatives": alts, "feasible": False}


async def assemble_plan(state: PlanState) -> dict[str, Any]:
    """Compose the narrative AROUND injected values — never free-generate a number."""
    feasible = bool(state.get("feasible"))
    space = state.get("space")
    quote = state.get("quote")
    tasks = state.get("tasks", [])
    conflicts = state.get("conflicts", [])
    alts = state.get("alternatives", [])
    win = state.get("chosen_window")
    attendees = state.get("attendees")
    layout = state.get("layout") or "flexible layout"

    if feasible and space is not None:
        date = win.start[:10] if win else "the requested date"
        if quote is not None:
            money = f"{quote.totalMinor:,} ALL incl. VAT"
        else:
            money = "a quote on request"
        conflict_note = "No conflicts." if not conflicts else f"{len(conflicts)} conflict(s) flagged."
        narrative = (
            f"{space.name} on {date}, {layout} for {attendees}. "
            f"{len(tasks)} setup/teardown task(s) queued. Total {money}. {conflict_note}"
        )
    else:
        reason = (
            conflicts[0].detail
            if conflicts
            else "No matching space or inventory for the requested window."
        )
        alt_txt = (" " + alts[0]["detail"]) if alts else ""
        narrative = f"Not feasible as requested: {reason}{alt_txt}"

    return {"feasible": feasible, "narrative": narrative}


# ═════════════════════════════════════════════════════════════════════════════
# Conditional edge — the conflict branch decision.
# ═════════════════════════════════════════════════════════════════════════════
def _after_hold(state: PlanState) -> str:
    """Route after ``hold_reservation`` — deterministic, keyed off state."""
    if state.get("feasible") is False or state.get("conflicts"):
        return "alternatives"
    return "generate_quote"


# ═════════════════════════════════════════════════════════════════════════════
# Graph builder — COMPLETE, CORRECT WIRING. (Do not change the topology.)
# ═════════════════════════════════════════════════════════════════════════════
def build_planning_graph() -> Any:
    """Build + compile the deterministic planning ``StateGraph``."""
    g: StateGraph = StateGraph(PlanState)

    g.add_node("parse_intake", parse_intake)
    g.add_node("match_space", match_space)
    g.add_node("check_availability", check_availability)
    g.add_node("hold_reservation", hold_reservation)
    g.add_node("generate_quote", generate_quote)
    g.add_node("generate_tasks", generate_tasks)
    g.add_node("detect_conflicts", detect_conflicts)
    g.add_node("alternatives", alternatives)
    g.add_node("assemble_plan", assemble_plan)

    g.set_entry_point("parse_intake")
    g.add_edge("parse_intake", "match_space")
    g.add_edge("match_space", "check_availability")
    g.add_edge("check_availability", "hold_reservation")

    g.add_conditional_edges(
        "hold_reservation",
        _after_hold,
        {
            "generate_quote": "generate_quote",  # happy path
            "alternatives": "alternatives",  # conflict path
        },
    )

    g.add_edge("generate_quote", "generate_tasks")
    g.add_edge("generate_tasks", "detect_conflicts")
    g.add_edge("detect_conflicts", "assemble_plan")
    g.add_edge("alternatives", "assemble_plan")
    g.add_edge("assemble_plan", END)

    return g.compile()

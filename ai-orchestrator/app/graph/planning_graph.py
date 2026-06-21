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

import re
from datetime import datetime, timedelta
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from ..config import settings
from ..intake import _anthropic, parse_event_request
from ..ops_core_client import OpsCoreClient, OpsCoreConflict
from ..schemas import (
    Conflict,
    DateRange,
    EventRequest,
    EventRequestInput,
    Quote,
    Reservation,
    ReservationInput,
    ReservedAsset,
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
    nl_text: str

    # ── hydrated from the request ──────────────────────────────────────────────
    request_obj: EventRequest | None
    windows: list[DateRange]
    chosen_window: DateRange | None
    attendees: int | None
    event_type: str | None
    layout: str | None
    av_needed: bool
    overflow_needed: int  # headcount the primary hall can't seat -> drives multi-space bundle
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
    bundle: list[dict[str, Any]]
    warnings: list[str]
    map_state: list[dict[str, Any]]


# ═════════════════════════════════════════════════════════════════════════════
# NODES — each ``async def node(state) -> partial-state-update``.
# ═════════════════════════════════════════════════════════════════════════════
async def parse_intake(state: PlanState) -> dict[str, Any]:
    """Normalize the request into structured state.

    NL text (``nl_text``) -> ``EventRequestInput`` via the parser (Phase B), or a
    pre-structured ``intake``; then create the request in ops-core. If a
    ``request_id`` is given instead, hydrate the existing request. Pick the first
    preferred window.
    """
    ops = state["ops"]
    intake = state.get("intake")
    if intake is None and state.get("nl_text"):
        intake = await parse_event_request(state["nl_text"])
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
        "event_type": req.eventType,
        "layout": requirements.layout if requirements else None,
        "av_needed": bool(requirements.avNeeded) if requirements else False,
    }


_SEATED_LAYOUTS = frozenset(
    {"THEATER", "CLASSROOM", "BANQUET", "RECEPTION", "CABARET", "BOARDROOM"}
)


def _fit_capacity(space: Space, layout: str | None) -> int:
    """Capacity for the requested layout — or the space's BEST capacity when the layout
    is CUSTOM/flexible (or one the space isn't sized for). A flexible event can use the
    room's best setup, so it must never read as "no space fits"."""
    caps = space.capacities or {}
    if layout and layout in caps:
        return caps[layout]
    return max(caps.values()) if caps else 0


async def match_space(state: PlanState) -> dict[str, Any]:
    """Choose the best-fit BOOKABLE space for the window, ranked by capacity-for-setup.

    Prefer the SMALLEST bookable space that seats the headcount at the requested
    layout. When none can (the real Pyramid halls are modest — the main hall seats
    ~106 theatre), fall back to the LARGEST available hall as the plenary and record
    the ``overflow`` so the bundle adds breakouts / additional halls (spec §4,
    multi-space). Non-bookable spaces carry no capacities, so they are never chosen;
    the atomic hold still re-checks availability (TOCTOU-safe).
    """
    win = state.get("chosen_window")
    if win is None:
        return {"feasible": False}

    attendees = state.get("attendees") or 0
    layout = state.get("layout")
    # CUSTOM/flexible (or any layout no space is sized for) must NOT filter ops-core by
    # layout — that returns zero spaces and the plan reads "no matching space" even though
    # the venue can host the event. Query unfiltered and rank by best-fit capacity instead.
    query_layout = layout if layout in _SEATED_LAYOUTS else None
    spaces = await state["ops"].match_spaces(layout=query_layout, start=win.start, end=win.end)

    def cap(s: Space) -> int:
        return _fit_capacity(s, layout)

    candidates = [s for s in spaces if cap(s) > 0]  # has bookable capacity for this event
    available = [s for s in candidates if s.available is not False]
    fits = [s for s in available if cap(s) >= attendees]
    if fits:
        chosen = min(fits, key=cap)        # smallest sufficient AVAILABLE space
    elif candidates:
        # No single available space seats them -> take the designated plenary (the largest
        # hall by capacity). If it's occupied, the atomic hold surfaces the conflict and we
        # branch to alternatives; otherwise we proceed with an overflow/breakout bundle.
        chosen = max(candidates, key=cap)
    else:
        chosen = None
    overflow = max(0, attendees - cap(chosen)) if chosen else 0
    return {"space": chosen, "overflow_needed": overflow}


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
        TaskInput(
            title="Strike seating + clean", phase="TEARDOWN", owner="ops_team", dueOffsetHours=2
        )
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
    space = state.get("space")
    booked_id = space.id if space else None
    layout = state.get("layout")
    if win is not None:
        # No unused preferred date? Probe the next few days for the SAME hall being free,
        # so a single-date clash still yields a concrete alternate DATE the Re-plan button
        # can act on — not just other halls inside the same busy window.
        has_window_alt = any(a.get("type") == "ALTERNATE_WINDOW" for a in alts)
        if space is not None and not has_window_alt:
            try:
                s0 = datetime.fromisoformat(win.start.replace("Z", "+00:00"))
                dur = datetime.fromisoformat(win.end.replace("Z", "+00:00")) - s0
                for days in (1, 2, 3, 7):
                    ns = s0 + timedelta(days=days)
                    iso_s = ns.isoformat().replace("+00:00", "Z")
                    iso_e = (ns + dur).isoformat().replace("+00:00", "Z")
                    avail = await ops.check_space_availability(space.id, start=iso_s, end=iso_e)
                    if avail.available:
                        alts.insert(0, {
                            "type": "ALTERNATE_WINDOW",
                            "dateRange": {"start": iso_s, "end": iso_e},
                            "detail": f"{space.name} is free on {ns.date().isoformat()} "
                                      "— want me to move it there?",
                        })
                        break
            except Exception:
                pass

        # Offer the largest OTHER bookable halls free in this window (no hard capacity
        # gate — the modest halls combine, so a free hall is a valid starting point).
        query_layout = layout if layout in _SEATED_LAYOUTS else None
        spaces = await ops.match_spaces(layout=query_layout, start=win.start, end=win.end)

        def cap(s: Space) -> int:
            return _fit_capacity(s, layout)

        free = sorted(
            (s for s in spaces if s.id != booked_id and s.available is True and cap(s) > 0),
            key=cap,
            reverse=True,
        )
        for s in free[:3]:
            alts.append(
                {
                    "type": "ALTERNATE_SPACE",
                    "spaceId": s.id,
                    "spaceName": s.name,
                    "detail": f"{s.name} is free in your window (seats ~{cap(s)}).",
                }
            )

    return {"alternatives": alts, "feasible": False}


# ═════════════════════════════════════════════════════════════════════════════
# Narrative — deterministic figures + an optional, GUARDED LLM polish.
# Non-negotiable #2: numbers are injected, never free-generated. The polish may
# only rephrase; a numeric guard rejects any rewrite that invents or drops a
# figure, falling back to the deterministic f-string.
# ═════════════════════════════════════════════════════════════════════════════
_NUMTOKEN = re.compile(r"\d[\d,]*")


def _numbers_in(text: str) -> set[int]:
    """Every integer token in the text (comma groups collapsed; '2026-09-15' -> {2026,9,15})."""
    out: set[int] = set()
    for tok in _NUMTOKEN.findall(text):
        tok = tok.strip(",")
        if tok:
            try:
                out.add(int(tok.replace(",", "")))
            except ValueError:
                pass
    return out


def _narrative_guard(prose: str, deterministic: str, figures: dict[str, Any]) -> bool:
    """True iff the prose invents NO number and keeps every required figure (#2).

    Allowed numbers are exactly those already in the deterministic narrative (plan
    figures + any digits inside injected names like "Box 7"). Any other number, or a
    missing required figure (space, attendees, total, date, task count), fails.
    """
    if any(n not in _numbers_in(deterministic) for n in _numbers_in(prose)):
        return False
    low = prose.lower()
    space = figures.get("space")
    if space and space.lower() not in low:
        return False
    a = figures.get("attendees")
    if isinstance(a, int) and str(a) not in prose:
        return False
    total = figures.get("total_minor")
    if isinstance(total, int) and f"{total:,}" not in prose and str(total) not in prose:
        return False
    tc = figures.get("task_count")
    if isinstance(tc, int) and tc > 0 and str(tc) not in prose:
        return False
    date = figures.get("date")
    if isinstance(date, str) and len(date) >= 10:
        if date not in prose and not (date[:4] in prose and str(int(date[8:10])) in prose):
            return False
    return True


async def _polish_narrative(deterministic: str, figures: dict[str, Any]) -> str:
    """LLM-rephrase the plan summary into warmer prose, KEEPING every figure.

    Off unless ``NARRATIVE_POLISH`` and an API key are set. Guarded + never raises:
    any failure or guard rejection returns the deterministic f-string verbatim.
    """
    if not (settings.NARRATIVE_POLISH and settings.ANTHROPIC_API_KEY):
        return deterministic
    try:
        resp = await _anthropic().messages.create(
            model=settings.FAST_MODEL,
            max_tokens=220,
            system=(
                "You are the Pyramid of Tirana's operations copilot. "
                "Rewrite the plan summary as one or "
                "two warm, natural sentences (max ~45 words). "
                "Keep EVERY number, name, and date EXACTLY "
                "as given — never add, drop, round, or invent a figure. "
                "Use only the facts provided; no "
                "code fence, no preamble."
            ),
            messages=[{"role": "user", "content": f"Plan summary to rewrite:\n{deterministic}"}],
        )
        txt = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
        return txt if (txt and _narrative_guard(txt, deterministic, figures)) else deterministic
    except Exception:
        return deterministic


async def assemble_plan(state: PlanState) -> dict[str, Any]:
    """Compose the OperationalPlan + narrative, with Phase C spatial enrichment.

    Numbers stay injected, never free-generated (#2). On the happy path we add the
    space BUNDLE (complementary spaces from the catalog) + circulation warnings +
    the floor-map state; on the conflict path we narrate the conflict + alternative.
    """
    feasible = bool(state.get("feasible"))
    space = state.get("space")
    quote = state.get("quote")
    tasks = state.get("tasks", [])
    conflicts = state.get("conflicts", [])
    alts = state.get("alternatives", [])
    win = state.get("chosen_window")
    attendees = state.get("attendees")
    raw_layout = state.get("layout")
    layout = "flexible layout" if raw_layout in (None, "CUSTOM") else raw_layout
    event_type = state.get("event_type") or "OTHER"
    overflow = state.get("overflow_needed", 0) or 0

    bundle: list[dict[str, Any]] = []
    warnings: list[str] = []
    map_state: list[dict[str, Any]] = []
    primary_slug: str | None = None
    try:
        from ..venue import get_venue

        venue = get_venue()
        primary = venue.by_name(space.name) if space else None
        primary_slug = primary["slug"] if primary else None
        if feasible and primary_slug:
            bundle = venue.propose_bundle(
                event_type=event_type, primary_slug=primary_slug,
                layout=raw_layout, overflow=overflow,
            )
            warnings = venue.circulation_warnings([primary_slug] + [b["slug"] for b in bundle])
    except Exception:
        bundle, warnings, primary_slug = [], [], None

    if feasible and space is not None:
        if primary_slug:
            map_state.append({"slug": primary_slug, "status": "main"})
            for b in bundle:
                map_state.append(
                    {"slug": b["slug"], "status": "circulation" if b["isCirculation"] else "bundle"}
                )
        date = win.start[:10] if win else "the requested date"
        money = f"{quote.totalMinor:,} ALL incl. VAT" if quote is not None else "a quote on request"
        bundle_txt = ""
        if bundle:
            parts = ", ".join(
                f"{b['name']} ({b['reason']})" if b.get("reason") else b["name"] for b in bundle
            )
            bundle_txt = f" Plus {parts}."
        conflict_note = (
            "No conflicts." if not conflicts else f"{len(conflicts)} conflict(s) flagged."
        )
        warn_txt = (" Heads-up: " + " ".join(warnings)) if warnings else ""
        # Multi-space plenary: the modest Pyramid halls combine to seat a big headcount.
        n_overflow = sum(1 for b in bundle if b.get("role") == "overflow")
        multi_txt = (
            f" Combined across {n_overflow + 1} halls to seat {attendees}." if n_overflow else ""
        )
        deterministic = (
            f"{space.name} on {date}, {layout} for {attendees}.{multi_txt}{bundle_txt} "
            f"{len(tasks)} setup/teardown task(s) queued. Total {money}. {conflict_note}{warn_txt}"
        )
        figures = {
            "space": space.name,
            "date": win.start[:10] if win else None,
            "attendees": attendees if isinstance(attendees, int) else None,
            "total_minor": quote.totalMinor if quote is not None else None,
            "task_count": len(tasks),
            "conflict_count": len(conflicts),
        }
        narrative = await _polish_narrative(deterministic, figures)
        # The spec's areas/capacities are ~1:200 estimates — flag once for the UI to surface.
        warnings = warnings + [
            "Areas + capacities are ~1:200 estimates (±20%); editable to surveyed figures."
        ]
    else:
        if primary_slug:
            map_state.append({"slug": primary_slug, "status": "conflict"})
        date = win.start[:10] if win else "the requested date"
        who = f"{attendees} guests" if isinstance(attendees, int) else "that group"
        # Always give a CONCRETE reason: the actual booking clash, or why nothing matched.
        if conflicts:
            # Drop the internal request UUID from the clash detail ("…reserved for <uuid>…").
            reason = re.sub(
                r"\s+for\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
                "", conflicts[0].detail,
            )
        elif space is None:
            reason = f"no bookable space is free for {who} on {date} in that window"
        else:
            reason = f"{space.name} couldn't be held for {who} on {date}"
        alt_txt = (
            (" " + alts[0]["detail"]) if alts
            else " I can try another date or split it across halls — want me to re-plan?"
        )
        narrative = f"Not feasible as requested: {reason.rstrip('. ')}.{alt_txt}"

    return {
        "feasible": feasible,
        "narrative": narrative,
        "bundle": bundle,
        "warnings": warnings,
        "map_state": map_state,
    }


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

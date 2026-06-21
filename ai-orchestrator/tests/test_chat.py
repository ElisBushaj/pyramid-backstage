"""Chat-orchestration tests — the re-plan guard + Redis-fallback memory.

These lock in the two fixes:
  1. A chat session spawns AT MOST ONE live hold. Conversational follow-ups re-serve
     the standing plan (no graph run, no new request); a real change releases the
     prior hold BEFORE re-planning. So holds never stack.
  2. The session keeps the full Q&A transcript (user + assistant turns), and a
     multi-turn gather never drops an earlier count when the date arrives as ISO.

Fully offline: a fake graph + fake ops (no network, no API key), and the plan
assembler is monkeypatched so the tests assert ORCHESTRATION, not parsing.
"""

from __future__ import annotations

import asyncio

import pytest

import app.chat as chat
from app.schemas import (
    ChatResponse,
    DateRange,
    OperationalPlan,
    Reservation,
    Space,
)
from app.session import SessionStore


class FakeOps:
    """Records release calls so we can assert at-most-one-live-hold."""

    def __init__(self) -> None:
        self.released: list[str] = []

    async def release_reservation(self, reservation_id: str) -> None:
        self.released.append(reservation_id)


class FakeGraph:
    """Counts invocations — each ainvoke == one (would-be) request + hold."""

    def __init__(self) -> None:
        self.calls = 0

    async def ainvoke(self, state: dict) -> dict:
        self.calls += 1
        return {"_brief": state.get("nl_text")}


def _plan(reservation_id: str, *, feasible: bool = True) -> OperationalPlan:
    return OperationalPlan(
        requestId="req-1",
        feasible=feasible,
        space=Space(
            id="s1", name="Box 5", floor=0, kind="MAIN",
            capacities={"THEATER": 220}, dayRateMinor=80000,
        ),
        reservation=Reservation(
            id=reservation_id, requestId="req-1", spaceId="s1",
            dateRange=DateRange(start="2026-09-15T09:00:00Z", end="2026-09-15T17:00:00Z"),
            status="HELD",
        ),
        narrative="Box 5 on 2026-09-15, THEATER for 180. Total 96,000 ALL incl. VAT.",
    )


@pytest.fixture
def patched_plan(monkeypatch: pytest.MonkeyPatch):
    """build_operational_plan -> a fresh plan with an incrementing reservation id."""
    seq = {"n": 0}

    def _factory(result, request_id):  # noqa: ARG001 — signature mirror
        seq["n"] += 1
        return _plan(f"resv-{seq['n']}")

    monkeypatch.setattr(chat, "build_operational_plan", _factory)
    return seq


def _send(store: SessionStore, ops: FakeOps, graph: FakeGraph, msg: str) -> ChatResponse:
    return asyncio.run(
        chat.handle_chat("sess-A", msg, ops=ops, graph=graph, sessions=store)
    )


def test_followups_never_spawn_duplicate_holds(patched_plan) -> None:
    store, ops, graph = SessionStore(), FakeOps(), FakeGraph()

    # Multi-turn gather: count first, then the date as an ISO string.
    r1 = _send(store, ops, graph, "conference for 180 people")
    assert r1.plan is None and graph.calls == 0  # still gathering, no plan yet
    r2 = _send(store, ops, graph, "on 2026-09-15")
    assert r2.plan is not None and graph.calls == 1  # planned exactly once

    # The ISO date did NOT reset the brief — the count survived the gather.
    sess = asyncio.run(store.get("sess-A"))
    assert "180" in sess["brief_planned"] and "2026-09-15" in sess["brief_planned"]

    # Conversational follow-ups re-serve the standing plan: no new graph run, no release.
    for q in ["what's the total?", "who approves this?", "thanks!"]:
        _send(store, ops, graph, q)
    assert graph.calls == 1
    assert ops.released == []


def test_affirmation_does_not_replan(patched_plan) -> None:
    store, ops, graph = SessionStore(), FakeOps(), FakeGraph()
    _send(store, ops, graph, "conference for 180 people on 2026-09-15")
    assert graph.calls == 1
    r = _send(store, ops, graph, "yes")
    assert graph.calls == 1  # "yes" surfaces the gated action, never re-plans
    assert r.requiresApproval is True and r.proposedActions


def test_real_change_releases_prior_hold_then_replans(patched_plan) -> None:
    store, ops, graph = SessionStore(), FakeOps(), FakeGraph()
    _send(store, ops, graph, "conference for 180 people on 2026-09-15")
    assert graph.calls == 1  # hold resv-1

    _send(store, ops, graph, "actually make it 250 instead")
    assert graph.calls == 2  # re-planned
    assert ops.released == ["resv-1"]  # the FIRST hold was released BEFORE re-holding

    sess = asyncio.run(store.get("sess-A"))
    assert sess["reservation_id"] == "resv-2"  # now tracking the new lease only


def test_new_event_releases_old_hold_and_resets_brief(patched_plan) -> None:
    store, ops, graph = SessionStore(), FakeOps(), FakeGraph()
    _send(store, ops, graph, "conference for 180 people on 2026-09-15")
    # A second self-contained brief = a different event -> release + fresh brief.
    _send(store, ops, graph, "a gala for 90 people on 2026-12-03")
    assert graph.calls == 2
    assert ops.released == ["resv-1"]
    sess = asyncio.run(store.get("sess-A"))
    assert sess["brief_planned"] == "a gala for 90 people on 2026-12-03"


def test_history_keeps_user_and_assistant_turns(patched_plan) -> None:
    store, ops, graph = SessionStore(), FakeOps(), FakeGraph()
    _send(store, ops, graph, "conference for 180 people")
    _send(store, ops, graph, "on 2026-09-15")
    sess = asyncio.run(store.get("sess-A"))
    roles = [h["role"] for h in sess["history"]]
    # Two user turns, each answered -> alternating transcript, assistant replies stored.
    assert roles == ["user", "assistant", "user", "assistant"]
    assert all(h["content"] for h in sess["history"])


def test_memory_store_roundtrips_without_redis() -> None:
    # No Redis configured -> in-memory backend, full record shape on a cold read.
    store = SessionStore()
    assert store.backend == "memory"
    fresh = asyncio.run(store.get("unseen"))
    assert set(fresh) >= {"messages", "history", "plan", "request_id", "reservation_id"}

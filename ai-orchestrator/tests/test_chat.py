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
from app.config import settings
from app.schemas import (
    ChatResponse,
    DateRange,
    OperationalPlan,
    Reservation,
    Space,
)
from app.session import SessionStore


@pytest.fixture(autouse=True)
def _no_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    # Force the offline/template paths (a real key lives in .env) so the whole suite
    # is hermetic — no network in _phrase_question or _answer_venue_question.
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")


class FakeOps:
    """Records release calls so we can assert at-most-one-live-hold."""

    def __init__(self) -> None:
        self.released: list[str] = []

    async def release_reservation(self, reservation_id: str) -> None:
        self.released.append(reservation_id)


class FakeKB:
    """A knowledge base that returns canned venue_facts hits + records queries."""

    def __init__(self, hits: list[dict] | None = None) -> None:
        self._hits = hits or []
        self.queries: list[tuple[str, str]] = []

    @property
    def available(self) -> bool:
        return True

    def query(self, collection: str, text: str, n_results: int = 5) -> list[dict]:
        self.queries.append((collection, text))
        return list(self._hits) if collection == "venue_facts" else []


class FakeGraph:
    """Counts invocations + records the brief each one planned from."""

    def __init__(self) -> None:
        self.calls = 0
        self.briefs: list[str] = []

    async def ainvoke(self, state: dict) -> dict:
        self.calls += 1
        self.briefs.append(state.get("nl_text"))
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


def _send(
    store: SessionStore, ops: FakeOps, graph: FakeGraph, msg: str, kb=None
) -> ChatResponse:
    return asyncio.run(
        chat.handle_chat("sess-A", msg, ops=ops, graph=graph, sessions=store, kb=kb)
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


def test_venue_question_answered_from_kb_without_planning() -> None:
    store, ops, graph = SessionStore(), FakeOps(), FakeGraph()
    kb = FakeKB(hits=[{"document": "Space 1 is the largest hall (~300 people).", "metadata": {}}])
    r = _send(store, ops, graph, "what's the biggest hall?", kb=kb)
    assert graph.calls == 0  # answered from RAG, never ran the planner
    assert "Space 1 is the largest hall" in r.reply
    assert r.plan is None and ("venue_facts", "what's the biggest hall?") in kb.queries
    # The brief is left untouched — a question mid-conversation doesn't derail intake.
    assert asyncio.run(store.get("sess-A"))["messages"] == []


def test_venue_question_falls_through_to_gather_when_kb_empty() -> None:
    store, ops, graph = SessionStore(), FakeOps(), FakeGraph()
    r = _send(store, ops, graph, "do you have outdoor space?", kb=FakeKB(hits=[]))
    assert graph.calls == 0 and r.plan is None  # no hit -> normal intake gather
    assert asyncio.run(store.get("sess-A"))["messages"] == ["do you have outdoor space?"]


def test_booking_brief_is_not_hijacked_by_the_rag_path(patched_plan) -> None:
    # A full brief (count + date) plans even though a KB is present — booking wins.
    store, ops, graph = SessionStore(), FakeOps(), FakeGraph()
    kb = FakeKB(hits=[{"document": "irrelevant", "metadata": {}}])
    r = _send(store, ops, graph, "conference for 180 people on 2026-09-15", kb=kb)
    assert graph.calls == 1 and r.plan is not None


def test_needs_condense_only_on_conflict() -> None:
    assert chat._needs_condense(["conference for 180 on 2026-09-15"]) is False  # single msg
    assert chat._needs_condense(["180 people", "on 2026-09-15"]) is False       # additive gather
    assert chat._needs_condense(["180 people", "actually 250 people"]) is True  # two headcounts
    assert chat._needs_condense(["80 on the 3rd", "make it banquet"]) is True    # edit verb later


def test_condense_falls_back_to_join_without_a_key() -> None:
    # _no_llm blanks the key -> plain concatenation; a single fragment is returned as-is.
    assert asyncio.run(
        chat._condense_brief(["180 people", "actually 250 people"])
    ) == "180 people  actually 250 people"
    assert asyncio.run(chat._condense_brief(["just the one"])) == "just the one"


def test_condense_feeds_a_resolved_brief_to_the_planner(patched_plan, monkeypatch) -> None:
    store, ops, graph = SessionStore(), FakeOps(), FakeGraph()

    async def _fake_condense(messages):
        return "Conference for 250 people on 2026-09-15"

    monkeypatch.setattr(chat, "_condense_brief", _fake_condense)
    _send(store, ops, graph, "conference for 180 people on 2026-09-15")  # first plan
    _send(store, ops, graph, "actually make it 250")  # a change -> re-plan via condense
    assert graph.calls == 2
    # The planner saw the RECONCILED brief (250), not the raw "180 ... 250" concatenation.
    assert graph.briefs[-1] == "Conference for 250 people on 2026-09-15"
    assert ops.released == ["resv-1"]  # prior hold still released before the re-plan


def _force_intent(monkeypatch, intent: str) -> None:
    async def _fake(message, *, has_plan, awaiting=""):
        return intent

    monkeypatch.setattr(chat, "_classify_intent", _fake)


def test_heuristic_intent_mapping() -> None:
    h = chat._heuristic_intent
    assert h("yes", has_plan=True) == "AFFIRM"
    assert h("what's the biggest hall?", has_plan=False) == "VENUE_QUESTION"
    assert h("conference for 180 on 2026-09-15", has_plan=False) == "BOOKING"
    assert h("make it 250", has_plan=True) == "MODIFY"
    assert h("what's the total?", has_plan=True) == "OTHER"          # plan-relative, not a re-plan
    assert h("a gala for 90 on 2026-12-03", has_plan=True) == "BOOKING"  # full brief -> new event


def test_classifier_routes_venue_question_even_after_a_plan(patched_plan, monkeypatch) -> None:
    store, ops, graph = SessionStore(), FakeOps(), FakeGraph()
    kb = FakeKB(hits=[{"document": "Floor 3 has outdoor roof terraces.", "metadata": {}}])
    _force_intent(monkeypatch, "BOOKING")
    _send(store, ops, graph, "conference for 180 on 2026-09-15", kb=kb)
    assert graph.calls == 1  # plan established
    # A venue question WITH a plan standing now routes to RAG (the classifier separates it
    # from plan-relative chatter) — old keyword gate would have re-served the plan instead.
    _force_intent(monkeypatch, "VENUE_QUESTION")
    r = _send(store, ops, graph, "do you have outdoor space?", kb=kb)
    assert graph.calls == 1 and "outdoor roof terraces" in r.reply  # answered, no re-plan
    assert asyncio.run(store.get("sess-A"))["plan"] is not None     # plan preserved for "yes"


def test_classifier_other_without_a_plan_nudges_without_polluting_brief(monkeypatch) -> None:
    store, ops, graph = SessionStore(), FakeOps(), FakeGraph()
    _force_intent(monkeypatch, "OTHER")
    r = _send(store, ops, graph, "hey there!", kb=None)
    assert graph.calls == 0 and r.plan is None
    assert asyncio.run(store.get("sess-A"))["messages"] == []  # greeting didn't enter the brief


def test_memory_store_roundtrips_without_redis() -> None:
    # No Redis configured -> in-memory backend, full record shape on a cold read.
    store = SessionStore()
    assert store.backend == "memory"
    fresh = asyncio.run(store.get("unseen"))
    assert set(fresh) >= {"messages", "history", "plan", "request_id", "reservation_id"}

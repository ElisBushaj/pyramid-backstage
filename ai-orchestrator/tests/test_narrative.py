"""Narrative tests (A00-T10) — guarantees non-negotiable #2 holds with the LLM in.

Two halves:
  1. The deterministic narrative (polish OFF) carries EXACTLY the structured plan's
     figures — space, date, attendees, quote total, task count. ("prose figures ==
     structured plan".)
  2. The numeric guard that gates the optional LLM polish rejects any rewrite that
     invents or drops a figure — so even when polish is ON, no number can drift.

All offline: polish is disabled so no API key / network is used.
"""

from __future__ import annotations

import asyncio

import pytest

from app.config import settings
from app.graph.planning_graph import (
    _narrative_guard,
    _numbers_in,
    _polish_narrative,
    assemble_plan,
)
from app.schemas import DateRange, Quote, Space, Task

DETERMINISTIC = (
    "Blue Hall on 2026-09-15, THEATER for 180. "
    "3 setup/teardown task(s) queued. Total 96,000 ALL incl. VAT. No conflicts."
)
FIGURES = {
    "space": "Blue Hall",
    "date": "2026-09-15",
    "attendees": 180,
    "total_minor": 96000,
    "task_count": 3,
    "conflict_count": 0,
}


@pytest.fixture(autouse=True)
def _polish_off(monkeypatch: pytest.MonkeyPatch) -> None:
    # Force the deterministic path regardless of any .env key, so tests are hermetic.
    monkeypatch.setattr(settings, "NARRATIVE_POLISH", False)


def _feasible_state() -> dict:
    return {
        "feasible": True,
        # A real catalog space so venue.by_name resolves the floor-map primary.
        "space": Space(
            id="s1", name="Box 5", floor=0, kind="MAIN",
            capacities={"THEATER": 220}, dayRateMinor=80000,
        ),
        "quote": Quote(
            id="q1", requestId="r1", netMinor=80000, vatRate=0.2,
            vatMinor=16000, totalMinor=96000, status="DRAFT",
        ),
        "tasks": [
            Task(id=f"t{i}", requestId="r1", title="x", phase="SETUP", status="TODO")
            for i in range(3)
        ],
        "conflicts": [],
        "chosen_window": DateRange(start="2026-09-15T09:00:00Z", end="2026-09-15T17:00:00Z"),
        "attendees": 180,
        "layout": "THEATER",
        "event_type": "CONFERENCE",
    }


def test_assembled_narrative_matches_structured_figures() -> None:
    out = asyncio.run(assemble_plan(_feasible_state()))
    narrative = out["narrative"]
    # Every structured figure must surface verbatim in the prose.
    assert "Box 5" in narrative
    assert "2026-09-15" in narrative
    assert "180" in narrative
    assert "96,000" in narrative
    assert "3 setup/teardown" in narrative
    # Every structured figure (attendees, total, task count, date parts) appears as a
    # number in the prose — "prose figures == structured plan". The narrative may carry
    # extra digits from injected bundle names (e.g. "Box 7"), which is fine.
    assert {180, 96000, 3, 2026, 9, 15} <= _numbers_in(narrative)
    # The floor-map primary lit as the main space (raw graph key is snake_case).
    assert any(m["status"] == "main" for m in out["map_state"])


def test_numbers_in_parsing() -> None:
    assert _numbers_in("96,000 on 2026-09-15 for 180") == {96000, 2026, 9, 15, 180}


def test_guard_accepts_faithful_rewrite() -> None:
    good = (
        "Blue Hall is booked for 2026-09-15 — a THEATER setup for 180, with 3 "
        "setup/teardown tasks queued and a total of 96,000 ALL incl. VAT. No conflicts."
    )
    assert _narrative_guard(good, DETERMINISTIC, FIGURES) is True


def test_guard_rejects_invented_number() -> None:
    bad = (  # 250 was never in the plan
        "Blue Hall on 2026-09-15, THEATER for 180, 3 tasks, total 96,000 ALL — "
        "and room for 250 more."
    )
    assert _narrative_guard(bad, DETERMINISTIC, FIGURES) is False


def test_guard_rejects_dropped_total() -> None:
    bad = "Blue Hall on 2026-09-15, THEATER for 180 with 3 tasks queued. No conflicts."
    assert _narrative_guard(bad, DETERMINISTIC, FIGURES) is False


def test_guard_rejects_dropped_space_name() -> None:
    bad = "On 2026-09-15, THEATER for 180, 3 tasks, total 96,000 ALL incl. VAT."
    assert _narrative_guard(bad, DETERMINISTIC, FIGURES) is False


def test_polish_falls_back_to_deterministic_when_off() -> None:
    # NARRATIVE_POLISH is False (fixture) -> returns the input verbatim, no network.
    assert asyncio.run(_polish_narrative(DETERMINISTIC, FIGURES)) == DETERMINISTIC

"""Planning-graph matching tests — the CUSTOM/flexible-layout fix.

A vague enquiry ("host an event") makes intake infer layout=CUSTOM, but no space is
sized for CUSTOM. The old match ranked by `capacities["CUSTOM"]` = 0 for every space →
`space: None` → the plan falsely read "No matching space" even though the venue can
host the headcount. These lock in: best-fit-by-max-capacity, and never sending a
non-seated layout to ops-core as a filter (which returns zero spaces).
"""

from __future__ import annotations

import asyncio

from app.graph.planning_graph import _fit_capacity, match_space
from app.schemas import DateRange, Space


def _space(sid: str, name: str, caps: dict, available: bool = True) -> Space:
    return Space(
        id=sid, name=name, floor=0, kind="MAIN",
        capacities=caps, dayRateMinor=80000, available=available,
    )


class _FakeOps:
    def __init__(self, spaces: list[Space]) -> None:
        self._spaces = spaces
        self.layouts_seen: list[str | None] = []

    async def match_spaces(self, *, layout=None, start=None, end=None) -> list[Space]:
        self.layouts_seen.append(layout)
        return self._spaces


def test_fit_capacity_falls_back_to_max_for_custom() -> None:
    s = _space("s1", "Main hall", {"RECEPTION": 200, "THEATER": 106})
    assert _fit_capacity(s, "RECEPTION") == 200       # exact layout
    assert _fit_capacity(s, "THEATER") == 106
    assert _fit_capacity(s, "CUSTOM") == 200          # flexible -> best setup
    assert _fit_capacity(s, None) == 200
    assert _fit_capacity(_space("x", "WC", {}), "CUSTOM") == 0  # no capacity at all


def test_match_space_custom_layout_still_matches() -> None:
    ops = _FakeOps([
        _space("s1", "Main hall", {"RECEPTION": 200, "THEATER": 106}),
        _space("s2", "Box", {"BOARDROOM": 12}),
    ])
    win = DateRange(start="2026-06-22T09:00:00Z", end="2026-06-22T17:00:00Z")
    out = asyncio.run(
        match_space({"ops": ops, "chosen_window": win, "attendees": 200, "layout": "CUSTOM"})
    )
    assert out["space"] is not None and out["space"].name == "Main hall"  # not None!
    # CUSTOM must NOT be sent to ops-core as a layout filter (it would return nothing).
    assert ops.layouts_seen == [None]


def test_match_space_seated_layout_is_passed_through() -> None:
    ops = _FakeOps([_space("s1", "Main hall", {"THEATER": 106})])
    win = DateRange(start="2026-06-22T09:00:00Z", end="2026-06-22T17:00:00Z")
    out = asyncio.run(
        match_space({"ops": ops, "chosen_window": win, "attendees": 80, "layout": "THEATER"})
    )
    assert out["space"].name == "Main hall" and ops.layouts_seen == ["THEATER"]

"""Heuristic-intake tests (A00-T10).

These exercise the deterministic ``heuristic_parse`` fallback — the no-key path —
so they run offline with no ``ANTHROPIC_API_KEY`` and no network. They lock in the
edge cases the prompt work targets: word-numbers, year/ordinal rejection, layout
inference, AV/catering hints, and relative-date resolution.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.intake import _heuristic_window, heuristic_parse
from app.schemas import EventRequestInput


def _attendees(text: str) -> int:
    return heuristic_parse(text).expectedAttendees


@pytest.mark.parametrize(
    "text,expected",
    [
        ("a dozen execs for a board meeting", 12),
        ("two dozen people", 24),
        ("a couple hundred guests", 200),
        ("a few hundred attendees", 300),
        ("conference for 180 people", 180),
        ("workshop, 30 pax", 30),
        ("fifty for dinner", 50),
    ],
)
def test_wordnumber_and_digit_counts(text: str, expected: int) -> None:
    assert _attendees(text) == expected


def test_year_and_ordinal_are_not_counted_as_people() -> None:
    # The year 2026 and the ordinal "22nd" must not be read as the crowd size.
    assert _attendees("gala on the 22nd of July 2026 for 150 guests") == 150
    # No count at all -> safe default, not the day-of-month.
    assert _attendees("exhibition on the 24th") == 50


@pytest.mark.parametrize(
    "text,layout",
    [
        ("networking reception", "RECEPTION"),
        ("quarterly board meeting", "BOARDROOM"),
        ("hands-on training", "CLASSROOM"),
        ("keynote talks and panels", "THEATER"),
        ("gala dinner", "BANQUET"),
    ],
)
def test_layout_inference(text: str, layout: str) -> None:
    assert heuristic_parse(text).requirements.layout == layout


@pytest.mark.parametrize(
    "text,etype",
    [
        ("startup conference", "CONFERENCE"),
        ("art exhibition", "EXHIBITION"),
        ("coding hackathon", "WORKSHOP"),
        ("live concert", "PERFORMANCE"),
        ("wedding reception", "PRIVATE"),
    ],
)
def test_event_type_inference(text: str, etype: str) -> None:
    assert heuristic_parse(text).eventType == etype


def test_av_and_catering_hints() -> None:
    r = heuristic_parse("conference needing mics, a stage and full catering").requirements
    assert r.avNeeded is True
    assert r.cateringNeeded is True
    r2 = heuristic_parse("quiet boardroom meeting").requirements
    assert r2.avNeeded is False
    assert r2.cateringNeeded is False


def test_relative_dates_resolve_forward() -> None:
    now = datetime.now(UTC)
    tomorrow = heuristic_parse("event tomorrow").preferredDates[0].start[:10]
    assert tomorrow > now.strftime("%Y-%m-%d")  # strictly in the future

    july = _heuristic_window(" something in july ").start
    assert july[5:7] == "07"

    # "next month" lands in a different month than today.
    nxt = _heuristic_window(" party next month ").start
    assert nxt[5:7] != now.strftime("%m")


def test_always_valid_and_never_raises() -> None:
    for text in ["", "???", "a vague enquiry", "200 people next week with mics"]:
        out = heuristic_parse(text)
        assert isinstance(out, EventRequestInput)
        assert out.expectedAttendees >= 1
        assert len(out.preferredDates) >= 1
        assert out.title  # non-empty


def test_title_is_capitalised() -> None:
    assert heuristic_parse("a vague enquiry about a party").title == "A vague enquiry about a party"

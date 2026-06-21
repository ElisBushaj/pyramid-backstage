"""NL intake parsing — free text -> validated ``EventRequestInput``.

Non-negotiable #4 (AI_ORCHESTRATION.md): schema-validated with one LLM retry + a
deterministic fallback. (Newer models like Opus 4.8 reject the ``temperature``
param, so we omit it; schema-validation + retry keep the output deterministic.)

The fallback is a keyword/number heuristic, so the NL path works even with **no**
``ANTHROPIC_API_KEY`` set — the LLM only upgrades quality. Deep prompt-tuning is
deliberately deferred (Phase B v1: get it working; tune later).
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from pydantic import ValidationError

from .config import settings
from .schemas import DateRange, EventRequestInput, Requirements

_EVENT_TYPES = {
    "conference": "CONFERENCE", "summit": "CONFERENCE", "startup": "CONFERENCE",
    "keynote": "CONFERENCE",
    "exhibition": "EXHIBITION", "expo": "EXHIBITION", "gallery": "EXHIBITION", "art": "EXHIBITION",
    "workshop": "WORKSHOP", "training": "WORKSHOP", "hackathon": "WORKSHOP", "course": "WORKSHOP",
    "performance": "PERFORMANCE", "concert": "PERFORMANCE", "show": "PERFORMANCE",
    "recital": "PERFORMANCE",
    "community": "COMMUNITY", "gathering": "COMMUNITY", "meetup": "COMMUNITY",
    "private": "PRIVATE", "wedding": "PRIVATE", "gala": "PRIVATE", "birthday": "PRIVATE",
}
# Layout from explicit words AND from intent keywords (talks -> THEATER, dinner -> BANQUET).
_LAYOUTS = {
    "theater": "THEATER", "theatre": "THEATER", "classroom": "CLASSROOM",
    "banquet": "BANQUET", "dinner": "BANQUET", "reception": "RECEPTION",
    "cabaret": "CABARET", "boardroom": "BOARDROOM",
}
_LAYOUT_INTENT = {
    "THEATER": ("talk", "keynote", "conference", "panel", "presentation", "lecture", "concert"),
    "CLASSROOM": ("training", "course", "workshop", "class", "hands-on", "hands on", "tutorial"),
    "BANQUET": ("dinner", "gala", "banquet", "awards", "wedding", "luncheon"),
    "RECEPTION": ("reception", "networking", "mixer", "cocktail", "mingle", "drinks", "expo"),
    "BOARDROOM": ("board", "exec", "executive", "leadership", "stand-up", "standup"),
    "CABARET": ("cabaret", "club night", "table seating"),
}
_AV_HINTS = (
    "mic", " av ", "sound", "audio", "projector", "screen", "stage", "speaker", "presentation",
)
_CATERING_HINTS = (
    "cater", "food", "lunch", "dinner", "coffee", "buffet", "snack", "drinks", "refreshment",
)

# Word-quantities the heuristic resolves when no digit count is present.
_WORD_QTY = {
    "a dozen": 12, "dozen": 12, "two dozen": 24, "a couple dozen": 24, "a few dozen": 36,
    "a hundred": 100, "one hundred": 100, "a couple hundred": 200, "couple hundred": 200,
    "two hundred": 200, "a few hundred": 300, "three hundred": 300, "several hundred": 400,
    "a handful": 6, "a couple": 2, "a few": 5,
}
_TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60,
         "seventy": 70, "eighty": 80, "ninety": 90, "ten": 10, "fifteen": 15}
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _iso(d: datetime) -> str:
    return d.isoformat().replace("+00:00", "Z")


def _window_on(day: datetime, hour_start: int = 9, hour_end: int = 17) -> DateRange:
    """A same-day [start, end) window at the given UTC hours."""
    start = day.replace(hour=hour_start, minute=0, second=0, microsecond=0)
    end = day.replace(hour=hour_end, minute=0, second=0, microsecond=0)
    return DateRange(start=_iso(start), end=_iso(end))


def _default_window(days_ahead: int = 30) -> DateRange:
    return _window_on(datetime.now(UTC) + timedelta(days=days_ahead))


# The Pyramid is in Tirana; the frontend renders every time in Europe/Tirane. The
# organizer speaks LOCAL time, so the wall-clock the intake emits (as a trailing-Z
# string) must be re-interpreted as venue-local and converted to the true UTC instant —
# otherwise "10am" stores as 10:00 UTC and the UI shows it as 12:00 (UTC+2 in summer).
try:
    from zoneinfo import ZoneInfo

    _VENUE_TZ = ZoneInfo("Europe/Tirane")
except Exception:  # tzdata absent (e.g. bare Windows) -> Tirana summer offset
    from datetime import timezone

    _VENUE_TZ = timezone(timedelta(hours=2))


def _localize_to_utc(iso_z: str) -> str:
    """Treat an intake wall-clock time as Europe/Tirane local; return the true UTC instant."""
    try:
        local = datetime.fromisoformat(iso_z.replace("Z", "")).replace(tzinfo=_VENUE_TZ)
        return local.astimezone(UTC).isoformat().replace("+00:00", "Z")
    except Exception:
        return iso_z


def _localized(req: EventRequestInput) -> EventRequestInput:
    """Convert every preferred window from venue-local wall-clock to UTC (in place)."""
    for w in req.preferredDates:
        w.start = _localize_to_utc(w.start)
        w.end = _localize_to_utc(w.end)
    return req


def _heuristic_attendees(low: str) -> int:
    """Best-effort headcount: explicit "<n> people" → word-quantity → a safe bare number.

    Ignores years and day-of-month ordinals so "conference on the 22nd" or "in 2026"
    don't get read as the crowd size.
    """
    m = re.search(
        r"(\d{1,5})\s*\+?\s*(?:people|ppl|pax|persons?|attendees|guests|heads|seats)", low
    )
    if m:
        return max(1, int(m.group(1)))
    for phrase, qty in sorted(_WORD_QTY.items(), key=lambda kv: -len(kv[0])):
        if phrase in low:
            return qty
    for word, qty in _TENS.items():
        if re.search(rf"\b{word}\b", low):
            return qty
    # Bare number, but skip 4-digit years and ordinals like "22nd"/"3rd".
    for m in re.finditer(r"\b(\d{1,5})\b(st|nd|rd|th)?", low):
        n = int(m.group(1))
        if m.group(2):  # ordinal → a date, not a count
            continue
        if 1900 <= n <= 2100:  # a year
            continue
        if 2 <= n <= 5000:
            return n
    return 50


def _heuristic_window(low: str) -> DateRange:
    """Resolve a rough date phrase to a window; fall back to ~30 days out."""
    now = datetime.now(UTC)
    if "tonight" in low:
        return _window_on(now, 18, 23)
    if "today" in low:
        return _window_on(now)
    if "tomorrow" in low:
        return _window_on(now + timedelta(days=1))
    if "next week" in low:
        days = (7 - now.weekday()) + 0  # next Monday
        return _window_on(now + timedelta(days=days or 7))
    if "this weekend" in low or "weekend" in low:
        return _window_on(now + timedelta(days=(5 - now.weekday()) % 7 or 7))
    if "next month" in low:
        nxt = (now.replace(day=1) + timedelta(days=32)).replace(day=15)
        return _window_on(nxt)
    for i, wd in enumerate(_WEEKDAYS):  # "this monday", "on friday"
        if re.search(rf"\b{wd}\b", low):
            return _window_on(now + timedelta(days=(i - now.weekday()) % 7 or 7))
    mo = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b", low)
    if mo:
        month = _MONTHS[mo.group(1)]
        year = now.year if month >= now.month else now.year + 1
        dm = re.search(r"\b([0-3]?\d)(?:st|nd|rd|th)?\b", low)
        day = min(max(int(dm.group(1)), 1), 28) if dm else 15
        return _window_on(now.replace(year=year, month=month, day=day))
    return _default_window()


def heuristic_parse(text: str) -> EventRequestInput:
    """Deterministic fallback — keyword + number extraction. Never raises."""
    low = f" {text.lower()} "
    attendees = _heuristic_attendees(low)
    event_type = next((v for k, v in _EVENT_TYPES.items() if k in low), "OTHER")
    layout = next((v for k, v in _LAYOUTS.items() if k in low), None)
    if layout is None:
        layout = next(
            (lo for lo, kws in _LAYOUT_INTENT.items() if any(k in low for k in kws)), None
        )
    if layout is None:
        layout = "THEATER" if event_type in ("CONFERENCE", "PERFORMANCE") else "RECEPTION"
    av = any(h in low for h in _AV_HINTS)
    catering = any(h in low for h in _CATERING_HINTS)
    title = (re.split(r"[.,;\n]", text.strip())[0] or "Event request")[:80]
    title = title[:1].upper() + title[1:]
    return EventRequestInput(
        title=title,
        organizerName="Guest organizer",
        expectedAttendees=attendees,
        eventType=event_type,  # type: ignore[arg-type]
        preferredDates=[_heuristic_window(low)],
        requirements=Requirements(  # type: ignore[arg-type]
            layout=layout, avNeeded=av, cateringNeeded=catering
        ),
    )


# Few-shot exemplars (input -> exact target JSON). Generated via json.dumps so the
# examples can never drift from the schema. They teach: word-numbers, multi-date
# ("22 or 24"), time-of-day windows, and layout/AV/catering inference.
_FEWSHOT: list[tuple[str, dict]] = [
    (
        "Startup conference for 180 people on 2026-09-15, needs a stage and mics",
        {
            "title": "Startup Conference", "organizerName": "Guest organizer",
            "contactEmail": None, "expectedAttendees": 180, "eventType": "CONFERENCE",
            "preferredDates": [{"start": "2026-09-15T09:00:00Z", "end": "2026-09-15T17:00:00Z"}],
            "requirements": {"layout": "THEATER", "avNeeded": True, "cateringNeeded": False,
                             "notes": "stage + microphones"},
        },
    ),
    (
        "Private gala dinner for a couple hundred guests on 22 or 24 October 2026, with catering",
        {
            "title": "Private Gala Dinner", "organizerName": "Guest organizer",
            "contactEmail": None, "expectedAttendees": 200, "eventType": "PRIVATE",
            "preferredDates": [
                {"start": "2026-10-22T18:00:00Z", "end": "2026-10-22T23:00:00Z"},
                {"start": "2026-10-24T18:00:00Z", "end": "2026-10-24T23:00:00Z"},
            ],
            "requirements": {"layout": "BANQUET", "avNeeded": False, "cateringNeeded": True,
                             "notes": None},
        },
    ),
    (
        "Hands-on training workshop for about 30, 2026-11-03 afternoon",
        {
            "title": "Hands-On Training Workshop", "organizerName": "Guest organizer",
            "contactEmail": None, "expectedAttendees": 30, "eventType": "WORKSHOP",
            "preferredDates": [{"start": "2026-11-03T13:00:00Z", "end": "2026-11-03T17:00:00Z"}],
            "requirements": {"layout": "CLASSROOM", "avNeeded": False, "cateringNeeded": False,
                             "notes": None},
        },
    ),
]


def _system_prompt() -> str:
    now = datetime.now(_VENUE_TZ)
    today, weekday = now.strftime("%Y-%m-%d"), now.strftime("%A")
    examples = "\n".join(f'IN: "{text}"\nOUT: {json.dumps(out)}' for text, out in _FEWSHOT)
    return (
        "You turn a free-text enquiry into ONE structured event request "
        "for the Pyramid of Tirana.\n"
        f"Today is {weekday}, {today}, the venue's LOCAL date (Tirana, Albania). "
        "All times the organizer gives are venue-local. Resolve EVERY relative date "
        "against today; never output a past date:\n"
        "  - 'next week' -> the following Mon-Fri; 'this weekend' -> the coming Sat-Sun.\n"
        "  - 'next month' -> a weekday in the next calendar month.\n"
        "  - a weekday name ('this Monday', 'Friday') -> the next such day on/after today.\n"
        "  - a bare month ('in July') -> mid-month; a quarter ('Q3')/season ('summer') "
        "-> its middle month.\n"
        "  - 'today'/'tonight' -> today; 'tomorrow' -> today + 1 day. "
        "If NO date is given, use a weekday ~30 days out.\n"
        "Output ONLY a JSON object (no prose, no code fence, no trailing text) with keys:\n"
        "  title (str: a short human label, Title Case),\n"
        "  organizerName (str; 'Guest organizer' if none given), contactEmail (str|null),\n"
        "  expectedAttendees (int >= 1),\n"
        "  eventType: one of CONFERENCE, EXHIBITION, WORKSHOP, PERFORMANCE, "
        "COMMUNITY, PRIVATE, OTHER,\n"
        "  preferredDates: array (>=1) of {start, end}. Write the organizer's stated "
        "LOCAL wall-clock\n"
        "    time with a trailing Z exactly as said — do NOT convert to UTC yourself "
        "(the system does). ONE entry per distinct\n"
        "    date the user offers ('the 22nd or 24th' -> two entries). "
        "A single day defaults to 09:00-17:00Z;\n"
        "    honour stated times ('evening' -> 18:00-23:00, 'afternoon' -> 13:00-17:00, "
        "'morning' -> 09:00-12:00).\n"
        "    A multi-day event is ONE entry spanning the first start to the last end.\n"
        "  requirements: {layout one of THEATER, CLASSROOM, BANQUET, "
        "RECEPTION, CABARET, BOARDROOM, "
        "CUSTOM; avNeeded bool; cateringNeeded bool; notes str|null}.\n"
        "Counting: read numerals AND words ('a dozen' -> 12, 'a couple hundred' -> 200, "
        "'150-200' -> 175). Ignore years and day-of-month numbers when counting people.\n"
        "Layout when unstated: talks/keynote/conference -> THEATER; "
        "training/course/workshop -> CLASSROOM; "
        "dinner/gala/awards -> BANQUET; networking/reception/exhibition -> RECEPTION; "
        "board/exec -> BOARDROOM; else CUSTOM.\n"
        "avNeeded true if mics/sound/stage/projector/screen/presentation are implied; "
        "cateringNeeded true if "
        "food/coffee/lunch/dinner/catering is implied. "
        "Infer sensible defaults; never leave a field blank.\n"
        "\nExamples:\n" + examples
    )


@lru_cache(maxsize=1)
def _anthropic():
    """One reused AsyncAnthropic client — keep-alive connection avoids per-call cold starts."""
    from anthropic import AsyncAnthropic

    return AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


async def _llm_attempt(text: str, repair_hint: str | None = None) -> EventRequestInput:
    client = _anthropic()
    user = text if not repair_hint else (
        f"{text}\n\n(Your previous output was invalid: {repair_hint}. Return corrected JSON only.)"
    )
    resp = await client.messages.create(
        model=settings.FAST_MODEL,
        max_tokens=1024,
        system=_system_prompt(),
        messages=[{"role": "user", "content": user}],
    )
    raw = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    return EventRequestInput.model_validate(json.loads(raw))


async def parse_event_request(text: str) -> EventRequestInput:
    """NL -> ``EventRequestInput``. LLM (low temp) + one retry; deterministic fallback.

    Falls back to the heuristic when no API key is set, or the LLM output won't
    validate twice, or the SDK/network errors — the flow never crashes (#4).
    """
    if not settings.ANTHROPIC_API_KEY:
        return _localized(heuristic_parse(text))
    try:
        return _localized(await _llm_attempt(text))
    except (ValidationError, json.JSONDecodeError) as first:
        try:
            return _localized(await _llm_attempt(text, repair_hint=str(first)[:300]))
        except Exception:
            return _localized(heuristic_parse(text))
    except Exception:
        return _localized(heuristic_parse(text))

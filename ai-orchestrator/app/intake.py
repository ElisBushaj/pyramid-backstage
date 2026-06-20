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
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError

from .config import settings
from .schemas import DateRange, EventRequestInput, Requirements

_EVENT_TYPES = {
    "conference": "CONFERENCE", "summit": "CONFERENCE", "startup": "CONFERENCE",
    "exhibition": "EXHIBITION", "expo": "EXHIBITION", "gallery": "EXHIBITION", "art": "EXHIBITION",
    "workshop": "WORKSHOP", "training": "WORKSHOP", "hackathon": "WORKSHOP",
    "performance": "PERFORMANCE", "concert": "PERFORMANCE", "show": "PERFORMANCE",
    "community": "COMMUNITY", "gathering": "COMMUNITY", "meetup": "COMMUNITY",
    "private": "PRIVATE", "wedding": "PRIVATE", "gala": "PRIVATE",
}
_LAYOUTS = {
    "theater": "THEATER", "theatre": "THEATER", "classroom": "CLASSROOM",
    "banquet": "BANQUET", "dinner": "BANQUET", "reception": "RECEPTION",
    "cabaret": "CABARET", "boardroom": "BOARDROOM",
}
_AV_HINTS = ("mic", " av ", "sound", "audio", "projector", "screen", "stage", "speaker", "presentation")


def _default_window(days_ahead: int = 30) -> DateRange:
    start = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).replace(
        hour=9, minute=0, second=0, microsecond=0
    )
    end = start.replace(hour=17)
    iso = lambda d: d.isoformat().replace("+00:00", "Z")  # noqa: E731
    return DateRange(start=iso(start), end=iso(end))


def heuristic_parse(text: str) -> EventRequestInput:
    """Deterministic fallback — keyword + number extraction. Never raises."""
    low = f" {text.lower()} "
    m = re.search(r"(\d{1,5})\s*(?:people|ppl|pax|persons?|attendees|guests)", low) or re.search(
        r"\b(\d{2,5})\b", low
    )
    attendees = max(1, int(m.group(1))) if m else 50
    event_type = next((v for k, v in _EVENT_TYPES.items() if k in low), "OTHER")
    layout = next((v for k, v in _LAYOUTS.items() if k in low), None)
    if layout is None:
        layout = "THEATER" if event_type in ("CONFERENCE", "PERFORMANCE") else "RECEPTION"
    av = any(h in low for h in _AV_HINTS)
    title = (re.split(r"[.,;\n]", text.strip())[0] or "Event request")[:80]
    title = title[:1].upper() + title[1:]
    return EventRequestInput(
        title=title,
        organizerName="Guest organizer",
        expectedAttendees=attendees,
        eventType=event_type,  # type: ignore[arg-type]
        preferredDates=[_default_window()],
        requirements=Requirements(layout=layout, avNeeded=av),  # type: ignore[arg-type]
    )


def _system_prompt() -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return (
        "You extract a structured venue event request from a free-text message.\n"
        f"Today is {today} (UTC). Resolve relative dates (e.g. 'next month') to concrete UTC datetimes.\n"
        "Output ONLY a JSON object (no prose, no code fence) with keys:\n"
        "  title (str), organizerName (str), contactEmail (str|null),\n"
        "  expectedAttendees (int >= 1),\n"
        "  eventType: one of CONFERENCE, EXHIBITION, WORKSHOP, PERFORMANCE, COMMUNITY, PRIVATE, OTHER,\n"
        "  preferredDates: array (>=1) of {start, end} RFC-3339 UTC with trailing Z,\n"
        "  requirements: {layout one of THEATER, CLASSROOM, BANQUET, RECEPTION, CABARET, BOARDROOM, "
        "CUSTOM; avNeeded bool; cateringNeeded bool; notes str|null}.\n"
        "Infer sensible defaults for any missing detail."
    )


async def _llm_attempt(text: str, repair_hint: str | None = None) -> EventRequestInput:
    from anthropic import AsyncAnthropic  # lazy import: only needed when a key is set

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    user = text if not repair_hint else (
        f"{text}\n\n(Your previous output was invalid: {repair_hint}. Return corrected JSON only.)"
    )
    resp = await client.messages.create(
        model=settings.MODEL,
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
        return heuristic_parse(text)
    try:
        return await _llm_attempt(text)
    except (ValidationError, json.JSONDecodeError) as first:
        try:
            return await _llm_attempt(text, repair_hint=str(first)[:300])
        except Exception:
            return heuristic_parse(text)
    except Exception:
        return heuristic_parse(text)

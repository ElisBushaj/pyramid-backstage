"""The conversational copilot (Phase D v1) behind ``POST /chat``.

Multi-turn: accumulates the brief across messages (in-memory session); once it has
the essentials (how many + when), runs the deterministic planning DAG and attaches
the ``OperationalPlan`` with ``proposedActions`` gated by ``requiresApproval``.

The AI **proposes**; a human + ops-core **authorize** (non-negotiable #3) — the
copilot never commits a reservation/approval itself, even on "yes". Narrative
numbers come from the plan (injected), never from free text (#2). Works without an
API key (deterministic readiness + templated questions); the key only upgrades the
phrasing of clarifying questions.
"""

from __future__ import annotations

import re

from .config import settings
from .planning import build_operational_plan
from .schemas import ChatResponse, OperationalPlan, ProposedAction
from .session import get_sessions

_NUM = re.compile(r"\d{2,5}")
_DATE = re.compile(
    r"(next\s+(week|month)|this\s+(week|month|weekend)|tomorrow|weekend|"
    r"\d{4}-\d{2}-\d{2}|"
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*)",
    re.I,
)
_AFFIRM = {
    "yes", "y", "approve", "approved", "go ahead", "ok", "okay", "confirm",
    "do it", "sure", "yep", "yes please", "send it", "lets do it", "let's do it",
}


def _has_num(t: str) -> bool:
    return bool(_NUM.search(t))


def _has_date(t: str) -> bool:
    return bool(_DATE.search(t))


def _is_affirmation(msg: str) -> bool:
    m = msg.strip().lower().rstrip("!.")
    return m in _AFFIRM or "approve" in m


def _approve_action(plan: OperationalPlan) -> list[ProposedAction]:
    """The single human-gated commit action for a feasible plan."""
    if not plan.reservation:
        return []
    name = plan.space.name if plan.space else "the hold"
    return [
        ProposedAction(
            type="approve_request",
            label=f"Approve & confirm {name}",
            payload={"requestId": plan.requestId},
        )
    ]


async def _phrase_question(brief: str, missing: list[str]) -> str:
    """Phrase the clarifying question. LLM when a key is set; template otherwise."""
    template = "Happy to help plan that. Could you tell me " + " and ".join(missing) + "?"
    if not settings.ANTHROPIC_API_KEY:
        return template
    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = await client.messages.create(
            model=settings.FAST_MODEL,
            max_tokens=120,
            system=(
                "You are a warm, concise venue-booking copilot for the Pyramid of Tirana. "
                "Ask ONE short question to collect the missing details. Never invent facts."
            ),
            messages=[
                {
                    "role": "user",
                    "content": f"Brief so far: {brief}\nMissing: {', '.join(missing)}\n"
                    "Ask for the missing details in one friendly sentence.",
                }
            ],
        )
        txt = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
        return txt or template
    except Exception:
        return template


async def handle_chat(session_id: str, message: str, *, ops, graph) -> ChatResponse:
    store = get_sessions()
    sess = store.get(session_id)

    # "yes/approve" on an existing feasible plan -> surface the gated action; never
    # auto-commit, and don't re-plan (which would create a duplicate hold).
    if sess.get("plan") and _is_affirmation(message):
        plan = OperationalPlan.model_validate(sess["plan"])
        if plan.feasible:
            return ChatResponse(
                reply=(
                    "Great — an admin can tap Approve to confirm; the hold stays for 30 minutes. "
                    "(The AI proposes; a person authorizes the commit.)"
                ),
                plan=plan,
                proposedActions=_approve_action(plan),
                requiresApproval=True,
            )

    # A self-contained new request (has a count AND a date) starts a fresh brief —
    # don't merge it into a prior event's context (the "event A bleeds into event B"
    # bug). Partial/incremental messages still accumulate across turns to gather one.
    if _has_num(message) and _has_date(message):
        sess["messages"] = [message]
        sess["plan"] = None
    else:
        sess.setdefault("messages", []).append(message)
    brief = "  ".join(sess["messages"])

    missing: list[str] = []
    if not _has_num(brief):
        missing.append("how many people")
    if not _has_date(brief):
        missing.append("roughly when (a date or month)")
    if missing:
        store.save(session_id, sess)
        return ChatResponse(
            reply=await _phrase_question(brief, missing),
            plan=None,
            proposedActions=[],
            requiresApproval=False,
        )

    result = await graph.ainvoke({"ops": ops, "nl_text": brief})
    plan = build_operational_plan(result, None)
    sess["plan"] = plan.model_dump()
    store.save(session_id, sess)

    if plan.feasible:
        return ChatResponse(
            reply=f"{plan.narrative} Shall I send it for approval?",
            plan=plan,
            proposedActions=_approve_action(plan),
            requiresApproval=True,
        )
    return ChatResponse(
        reply=f"{plan.narrative} Want me to try one of the alternatives?",
        plan=plan,
        proposedActions=[],
        requiresApproval=False,
    )

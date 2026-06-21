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

import asyncio
import re
from datetime import UTC, datetime

from .config import settings
from .intake import _anthropic
from .planning import build_operational_plan
from .rag.chroma import KnowledgeBase
from .schemas import ChatResponse, OperationalPlan, ProposedAction
from .session import SessionStore

_NUM = re.compile(r"\d{2,5}")
# Date-shaped tokens stripped BEFORE looking for a headcount, so "on 2026-09-15" or
# "the 22nd" never read as a crowd size (mirrors the intake heuristic). Without this,
# any ISO date trips the count check and the self-contained-event reset — dropping an
# earlier count mid-gather.
_DATEY = re.compile(r"\b\d{4}-\d{2}-\d{2}\b|\b(?:19|20)\d{2}\b|\b\d{1,2}(?:st|nd|rd|th)\b", re.I)
# Word-quantities ("a dozen", "a couple hundred") so the copilot doesn't re-ask for a
# count it can already resolve via the intake LLM/heuristic.
_WORDNUM = re.compile(
    r"\b(?:a\s+)?(?:dozen|hundred|handful|couple|few|several|"
    r"ten|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b",
    re.I,
)
# A message that could MATERIALLY change the plan (count, date, layout, AV, catering,
# or an explicit edit verb). Conversational follow-ups that match none of these
# ("what's the total?", "who approves?", "thanks") reuse the standing plan instead of
# re-running the graph — so a chat session never spawns duplicate holds (#3, #1).
_CHANGE_HINT = re.compile(
    r"\b(cater|food|lunch|dinner|coffee|buffet|snack|drinks|refreshment|"
    r"mic|av|sound|audio|projector|screen|stage|speaker|presentation|"
    r"theat(?:er|re)|classroom|banquet|reception|cabaret|boardroom|"
    r"instead|change|swap|make it|actually|rather|prefer|update|move|reschedul|add)\b",
    re.I,
)
_DATE = re.compile(
    r"(next\s+(week|month)|this\s+(week|month|weekend)|tomorrow|weekend|"
    r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|"
    r"\b(early|mid|late|this|next)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*|"
    r"\b(q[1-4]|spring|summer|autumn|fall|winter)\b|"
    r"\d{4}-\d{2}-\d{2}|"
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*)",
    re.I,
)
_AFFIRM = {
    "yes", "y", "approve", "approved", "go ahead", "ok", "okay", "confirm",
    "do it", "sure", "yep", "yes please", "send it", "lets do it", "let's do it",
}


def _has_num(t: str) -> bool:
    """A HEADCOUNT signal — a number/word-number that isn't part of a date."""
    return bool(_NUM.search(_DATEY.sub(" ", t)) or _WORDNUM.search(t))


def _has_date(t: str) -> bool:
    return bool(_DATE.search(t))


def _has_change(t: str) -> bool:
    """True iff the message carries something that could change the plan."""
    return _has_num(t) or _has_date(t) or bool(_CHANGE_HINT.search(t))


def _is_affirmation(msg: str) -> bool:
    m = msg.strip().lower().rstrip("!.")
    return m in _AFFIRM or "approve" in m


# A question we can answer from venue knowledge (RAG) rather than treat as booking
# data — starts with an interrogative or ends with "?".
_QSTART = (
    "what", "which", "where", "how", "do you", "does", "is ", "are ", "can ", "could ",
    "tell me", "list", "show me", "who", "when does", "why",
)


def _is_venue_question(msg: str) -> bool:
    low = msg.strip().lower()
    return bool(low) and (low.endswith("?") or low.startswith(_QSTART))


async def _answer_venue_question(message: str, *, kb: KnowledgeBase | None) -> str | None:
    """Grounded RAG answer from the venue knowledge base, or None to fall through.

    Retrieves venue_facts + setup_templates and answers ONLY from them (FAST_MODEL,
    or the top fact verbatim with no key). Returns None when the KB is off or has no
    hit, so the caller degrades to the normal intake gather. Never invents live
    availability or prices — those route back to a plan."""
    if kb is None:
        return None
    hits = await asyncio.to_thread(kb.query, "venue_facts", message, 5)
    hits += await asyncio.to_thread(kb.query, "setup_templates", message, 2)
    if not hits:
        return None
    context = "\n".join(f"- {h['document']}" for h in hits if h.get("document"))
    if not settings.ANTHROPIC_API_KEY:
        return f"{hits[0]['document']} Want me to put a plan together?"
    try:
        resp = await _anthropic().messages.create(
            model=settings.FAST_MODEL,
            max_tokens=220,
            system=(
                "You are the Pyramid of Tirana's booking copilot. Answer the question "
                "using ONLY the venue facts provided — never invent spaces, numbers, or "
                "features. If the facts don't cover it, say so briefly and offer to help "
                "plan. You do NOT know live availability or exact prices; for those, offer "
                "to draft a plan. Reply in ONE or two friendly sentences, under 60 words."
            ),
            messages=[
                {"role": "user", "content": f"Venue facts:\n{context}\n\nQuestion: {message}"}
            ],
        )
        txt = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
        return txt or f"{hits[0]['document']} Want me to put a plan together?"
    except Exception:
        return f"{hits[0]['document']} Want me to put a plan together?"


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


def _plan_response(plan: OperationalPlan) -> ChatResponse:
    """The standard reply for a freshly assembled OR re-served cached plan."""
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


async def _release_current(ops, sess: dict) -> None:
    """Release this session's live HELD lease before a re-plan / new event.

    Each graph run inserts a fresh reservation, and ops-core's hold even self-conflicts
    against the request's own prior hold on the same space — so without this, holds
    would stack until the reaper runs (#1). Best-effort: a missing/already-released
    lease is a no-op, never fatal."""
    rid = sess.get("reservation_id")
    if not rid:
        return
    try:
        await ops.release_reservation(rid)
    except Exception:
        pass
    sess["reservation_id"] = None


async def _finish(
    sessions: SessionStore, session_id: str, sess: dict, resp: ChatResponse
) -> ChatResponse:
    """Record the assistant's reply in the transcript and persist the session."""
    sess.setdefault("history", []).append({"role": "assistant", "content": resp.reply})
    await sessions.save(session_id, sess)
    return resp


def _needs_condense(messages: list[str]) -> bool:
    """True only when the brief fragments could CONFLICT (so a merge is worth a call).

    A clean multi-turn gather ("180 people" then "on the 15th") is purely additive —
    naive concatenation already parses right, so we skip the LLM. We condense only when
    the same parameter appears twice (two headcounts / two dates) or a later turn carries
    an edit verb / requirement change ("actually 250", "make it banquet", "add catering")."""
    if len(messages) < 2:
        return False
    counts = sum(1 for m in messages if _has_num(m))
    dates = sum(1 for m in messages if _has_date(m))
    changed = any(_CHANGE_HINT.search(m) for m in messages[1:])
    return counts >= 2 or dates >= 2 or changed


async def _condense_brief(messages: list[str]) -> str:
    """Merge the brief fragments into ONE standalone request, latest value wins.

    Fixes the "make it 250" caseː naive concatenation keeps both "180 people" and "250",
    and the parser takes the FIRST — so an override is silently ignored. Here a cheap
    FAST_MODEL call resolves the conversation to a single coherent line. Skipped (returns
    the plain join) when there's nothing to reconcile or no API key, and guarded so a bad
    rewrite that loses the headcount falls back to the join — never a worse brief."""
    joined = "  ".join(messages)
    if not _needs_condense(messages) or not settings.ANTHROPIC_API_KEY:
        return joined
    try:
        turns = "\n".join(f"- {m}" for m in messages)
        resp = await _anthropic().messages.create(
            model=settings.FAST_MODEL,
            max_tokens=120,
            system=(
                "You merge a short back-and-forth about ONE event into a SINGLE standalone "
                "request line. Combine every detail the organizer gave. When they change "
                "their mind — a new headcount, date, layout, or an added/removed requirement "
                "— the LATEST statement WINS; drop the superseded value. Output ONE plain-text "
                "line, no preamble and no JSON. Example: 'Conference for 250 people on "
                "2026-09-15 with catering'."
            ),
            messages=[
                {"role": "user", "content": f"Conversation:\n{turns}\n\nThe single request line:"}
            ],
        )
        txt = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
        return txt if (txt and _has_num(txt)) else joined
    except Exception:
        return joined


async def _phrase_question(brief: str, missing: list[str]) -> str:
    """Phrase the clarifying question. LLM when a key is set; template otherwise."""
    template = "Happy to help plan that. Could you tell me " + " and ".join(missing) + "?"
    if not settings.ANTHROPIC_API_KEY:
        return template
    try:
        now = datetime.now(UTC)
        today, weekday = now.strftime("%Y-%m-%d"), now.strftime("%A")
        resp = await _anthropic().messages.create(
            model=settings.FAST_MODEL,
            max_tokens=120,
            system=(
                "You are a warm, concise booking copilot for the Pyramid of Tirana — Albania's "
                "landmark events venue. "
                f"Today is {weekday}, {today} (UTC); resolve relative dates against it "
                "and NEVER invent or guess a specific date. "
                "Briefly acknowledge what the organizer has already told you, "
                "then ask in ONE friendly "
                "sentence only for what's still missing. Don't re-ask anything already known, "
                "don't list options, don't invent facts, and keep it under 30 words."
            ),
            messages=[
                {
                    "role": "user",
                    "content": f"What the organizer has said so far: {brief}\n"
                    f"Still missing: {', '.join(missing)}\n"
                    "Write the reply.",
                }
            ],
        )
        txt = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
        return txt or template
    except Exception:
        return template


async def handle_chat(
    session_id: str, message: str, *, ops, graph, sessions: SessionStore,
    kb: KnowledgeBase | None = None,
) -> ChatResponse:
    sess = await sessions.get(session_id)
    sess.setdefault("history", []).append({"role": "user", "content": message})

    # 1. "yes/approve" on a standing feasible plan -> surface the gated action; never
    #    auto-commit, and never re-plan (that would spawn a duplicate hold).
    if sess.get("plan") and _is_affirmation(message):
        plan = OperationalPlan.model_validate(sess["plan"])
        if plan.feasible:
            return await _finish(
                sessions, session_id, sess,
                ChatResponse(
                    reply=(
                        "Great — an admin can tap Approve to confirm; the hold stays for "
                        "30 minutes. (The AI proposes; a person authorizes the commit.)"
                    ),
                    plan=plan,
                    proposedActions=_approve_action(plan),
                    requiresApproval=True,
                ),
            )

    # 1b. A venue QUESTION carrying no booking signal, before any plan stands -> answer
    #     it from the knowledge base (RAG). Leaves the brief untouched, so a question
    #     asked mid-gather doesn't derail the intake. Falls through if RAG is off/empty.
    if not sess.get("plan") and _is_venue_question(message) and not _has_change(message):
        answer = await _answer_venue_question(message, kb=kb)
        if answer is not None:
            return await _finish(
                sessions, session_id, sess,
                ChatResponse(reply=answer, plan=None, proposedActions=[], requiresApproval=False),
            )

    # 2. A self-contained NEW event (count AND date in one message, once a plan already
    #    stands) starts a fresh brief — don't bleed event A into event B. An exact
    #    re-send of the standing event is NOT new (step 4 re-serves its plan). Before a
    #    plan exists we only accumulate, so a multi-turn gather never resets mid-way.
    is_new_event = bool(sess.get("plan")) and _has_num(message) and _has_date(message)
    if is_new_event and sess.get("brief_planned") != message:
        await _release_current(ops, sess)  # abandon the prior event's hold
        sess["messages"] = [message]
        sess["plan"] = None
        sess["brief_planned"] = None
        sess["request_id"] = None
    elif is_new_event:
        sess["messages"] = [message]
    else:
        sess.setdefault("messages", []).append(message)
    brief = "  ".join(sess["messages"])

    missing: list[str] = []
    if not _has_num(brief):
        missing.append("how many people")
    if not _has_date(brief):
        missing.append("roughly when (a date or month)")
    if missing:
        return await _finish(
            sessions, session_id, sess,
            ChatResponse(
                reply=await _phrase_question(brief, missing),
                plan=None,
                proposedActions=[],
                requiresApproval=False,
            ),
        )

    # 3. Brief is complete. Re-serve the STANDING plan for conversational follow-ups
    #    (no count/date/layout/AV/catering signal) or an identical brief — no graph run,
    #    no new request, no duplicate hold. Only a real change falls through to re-plan.
    if sess.get("plan") and (not _has_change(message) or sess.get("brief_planned") == brief):
        return await _finish(
            sessions, session_id, sess, _plan_response(OperationalPlan.model_validate(sess["plan"]))
        )

    # 4. First plan, or a genuine change -> release the prior hold (so leases never
    #    stack), then run the deterministic DAG exactly once. Condense the accumulated
    #    fragments into a standalone brief first so a later override (e.g. "make it 250")
    #    wins over the earlier value instead of being lost in the concatenation.
    await _release_current(ops, sess)
    planned_brief = await _condense_brief(sess["messages"])
    result = await graph.ainvoke({"ops": ops, "nl_text": planned_brief})
    plan = build_operational_plan(result, None)
    sess["plan"] = plan.model_dump()
    sess["brief_planned"] = brief
    sess["request_id"] = plan.requestId
    sess["reservation_id"] = plan.reservation.id if plan.reservation else None
    return await _finish(sessions, session_id, sess, _plan_response(plan))

"""Conversation state for the chat copilot.

Redis-backed when reachable (``settings.REDIS_URL``), with a transparent in-memory
fallback so the copilot still works with no Redis (local dev, the demo box) — the
"never hard-crash" spirit of non-negotiable #4 applied to memory. The interface is
identical across backends, so swapping is invisible to callers, and EVERY Redis op
degrades to memory on error: a flaky Redis can never take down the chat.

A session record holds BOTH the running brief and the full Q&A transcript, plus the
ops-core handles the copilot must remember to avoid duplicate work::

    {
      "messages":       [...],        # user-only brief fragments (drive the planner)
      "history":        [...],        # full {role, content} turns, incl. assistant replies
      "plan":           {...}|None,   # last assembled OperationalPlan (cached, re-served as-is)
      "brief_planned":  str|None,     # the brief that produced `plan` (re-plan guard)
      "request_id":     str|None,     # the ops-core request tracked this session
      "reservation_id": str|None,     # the live HELD lease, released before any re-plan
    }

The AI holds NO domain state — only the conversation; ops-core stays the system of
record. Records expire after a day so Redis self-cleans abandoned sessions.
"""

from __future__ import annotations

import json
from typing import Any

from .config import settings

_TTL_SECONDS = 60 * 60 * 24  # a day — long enough for a planning session, self-cleaning
_MAX_HISTORY = 40  # cap the transcript so a long session can't grow a record unbounded


def _key(session_id: str) -> str:
    return f"pyramid:chat:{session_id}"


def new_record() -> dict[str, Any]:
    """A fresh, empty session record (all the keys callers may read)."""
    return {
        "messages": [],
        "history": [],
        "plan": None,
        "brief_planned": None,
        "request_id": None,
        "reservation_id": None,
    }


class SessionStore:
    """Async conversation store: Redis when connected, else process memory."""

    def __init__(self, redis: Any | None = None) -> None:
        self._redis = redis
        self._mem: dict[str, dict[str, Any]] = {}

    @property
    def backend(self) -> str:
        return "redis" if self._redis is not None else "memory"

    async def get(self, session_id: str) -> dict[str, Any]:
        """Return the session record (a fresh empty one if unseen).

        Merged onto ``new_record()`` so a record written by an older build (missing
        the newer keys) still reads back with every field present.
        """
        if self._redis is not None:
            try:
                raw = await self._redis.get(_key(session_id))
                if raw is not None:
                    return {**new_record(), **json.loads(raw)}
            except Exception:
                pass  # degrade to memory — never fail a chat on a Redis hiccup
        stored = self._mem.get(session_id)
        return stored if stored is not None else new_record()

    async def save(self, session_id: str, data: dict[str, Any]) -> None:
        if data.get("history"):
            data["history"] = data["history"][-_MAX_HISTORY:]
        if self._redis is not None:
            try:
                await self._redis.set(_key(session_id), json.dumps(data), ex=_TTL_SECONDS)
                return
            except Exception:
                pass
        self._mem[session_id] = data

    async def reset(self, session_id: str) -> None:
        if self._redis is not None:
            try:
                await self._redis.delete(_key(session_id))
            except Exception:
                pass
        self._mem.pop(session_id, None)

    async def aclose(self) -> None:
        if self._redis is not None:
            try:
                await self._redis.aclose()
            except Exception:
                pass


async def create_session_store() -> SessionStore:
    """Build the store, connecting to Redis when reachable.

    Pings once at startup with a short timeout; on any failure (no server, bad URL)
    we silently use the in-memory backend so the app still boots and chats. Inspect
    the returned store's ``backend`` to see which path is live.
    """
    if not settings.REDIS_URL:
        return SessionStore()
    try:
        from redis.asyncio import from_url

        client = from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
        )
        await client.ping()
        return SessionStore(redis=client)
    except Exception:
        return SessionStore()

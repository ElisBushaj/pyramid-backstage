"""Conversation state for the chat copilot (Phase D v1).

In-memory, keyed by ``sessionId``. The AI holds **no domain state** — only the
conversation (per AI_ORCHESTRATION.md). Swap this for a Redis-backed store later
(``settings.REDIS_URL``) with the same tiny interface; nothing else changes.
"""

from __future__ import annotations

from typing import Any


class SessionStore:
    def __init__(self) -> None:
        self._data: dict[str, dict[str, Any]] = {}

    def get(self, session_id: str) -> dict[str, Any]:
        """Return (creating if needed) the mutable session record."""
        return self._data.setdefault(session_id, {"messages": [], "plan": None})

    def save(self, session_id: str, data: dict[str, Any]) -> None:
        self._data[session_id] = data

    def reset(self, session_id: str) -> None:
        self._data.pop(session_id, None)


_store: SessionStore | None = None


def get_sessions() -> SessionStore:
    """Process-wide session store singleton."""
    global _store
    if _store is None:
        _store = SessionStore()
    return _store

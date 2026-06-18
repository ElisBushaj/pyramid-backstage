"""Async ops-core HTTP client = the LangGraph "tools".

This is REAL, working code (not a stub). It treats every ops-core endpoint in
``ops-core/openapi.yaml`` as a callable tool. Each method:

  * hits ``settings.OPS_CORE_URL`` + the contract path,
  * forwards a fresh ``Idempotency-Key`` (uuid4) on every mutating request,
  * unwraps the ``ServiceEnvelope`` (``{status, message, messageKey, data}``)
    and returns the typed ``data``,
  * raises a typed ``OpsCoreConflict`` on ``409 {error: "conflict", conflicts}``
    so the graph's deterministic conflict branch can ``except`` it,
  * raises ``OpsCoreError`` for any other non-2xx.

Until ops-core is live, point ``OPS_CORE_URL`` at the stateful ``mock-ops-core``
(:4010) — the mock honors the same envelope + the real 409 conflict path, so the
conflict branch is genuinely testable in isolation.

NOTE: auth. ops-core's private routes sit behind a session cookie. The mock needs
no auth. When wiring against the real service, pass cookies/headers via the
``headers`` constructor arg (or extend this client) — left open here on purpose.
"""

from __future__ import annotations

from types import TracebackType
from typing import Any
from uuid import uuid4

import httpx

from .config import settings
from .schemas import (
    Asset,
    AuditEntry,
    Conflict,
    EventRequest,
    EventRequestInput,
    LineItemInput,
    Quote,
    RequestAggregate,
    Reservation,
    ReservationInput,
    Space,
    SpaceAvailability,
    Task,
    TaskInput,
)


# ═════════════════════════════════════════════════════════════════════════════
# Typed errors
# ═════════════════════════════════════════════════════════════════════════════
class OpsCoreError(Exception):
    """Any non-2xx from ops-core that isn't a reservation conflict."""

    def __init__(self, status_code: int, error: str | None, body: dict[str, Any]):
        self.status_code = status_code
        self.error = error
        self.body = body
        super().__init__(f"ops-core {status_code} {error or ''}: {body}")


class OpsCoreConflict(OpsCoreError):
    """A ``409 {error: "conflict", conflicts: Conflict[]}``.

    The graph's conflict branch keys off this exception type — it carries the
    parsed ``Conflict[]`` so the AI can explain *why* the hold failed and offer
    alternatives without re-querying. See ERROR_CONTRACT.md.
    """

    def __init__(self, body: dict[str, Any]):
        raw = body.get("conflicts", []) or []
        self.conflicts: list[Conflict] = [Conflict.model_validate(c) for c in raw]
        super().__init__(409, body.get("error", "conflict"), body)


# ═════════════════════════════════════════════════════════════════════════════
# Client
# ═════════════════════════════════════════════════════════════════════════════
def _idempotency_headers() -> dict[str, str]:
    """A fresh Idempotency-Key (uuid4) for one mutating request."""
    return {"Idempotency-Key": str(uuid4())}


class OpsCoreClient:
    """Thin async wrapper over the ops-core contract.

    Usage::

        async with OpsCoreClient() as ops:
            spaces = await ops.match_spaces(min_capacity=180, layout="THEATER")

    or share one long-lived instance across the app (see ``main.py`` lifespan).
    """

    def __init__(
        self,
        base_url: str | None = None,
        *,
        timeout: float = 15.0,
        headers: dict[str, str] | None = None,
    ):
        self.base_url = (base_url or settings.OPS_CORE_URL).rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            headers=headers or {},
        )

    # ── lifecycle ────────────────────────────────────────────────────────────
    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> OpsCoreClient:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()

    # ── envelope / error handling ─────────────────────────────────────────────
    @staticmethod
    def _unwrap(resp: httpx.Response) -> Any:
        """Validate status and return ``data`` from the ServiceEnvelope.

        Raises ``OpsCoreConflict`` on the reservation 409 conflict path, and
        ``OpsCoreError`` on any other non-2xx (including 409 invalid_transition).
        """
        if resp.is_success:
            try:
                payload = resp.json()
            except ValueError:
                return None
            # Success responses are wrapped: {status, message, messageKey, data}.
            if isinstance(payload, dict) and "data" in payload:
                return payload["data"]
            return payload

        # Error path — parse the error contract body.
        try:
            body = resp.json()
        except ValueError:
            body = {"error": "unknown", "status": resp.status_code, "raw": resp.text}

        error = body.get("error") if isinstance(body, dict) else None
        if resp.status_code == 409 and error == "conflict":
            raise OpsCoreConflict(body)
        raise OpsCoreError(resp.status_code, error, body if isinstance(body, dict) else {})

    # ═════════════════════════════════════════════════════════════════════════
    # TOOL SURFACE — one method per contract endpoint the AI calls.
    # (See docs/04-api/CONTRACT.md "The tool surface".)
    # ═════════════════════════════════════════════════════════════════════════

    # ── requests ──────────────────────────────────────────────────────────────
    async def create_request(self, body: EventRequestInput) -> EventRequest:
        """POST /private/requests → EventRequest."""
        resp = await self._client.post(
            "/private/requests",
            json=body.model_dump(exclude_none=True),
            headers=_idempotency_headers(),
        )
        return EventRequest.model_validate(self._unwrap(resp))

    async def get_request_aggregate(self, request_id: str) -> RequestAggregate:
        """GET /private/requests/:id → RequestAggregate (request+reservation+
        quote+tasks+conflicts+audit)."""
        resp = await self._client.get(f"/private/requests/{request_id}")
        return RequestAggregate.model_validate(self._unwrap(resp))

    # ── spaces ────────────────────────────────────────────────────────────────
    async def match_spaces(
        self,
        *,
        min_capacity: int | None = None,
        layout: str | None = None,
        start: str | None = None,
        end: str | None = None,
    ) -> list[Space]:
        """GET /private/spaces → SpaceWithAvailability[].

        When ``start`` & ``end`` are supplied, each Space carries ``available``
        computed with buffer-aware occupancy.
        """
        params: dict[str, Any] = {}
        if min_capacity is not None:
            params["minCapacity"] = min_capacity
        if layout is not None:
            params["layout"] = layout
        if start is not None:
            params["start"] = start
        if end is not None:
            params["end"] = end
        resp = await self._client.get("/private/spaces", params=params)
        data = self._unwrap(resp) or []
        return [Space.model_validate(s) for s in data]

    async def check_space_availability(
        self, space_id: str, *, start: str, end: str
    ) -> SpaceAvailability:
        """GET /private/spaces/:id/availability → SpaceAvailability (buffer-aware)."""
        resp = await self._client.get(
            f"/private/spaces/{space_id}/availability",
            params={"start": start, "end": end},
        )
        return SpaceAvailability.model_validate(self._unwrap(resp))

    # ── assets ────────────────────────────────────────────────────────────────
    async def check_assets(
        self,
        *,
        asset_type: str | None = None,
        quantity: int | None = None,
        start: str | None = None,
        end: str | None = None,
    ) -> list[Asset]:
        """GET /private/assets → AssetWithAvailability[] (windowed availability)."""
        params: dict[str, Any] = {}
        if asset_type is not None:
            params["type"] = asset_type
        if quantity is not None:
            params["quantity"] = quantity
        if start is not None:
            params["start"] = start
        if end is not None:
            params["end"] = end
        resp = await self._client.get("/private/assets", params=params)
        data = self._unwrap(resp) or []
        return [Asset.model_validate(a) for a in data]

    # ── reservations ──────────────────────────────────────────────────────────
    async def hold_reservation(self, body: ReservationInput) -> Reservation:
        """POST /private/reservations → Reservation, OR raises OpsCoreConflict on
        409 {conflicts}. The atomic hold; the conflict branch keys off the raise."""
        resp = await self._client.post(
            "/private/reservations",
            json=body.model_dump(exclude_none=True),
            headers=_idempotency_headers(),
        )
        return Reservation.model_validate(self._unwrap(resp))

    async def confirm_reservation(self, reservation_id: str) -> Reservation:
        """POST /private/reservations/:id/confirm → Reservation (idempotent)."""
        resp = await self._client.post(
            f"/private/reservations/{reservation_id}/confirm",
            headers=_idempotency_headers(),
        )
        return Reservation.model_validate(self._unwrap(resp))

    # ── quotes ────────────────────────────────────────────────────────────────
    async def generate_quote(
        self,
        *,
        request_id: str,
        reservation_id: str | None = None,
        extra_line_items: list[LineItemInput] | None = None,
    ) -> Quote:
        """POST /private/quotes → Quote (VAT applied, totalMinor server-computed)."""
        body: dict[str, Any] = {"requestId": request_id}
        if reservation_id is not None:
            body["reservationId"] = reservation_id
        if extra_line_items:
            body["extraLineItems"] = [li.model_dump() for li in extra_line_items]
        resp = await self._client.post(
            "/private/quotes",
            json=body,
            headers=_idempotency_headers(),
        )
        return Quote.model_validate(self._unwrap(resp))

    # ── conflicts ─────────────────────────────────────────────────────────────
    async def detect_conflicts(
        self, *, start: str, end: str, space_id: str | None = None
    ) -> list[Conflict]:
        """GET /private/conflicts → Conflict[] (proactive check for a window)."""
        params: dict[str, Any] = {"start": start, "end": end}
        if space_id is not None:
            params["spaceId"] = space_id
        resp = await self._client.get("/private/conflicts", params=params)
        data = self._unwrap(resp) or []
        return [Conflict.model_validate(c) for c in data]

    # ── tasks ─────────────────────────────────────────────────────────────────
    async def persist_tasks(self, request_id: str, tasks: list[TaskInput]) -> list[Task]:
        """POST /private/requests/:id/tasks → Task[] (AI-generated, human-owned)."""
        resp = await self._client.post(
            f"/private/requests/{request_id}/tasks",
            json={"tasks": [t.model_dump(exclude_none=True) for t in tasks]},
            headers=_idempotency_headers(),
        )
        data = self._unwrap(resp) or []
        return [Task.model_validate(t) for t in data]

    # ── approvals ─────────────────────────────────────────────────────────────
    async def approve_request(self, request_id: str) -> EventRequest:
        """POST /private/requests/:id/approve → EventRequest (MANAGER+).

        NB: if a held reservation expired, approve returns 409 conflict with the
        offending Conflict[] → surfaces here as OpsCoreConflict for re-planning.
        """
        resp = await self._client.post(
            f"/private/requests/{request_id}/approve",
            headers=_idempotency_headers(),
        )
        return EventRequest.model_validate(self._unwrap(resp))

    async def reject_request(self, request_id: str, reason: str) -> EventRequest:
        """POST /private/requests/:id/reject → EventRequest (MANAGER+)."""
        resp = await self._client.post(
            f"/private/requests/{request_id}/reject",
            json={"reason": reason},
            headers=_idempotency_headers(),
        )
        return EventRequest.model_validate(self._unwrap(resp))

    # ── audit ─────────────────────────────────────────────────────────────────
    async def get_audit(
        self, *, request_id: str | None = None, entity_type: str | None = None
    ) -> list[AuditEntry]:
        """GET /private/audit → AuditEntry[] (decision / change history)."""
        params: dict[str, Any] = {}
        if request_id is not None:
            params["requestId"] = request_id
        if entity_type is not None:
            params["entityType"] = entity_type
        resp = await self._client.get("/private/audit", params=params)
        data = self._unwrap(resp) or []
        return [AuditEntry.model_validate(a) for a in data]

"""Shared helper: assemble an ``OperationalPlan`` from the graph's final state.

Used by both ``POST /plan`` and the chat copilot so the plan shape never drifts
between the two surfaces.
"""

from __future__ import annotations

from typing import Any

from .schemas import OperationalPlan


def build_operational_plan(
    result: dict[str, Any], fallback_request_id: str | None
) -> OperationalPlan:
    return OperationalPlan(
        requestId=result.get("request_id") or (fallback_request_id or "req_unknown"),
        feasible=bool(result.get("feasible")),
        space=result.get("space"),
        reservation=result.get("reservation"),
        quote=result.get("quote"),
        tasks=result.get("tasks") or [],
        conflicts=result.get("conflicts") or [],
        alternatives=result.get("alternatives") or [],
        bundle=result.get("bundle") or [],
        warnings=result.get("warnings") or [],
        mapState=result.get("map_state") or [],
        narrative=result.get("narrative") or "",
    )

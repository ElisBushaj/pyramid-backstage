"""Pydantic models mirroring the ops-core contract (``ops-core/openapi.yaml``).

THE CONTRACT IS LAW. Field names, optionality, and enum spellings here match the
OpenAPI schema 1:1 so the AI side never drifts from ops-core on casing or shape.
Enums are modelled as ``Literal[...]`` of UPPER_SNAKE strings (not Python Enums)
so they serialize to the exact wire values and validate inbound payloads.

Two groups live here:
  1. Contract mirrors — DateRange, Space, Asset, EventRequest, Reservation,
     Quote, Task, Conflict, AuditEntry, RequestAggregate, ... (+ their *Input).
  2. AI-specific — ChatRequest/ChatResponse, ProposedAction, OperationalPlan.
     These are NOT part of ops-core; they are this service's own surface.

Money is always integer minor units (``*Minor`` fields). Timestamps are RFC-3339
UTC strings on the wire; kept as ``str`` here to avoid lossy round-tripping.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# ═════════════════════════════════════════════════════════════════════════════
# Shared enums — UPPER_SNAKE Literals (match openapi.yaml `components.schemas`)
# ═════════════════════════════════════════════════════════════════════════════
Currency = Literal["ALL"]
Layout = Literal["THEATER", "CLASSROOM", "BANQUET", "RECEPTION", "CABARET", "BOARDROOM", "CUSTOM"]
SpaceKind = Literal["MAIN", "TRANSITIONAL"]
AssetType = Literal[
    "SEATING", "TABLE", "MICROPHONE", "SCREEN", "PROJECTOR", "STAGE_UNIT", "LIGHTING", "OTHER"
]
AssetStatus = Literal["ACTIVE", "MAINTENANCE", "RETIRED"]
EventType = Literal[
    "CONFERENCE", "EXHIBITION", "WORKSHOP", "PERFORMANCE", "COMMUNITY", "PRIVATE", "OTHER"
]
RequestStatus = Literal["DRAFT", "PROPOSED", "APPROVED", "SCHEDULED", "COMPLETED", "REJECTED"]
ReservationStatus = Literal["HELD", "CONFIRMED", "RELEASED"]
QuoteStatus = Literal["DRAFT", "SENT", "ACCEPTED", "EXPIRED"]
TaskPhase = Literal["SETUP", "TEARDOWN"]
TaskStatus = Literal["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]
LineItemKind = Literal["SPACE", "ASSET", "SERVICE"]
ConflictType = Literal["SPACE_DOUBLE_BOOKED", "ASSET_OVERALLOCATED", "SETUP_WINDOW_OVERLAP"]
Role = Literal["ADMIN", "MANAGER", "OPS", "VIEWER"]

# AI-specific proposed-action verbs. These mirror the ops-core mutation tools the
# copilot can propose; ops-core re-validates every payload server-side.
ProposedActionType = Literal[
    "create_request",
    "hold_reservation",
    "confirm_reservation",
    "generate_quote",
    "persist_tasks",
    "approve_request",
    "reject_request",
]


# ═════════════════════════════════════════════════════════════════════════════
# Primitives
# ═════════════════════════════════════════════════════════════════════════════
class DateRange(BaseModel):
    """A half-open event window [start, end). RFC-3339 UTC strings."""

    start: str
    end: str


# ═════════════════════════════════════════════════════════════════════════════
# Space
# ═════════════════════════════════════════════════════════════════════════════
class Space(BaseModel):
    id: str
    name: str
    floor: int
    kind: SpaceKind
    # Layout -> seated capacity. A space need not support every layout.
    capacities: dict[str, int]
    features: list[str] = Field(default_factory=list)
    dayRateMinor: int
    currency: Currency = "ALL"
    setupBufferMinutes: int = 120
    teardownBufferMinutes: int = 120
    status: Literal["ACTIVE", "INACTIVE"] = "ACTIVE"
    # Present only when the caller supplied a start&end window.
    available: bool | None = None


class SpaceAvailability(BaseModel):
    spaceId: str
    available: bool
    conflictingRequestIds: list[str] = Field(default_factory=list)


# ═════════════════════════════════════════════════════════════════════════════
# Asset
# ═════════════════════════════════════════════════════════════════════════════
class Asset(BaseModel):
    id: str
    name: str
    type: AssetType
    totalQuantity: int
    location: str
    status: AssetStatus
    # Present only when the caller supplied a start&end window.
    availableQuantity: int | None = None


# ═════════════════════════════════════════════════════════════════════════════
# EventRequest
# ═════════════════════════════════════════════════════════════════════════════
class Requirements(BaseModel):
    layout: Layout | None = None
    avNeeded: bool | None = None
    cateringNeeded: bool | None = None
    notes: str | None = None


class EventRequest(BaseModel):
    id: str
    title: str
    organizerName: str
    contactEmail: str | None = None
    contactPhone: str | None = None
    expectedAttendees: int
    eventType: EventType
    preferredDates: list[DateRange]
    requirements: Requirements | None = None
    status: RequestStatus
    rejectionReason: str | None = None
    createdById: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None


class EventRequestInput(BaseModel):
    """Body for ``POST /private/requests`` — the structured intake shape.

    NL -> this shape is validated (with one retry + canned fallback) in the
    ``parse_intake`` graph node. See AI_ORCHESTRATION.md non-negotiable #4.
    """

    title: str
    organizerName: str
    contactEmail: str | None = None
    contactPhone: str | None = None
    expectedAttendees: int = Field(ge=1)
    eventType: EventType
    preferredDates: list[DateRange] = Field(min_length=1)
    requirements: Requirements | None = None


# ═════════════════════════════════════════════════════════════════════════════
# Reservation
# ═════════════════════════════════════════════════════════════════════════════
class ReservedAsset(BaseModel):
    assetId: str
    quantity: int = Field(ge=1)


class Reservation(BaseModel):
    id: str
    requestId: str
    spaceId: str
    dateRange: DateRange
    # Buffer-padded occupancy window (dateRange ± space buffers).
    effectiveStart: str | None = None
    effectiveEnd: str | None = None
    assets: list[ReservedAsset] = Field(default_factory=list)
    status: ReservationStatus
    # When a HELD lease lapses (reaper releases it). Null once CONFIRMED.
    expiresAt: str | None = None
    createdById: str | None = None
    createdAt: str | None = None


class ReservationInput(BaseModel):
    """Body for ``POST /private/reservations`` — the atomic hold."""

    requestId: str
    spaceId: str
    dateRange: DateRange
    assets: list[ReservedAsset] = Field(default_factory=list)
    holdMinutes: int = 30


# ═════════════════════════════════════════════════════════════════════════════
# Quote — totalMinor is SERVER-COMPUTED; clients never send it.
# ═════════════════════════════════════════════════════════════════════════════
class LineItem(BaseModel):
    label: str
    kind: LineItemKind
    qty: int
    unitPriceMinor: int
    subtotalMinor: int


class LineItemInput(BaseModel):
    """Optional SERVICE line items appended to a quote (e.g. catering)."""

    label: str
    qty: int = Field(ge=1)
    unitPriceMinor: int = Field(ge=0)


class Quote(BaseModel):
    id: str
    requestId: str
    currency: Currency = "ALL"
    lineItems: list[LineItem] = Field(default_factory=list)
    netMinor: int  # Σ subtotals
    vatRate: float  # e.g. 0.20
    vatMinor: int  # round(net * vatRate)
    totalMinor: int  # net + vat (server-computed)
    status: QuoteStatus
    version: int | None = None
    expiresAt: str | None = None
    createdAt: str | None = None


# ═════════════════════════════════════════════════════════════════════════════
# Task
# ═════════════════════════════════════════════════════════════════════════════
class Task(BaseModel):
    id: str
    requestId: str
    title: str
    phase: TaskPhase
    owner: str | None = None
    assigneeId: str | None = None
    # Relative to event start (SETUP, negative) or end (TEARDOWN, positive).
    dueOffsetHours: int | None = None
    dueAt: str | None = None
    status: TaskStatus


class TaskInput(BaseModel):
    """One entry in the ``POST /private/requests/:id/tasks`` body."""

    title: str
    phase: TaskPhase
    owner: str | None = None
    assigneeId: str | None = None
    dueOffsetHours: int | None = None


# ═════════════════════════════════════════════════════════════════════════════
# Conflict — the agent's deterministic conflict branch keys off this.
# ═════════════════════════════════════════════════════════════════════════════
class Conflict(BaseModel):
    type: ConflictType
    spaceId: str | None = None
    assetId: str | None = None
    requested: int | None = None  # for ASSET_OVERALLOCATED
    available: int | None = None  # for ASSET_OVERALLOCATED
    conflictingRequestIds: list[str] = Field(default_factory=list)
    window: DateRange
    detail: str


# ═════════════════════════════════════════════════════════════════════════════
# AuditEntry
# ═════════════════════════════════════════════════════════════════════════════
class AuditEntry(BaseModel):
    id: str
    actorId: str
    actorName: str | None = None
    action: str  # e.g. "request.approve"
    entityType: str  # e.g. "EventRequest"
    entityId: str
    requestId: str | None = None
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    reason: str | None = None
    at: str


# ═════════════════════════════════════════════════════════════════════════════
# Aggregate — the full ``GET /private/requests/:id`` payload.
# ═════════════════════════════════════════════════════════════════════════════
class RequestAggregate(BaseModel):
    request: EventRequest | None = None
    reservation: Reservation | None = None
    quote: Quote | None = None
    tasks: list[Task] = Field(default_factory=list)
    conflicts: list[Conflict] = Field(default_factory=list)
    audit: list[AuditEntry] = Field(default_factory=list)


# ═════════════════════════════════════════════════════════════════════════════
# AI-specific surface (NOT part of ops-core) — this service's own endpoints.
# ═════════════════════════════════════════════════════════════════════════════
class ChatRequest(BaseModel):
    """Body for ``POST /chat``. Stateful via ``sessionId`` (Redis-backed)."""

    sessionId: str
    message: str


class ProposedAction(BaseModel):
    """A reversible action the copilot proposes. The AI proposes; ops-core
    authorizes. ``payload`` is re-validated server-side before anything commits.
    """

    type: ProposedActionType
    label: str
    payload: dict[str, Any] = Field(default_factory=dict)


class OperationalPlan(BaseModel):
    """The headline artifact of ``POST /plan`` — a deterministic plan assembled
    from ops-core responses. Narrative numbers are INJECTED from those responses,
    never free-generated. ``alternatives`` is populated when ``feasible`` is
    False (e.g. an unused preferredDates window). See AI_ORCHESTRATION.md.
    """

    requestId: str
    feasible: bool
    space: Space | None = None
    reservation: Reservation | None = None
    quote: Quote | None = None
    tasks: list[Task] = Field(default_factory=list)
    conflicts: list[Conflict] = Field(default_factory=list)
    # Free DateRange windows / candidate spaces to fall back to when infeasible.
    alternatives: list[dict[str, Any]] = Field(default_factory=list)
    narrative: str


class ChatResponse(BaseModel):
    """Body returned by ``POST /chat``. ``requiresApproval`` gates anything that
    commits — human approval is mandatory before a proposed action runs.
    """

    reply: str
    plan: OperationalPlan | None = None
    proposedActions: list[ProposedAction] = Field(default_factory=list)
    requiresApproval: bool = True


# ── Health ───────────────────────────────────────────────────────────────────
class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"] = "ok"
    service: str = "ai-orchestrator"
    version: str = "0.1.0"

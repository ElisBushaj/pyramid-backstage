---
id: GLOSSARY
created: 2026-06-18
last_updated: 2026-06-18
status: active
owners: [elis]
---

# Glossary — Pyramid Backstage

> The shared vocabulary. When a term is load-bearing, the canonical detail lives in a domain doc or an ADR — this glossary points there rather than re-deriving it. Enum values are `UPPER_SNAKE`, as on the wire.

## Domain entities

**Space** — A bookable room or area of the Pyramid. Four **main halls** (`Blue`, `Orange`, `Green`, `Yellow`, on floors 0 / −1) plus **transitional areas** (`kind: TRANSITIONAL` — entrance, corridors, atria, terrace) that events spill into. Carries `capacities` (a layout → seated-count map), `features`, `dayRateMinor`, and per-space `setupBufferMinutes`/`teardownBufferMinutes`. The full **19-space catalog** ([docs/03-data/spaces.catalog.json](../03-data/spaces.catalog.json)) is the superset the `F14` expansion seeds — rows 1–6 authoritative (matching the seed exactly), rows 7–19 new. It adds catalog-extension fields per space: `slug`, `category` (`HALL`/`BOX`/`CORRIDOR`/`ATRIUM`/`ENTRANCE`/`TERRACE`/`TRANSITIONAL`), `zone`, `isCirculation`, `adjacent[]` (a slug graph), `map` (`{floor, ring, sectorFrom?, sectorTo?}` — circulation/center spaces carry no sector), and `ceilingCm`. ([docs/02-domain/SPACES.md](../02-domain/SPACES.md))

**Asset** — Operational equipment tracked as an **aggregate count** (not per physical unit): `type` (`SEATING`, `TABLE`, `MICROPHONE`, `SCREEN`, `PROJECTOR`, `STAGE_UNIT`, `LIGHTING`, `OTHER`), `totalQuantity`, `location`, `status` (`ACTIVE`/`MAINTENANCE`/`RETIRED`). `MAINTENANCE`/`RETIRED` report zero availability. ([docs/02-domain/ASSETS.md](../02-domain/ASSETS.md))

**AssetMovement / scan / live location** — The `F16` asset-tracking trail. An asset's **live location** is `Asset.location`, kept current by **scanning**: a QR/NFC tag encodes the `assetId`, and `POST /private/assets/:id/scan` records an **`AssetMovement`** ledger row (`{ assetId, fromLocation?, toLocation, actorId, at }`) *and* updates `Asset.location` in one transaction. Tracking is **aggregate-with-movement**, not per-unit serialized identity — the count stays aggregate; the ledger answers *"where is it?"*. `GET /private/assets/:id/movements` reads the history. ([docs/02-domain/ASSET_TRACKING.md](../02-domain/ASSET_TRACKING.md))

**EventRequest** — The inquiry that starts everything: `title`, `organizerName`, contact PII, `expectedAttendees`, `eventType`, `preferredDates[]` (one or more candidate windows), `requirements`. Created by staff (form) or by the AI from natural language (validated into `EventRequestInput` first). Lifecycle: `DRAFT → PROPOSED → APPROVED → SCHEDULED → COMPLETED`, or `→ REJECTED`. Transitions are guarded; an illegal move → `409 invalid_transition`. ([docs/02-domain/REQUESTS.md](../02-domain/REQUESTS.md))

**Reservation** — A hold on a **space + a set of assets** for a request's window; the **only** place inventory is decremented. Status: **`HELD`** (a lease, with `expiresAt`) → **`CONFIRMED`** (lease cleared) → or `RELEASED`. The write re-validates and decrements atomically inside a serializable, row-locked transaction. ([docs/02-domain/RESERVATIONS.md](../02-domain/RESERVATIONS.md))

**Quote** — A priced proposal built from a request + its reservation. Line items are `SPACE` (day-rate × days), `ASSET` (rate × qty), and optional `SERVICE`. `netMinor = Σ subtotals`; `vatMinor = round(net × 0.20)`; **`totalMinor = net + vat` is server-computed** — clients never send a total. Versions on regeneration. ([docs/02-domain/QUOTES.md](../02-domain/QUOTES.md), [ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md))

**Task** — A setup/teardown checklist item: `title`, `phase` (`SETUP`/`TEARDOWN`), `owner`, `assigneeId`, `dueOffsetHours`, computed `dueAt`, `status` (`TODO`/`IN_PROGRESS`/`DONE`/`BLOCKED`). `SETUP` offsets are negative from event **start**; `TEARDOWN` positive from event **end**. AI-generated, but persisted through ops-core so state stays single-sourced. ([docs/02-domain/TASKS.md](../02-domain/TASKS.md))

**Conflict** — A detected clash, one of **three types** ([docs/02-domain/CONFLICTS.md](../02-domain/CONFLICTS.md), [ADR-0009](../08-decisions/0009-conflict-window-includes-buffers.md)):
- **`SPACE_DOUBLE_BOOKED`** — a space's effective window overlaps another `HELD|CONFIRMED` reservation for the same space.
- **`ASSET_OVERALLOCATED`** — `requested > availableQuantity` for some asset in the window.
- **`SETUP_WINDOW_OVERLAP`** — the *event* windows don't overlap but the buffer-padded *effective* windows do (not enough turnaround time).
A `409 { conflicts }` carries the full `Conflict[]` so the AI can explain *why* without re-querying.

**AuditEntry** — An append-only ledger row written on **every** mutation and decision, in the same transaction as the change: `{ id, actorId, actorName, action, entityType, entityId, requestId?, before?, after?, reason?, at }`. `actorId` is the real authenticated staff member — never anonymous. This is *why* auth is in scope. ([docs/02-domain/AUDIT.md](../02-domain/AUDIT.md))

**OperationalPlan** — The headline artifact the AI returns: a `RequestAggregate`'s worth of structured data (`space`, `reservation`, `quote`, `tasks`, `conflicts`, `alternatives`) plus a generated **`narrative`** whose numbers are injected from ops-core responses, never free-generated. `feasible: false` populates `alternatives`. Lives on the AI side; ops-core supplies the data. ([docs/02-domain/AI_ORCHESTRATION.md](../02-domain/AI_ORCHESTRATION.md))

**RequestAggregate** — The single read payload the operational-plan page renders: `request + reservation + quote + tasks + conflicts + audit`. Returned by `GET /requests/:id`.

**Space bundle / circulation** — Two catalog concepts from the `F14` expansion. A **bundle** is a pre-composed set of spaces for an event archetype — a `conference`/`exhibition`/`gala` template pairing a main hall with the transitional spaces (atria, corridors, terrace) it naturally spills into. **Circulation** is the movement layer: spaces with `isCirculation: true` (corridors, atria, the entrance) connect halls via the `adjacent[]` slug graph and are governed by `circulationRules`. `bundleTemplates` and `circulationRules` ship as a **frontend constant** — no contract endpoint. ([docs/02-domain/SPACES.md](../02-domain/SPACES.md))

**FloorMap / digital twin** — The radial map of a Pyramid floor that renders the plan as a **digital twin of the event's logistics** — which halls are booked, which circulation spaces the event uses, and where a conflict bites. Driven by the catalog `map` field behind the prop contract `<FloorMap floor spaces={[{slug, status}]} />`, where `status ∈ free | main | bundle | conflict | circulation`. Elis ships a **v1** (radial layout from the catalog) as the self-sufficient fallback; a **v2** (real-plan SVG hotspots) is post-demo polish, and Alvin may later swap in his own behind the same prop contract. ([docs/05-frontend/FLOOR_MAP.md](../05-frontend/FLOOR_MAP.md))

## Time & correctness

**Effective window / buffer** — A reservation's real occupancy, wider than its event window: `effectiveStart = start − setupBuffer`, `effectiveEnd = end + teardownBuffer`. Availability and conflict detection always test the **effective** window. This is what makes back-to-back events surface as `SETUP_WINDOW_OVERLAP`. ([ADR-0009](../08-decisions/0009-conflict-window-includes-buffers.md))

**Half-open overlap** — Two windows `[aStart, aEnd)` and `[bStart, bEnd)` overlap iff `aStart < bEnd AND bStart < aEnd`. Half-open so touching boundaries (10–14 and 14–18) don't conflict. All overlap math goes through `utils/time.ts::overlaps()`.

**Asset availability** — `availableQuantity = totalQuantity − Σ ra.quantity` over every `ReservationAsset` whose parent is `HELD|CONFIRMED` (HELD only while `expiresAt > now`) and whose effective window overlaps the query — computed as **one grouped SQL query**, never a per-row loop, never "is total ≥ requested."

**Lease / `expiresAt` / reaper** — A `HELD` reservation decrements inventory immediately but expires at `createdAt + holdMinutes` (default 30). A **reaper** flips lapsed holds to `RELEASED` so inventory never leaks; availability counts only un-expired holds. `CONFIRMED` clears `expiresAt`.

**Money (integer minor units)** — All money is integer `*Minor` fields; for `ALL` (Albanian Lek) the minor-unit factor is 1. No float ever touches money; arithmetic goes through `utils/money.ts`. ([ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md))

## Mechanisms

**Outbox** — The `OutboxEvent` table. Domain events are written to it **in the same transaction** as the state change (no dual write); a **relay** polls unpublished rows, publishes to NATS, and stamps `publishedAt`. At-least-once delivery; consumers are idempotent. ([ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md), [docs/02-domain/AUDIT.md](../02-domain/AUDIT.md))

**Idempotency / `Idempotency-Key`** — A UUID v4 header required on every mutation. The first arrival processes and caches `(key, request-hash, response)` (Redis, 24h TTL); a replay returns the original bit-identically; a same-key-different-body replay → `409 idempotency_key_mismatch`. ([ADR-0005](../08-decisions/0005-idempotency-keys.md))

**Serializable transaction** — The isolation level the reservation hold/confirm runs at, with row locks, so the availability check and the decrement are one atomic step — killing the TOCTOU race where two holds grab the same scarce inventory. ([docs/02-domain/RESERVATIONS.md](../02-domain/RESERVATIONS.md))

## Roles (RBAC)

The ladder `ADMIN > MANAGER > OPS > VIEWER > PARTNER` ([ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md), [ADR-0010](../08-decisions/0010-partner-role-and-approval-chain.md)):

| Role | Can |
|------|-----|
| **PARTNER** | External organizer — file and read **own** event requests only (row-scoped by `EventRequest.createdById`). The least-privileged role; below `VIEWER`. |
| **VIEWER** | Read the whole tool surface. |
| **OPS** | VIEWER + inventory/space writes, create requests, hold/confirm reservations, persist tasks. |
| **MANAGER** | OPS + **approve / reject** requests. |
| **ADMIN** | MANAGER + staff/user management. |

`requireAuth` populates `req.actor = { id, name, role }` (the audit actor); `requireRole`/`requirePermission` gate beyond the route tier.

**PARTNER role** — The `F15` external-organizer role, added **below `VIEWER`**. A partner sees only their own `EventRequest` rows (scoped by `createdById`) through the partner portal; an admin **approval queue** moves their intake forward, reusing the `F10` approve/reject (MANAGER+) as a **single-step** chain — which is what **removes the email/Excel/phone loop** for external requests. ([docs/02-domain/PARTNER_PORTAL.md](../02-domain/PARTNER_PORTAL.md), [ADR-0010](../08-decisions/0010-partner-role-and-approval-chain.md))

## Services & infra

**ops-core** — The deterministic system of record (Elis · Node 20 · Express 5 · Prisma 7 · Postgres 17 · NATS). Knows what is true and enforces it; **no AI**. The 3-day build ships it in full. ([ADR-0001](../08-decisions/0001-two-services-one-contract.md))

**ai-orchestrator** — The reasoning layer (Alvin · Python · FastAPI · LangGraph · Claude · ChromaDB · Redis). Holds **no domain state**; everything true comes from ops-core. Scaffold + mock here; Alvin's lane. ([docs/02-domain/AI_ORCHESTRATION.md](../02-domain/AI_ORCHESTRATION.md))

**mock-ops-core** — A **stateful** contract-accurate stand-in for ops-core (runs under the compose `mock` profile, on `:4010`). Honors the reservation `409` path so the AI's conflict branch is genuinely testable. Integrate the real service by flipping `OPS_CORE_URL`.

**The contract** — [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml). The single source of truth and the **only** coupling between the two services. Locked Hour 0, additive-only after; a breaking change is a new ADR. `ai-orchestrator` treats each endpoint as a LangGraph tool. ([docs/04-api/CONTRACT.md](../04-api/CONTRACT.md))

**NATS (JetStream)** — The event backbone for the live dashboard + proactive AI; fed by the outbox. **Degradable** (`NATS_ENABLED=false` → REST-only). ([ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md))

**`req.actor`** — The authenticated staff identity (`{ id, name, role }`) `requireAuth` attaches to a request; the audit actor on every mutation.

**Service token / forwarded actor** — How the AI calls ops-core without a human session (`F17`). A **service token** authenticates the `ai-orchestrator` as a **system actor**; alongside it the AI forwards **`X-Acting-User-Id`** / **`X-Acting-User-Role`** headers naming the human on whose behalf it acts. ops-core resolves `req.actor` from the forwarded identity — so **audit stays attributed** and **partner row-scoping stays correct** — but enforces a **forwarded-role ceiling**: the acting role can never exceed what the service token is permitted to assert. The only new coupling stays the contract. ([ADR-0012](../08-decisions/0012-ai-ops-core-service-token-auth.md), [docs/04-api/AI_CONTRACT.md](../04-api/AI_CONTRACT.md))

**`@controlledResponse(type)`** — The controller decorator that serializes the `ServiceResponse<T>` envelope, sets the status, and maps thrown `APIError`s to the error contract. Every controller method uses it. ([docs/04-api/CORE_PATTERNS.md](../04-api/CORE_PATTERNS.md))

**`APIError`** — The only error a request path throws; carries a `messageKey` (i18n) and the structured fields for `409`/`422`. ([docs/04-api/ERROR_CONTRACT.md](../04-api/ERROR_CONTRACT.md))

**`ServiceResponse<T>` / envelope** — The success wrapper `{ status, message, messageKey, data: T }`; paginated lists use `PaginatedServiceResponse<T>`.

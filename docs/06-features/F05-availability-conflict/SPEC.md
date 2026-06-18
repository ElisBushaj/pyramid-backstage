---
id: F05
name: Availability & Conflict Engine
phase: Core
depends_on: [F02, F03, F06]
status: not_started
last_updated: 2026-06-18
---

# F05 — Availability & Conflict Engine

## Summary

The one engine that must be exactly right. Everything else is CRUD; this is where a subtle bug silently double-books a room or over-allocates 400 chairs. It computes windowed space and asset availability (buffer-aware, half-open overlap) and `detectConflicts(spaceId?, window, requestedAssets?)` → `Conflict[]`, surfacing the three conflict types `SPACE_DOUBLE_BOOKED | ASSET_OVERALLOCATED | SETUP_WINDOW_OVERLAP`. It is unit- **and** property-tested.

`detectConflicts` is used two ways: proactively by `GET /conflicts` and the availability reads, and defensively **inside** the F06 reservation transaction as the authoritative check. The same function backs both, so the proactive answer and the committed decision can never diverge.

## Scope

### In scope
- Time/buffer utilities in `utils/time.ts`: half-open `overlaps()`, effective-window computation (`effectiveStart = start − setupBuffer`, `effectiveEnd = end + teardownBuffer`), with unit tests.
- Space availability service (buffer-aware): is a space free in a padded window.
- Asset availability service: `availableQuantity = totalQuantity − Σ overlapping HELD|CONFIRMED holds`, as a single grouped query.
- `detectConflicts` producing the three conflict types with the exact `Conflict` shape.
- `GET /private/conflicts` and `GET /private/spaces/:id/availability`.
- Property tests: random overlaps never over-allocate / never double-book; half-open boundaries don't conflict.

### Out of scope
- The reservation write/transaction — F06 (it *calls* `detectConflicts`; the engine is read-only and pure-ish, it doesn't decrement).
- Space/asset CRUD — F02/F03.
- The `available` annotation wiring onto `GET /spaces` and `GET /assets` — those endpoints (F02-T04, F03-T03) consume these services.

## Acceptance criteria

- `overlaps(a, b)` is half-open: `aStart < bEnd && bStart < aEnd`, so 10:00–14:00 and 14:00–18:00 do **not** overlap (per `docs/02-domain/CONFLICTS.md`); all interval tests route through it, never hand-rolled.
- Effective windows pad by the space's buffers; availability and conflict detection always test the **effective** window, so back-to-back events surface as `SETUP_WINDOW_OVERLAP`, not a silent collision (per `docs/02-domain/CONFLICTS.md`, ADR-0009).
- Asset availability is `totalQuantity − Σ ra.quantity` over every `ReservationAsset` whose reservation is `HELD|CONFIRMED` and whose effective window overlaps the query window — computed as one grouped SQL query, never a per-row loop, never "is total ≥ requested" (per `docs/03-data/SCHEMA.md`).
- `detectConflicts` returns: `SPACE_DOUBLE_BOOKED` when the space's effective window overlaps another HELD|CONFIRMED reservation for the same space (with `conflictingRequestIds`); `ASSET_OVERALLOCATED` when `requested > availableQuantity` (with `requested`/`available`/`assetId`); `SETUP_WINDOW_OVERLAP` when event windows don't overlap but effective windows do — each matching the `Conflict` schema in `openapi.yaml` with a human `detail`.
- `GET /private/conflicts?spaceId&start&end` (start/end required) returns `Conflict[]`; `GET /private/spaces/:id/availability?start&end` returns `SpaceAvailability { spaceId, available, conflictingRequestIds }`.
- Property tests pass: for random sets of overlapping reservations, the summed HELD+CONFIRMED allocation for any asset in any window never exceeds `totalQuantity`, and no space ever hosts two overlapping effective windows; touching (half-open) boundaries never conflict.

## Data model

No new models. Reads `Space` (buffers), `Asset` (`totalQuantity`, `status`), `Reservation` (`status`, `effectiveStart/End`), `ReservationAsset` (`assetId`, `quantity`). Relies on the indexes `Reservation [spaceId,status,effectiveStart,effectiveEnd]`, `[status,effectiveStart,effectiveEnd]`, and `ReservationAsset [assetId]` from F00-T06.

## API surface

- `GET /private/conflicts?spaceId&start&end` — proactive conflict check for a space + window → `Conflict[]`.
- `GET /private/spaces/:id/availability?start&end` — single-space buffer-aware check → `SpaceAvailability`.

(The engine's services also back `GET /spaces` (F02-T04) and `GET /assets` (F03-T03) availability annotations.)

## UI surfaces

None — backend.

## Notes

- The full engine spec — half-open overlap, effective occupancy, the three conflict types, the Σ-overlapping-holds formula, `preferredDates[]` selection, and the property-test obligations — is `docs/02-domain/CONFLICTS.md`. This SPEC references it; the math is defined there.
- Buffers-in-window decision: ADR-0009. Time/money utilities: `docs/04-api/CORE_PATTERNS.md`.
- `detectConflicts` is the authoritative check reused inside the F06 transaction (`docs/02-domain/RESERVATIONS.md`).

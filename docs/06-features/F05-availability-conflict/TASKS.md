---
id: F05
name: Availability & Conflict Engine
last_updated: 2026-06-19
---

# F05 — Tasks

### F05-T01 — time/buffer utils + half-open overlap + effectiveWindow + unit tests
- Status: done
- Depends on: F00-T03
- Estimate: 0.25d
- Acceptance:
  - `src/utils/time.ts` exposes `overlaps(a, b)` implementing half-open overlap `aStart < bEnd && bStart < aEnd` (per `docs/02-domain/CONFLICTS.md`) and `effectiveWindow(dateRange, setupBufferMinutes, teardownBufferMinutes)` → `{ effectiveStart = start − setup, effectiveEnd = end + teardown }`.
  - All math is UTC-canonical; no hand-rolled interval comparisons anywhere else in the codebase (per `docs/04-api/CORE_PATTERNS.md`).
  - Unit tests (`utils/time.test.ts`) assert: touching boundaries don't overlap (10–14 vs 14–18 → false); genuine overlaps → true; effective windows pad correctly and a buffer-zone collision is detectable.
  - tsc clean; vitest passing.

### F05-T02 — space availability service (buffer-aware)
- Status: done
- Depends on: F05-T01, F06-T01
- Estimate: 0.5d
- Acceptance:
  - `src/services/availability` exposes a space-availability function: given a `spaceId` and a query `[start,end]`, it pads the query by the space's buffers and tests overlap against that space's `HELD|CONFIRMED` reservations' effective windows, returning `available: boolean` + `conflictingRequestIds`.
  - Only `HELD` reservations whose `expiresAt > now` (plus all `CONFIRMED`) count — a lapsed hold does not block (per `docs/02-domain/RESERVATIONS.md`).
  - Uses the `Reservation [spaceId,status,effectiveStart,effectiveEnd]` index; no per-row JS loop over all reservations.
  - This service backs the `GET /spaces` availability annotation (F02-T04) and `GET /spaces/:id/availability` (T05).
  - Unit test: a space with an overlapping confirmed reservation → `available:false` with the right `conflictingRequestIds`; a free window → `available:true`.

### F05-T03 — asset availability service (total − Σ overlapping HELD|CONFIRMED holds, single grouped query)
- Status: done
- Depends on: F05-T01, F06-T01
- Estimate: 0.5d
- Acceptance:
  - `src/services/availability` exposes an asset-availability function computing `availableQuantity = totalQuantity − Σ ra.quantity` over every `ReservationAsset` whose parent reservation is `HELD|CONFIRMED` (HELD only while `expiresAt > now`) and whose effective window overlaps the query window — as a **single grouped SQL query**, never a per-row loop, never "is total ≥ requested" (per `docs/02-domain/CONFLICTS.md` and `docs/03-data/SCHEMA.md`).
  - `MAINTENANCE`/`RETIRED` assets return `availableQuantity: 0` (per `docs/02-domain/ASSETS.md`).
  - Supports computing availability for one asset or a batch (so `GET /assets` annotates many in one query).
  - Uses the `ReservationAsset [assetId]` + `Reservation [status,effectiveStart,effectiveEnd]` indexes.
  - Unit test: with 310 of 400 chairs held overlapping the window → `90`; a non-overlapping hold does not reduce availability; two overlapping holds sum correctly.

### F05-T04 — detectConflicts → SPACE_DOUBLE_BOOKED|ASSET_OVERALLOCATED|SETUP_WINDOW_OVERLAP
- Status: done
- Depends on: F05-T02, F05-T03
- Estimate: 0.75d
- Acceptance:
  - `src/services/conflict` exposes `detectConflicts(spaceId?, window, requestedAssets?)` → `Conflict[]`, each matching the `openapi.yaml` `Conflict` schema (`type`, `spaceId?`, `assetId?`, `requested?`, `available?`, `conflictingRequestIds?`, `window`, `detail`).
  - `SPACE_DOUBLE_BOOKED`: emitted when the space's effective window overlaps another `HELD|CONFIRMED` reservation for the same space, with `conflictingRequestIds` and a human `detail` (per `docs/02-domain/CONFLICTS.md`).
  - `ASSET_OVERALLOCATED`: emitted per requested asset when `requested > availableQuantity`, carrying `assetId`, `requested`, `available`, and a `detail` like "Only 90 of 400 standard chairs free in this window".
  - `SETUP_WINDOW_OVERLAP`: emitted when the **event** windows do not overlap but the **effective** windows do (buffer-zone collision) — a distinct type, not folded into double-booked.
  - The function is pure/read-only (no writes, no decrement) so it can run both proactively and inside the F06 transaction as the authoritative check; results are deterministic for a given DB state.
  - Unit tests: each type fires exactly when it should and not otherwise; no false positive on touching half-open boundaries.

### F05-T05 — GET /conflicts + GET /spaces/:id/availability
- Status: done
- Depends on: F05-T04
- Estimate: 0.5d
- Acceptance:
  - `GET /private/conflicts?spaceId&start&end` (start/end required, validated) returns `ServiceResponse<Conflict[]>` by calling `detectConflicts`; with no conflicts it returns an empty array, not a 404.
  - `GET /private/spaces/:id/availability?start&end` (start/end required) returns `ServiceResponse<SpaceAvailability>` `{ spaceId, available, conflictingRequestIds }` per `openapi.yaml`; an unknown space id → `404 not_found`.
  - Both controllers use `@controlledResponse`; both are `/private` (VIEWER+).
  - Test: a space with an overlapping reservation yields a `SPACE_DOUBLE_BOOKED` from `/conflicts` and `available:false` from `/spaces/:id/availability`; a free window yields no conflict and `available:true`.

### F05-T06 — property tests (random overlaps never over-allocate / never double-book; half-open boundaries)
- Status: done
- Depends on: F05-T04
- Estimate: 0.5d
- Acceptance:
  - Property tests (the DoD for F05 per `docs/02-domain/CONFLICTS.md`): for randomly generated sets of overlapping reservations, the summed `HELD+CONFIRMED` allocation for any asset in any window never exceeds that asset's `totalQuantity`.
  - For randomly generated reservations on a space, no two whose effective windows overlap are both accepted as conflict-free — i.e. `detectConflicts` always catches a real double-book.
  - Half-open boundary property: windows that merely touch (`aEnd == bStart`) never produce a conflict.
  - The generators cover edge cases: zero-length buffers, large buffers that make non-overlapping events collide, exact-boundary touches.
  - Property tests run in CI; tsc clean.

### F05-T07 — pass conflicts window on Dashboard + AppShell; restore conflict alert + nav badge (XC-2)
- Status: not_started
- Depends on: F05-T03
- Estimate: 0.25d
- Acceptance:
  - Dashboard and AppShell `useConflicts` receive a memoized today±60d window (shared `defaultWindow`); no more `{}` → 422.
  - Dashboard conflict-alert banner + FloorMap red-lighting render with a seeded overlapping reservation; sidebar Conflicts nav badge shows a count. Verified: network 200, no 422/page.

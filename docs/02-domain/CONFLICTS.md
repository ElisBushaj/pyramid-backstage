# Domain — Conflicts & Availability (the correctness core)

This is the one engine that must be exactly right. Everything else is CRUD; this is where a subtle bug silently double-books a room or over-allocates 400 chairs. It is unit- **and** property-tested.

## Interval overlap (half-open)
Two windows `A = [aStart, aEnd)` and `B = [bStart, bEnd)` overlap iff:
```
aStart < bEnd  AND  bStart < aEnd
```
Half-open so a 10:00–14:00 booking and a 14:00–18:00 booking do **not** overlap. All overlap tests use `utils/time.ts::overlaps()`. Never hand-roll this.

## Buffers — effective occupancy
A room is not free the instant an event ends; crews need setup/teardown time. So a reservation's **effective occupancy** is wider than its event window:
```
effectiveStart = dateRange.start − space.setupBufferMinutes
effectiveEnd   = dateRange.end   + space.teardownBufferMinutes
```
Availability and conflict detection always test the **effective** window. This is what makes "two events back-to-back in Blue Hall" surface as a `SETUP_WINDOW_OVERLAP` instead of silently colliding. ([ADR-0009](../08-decisions/0009-conflict-window-includes-buffers.md))

## The three conflict types

### `SPACE_DOUBLE_BOOKED`
A space's effective window overlaps another `HELD|CONFIRMED` reservation for the **same space**.
```
detail: "Blue Hall already reserved for req_5a1 in this window."
conflictingRequestIds: [req_5a1]
```

### `ASSET_OVERALLOCATED`
For some requested asset, `requested > availableQuantity` in the window, where
`availableQuantity = totalQuantity − Σ overlapping holds` (see below).
```
assetId: asset_chair_std, requested: 180, available: 90
detail: "Only 90 of 400 standard chairs free in this window (310 held elsewhere)."
```

### `SETUP_WINDOW_OVERLAP`
The **event windows** don't overlap, but the **effective** windows do — i.e. the buffer zones collide. Distinct type so the UI/AI can say "they don't overlap, but there isn't enough turnaround time between them."

## Asset availability — sum of overlapping holds
The crux, and the most common place naive implementations are wrong:

```
availableQuantity(asset, window) =
    asset.totalQuantity
  − Σ ra.quantity
      for every ReservationAsset ra
      where ra.assetId = asset.id
        and ra.reservation.status in (HELD, CONFIRMED)
        and overlaps(ra.reservation.effectiveWindow, window)
```

Two events each needing 300 of 400 chairs in the same window **must** conflict — the second sees only 100 available. Computed as one grouped SQL query, not a per-row loop, and not "is total ≥ requested".

## Selecting among `preferredDates[]`
A request may carry several candidate windows. The planner tries them in order; the **first feasible** window is reserved, and the **unused** windows become free `alternatives[]` material for the conflict story ("Blue is taken on the 22nd, but it's free on your alternate date, the 24th").

## Where it runs
- `services/availability/` — windowed space + asset availability (read-only, used by `GET /spaces`, `GET /assets`, `GET /spaces/:id/availability`).
- `services/conflict/` — `detectConflicts(spaceId?, window, requestedAssets?)` → `Conflict[]`. Used proactively by `GET /conflicts` and defensively **inside** the reservation transaction (the authoritative check). See [RESERVATIONS.md](./RESERVATIONS.md).

## Test obligations (Definition of Done for F05)
- Unit: each conflict type fires exactly when it should and not otherwise; half-open boundaries (touching windows don't conflict).
- **Property**: for random sets of overlapping reservations, the sum of confirmed+held allocations for any asset in any window never exceeds `totalQuantity`; no space ever hosts two overlapping effective windows.

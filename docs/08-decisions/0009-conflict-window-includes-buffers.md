# ADR-0009: The conflict window includes setup/teardown buffers

- **Status**: Accepted
- **Date**: 2026-06-18

## Context

The conflict/availability engine is the **one part of the system that must be exactly right** — everything else is CRUD; this is where a subtle bug silently double-books a hall or over-allocates 400 chairs ([docs/02-domain/CONFLICTS.md](../02-domain/CONFLICTS.md)). The explicit, hard constraints from the brief are *multiple simultaneous events* and *shared assets*.

A naive engine tests the **event window** for overlap. But a room is not free the instant an event ends: crews need setup and teardown time. If the engine ignores that, two events scheduled back-to-back in Blue Hall pass the overlap test and then physically collide on the floor — the exact operational failure the product exists to prevent.

## Decision

**Availability and conflict detection always test the buffer-padded *effective* window, with half-open overlap, and asset availability is total − Σ overlapping holds.**

- **Effective occupancy** is wider than the event window:
  ```
  effectiveStart = dateRange.start − space.setupBufferMinutes
  effectiveEnd   = dateRange.end   + space.teardownBufferMinutes
  ```
  Every overlap test uses the effective window, never the raw event window.
- **Half-open overlap** — two windows `[aStart, aEnd)` and `[bStart, bEnd)` overlap iff `aStart < bEnd AND bStart < aEnd`. Half-open so a 10:00–14:00 booking and a 14:00–18:00 booking do **not** overlap (touching boundaries are fine). All overlap math goes through `utils/time.ts::overlaps()` — never hand-rolled.
- **The three conflict types** ([docs/02-domain/CONFLICTS.md](../02-domain/CONFLICTS.md)):
  - **`SPACE_DOUBLE_BOOKED`** — a space's effective window overlaps another `HELD|CONFIRMED` reservation for the same space.
  - **`ASSET_OVERALLOCATED`** — for some requested asset, `requested > availableQuantity` in the window.
  - **`SETUP_WINDOW_OVERLAP`** — the *event* windows don't overlap but the *effective* windows do (the buffer zones collide). A distinct type so the UI/AI can say *"they don't overlap, but there isn't enough turnaround time between them."*
- **Asset availability** is the sum of overlapping holds, not a "total ≥ requested" check:
  ```
  availableQuantity(asset, window) =
      asset.totalQuantity
    − Σ ra.quantity
        for every ReservationAsset ra
        where ra.assetId = asset.id
          and ra.reservation.status in (HELD, CONFIRMED)   # HELD only while expiresAt > now
          and overlaps(ra.reservation.effectiveWindow, window)
  ```
  Computed as **one grouped SQL query**, never a per-row loop. Two events each needing 300 of 400 chairs in the same window must conflict — the second sees only 100 free.

The same `detectConflicts(...)` runs proactively (`GET /conflicts`) **and** defensively inside the serializable reservation transaction (the authoritative check — [docs/02-domain/RESERVATIONS.md](../02-domain/RESERVATIONS.md)).

## Consequences

- **Back-to-back events surface correctly.** Two events with no event-window overlap but colliding buffers raise `SETUP_WINDOW_OVERLAP` — the operational truth, named distinctly so the AI can explain it.
- **Shared assets cannot be over-allocated.** The sum-of-holds computation makes the second large request fail with `ASSET_OVERALLOCATED`, carrying `requested`/`available` so the explanation is in the rejection.
- **The boundary is unambiguous.** Half-open overlap means a clean handoff at a shared time isn't a false conflict, while genuine overlap always is.
- **Property-testable.** The invariant — *for any window, Σ held+confirmed allocations of any asset never exceeds its total, and no space hosts two overlapping effective windows* — is checked by property tests, not just examples (F05 Definition of Done).
- **Buffers are per-space and configurable.** Defaults are 240 min setup / 120 min teardown (logged as an assumption, flagged as Q-01 for the real venue turnaround times).

## Alternatives considered

- **Test the raw event window only.** Rejected: back-to-back events physically collide on the floor; the product's whole point is to catch exactly that.
- **Closed intervals (`<=`).** Rejected: a clean handoff at a shared boundary (one event ends as the next's buffer begins) would register as a false conflict. Half-open is the correct model for time intervals.
- **"Total ≥ requested" asset check.** Rejected as the canonical naive bug: it ignores *other* overlapping holds entirely, so two big requests in the same window both pass and the inventory goes negative in reality.
- **A single global buffer constant.** Rejected: turnaround differs by space (a hall vs. a corridor); per-space `setupBufferMinutes`/`teardownBufferMinutes` is required, and the value itself is a question for the venue (Q-01).

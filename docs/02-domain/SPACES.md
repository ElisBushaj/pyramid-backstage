# Domain — Spaces

Bookable rooms and areas of the Pyramid.

## Inventory
- **Four main halls** on floors 0 / −1: **Blue, Orange, Green, Yellow**.
- **Transitional areas** (`kind: TRANSITIONAL`): entrance, corridors, informal gathering spaces — events "spill" into these, so they're bookable too (the brief's "think beyond booking").

## Shape
- `capacities`: a **layout → seated count** map (`THEATER`, `CLASSROOM`, `BANQUET`, `RECEPTION`, …). Capacity is layout-dependent — a room seats more in theater than banquet — so matching on `minCapacity` checks the capacity *for the requested layout*.
- `features`: free-form tags (`stage`, `av_builtin`, `step_free`, `natural_light`).
- `dayRateMinor`: integer Lek/day.
- `setupBufferMinutes` / `teardownBufferMinutes`: per-space turnaround padding feeding the [conflict engine](./CONFLICTS.md).

## Matching
`GET /spaces?minCapacity&layout&start&end` returns spaces whose `capacities[layout] ≥ minCapacity`, each annotated with `available` (buffer-aware) when a window is supplied. This is the AI's "match space" tool.

## Writes
Create/update is `OPS+`. Capacity, rate, and buffer changes are audited.

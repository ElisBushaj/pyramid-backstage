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

## The 19-space catalog
The Pyramid is a radial building — a central atrium of grand stairs, ring corridors, wedge rooms on 16 axes, terraced inside. The full bookable inventory is **19 spaces** across floors −1 / 0 / 3, captured once in [docs/03-data/spaces.catalog.json](../03-data/spaces.catalog.json), the single shared source for three consumers: the ops-core Space seed, the AI's venue facts, and the floor map.

- **Six halls** (`category: HALL`): the four colour halls — **Blue, Orange** (floor 0), **Green, Yellow** (floor −1) — plus the **Lower Gallery** (−1) and the panoramic **Skyline Room** (floor 3).
- **Transitional spaces** across all three floors: the **Entrance Atrium**, the central / lower / upper **atria**, the **East Ring** and **Lower** corridors, the **North Foyer**, and the iconic **Roof Terrace** (the pyramid slope).
- **Boxes** (`category: BOX`): small enclosed rooms — green room, breakout, workshop, back-of-house, upper meeting.

Rows 1–6 are **authoritative** — they match `seed.ts` exactly (UUIDs, capacities, rates, buffers). Rows 7–19 are read from the floor plans; their capacities, rates, buffers, adjacency, and map sectors are reasonable demo **estimates**, not surveyed facts.

## Catalog facets
The catalog carries extension fields beyond the seeded Space shape — added to ops-core **additively** (nullable + backfill) per [ADR-0013](../08-decisions/0013-space-catalog-extension-fields.md):

- `slug` — stable string id (`blue_hall`); the key the AI and the map graph reference.
- `category` (`HALL | BOX | CORRIDOR | ATRIUM | ENTRANCE | TERRACE | TRANSITIONAL`) and `zone` — for matching and grouping.
- `adjacent[]` — slugs that physically touch this space; the edge list of the circulation graph.
- `isCirculation` — true for corridors/atria/entrance: booking these affects neighbours' access/egress.
- `map { floor, ring, sectorFrom?, sectorTo? }` — schematic placement on the 16-axis radial map; circulation/centre spaces have no sector range. Feeds [FLOOR_MAP.md](../05-frontend/FLOOR_MAP.md).
- `ceilingCm` — clear height, where it constrains staging/rigging.

## Bundles & circulation
Many events aren't one room — a conference is a hall **plus** a registration atrium **plus** a green room. The catalog's `bundleTemplates` (conference / exhibition / gala) map an `eventType` to a set of space **roles** (main + registration + green_room, etc.), so the planner can propose a coherent multi-space layout, not a single booking.

`circulationRules` encode the cost of booking flow space: reserving an `isCirculation` space blocks or limits access to its `adjacent` neighbours for the effective window — surfaced as an *access warning*, with an alternative preferred. These ship as a **frontend constant** (no new contract endpoint); the AI mirrors them for its bundle and access reasoning. See [F14 SPEC](../06-features/F14-space-catalog/SPEC.md).

# ADR-0013: The space catalog is one shared source; extension fields land on Space additively

- **Status**: Accepted
- **Date**: 2026-06-20

## Context

The expansion grows the venue from the 6 currently-seeded spaces to a 19-space catalog covering every floor of the Pyramid — halls, boxes, and the **transitional** circulation spaces (corridors, atria, the entrance, the terrace) that the FloorMap and the planner need in order to reason about movement and adjacency. That catalog lives at [docs/03-data/spaces.catalog.json](../03-data/spaces.catalog.json). Three different consumers need the same venue facts:

- **ops-core** seeds `Space` rows from it (`seed.ts`),
- the **ai-orchestrator** loads it as `venue_facts` for the planner,
- the **FloorMap** renders the radial layout from it ([docs/05-frontend/FLOOR_MAP.md](../05-frontend/FLOOR_MAP.md)).

The catalog carries fields the `Space` model does not have today: `slug`, `category` (`HALL | BOX | CORRIDOR | ATRIUM | ENTRANCE | TERRACE | TRANSITIONAL`), `zone`, `isCirculation`, `adjacent[]` (a slug graph), `map { floor, ring, sectorFrom?, sectorTo? }`, and `ceilingCm`. It also carries `bundleTemplates` (conference / exhibition / gala) and `circulationRules`. Rows 1–6 are **authoritative** — their UUIDs, capacities, rates, and buffers match the ops-core seed byte-for-byte and must stay that way (the F12 planted Blue-hall conflict depends on those exact IDs). Rows 7–19 are new, with estimated attributes.

The question is twofold: where do the extension fields live, and is `bundleTemplates` / `circulationRules` part of the API contract.

## Decision

**`spaces.catalog.json` is the single shared source of venue facts; the per-space extension fields are promoted onto the `Space` model additively; `bundleTemplates` and `circulationRules` ship as a frontend constant, not a contract endpoint.**

- **One file, three consumers.** The catalog is the canonical venue description. ops-core seeds from it, the AI reads it as venue facts, the FloorMap renders from it. Rows 1–6 stay **byte-authoritative** — same UUIDs, capacities, rates, buffers — so the seed and the planted F12 conflict are unchanged. Rows 7–19 are seeded fresh.
- **Extension fields go on `Space`, additively.** `slug`, `category`, `zone`, `isCirculation`, `adjacent`, `map` (JSON), and `ceilingCm` are added to the model as **nullable** columns and **backfilled** from the catalog. This is an additive, non-breaking migration — no existing column changes type or meaning, consistent with the additive-only contract rule. See [docs/02-domain/SPACES.md](../02-domain/SPACES.md). Circulation/center spaces legitimately carry no `sectorFrom`/`sectorTo`; nullability is correct, not a gap.
- **`bundleTemplates` / `circulationRules` are a frontend constant.** They are static reference data — conference/exhibition/gala space groupings and movement rules that do not change per request and own no domain state. They ship in the frontend as a constant, sourced from the same catalog, with **no new contract endpoint**.

## Consequences

- **No drift between the three views of the venue.** Seed, planner, and map read the same file, so a space's adjacency or ring can't say one thing to the AI and another to the map.
- **The contract grows only where state lives.** Promoting per-space fields onto `Space` extends the existing space DTO additively; bundle/circulation meta stays out of the contract because it is static, avoiding a contract surface for data nobody writes.
- **F12 stays intact.** Because rows 1–6 keep their exact UUIDs and attributes, the seeded Blue-hall conflict and every existing test that pins those IDs continue to pass.
- **The catalog file becomes load-bearing.** A typo in `spaces.catalog.json` now affects seed, AI, and map at once. Accepted: one authoritative file is the point — it is reviewed as the contract-adjacent artifact it is.
- **Backfill must be deterministic.** The migration maps each catalog row to its `Space` by the authoritative UUID (rows 1–6) or creates it (rows 7–19); slugs are stable join keys for the FloorMap.

## Alternatives considered

- **Keep the catalog only in the AI and the FloorMap; leave `Space` as-is.** Rejected: the seed needs the 13 new spaces and the map needs `slug`/`map`/`adjacent` joined to real `Space` rows. Without promotion, the map and the record describe different venues, and conflict detection can't see the new spaces.
- **A contract endpoint for `bundleTemplates` / `circulationRules`.** Rejected: it is static reference data with no writer and no per-request variation. Serving it over the contract adds an endpoint, a DTO, and a type-mirror for data that a frontend constant covers exactly. Additive-only does not mean *add everything*.
- **Duplicate the extension fields into a side table keyed by `spaceId`.** Rejected: the fields are 1:1 attributes of a space (its slug, its ring, its ceiling). A side table is a join for no benefit; nullable columns on `Space` are the natural home.
- **Renumber or re-key rows 1–6 to a cleaner scheme.** Rejected outright: those UUIDs are pinned by the seed and the F12 conflict. Stability of existing IDs is non-negotiable.

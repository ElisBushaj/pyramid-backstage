---
id: F19
name: FloorMap / Digital Twin (v1)
phase: Integration
depends_on: [F14, F18]
status: not_started
last_updated: 2026-06-20
---

# F19 — FloorMap / Digital Twin (v1)

## Summary

The visual centerpiece: a self-contained v1 radial FloorMap of the Pyramid that lights up the AI plan in real time — the chosen space, its bundle, the affected circulation, and any conflict — so "can we make this happen?" becomes a picture, not a paragraph. Elis builds it behind the agreed prop contract `<FloorMap floor spaces={[{slug,status}]} />`, rendering the catalog `map` field ([docs/03-data/spaces.catalog.json](../../03-data/spaces.catalog.json)) landed by F14 — outer rooms as ring wedges on a 16-axis, circulation/center cores as rings. It is a pure presentational component fed from F18's `/plan` output: ops-core owns the v1 because it is the demo's digital twin and must never depend on the AI being live. A later, higher-fidelity component (real-plan SVG hotspots) hot-swaps in behind the **identical** props (v2, post-demo polish), per [docs/08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md](../../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md).

## Scope

### In scope
- `FloorMap.tsx` v1 — a radial, schematic floor renderer driven solely by the catalog `map` field: outer spaces as wedges (`sectorFrom..sectorTo` on a 16-axis ring), `ring`/`center` circulation cores (which carry no `sectorFrom`/`sectorTo`) as rings, with hard guards so a floor with missing/partial sectors never throws.
- The status → colour mapping (`free | main | bundle | conflict | circulation`) + a legend + a floor switcher (`-1 / 0 / 3`), fully EN/AL.
- A `spaces[]`-deriving adapter that turns `/plan` (F18) output into the prop contract, and embedding the FloorMap in `RequestDetail` and the Dashboard.
- The documented drop-in swap seam so Alvin's later component takes the same props with no caller change.

### Out of scope
- Adding the catalog-extension fields to the contract / seeding the 19 spaces — F14 (this feature only *renders* `map`/`category`/`isCirculation`; it lands no schema).
- The `/plan` endpoint and its AI auth — F18 / F17 (this feature consumes `/plan` output via the typed client; it implements no AI logic — Alvin's lane, A00).
- v2 real-plan SVG hotspots over a traced backdrop — captured as the optional, low-priority F19-T05 and deferred post-demo per [docs/08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md](../../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md).
- Editing/booking from the map (click-to-reserve) — read-only visualization only for the demo.

## Acceptance criteria

- `FloorMap.tsx` renders the prop contract `<FloorMap floor spaces={[{slug,status}]} />` exactly: it accepts a `floor` (`-1 | 0 | 3`) and a `spaces` array of `{ slug, status }`, looks each slug up in the catalog (`venue-catalog.ts`, F14), and draws only that floor's spaces from their `map` field — no other props, no ops-core fetch inside the component (it is pure/presentational).
- Outer-ring spaces (`map.ring: 'outer'`) draw as wedges spanning `sectorFrom..sectorTo` on a 16-axis ring; circulation/center cores (`map.ring: 'center' | 'corridor'`, which carry **no** `sectorFrom`/`sectorTo` per the catalog) draw as full/arc rings. A space whose `map` is missing, whose `ring` is unknown, or whose sector range is absent or inverted is skipped (or rendered as a neutral ring) and **never throws** — every floor (`-1`, `0`, `3`) renders without error even with partial data.
- `status` maps to colour deterministically — `free` (neutral), `main` (chosen/primary), `bundle` (secondary/adjacent), `conflict` (alert), `circulation` (affected access) — using design-system tokens (no raw hex), with a visible legend whose labels are i18n keys present in **both** `locales/en.json` and `al.json` (key-count parity); a space not present in the `spaces[]` prop defaults to `free`.
- A floor switcher toggles `-1 / 0 / 3`; switching re-renders the correct floor's geometry; the switcher and every label are EN/AL with no hard-coded strings.
- An adapter derives `spaces[]` from a `/plan` (F18) result: the plan's chosen space → `main`; its bundle adjacents → `bundle`; any space in the plan's conflicts → `conflict`; affected `isCirculation` neighbours → `circulation`; everything else on the floor → `free`. The FloorMap embeds in `RequestDetail` (the OperationalPlanView) and on the Dashboard, fed by this adapter.
- The component swap seam is documented and respected: the v2/Alvin component drops in behind the **identical** `<FloorMap floor spaces={[{slug,status}]} />` props with no change to `RequestDetail`/Dashboard call sites (per [docs/08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md](../../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md) and `COLLABORATION.md §6.1`).
- When `/plan` is unavailable (AI down), the FloorMap still renders the floor from the catalog with all spaces `free` (or a request's confirmed space as `main` from ops-core data) — the centerpiece degrades gracefully and never blanks (the self-sufficient-fallback rule).
- `tsc`/Vitest clean; the component renders in unit tests for all three floors with empty, partial, and full `spaces[]`; conforms to the design system ([docs/05-frontend/DESIGN_SYSTEM.md](../../05-frontend/DESIGN_SYSTEM.md)) and i18n parity ([docs/05-frontend/I18N.md](../../05-frontend/I18N.md)).

## Data model

No ops-core models, migrations, or endpoints. The FloorMap is pure frontend: it reads the static catalog constant ([frontend/src/lib/venue-catalog.ts](../../../frontend/src/lib/venue-catalog.ts), landed by F14) for each space's `map` (`{ floor, ring, sectorFrom?, sectorTo? }`), `category`, `isCirculation`, and `adjacent`, and takes its live state from the `spaces: [{ slug, status }]` prop. `status` is a closed frontend enum `'free' | 'main' | 'bundle' | 'conflict' | 'circulation'` (not a contract type). See [docs/05-frontend/FLOOR_MAP.md](../../05-frontend/FLOOR_MAP.md) and [docs/08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md](../../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md).

## API surface

None added. The FloorMap consumes existing surfaces only — the F14 catalog data (via the frontend constant) and `/plan` output (via the F18 wiring + typed client). It issues no requests of its own.

## UI surfaces

- `FloorMap` — the radial digital-twin component (legend + floor switcher), embedded in:
  - `/requests/:id` — the OperationalPlanView, beside the narrative plan, lit from that request's `/plan` result (PAGES §4.3).
  - `/` Dashboard — an at-a-glance "what's live in the building" tile (PAGES §3.1).

## Notes

- Ownership + fidelity tiers (Elis ships v1 now; Alvin's higher-fidelity component swaps in behind identical props later; v2 is post-demo): [docs/08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md](../../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md).
- The map renders the catalog `map` field — schematic radial placement, **not** surveyed geometry (`$meta.conventions.map`, `$meta.caveats`): [docs/03-data/spaces.catalog.json](../../03-data/spaces.catalog.json). Circulation and `ring: center` spaces deliberately omit the sector range — guard for it.
- The fields it reads are landed additively by F14: [docs/06-features/F14-space-catalog/SPEC.md](../F14-space-catalog/SPEC.md). The `/plan` output it lights up comes from F18: [docs/06-features/F18-ai-wiring/SPEC.md](../F18-ai-wiring/SPEC.md), [docs/04-api/AI_CONTRACT.md](../../04-api/AI_CONTRACT.md).
- The frontend spec for the component (prop contract, geometry, status semantics): [docs/05-frontend/FLOOR_MAP.md](../../05-frontend/FLOOR_MAP.md). Design tokens + i18n parity it must honour: [docs/05-frontend/DESIGN_SYSTEM.md](../../05-frontend/DESIGN_SYSTEM.md), [docs/05-frontend/I18N.md](../../05-frontend/I18N.md).
- The demo never depends on the AI: the FloorMap is a self-sufficient fallback — it renders from the catalog alone when `/plan` is down (the locked self-sufficiency rule).

---
id: F19
name: FloorMap / Digital Twin (v1)
last_updated: 2026-06-20
---

# F19 — Tasks

### F19-T01 — FloorMap.tsx v1: radial map per floor from the catalog `map` field
- Status: done
- Depends on: F14-T05
- Estimate: 1d
- Acceptance:
  - `frontend/src/components/command/FloorMap.tsx` exports a component with the exact prop contract `<FloorMap floor spaces={[{slug,status}]} />`: `floor` is `-1 | 0 | 3`, `spaces` is `Array<{ slug: string; status: 'free' | 'main' | 'bundle' | 'conflict' | 'circulation' }>` — no ops-core fetch inside (pure/presentational), per [docs/05-frontend/FLOOR_MAP.md](../../05-frontend/FLOOR_MAP.md).
  - It reads each space's `map` (`{ floor, ring, sectorFrom?, sectorTo? }`) from the F14 catalog constant ([frontend/src/lib/venue-catalog.ts](../../../frontend/src/lib/venue-catalog.ts)) and draws **only** the passed `floor`'s spaces.
  - Outer spaces (`map.ring: 'outer'`) render as wedges spanning `sectorFrom..sectorTo` on a 16-axis ring; `ring`/`center` circulation cores (which carry **no** `sectorFrom`/`sectorTo`, per [docs/03-data/spaces.catalog.json](../../03-data/spaces.catalog.json)) render as full/arc rings.
  - GUARD every missing/partial input: a space with no `map`, an unknown `ring`, or an absent/inverted `sectorFrom..sectorTo` is skipped (or drawn as a neutral ring) and the component **never throws** — all three floors (`-1`, `0`, `3`) render without error on empty, partial, and full `spaces[]`.
  - Geometry is schematic SVG (catalog `map` is stylized placement, not surveyed geometry — per the catalog `$meta`); uses design-system tokens, no raw hex (per [docs/05-frontend/DESIGN_SYSTEM.md](../../05-frontend/DESIGN_SYSTEM.md)).
  - tsc clean; Vitest renders the component for each floor with empty/partial/full `spaces[]` and asserts no throw.

### F19-T02 — status → colour mapping + legend + floor switcher + EN/AL i18n
- Status: done
- Depends on: F19-T01
- Estimate: 0.5d
- Acceptance:
  - A deterministic `status → colour` map covers all five states — `free` (neutral), `main` (chosen/primary), `bundle` (secondary/adjacent), `conflict` (alert), `circulation` (affected access) — sourced from design-system tokens; a space absent from the `spaces[]` prop defaults to `free`.
  - A visible legend lists the five statuses with i18n labels; a floor switcher toggles `-1 / 0 / 3` and re-renders the correct floor's geometry on change.
  - Every legend label, the floor-switcher labels, and the component title are i18n keys present in **both** `frontend/src/i18n/en.json` and `al.json` with enforced key-count parity (per [docs/05-frontend/I18N.md](../../05-frontend/I18N.md)) — no hard-coded strings.
  - tsc clean; Vitest asserts the colour for each status and that switching floors swaps the rendered space set.

### F19-T03 — derive spaces[] from /plan output + embed in RequestDetail and Dashboard
- Status: done
- Depends on: F18-T03, F19-T02
- Estimate: 0.75d
- Acceptance:
  - An adapter maps a `/plan` (F18) result to the `spaces: [{ slug, status }]` prop: the plan's chosen space → `main`; its bundle adjacents → `bundle`; any space in the plan's `conflicts` → `conflict`; affected `isCirculation` neighbours (from the chosen space's `adjacent` in the catalog) → `circulation`; everything else on the floor → `free` (per [docs/04-api/AI_CONTRACT.md](../../04-api/AI_CONTRACT.md) `OperationalPlan` shape).
  - `FloorMap` is embedded in `RequestDetail` (the OperationalPlanView at `/requests/:id`, PAGES §4.3), lit from that request's plan, and on the `/` Dashboard (PAGES §3.1) as a "what's live" tile, both fed by the adapter.
  - FALLBACK: when `/plan` is unavailable (AI down), the adapter yields all spaces `free` — or the request's confirmed space as `main` from ops-core aggregate data — so the map never blanks (the locked self-sufficiency rule); no thrown error, no blocked render.
  - The `status` enum stays a frontend-only type (not a contract type); the adapter unwraps the `/plan` envelope via the existing typed client (`src/api/client.ts`), with no new API call.
  - tsc clean; Vitest covers chosen-only, chosen+bundle, conflict, and AI-down (all-free) derivations.

### F19-T04 — drop-in swap seam for Alvin's component (identical props)
- Status: done
- Depends on: F19-T03
- Estimate: 0.25d
- Acceptance:
  - The swap point is a single module boundary (e.g. a `FloorMap` re-export / index) so Alvin's higher-fidelity component replaces the v1 implementation behind the **identical** `<FloorMap floor spaces={[{slug,status}]} />` props — `RequestDetail` and Dashboard call sites change in **zero** places.
  - The prop contract (`floor`, `spaces: [{slug,status}]`, the five-value `status` enum) is documented as the frozen seam in [docs/05-frontend/FLOOR_MAP.md](../../05-frontend/FLOOR_MAP.md), citing [docs/08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md](../../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md) and `COLLABORATION.md §6.1` as the ownership/handoff source.
  - A note records the fidelity tiers: v1 (Elis, schematic radial — ships now) vs v2 (real-plan SVG hotspots — Alvin/post-demo, F19-T05), and that the swap is presentational-only (no caller, contract, or data-shape change).
  - tsc clean.

### F19-T05 — (v2, OPTIONAL, post-demo) real-plan SVG hotspot polygons
- Status: not_started
- Depends on: F19-T04
- Estimate: 1d
- Acceptance:
  - LOW PRIORITY / post-demo: trace per-space hotspot polygons over a real floor-plan backdrop from the source plans (`New_Docs/kati 0`, `kati -1`, `kati 3` PDFs) for floors `-1 / 0 / 3`, keyed by `slug`.
  - The v2 component honours the **identical** `<FloorMap floor spaces={[{slug,status}]} />` props and the same five-value `status` colour mapping, dropping into the F19-T04 seam with no call-site change (per [docs/08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md](../../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md)).
  - Same missing-slug/partial-data guards as v1 — an untraced space falls back to the v1 radial wedge or a neutral marker, never a throw.
  - Explicitly NOT in the 3-day demo scope; deferred behind the v1 (per [docs/05-frontend/FLOOR_MAP.md](../../05-frontend/FLOOR_MAP.md)). tsc clean if/when built.

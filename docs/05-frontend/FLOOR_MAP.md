# FloorMap — the spatial / digital-twin component

> The visual centerpiece: a radial schematic of the Pyramid that lights up the AI plan in real time — the chosen space, its bundle, the affected circulation, and any conflict — so *"can we make this happen?"* becomes a picture, not a paragraph. A command-center component (`frontend/src/components/`) alongside `ConflictBanner` and `AvailabilityTimeline`; see the inventory in [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) §4 and the page embeds in [`PAGES.md`](./PAGES.md). The feature is [`../06-features/F19-floor-map/SPEC.md`](../06-features/F19-floor-map/SPEC.md); ownership + fidelity tiers are locked in [`../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md`](../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md).

## 1. Prop contract — the seam

The component is pure and presentational. It takes static geometry from the catalog and dynamic state from one prop; it issues no requests and holds no domain state. This is the contract Alvin's higher-fidelity v2 drops in behind, unchanged (COLLABORATION.md §6.1, root: [`../../COLLABORATION.md`](../../COLLABORATION.md)).

```ts
<FloorMap floor={0} spaces={[{ slug: "blue_hall",   status: "main" },
                             { slug: "north_foyer", status: "bundle" },
                             { slug: "orange_hall", status: "conflict" }]} />
// floor  ∈ -1 | 0 | 3
// status ∈ "free" | "main" | "bundle" | "conflict" | "circulation"
```

- `floor` selects which slice of the catalog to draw. Only spaces whose `map.floor` matches render.
- `spaces` is the live overlay: each entry pins a `status` onto a catalog slug. A catalog space **not** named in `spaces[]` defaults to `free`. An entry whose slug isn't in the catalog (or isn't on this floor) is ignored — never a throw.
- No other props for v1. The legend, the floor switcher, and all geometry derive from `floor` + the catalog. Keeping the surface this small is what lets v2 swap in behind it.

## 2. Geometry — rendering the catalog `map` field

The renderer reads only the `map` field from the venue catalog ([`../03-data/spaces.catalog.json`](../03-data/spaces.catalog.json), exposed to the SPA as the `venue-catalog.ts` constant landed by F14). The building is radial — a central atrium of grand stairs, ring corridors, wedge rooms on **16 axes** — so the map is a set of concentric rings with the outer ring divided into 16 sectors.

`map` shape, per space:

```ts
map: { floor: -1 | 0 | 3, ring: "outer" | "corridor" | "center",
       sectorFrom?: 1..16, sectorTo?: 1..16 }
```

Rendering rules:

- **Outer rooms** (`ring: "outer"`) draw as **wedges** spanning `sectorFrom..sectorTo` on the 16-axis ring — e.g. Blue Hall = sectors 1–3, Orange Hall = 4–6 (see the catalog). A single-sector box (`box_3_workshop`, 7–7) is one wedge. The 16 axes give the dial; the sector range is the arc.
- **Circulation cores** (`ring: "corridor"` and `ring: "center"`) carry **no** `sectorFrom`/`sectorTo` per the catalog. A `center` space (the central atrium) draws as the **inner disc/ring**; a `corridor` draws as the **mid ring** (optionally arced if it later carries sectors — `lower_corridor` and `east_ring_corridor_f0` do today, so honour them when present, else draw the full ring). These are the access fabric; status `circulation` tints them.

### 2.1 Guards (never throw)

The catalog is partly estimated and circulation spaces deliberately omit sectors, so the renderer is defensive — **every floor renders even with partial data** (F19 acceptance):

- `map` missing → skip the space (don't draw it).
- `ring` unknown → skip, or fall back to a neutral mid ring.
- `ring: "outer"` but `sectorFrom`/`sectorTo` absent, out of `1..16`, or inverted (`from > to`) → skip that wedge. Do **not** guess a span.
- `ring: "center" | "corridor"` → never read sectors; draw the ring regardless.
- A `spaces[]` entry whose slug resolves to a *different* floor than the `floor` prop → ignore.

The guard posture is "skip silently, render the rest" — a missing wedge is acceptable; a blank or thrown map is not. This is what makes the FloorMap a safe fallback (§5).

## 3. Status → derivation from `/plan`

`status` is a closed **frontend** enum, not a contract type. It is the join of geometry (catalog) and live state (the AI plan). An adapter turns a `POST /plan` result (the F18 wiring, [`../06-features/F18-ai-wiring/SPEC.md`](../06-features/F18-ai-wiring/SPEC.md); contract in [`../04-api/AI_CONTRACT.md`](../04-api/AI_CONTRACT.md)) into `spaces[]`:

| `/plan` element | → `status` | meaning |
|---|---|---|
| the plan's **chosen** space | `main` | the primary booked room — the accent wedge |
| the chosen space's **bundle** adjacents (registration / green room / welcome, per the plan's `bundleTemplates` roles) | `bundle` | secondary rooms in the same plan |
| any space in the plan's **conflicts** (`conflictingRequestIds`, overlapping holds) | `conflict` | the signature alert — the wedge that's taken |
| affected **`isCirculation`** neighbours of booked spaces (catalog `adjacent` ∩ circulation) | `circulation` | access/egress touched by the booking (circulationRules) |
| every other space on the floor | `free` | available — neutral |

Derivation order matters: `conflict` outranks `main`/`bundle` (a colliding chosen space reads as a conflict); `main`/`bundle` outrank `circulation`; `circulation` outranks `free`. The adapter lives beside the wiring, not inside the component — `FloorMap` only ever sees the resolved `{ slug, status }[]`.

The same adapter feeds the two embeds (§6): a request's `/plan` result on RequestDetail, and a building-wide roll-up on the Dashboard.

## 4. Status → tokens, legend, floor switcher

Colour is from design-system tokens only — **never a raw hex** ([`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) §2). The mapping reuses the operational palette so the map reads the same language as `StatusBadge` and `ConflictBanner`:

| `status` | token | read |
|---|---|---|
| `free` | neutral surface / `text-tertiary` hairline | available, calm |
| `main` | `accent` | the one chosen space (matches "primary action" accent rule) |
| `bundle` | `accent-muted` fill, `accent` edge | secondary plan rooms |
| `conflict` | `danger` / `danger-subtle` | the colliding space |
| `circulation` | `warning` / `warning-subtle` | affected access |

- **Legend** — a compact key (one chip per status) under the dial. Labels are i18n keys present in **both** `locales/en.json` and `al.json` (key-count parity, [`I18N.md`](./I18N.md)). Status is never colour-only — each wedge gets the space name on hover/focus and the legend gives the word.
- **Floor switcher** — a `SegmentedControl` toggling `-1 / 0 / 3`; switching re-renders that floor's geometry. Labels (and the floor names) are EN/AL, no hard-coded strings. Albanian runs ~20–30% longer — the legend chips and switcher must flex.
- **Accessibility** — wedges are focusable with an accessible name (`name · status`); the dial is decorative SVG with an `aria-label`. WCAG AA contrast as elsewhere.

## 5. Fidelity tiers — v1 now, v2 later

Two tiers behind the **identical** prop contract ([`../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md`](../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md), COLLABORATION.md §6.1):

- **v1 — stylized radial (this spec).** Sectors generated from `map`. Fast, robust, dependency-free; renders from the catalog alone even with the AI down. **Elis owns it** because it's the demo's digital twin and must never depend on the AI being live.
- **v2 — real-plan SVG hotspots (post-demo).** The rendered floor plan as a backdrop with a traced SVG polygon per space ("that's the actual Pyramid"). Needs a joint polygon-tracing pass that fills each space's real geometry into the catalog `map`. Sequenced after the AI spine — the map *renders* the plan, so it has nothing to show until `POST /plan` works.

### 5.1 The hot-swap seam

v2 (Alvin's component) drops in behind the **same** `<FloorMap floor spaces={[{slug,status}]} />` with **no change** to the RequestDetail / Dashboard call sites. Keep the seam clean:

- The component takes only `floor` + `spaces` — no leaking of catalog internals or `/plan` shapes into the prop surface.
- The `/plan` → `spaces[]` adapter (§3) stays **outside** the component, so swapping the renderer doesn't touch derivation.
- The `status` enum is the stable vocabulary both tiers speak. Adding a tier never adds a prop.

## 6. Where it embeds

Two surfaces (F19 in-scope; [`PAGES.md`](./PAGES.md) §3.1, §4.3):

- **`/requests/:id` — OperationalPlanView (§4.3).** Beside the narrative plan, lit from that request's `/plan` result via the adapter — the chosen room, its bundle, affected circulation, and any conflict, in place. The picture that answers the headline question.
- **`/` Dashboard (§3.1).** A "what's live in the building" tile — a building-wide roll-up across floors (booked spaces `main`/`bundle`, active conflicts `conflict`), with the floor switcher to scan `-1 / 0 / 3`.

When `/plan` is unavailable, both embeds still render the floor from the catalog with all spaces `free` (or a request's confirmed space as `main` from ops-core aggregate data) — the centerpiece degrades gracefully and never blanks (the self-sufficient-fallback rule, §2.1).

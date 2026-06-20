# ADR-0014: Elis builds a v1 FloorMap behind the agreed prop contract; fidelity tiers are staged

- **Status**: Accepted
- **Date**: 2026-06-20

## Context

The FloorMap is the digital-twin centerpiece of the demo: the moment the planner's output ([docs/04-api/AI_CONTRACT.md](../04-api/AI_CONTRACT.md)) stops being a list of room names and becomes a *picture of the venue* — which space is the main hall, which are circulation, where the conflict is. The collaboration plan ([COLLABORATION.md](../../COLLABORATION.md) §6.1) assigns it as *"Alvin owns; Elis embeds"* — the AI track builds the visual component, the ops-core track drops it in.

But the demo cannot depend on a component owned by the other track landing on time and working live. The locked principle for this build is **self-sufficient fallbacks** — the core loop, the copilot, and now the map must each degrade to something Elis controls so the demo never goes dark waiting on the AI. The catalog ([ADR-0013](./0013-space-catalog-extension-fields.md)) already gives every space a `map { floor, ring, sectorFrom?, sectorTo? }`, which is enough to draw a radial floor plan without any AI input.

## Decision

**Elis builds a v1 radial FloorMap behind the agreed prop contract, and hot-swaps Alvin's component (same props) if it lands. Higher fidelity is a later joint pass.**

- **The prop contract is the seam.** Both versions implement `<FloorMap floor spaces={[{ slug, status }]} />`, where `status ∈ free | main | bundle | conflict | circulation`. The component is a pure function of that contract — it does not know whether the statuses came from the planner, a canned fallback, or staff state. See [docs/05-frontend/FLOOR_MAP.md](../05-frontend/FLOOR_MAP.md).
- **v1 (Elis, this build): radial from the catalog.** Elis renders a radial map directly from each space's `map` field — ring = floor band, sector = position — coloring by `status`. It renders `/plan` output when the AI is live, and a deterministic fallback when it is not. Self-sufficient by construction.
- **Hot-swap, not fork.** Because both components share the prop contract, Alvin's richer component drops into the same call site with no rewiring. Whoever's component is better on demo day renders; the data path is identical.
- **v2 (joint, post-demo): real-plan SVG hotspots.** A faithful SVG of the actual Pyramid floor plan with clickable hotspots is explicitly out of scope for the three-day build. It is a joint pass after the demo, layered behind the *same* prop contract so v1 → v2 is a swap, not a rewrite.

## Consequences

- **The demo's centerpiece is Elis-owned and cannot go dark.** The map renders from catalog data and a canned status set even if the AI service is down — the same fallback posture as the degrade-to-canned copilot.
- **Collaboration friction is removed without a turf war.** The prop contract lets both tracks build to the same seam; §6.1's "Alvin owns; Elis embeds" becomes "either owns; the contract embeds." This ADR refines that ownership line for demo-safety, not overturns it.
- **Two implementations may briefly coexist.** Accepted: they are interchangeable by contract, so the cost is one extra component file, not a maintenance fork. The weaker one is deleted after demo day.
- **v1 fidelity is schematic, not architectural.** A radial ring/sector diagram communicates *which space, what status, where the conflict* — enough for the demo's story — without claiming to be a scale floor plan. v2 closes that gap later.

## Alternatives considered

- **Embed-only — wait for Alvin's component (the literal §6.1 reading).** Rejected: it makes the demo's centerpiece depend on another track's deliverable landing and working live, violating the self-sufficient-fallback principle that governs the copilot and the core loop. The map must degrade to something Elis controls.
- **Skip the map for the demo.** Rejected: the FloorMap is the digital-twin payoff — the visual that turns a plan into a venue. Cutting it guts the most compelling moment of the story for a venue-operations audience.
- **Build the v2 real-plan SVG now.** Rejected for the time box: a faithful, hotspotted floor plan is a substantial design+build effort and is not required to tell the demo story. v1 behind the shared prop contract gets the payoff now and makes v2 a clean later swap.

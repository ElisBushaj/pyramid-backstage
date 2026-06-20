# COLLABORATION.md — building apart, connecting cleanly

> How Elis and Alvin build Pyramid Backstage from separate machines without blocking
> each other, and how the pieces snap together at the end. Grounded in
> [`CLAUDE.md`](./CLAUDE.md) (operating guide) and [`docs/04-api/CONTRACT.md`](./docs/04-api/CONTRACT.md) (the contract).
> Last updated: 2026-06-19.

## 0. The one idea that makes separate work possible

From CLAUDE.md, verbatim: *"The two talk only over `ops-core/openapi.yaml`. Neither imports
the other's code. The only coupling is one env var: `OPS_CORE_URL`."*

You are not really "working separately" — you are both working against a **shared contract**.
Honor it and the pieces integrate at the end with a single URL flip.

```
  frontend ──VITE_OPS_CORE_URL──► ops-core ◄──OPS_CORE_URL── ai-orchestrator
     │                               ▲                              ▲
     └──────────────VITE_AI_URL──────┴──────────────────────────────┘
                    (frontend calls the AI's /chat + /plan)

  The seam between you = ops-core/openapi.yaml  +  mock-ops-core  +  the AI's /chat & /plan
```

## 1. Who owns what

| | **Elis** — frontend + ops-core | **Alvin** — ai-orchestrator | **The seam** (co-owned) |
|---|---|---|---|
| Holds | All state + data (Postgres) | No domain state (Redis convo only) | `openapi.yaml` |
| Builds | Every data tool/endpoint; auth & RBAC; Command Center UI; partner portal; admin approval UI; QR/NFC asset endpoints + scanner UI; the `Space` seed; **embeds** Alvin's floor-map component | NL intake parsing; the deterministic planning graph; RAG/venue knowledge (incl. floor-plan adjacency); the chat copilot; conflict explanation + alternatives; approval recommendations; asset-location reasoning; **the floor-map component** (decoupled; Elis embeds — §6.1) | `mock-ops-core`; the 2 AI endpoints; the `FloorMap` prop shape |
| Exposes | The tool surface (`/requests`, `/spaces`, `/assets`, `/reservations`, `/quotes`, `/conflicts`, `/tasks`, `/approve`…) | `POST /chat`, `POST /plan`, `GET /health` | Payload shapes + enums |
| Never | Reasons / generates prose | Owns or writes domain state directly | Breaks the contract non-additively |

Mental model: **Elis = the record + the screens; Alvin = the brain that reads the record and
decides.** The AI calls Elis's tools; it never stores what is true.

## 2. The seam mechanics (rules you both obey)

From CONTRACT.md — these keep the mock and the real service from drifting while you're apart:

- **Contract locked at H0, additive-only.** Add fields/endpoints; never rename or remove. A
  genuine breaking change is a 5-minute sync recorded as a new ADR in `docs/08-decisions/`.
- **Enums `UPPER_SNAKE`; timestamps RFC-3339 UTC `Z`; money integer `*Minor`; every mutation
  carries an `Idempotency-Key` (UUID v4).**
- **Types are hand-mirrored** from `openapi.yaml`: Elis → `ops-core/src/types/api/*` +
  `frontend/src/api/types/*`; Alvin → `ai-orchestrator/app/schemas.py`. (Done for today's surface.)
- **Envelope**: success = `{ status, message, messageKey, data }`. The AI client already unwraps
  `data` and raises a typed `OpsCoreConflict` on `409 {conflicts}`.
- **Auth tiers**: routes mount under `/api/v1/{public,private,admin}`; `private` = VIEWER+ (the
  whole tool surface); role gates (`MANAGER+` approvals, `OPS+` inventory writes) are per-route.

## 3. How you actually work apart, day to day

**Alvin's unblock button is `mock-ops-core`.** Build the AI against the stateful mock on `:4010`
(it has the planted conflict); integrate by flipping **one env var** to the real service on
`:4000`. No waiting on Elis.

**Protocol when the AI needs a tool ops-core doesn't have yet** — the heartbeat of working apart:

1. Agree the endpoint shape (path, request, response) — a 5-minute chat.
2. **Add it to the seam first**: `openapi.yaml` + a handler in `mock-ops-core/server.ts` +
   a Pydantic mirror in `ai-orchestrator/app/schemas.py`.
3. **Alvin builds against the mock immediately** — not blocked.
4. Elis implements the real endpoint in ops-core to match the contract.
5. **Integrate by flipping `OPS_CORE_URL`** → run the golden-path demo. If it worked on the mock
   and Elis matched the contract, it works for real.

**Git / repo hygiene (two people, one GitHub repo):**

- Branch per lane; PRs. Alvin touches `ai-orchestrator/` (+ shared `mock-ops-core/`); Elis touches
  `ops-core/` + `frontend/`. Folders rarely collide.
- The **only shared files** are `openapi.yaml`, `mock-ops-core/`, `docs/`. Rule: *any PR that
  changes the contract also updates the mock in the same PR, and pings the other person.*
- **Integration checkpoint ~2×/day**: `cd infrastructure && docker compose up`, flip the AI's
  `.env` to real ops-core, run the demo end-to-end. Catch drift early, not at hour 46.

## 4. The new features, split across the seam

### a) Partner portal + approval chain (remove email)
- **Elis**: add a `PARTNER` role (additive enum); a partner-scoped "create request + see my
  requests/status" flow (row-scoped by `createdById`); the external portal UI; the admin approval
  screen (approve/reject already exist, `MANAGER+`).
- **Alvin**: power the partner's **intake copilot** (`/chat`: NL → structured request + instant
  feasibility + draft quote preview) and an **AI recommendation** for the admin on each pending
  request ("fits Orange Hall theater-180, no conflicts, ~134k ALL incl. VAT → recommend approve"
  / "clashes with the Gala on the 22nd → suggest the 24th"). Reuses existing tools.
- **Seam**: `+PARTNER` enum; optionally a partner-scoped list endpoint.

### b) QR / NFC asset tracking
- **Elis**: QR encodes `assetId`; a **scan endpoint** to update live location / check-in-out; a
  movement log; mobile scanner UI; "where is it" on the dashboard. (`Asset.location` is a static
  string today — this makes it live + historical.)
- **Alvin**: reason over location + availability — *"you need 4 mics; 8 are checked out to the
  Gala in Blue Hall, 4 free in AV Room 0 — pull those,"* and flag assets not staged where setup
  needs them. Consumes the existing `GET /assets` (already returns `location` + windowed availability).
- **Seam**: `+ POST /assets/:id/scan` (or `/location`) + maybe an `AssetMovement` type.

### c) Conflict handling (bones already exist)
- **Elis**: authoritative engine ships already — buffer-aware detection, the `409 {conflicts}`
  path, `GET /conflicts`. Surface conflicts in the UI.
- **Alvin**: branch on the typed `409`, explain it in plain language, propose **alternatives**
  (unused `preferredDates`, another matching space), re-plan. No contract change.

### d) Precise design / space analysis ("space ≠ boxes") — see §6
- **Shared, one-time**: the **space catalog** ([`docs/03-data/spaces.catalog.json`](./docs/03-data/spaces.catalog.json))
  derived from the floor plans. It feeds Elis's `Space` seed, Alvin's `venue_facts`, and the floor-map.
- **Elis**: seed the expanded catalog — corridors/atria/entrance are `Space` rows with
  `kind: TRANSITIONAL` (ops-core already supports this). **Embed** Alvin's floor-map component (§6.1).
- **Alvin**: load `adjacent` + `category` into `venue_facts` so the planner proposes **space
  bundles** (main hall + foyer + green-room box) and adds **circulation/access** notes to the
  narrative — all reasoning, no CAD parsing at runtime. **Owns the floor-map component** (§6.1).

## 5. AI→ops-core auth — RESOLVED (F17 service token)

Settled + wired. The AI authenticates to the real ops-core with a **service token**
(`Authorization: Bearer <OPS_CORE_SERVICE_TOKEN>`) and forwards the acting staff user
(`X-Acting-User-Id` / `X-Acting-User-Role`), clamped to a `MANAGER` ceiling so a compromised AI
can't self-grant `ADMIN`. ops-core's `requireAuth` accepts it (Elis, F17); the AI client sends it
from settings — `OPS_CORE_SERVICE_TOKEN` + `ACTING_USER_ID` (default = seeded manager) +
`ACTING_USER_ROLE`. An **empty token sends no headers**, so the mock path is unchanged.
**Integration = a 2-env flip:** point `OPS_CORE_URL` at the real service and set
`OPS_CORE_SERVICE_TOKEN` to match ops-core's. `infrastructure/docker-compose.yml` wires the same
token into both services by default. (Caveat: partner-intake *through the AI* needs the frontend to
forward the partner's identity — a small F18 follow-up; the staff golden path uses the seeded manager.)

## 6. The space catalog — the shared artifact

[`docs/03-data/spaces.catalog.json`](./docs/03-data/spaces.catalog.json) — **19 spaces** across
floors −1 / 0 / 3 (6 halls, 5 boxes, 3 atria, 2 corridors, 1 entrance, 1 terrace, 1 transitional),
derived from the `New_Docs/` floor plans (radial building: central atrium of grand stairs → ring
corridors → wedge rooms on 16 axes; terraced interior). Regenerate with
`python New_Docs/_gen_catalog.py`.

**It is a superset that matches the existing ops-core seed exactly** for the 6 spaces already in
`seed.ts` (same UUIDs, capacities, rates, buffers); rows 7–19 are new. Each space carries the
ops-core seed fields **plus** catalog-extension fields (`slug`, `category`, `zone`, `isCirculation`,
`adjacent`, `map`, `ceilingCm`) for the AI and the floor-map.

How each side consumes it:
- **Elis (seed)**: use the `ops_core_seed_fields` to upsert `Space` rows (UUIDs continue the
  `id(n,"space")` scheme, n≥7). Extension fields can be added to the `Space` schema later, additively.
- **Elis (floor-map)**: render the `map` field (`floor`, `ring`, `sectorFrom`, `sectorTo`) as a
  stylized radial map; color sectors by status from the AI's plan output.
- **Alvin (venue_facts)**: index each space (name, category, capacities, features) + the `adjacent`
  graph + `bundleTemplates` + `circulationRules` so the planner can match bundles and warn on access.

> Caveat (in the file too): rows 1–6 are authoritative; rows 7–19 have real names/heights/structure
> from the plans but **estimated** capacities, rates, buffers, adjacency, and map sectors — good
> enough for the demo, not surveyed facts. Color halls are operational names; their exact plan-wedge
> mapping is unconfirmed.

## 6.1 The floor-map component (Alvin owns; Elis embeds)

The floor-map moved to Alvin's lane — it's where the schema analysis pays off and it pairs with the
AI plan output. To keep "build apart" intact it ships as a **self-contained component with a tiny
prop contract**: Alvin builds and iterates it standalone against mock plan data; Elis imports it in
one line. The prop shape is the seam.

```ts
<FloorMap floor={0} spaces={[{ slug: "blue_hall",   status: "main" },
                             { slug: "north_foyer", status: "bundle" },
                             { slug: "orange_hall", status: "conflict" }]} />
// status ∈ "free" | "main" | "bundle" | "conflict" | "circulation"
```

`spaces` = static geometry (catalog `map` field) + dynamic status (the AI plan output). Two fidelity
tiers: **v1** stylized radial (generated sectors — fast, robust fallback); **v2** the real rendered
plan as a backdrop with an SVG hotspot polygon per space (the "that's the actual Pyramid" effect).
v2 needs a joint polygon-tracing pass that fills each space's real geometry into the catalog `map`
field. **Sequenced after the AI spine** — the map renders the plan, so it has nothing to show until
`POST /plan` works.

## 7. Next steps

**Alvin (all against the mock — no waiting on Elis):**
1. Bring up the dev loop (Docker `redis` + `chromadb`, `npm run dev` the mock, local `uvicorn`).
2. Implement the graph node bodies → `POST /plan` returns a real plan vs the mock (no API key needed).
3. NL intake parser (the partner copilot's front door).
4. RAG / `venue_facts` incl. the catalog's adjacency (the "space beyond boxes" brain).
5. `POST /chat` copilot with `proposedActions` + `requiresApproval`.
6. Conflict branch (explain + alternatives); then approval recommendation + asset-location reasoning.
7. Keep `/chat` + `/plan` shapes stable and documented — that's Elis's wiring contract.

**Elis (so the AI has tools + the demo renders):**
1. Expand the `Space` seed from the catalog (incl. transitional spaces).
2. Add the `PARTNER` role + partner request flow + portal UI.
3. Add QR/NFC asset scan endpoints + scanner UI.
4. Wire the Command Center to `/chat` + `/plan` (canned today).
5. Embed Alvin's `FloorMap` component (one import) in the Command Center; pass it plan output.
6. Update `openapi.yaml` + `mock-ops-core` whenever a tool changes.

**Shared, this week:** lock the catalog; agree the ~3 additive contract bits (`PARTNER` role,
asset-scan endpoint, AI→ops-core auth header) — add them to `openapi.yaml` + the mock **first**.

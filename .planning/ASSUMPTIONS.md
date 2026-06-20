# Assumptions Log

Every default chosen in the absence of explicit guidance, with a date and one-line rationale. No silent assumptions — this log lets the user override later without re-reading code. Append-only; group by date + task.

## Format
```
## YYYY-MM-DD — F##-T## <short title>
- Assumed: <the default>.
  Rationale: <why; what real-world behavior or pattern it matches>.
```

---

## 2026-06-18 — Bootstrap (pre-F00)
- Assumed: **session auth (argon2id + httpOnly signed cookie) owned by ops-core**, not SuperTokens.
  Rationale: internal staff tool with a handful of roles; avoids a 4th container and is faster to make flawless in 3 days. (ADR-0003)
- Assumed: **VAT 20%**, single currency `ALL`, integer minor units (factor 1 for Lek).
  Rationale: Albanian standard VAT; PDF said "currency ALL, i18n-ready". (ADR-0004)
- Assumed: **default space buffers** setupBufferMinutes=240 (4h), teardownBufferMinutes=120 (2h).
  Rationale: PDF's example task `dueOffsetHours:-4`; real venues use multi-hour turnarounds. Per-space overridable. Flagged as Q-01 for the Pyramid team.
- Assumed: **HELD reservation lease = 30 min** default.
  Rationale: enough for a human to approve in the demo; short enough that abandoned holds free quickly.
- Assumed: roles **ADMIN / MANAGER / OPS / VIEWER**; approvals require MANAGER+, inventory writes OPS+.
  Rationale: maps to venue-manager / logistics / front-desk; minimal credible RBAC. Flagged as Q-02.

## 2026-06-18 — Scaffold execution (F00 groundwork)
- Assumed: **`@node-rs/argon2`** (prebuilt bindings) instead of `argon2` (node-gyp native build).
  Rationale: installs without build-essential — robust in `node:20-slim` Docker + CI. Same Argon2id algorithm. (ADR-0003)
- Assumed: **Prisma 7 driver-adapter pattern** — `PrismaPg` adapter in `config/prisma.ts` + `prisma.config.ts` holding `datasource.url = env("DATABASE_URL")`; the schema `datasource` declares only `provider`.
  Rationale: Prisma 7 dropped `url` in the schema datasource; this matches the marketplace's proven setup. Needs `DATABASE_URL` present for `prisma generate`.
- Assumed: **ChromaDB host port 8001** (container 8000) in docker-compose.
  Rationale: avoids colliding with ai-orchestrator on host 8000. (infra agent)
- Assumed: frontend pins **vite 7 + @vitejs/plugin-react 4 + @types/node 22**; `test` uses `--passWithNoTests` on the empty chassis.
  Rationale: peer-dep compatibility with the locked TS ~5.7 + Node 20 target. (infra agent)
- Assumed: ai-orchestrator default model **`claude-opus-4-8`**; the stateful mock runs **without auth** (a noted seam); `POST /plan` accepts either `{requestId}` or a full `EventRequestInput`.
  Rationale: scaffold ergonomics; verified model id via the claude-api reference. (ai agent)

## 2026-06-18 — Design↔backend alignment (pre-frontend)
- Decided: **Export** and **Duplicate-request** are **client-side** (CSV/print from loaded data; prefill a new `POST /requests`) — no backend endpoints.
  Rationale: the design's buttons don't imply server work; keeps the contract lean. See [[docs/10-qa/DESIGN-BACKEND-ALIGNMENT.md]].
- Decided: money is formatted in the frontend via `lib/money.ts` from integer minor units (EN `,` / AL `.` grouping); the design's compact `3.3L`-style KPI labels are display-only.
- Added (additive, contract stays lock-compatible): `PATCH /requests/:id` (F04-T06), `GET /requests?q=` (F04-T07), `GET /dashboard/stats` (F13-T05) to back design affordances. Build note: the structured intake form must capture `title` (required by `EventRequestInput`).

## 2026-06-19 — Build execution (F03-T03, F08-T02)
- Assumed: **`GET /assets?quantity=` filters** the result to lines whose windowed
  `availableQuantity >= quantity` (combined with `type`/window).
  Rationale: the contract lists `quantity` as a query param without semantics; matching
  for "assets that can satisfy this demand" is the obvious operational use (the AI/match
  flow). Without `quantity`, all lines are returned annotated. Flagged for confirmation.
- Assumed: **task `dueAt` is null until a reservation exists** for the request; once a
  reservation is present, SETUP offsets apply to its event `start`, TEARDOWN to its `end`.
  Rationale: matches TASKS.md; `dueOffsetHours` is retained so dueAt can be recomputed.

## 2026-06-20 — Beyond-Booking expansion (F14–F19 doc reconciliation)

User-confirmed decisions (chosen explicitly, recorded for traceability):
- Decided: **Elis stays in lane (ops-core + frontend + AI wiring) with self-sufficient fallbacks** — the copilot degrades to canned and Elis ships the v1 FloorMap, so the demo never depends on Alvin's live AI. Python AI logic (A00) stays Alvin's.
- Decided: **Elis builds the v1 radial FloorMap** behind Alvin's agreed prop contract `<FloorMap floor spaces={[{slug,status}]} />`; hot-swap Alvin's component later. (ADR-0014)
- Decided: **selective merge of `origin/alvin/phase-a-spine`** onto `feat/beyond-booking` — brings the catalog, `COLLABORATION.md`, `New_Docs/`, and the wired `/plan` spine to the branch.

Assumed defaults (no explicit guidance; logged so they can be overridden):
- Assumed: **asset tracking is aggregate-with-movement, not per-unit serialized identity** — QR encodes `assetId`; a scan writes an `AssetMovement` (CHECK_OUT|CHECK_IN|RELOCATE, quantity) + updates live `Asset.location`.
  Rationale: the brief asks for counts + location, not serialized units; far smaller model. Per-unit deferred. (ADR-0011)
- Assumed: **single-step approval** — PARTNER submits → existing F10 `MANAGER+` approve/reject; no new approval stage.
  Rationale: reuses a built, tested path; multi-stage chain deferred as a question. (ADR-0010)
- Assumed: **`PARTNER` ranks below `VIEWER`**; partner reads are row-scoped by `EventRequest.createdById`; a cross-row read returns **404, not 403** (no existence leak).
  Rationale: a partner must grant nothing on the staff surface; 404 avoids confirming other partners' requests exist. (ADR-0010)
- Assumed: **AI→ops-core auth = service token (system actor) + forwarded `X-Acting-User-Id/Role`, with a forwarded-role ceiling of `MANAGER`**.
  Rationale: keeps audit attribution + partner scoping correct; a compromised AI cannot self-grant ADMIN. (ADR-0012)
- Assumed: **`bundleTemplates` + `circulationRules` ship as a frontend constant** sourced from `spaces.catalog.json`, not a contract endpoint.
  Rationale: static reference data; avoids a contract addition; Alvin loads the same JSON into `venue_facts`. (ADR-0013)
- Assumed: **catalog rows 7–19 carry estimated capacities/rates/buffers/adjacency**; rows 1–6 stay byte-authoritative vs `seed.ts`.
  Rationale: read from the floor plans but not surveyed; flagged for real-venue confirmation (new OPEN question).

## 2026-06-20 — Requests/F15 test hardening (Q-12)

- Assumed: **a PARTNER `POST /private/requests` lands at `PROPOSED`** (staff still land `DRAFT`).
  Rationale: F15 SPEC states "created at `PROPOSED`" 3× as acceptance criteria; PARTNER_PORTAL.md says "lands `DRAFT → PROPOSED`"; ADR-0010 routes partner requests into the existing MANAGER+ approval queue (a list of PROPOSED). A partner can't reach PROPOSED via a hold (staff-only), so DRAFT would be an un-approvable dead-end. Fixed `requestsService.create`. [assumption: partner-create=PROPOSED] — conflicts with a stale `seed.ts` comment ("E3 DRAFT by PARTNER"), flagged in OPEN.md Q-12 for the seed owner to reconcile.

## 2026-06-20 — Quotes/F07 test hardening (Q-13)

- Assumed: **a quote with no resolvable reservation → 404 `not_found`** (not a silent empty zero-quote).
  Rationale: QUOTES.md frames a quote as pricing "a request + its reservation"; F07-T03 already mandates 404 for an unknown `reservationId`, so an *implicitly* missing reservation (no `reservationId` and no `HELD|CONFIRMED` hold) should fail the same way rather than persist a meaningless net=0/total=0 DRAFT (a money-correctness trap after a hold expires/releases). Fixed `quotesService.generate` to `throw APIError.notFound()` when no reservation resolves; reuses the existing `common.not_found` key (no new messageKey). [assumption: no-reservation-quote=404] — flagged in OPEN.md Q-13 in case a services-only (reservation-less, extraLineItems-only) quote should instead be allowed.

## 2026-06-20 — Floor-map v2 (real-plan polygons)
- Assumed: each space's **`map.polygon`** is an annular-sector wedge fitted to the floor's real radial centre + the real outer-wall radial profile (so lit rooms hug the actual silhouette), derived from the curated `map.{ring,sectorFrom,sectorTo}` — NOT a hand-surveyed room outline.
  Rationale: the CAD has 0 closed room polygons / 0 extractable text (rooms are negative space between ~147k wall segments), so exact per-room tracing isn't recoverable; the building is genuinely radial, so calibrated sectors over the real linework read as the real rooms. Regenerate via `New_Docs/_gen_floor_svg.py` (runs AFTER `_gen_catalog.py`; reads the catalog, injects `map.polygon`, writes `frontend/.../floorplan.data.ts`).
- Assumed: the **Blue/Orange (floor 0) and Green/Yellow (floor −1) wedge positions** follow the catalog's existing `sectorFrom/To` estimates; the exact colour→physical-wedge identity is still unconfirmed.
  Rationale: the CAD's `C 0x` colour layers (RED/BLUE/GREEN/YELLOW) are empty on floor 0, so they don't resolve the mapping; the brief only confirms these four are the main halls on floors 0/−1. Flagged for real-venue confirmation.
- Assumed: the **per-floor SVG backgrounds** (real CAD linework) ship as a generated frontend constant `floorplan.data.ts` (≈190 KB), while `map.polygon` rides in the shared catalog → `GET /spaces`.
  Rationale: the linework is per-floor (not per-space) and too large to inline per row; polygons belong in the catalog per the task. FloorMap.tsx renders real-plan mode when both are present, else falls back to the v1 radial schematic (backward-compatible).

## 2026-06-20 — Real floor model rebuild (architect spec, Floors 0/-1/3)
- Assumed: the catalog is **rebuilt to the architect spec** (~53 spaces) and is the single source; the spec's literal `src/data/floor*.ts` modules are NOT created (user confirmed: catalog -> ops-core `GET /spaces` is the source; no parallel mirror). `New_Docs/_gen_catalog.py` encodes the spec; `_gen_floor_svg.py` injects polygons.
- Assumed: **`capacities` are COMPUTED** floor(areaApproxM2 / density) per layout (RECEPTION .8 / THEATER 1.5 / CLASSROOM 2.0 / BANQUET 1.8 / BOARDROOM 3.0 / CABARET 2.2), outdoor x0.6 safety; **areas are ~1:200 estimates (+/-20%)**, flagged `map.areaEstimated` + surfaced as a plan warning, editable. Ceiling heights/levels are read straight from the plans (reliable).
- Assumed: the **6 authoritative seed UUIDs are remapped onto the real Floor -1 halls** — `...001`->Space 1 (Main hall, planted-conflict target), `...002`->Space 10, `...003`->Space 13 (seed event E2), `...004`->Space 9, `...005`->Box 5, `...006`->outer concourse. Keeps the planted conflict (E1 @ 2026-07-22) + E2 working with no seed-event edits. Colour halls stay staff-assignable (NOT hardcoded).
- Assumed: **no single Pyramid hall seats a large event** (main hall ~106 theatre), so big requests get a **multi-space plan** — the largest hall as plenary (chosen even if occupied, so the conflict still surfaces) + overflow halls + Floor-0 box breakouts. Non-bookable spaces (wc/technical/circulation/vestibule) carry empty capacities and are never matched/bundled (hard filter).
- Assumed: **`idsToConfirm` spaces** (Floor-0 perimeter terraces 24-28, Floor-3 rim rooms 50-54) are expanded to individual estimated entries at inferred bearings; flagged for confirmation.

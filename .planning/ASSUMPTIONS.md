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

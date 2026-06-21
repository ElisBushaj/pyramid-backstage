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

## 2026-06-21 — Frontend-audit remediation (branch `fix/frontend-audit-remediation`)

User-confirmed scope decisions (asked explicitly, recorded for traceability):
- Decided: **Calendar Week view is REMOVED**, not built — ship day-view + prev/next/date-picker navigation only. Rationale: the Week toggle was an unimplemented placeholder; a date-navigable day view delivers the value without a dead control.
- Decided: **Global ⌘K Search becomes a real command palette** over requests/spaces/assets with a working keybind (not a relabel). Rationale: honor the affordance the UI already advertises.
- Decided: **Global Copilot is wired to the live `/chat`** with the same graceful 503 degrade as Intake — NO AI logic is built (stays in Alvin's A00 lane). Rationale: a dead send button is a production-readiness defect; degrade-to-canned is already proven on Intake.

Remediation-execution assumptions:
- Assumed: **all work lands on a dedicated branch**, not `main`, because push-to-main auto-deploys to production (Hetzner CI→GHCR→VPS). Rationale: no half-finished production deploys; clean PR per the remediation plan.
- Assumed: **fixes slot into existing features (F01–F19) with new task IDs**, not new F20+ features — matching the prior remediation session's established practice (multi-feature commits). The REMEDIATION_PLAN.md's proposed F20–F30 is superseded by this slotting.
- Decided (ADR-0015): **expired-uncontested hold → 410 `reservation.hold_expired`** (re-hold), retaken → 409, contention → 429. Refines F10-T01's "expired → 409" promise and flips the deliberately-asserted 429 test. [assumption: expired-uncontested=410]
- Decided (ADR-0016): **a new `GET /private/reservations?start&end[&spaceId][&status]` read endpoint** powers the live timelines, rather than embedding windows on `/spaces` or fanning out `/spaces/:id/availability`.
- Decided (ADR-0017): **`/audit` and `/admin/users` gain server-side okList pagination**; `/requests` + `/movements` already paginate (client-only fix); one shared `ListEnvelope` + `Pager`.
- Assumed: **dead controls with no backend (Forgot-password, RequestDetail "Use this"/"Adjust") are removed or context-carried**, not stubbed — ops-core has no password-reset/re-hold-swap endpoint, so a real flow is out of scope. Flagged where removed. [assumption: remove-dead-controls-without-backend]

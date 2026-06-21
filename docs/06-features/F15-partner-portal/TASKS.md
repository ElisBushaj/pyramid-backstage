---
id: F15
name: Partner Portal & Approval Chain
last_updated: 2026-06-20
---

# F15 — Tasks

### F15-T01 — add PARTNER to the Role enum + RANK ladder (below VIEWER)
- Status: done
- Depends on: F01-T05
- Estimate: 0.5d
- Acceptance:
  - `PARTNER` is added to the Prisma `Role` enum (additive migration; no rename/reorder of existing variants) and to the `Role` enum in `openapi.yaml` (additive widening, contract stays additive-only per `docs/04-api/CONTRACT.md`).
  - The rank ladder used by `requireRole` ranks `PARTNER` strictly **below** `VIEWER`, giving the total order `PARTNER < VIEWER < OPS < MANAGER < ADMIN`; every existing `requireRole('VIEWER'|'OPS'|'MANAGER'|'ADMIN')` therefore returns `403` for a `PARTNER` with no code change to those gates.
  - The backend `Actor` type (the `req.actor.role` union) and the frontend auth types (`frontend/src/api/types/*` role union) are widened to include `'PARTNER'`; `mock-ops-core` mirrors the new role so parallel dev stays aligned.
  - Per ADR `docs/08-decisions/0010-partner-role-and-approval-chain.md`; conforms to `docs/04-api/TYPE_SHARING.md` (Prisma → openapi → backend DTO → FE mirror → mock all carry `PARTNER`).
  - `tsc` clean; migration applies cleanly on a fresh DB; vitest passing; conforms to `docs/04-api/CORE_PATTERNS.md`.

### F15-T02 — partner row-scoping on requests list + aggregate (SECURITY-CRITICAL)
- Status: done
- Depends on: F15-T01
- Estimate: 0.75d
- Acceptance:
  - `requestsService.list` and `requestsService.getAggregate` (the `GET /private/requests` and `GET /private/requests/:id` backings) filter by `createdById === actor.id` **iff** `actor.role === 'PARTNER'`; the scope is applied in the query `where`, not by post-filtering a full result set (no leak of counts/pagination totals).
  - A `PARTNER` may `POST /private/requests`; the created request has `createdById = req.actor.id`, status `PROPOSED`, and a `request.create` `AuditEntry` carrying `req.actor` — identical to a staff create (per `docs/06-features/F04-requests/SPEC.md`).
  - A `PARTNER` reading a request they did not create returns `APIError` `404 not_found` (the same shape as an unknown id) — **never** `403`, so existence is not leaked; the same id is fully readable by any `VIEWER+`.
  - `VIEWER`, `OPS`, `MANAGER`, `ADMIN` receive the unfiltered list and aggregate (no behavioural change for staff).
  - Tests assert the full matrix explicitly: partner-own → 200; partner-other → 404; partner-list → only own rows; staff-any → 200; staff-list → all rows. The cross-read test asserts the body is the `not_found` shape, not `forbidden`.
  - `tsc` clean; vitest passing (real-Postgres integration test for the scoping matrix); conforms to `docs/04-api/CORE_PATTERNS.md`.

### F15-T03 — seed a demo PARTNER user + partner-created PROPOSED requests
- Status: done
- Depends on: F15-T02
- Estimate: 0.25d
- Acceptance:
  - `ops-core/src/scripts/seed.ts` seeds one demo `PARTNER` user (e.g. `partner@acme.al`) with a known password, idempotently (re-running seed does not duplicate), alongside the existing staff users.
  - The seed creates 1–2 `PROPOSED` `EventRequest`s with `createdById` set to the demo partner, so the partner portal and the admin Pending Approvals queue both have content on a fresh demo DB.
  - The F12 planted Blue-hall conflict and all existing seeded UUIDs are preserved unchanged (new rows use new UUIDs; nothing existing is renumbered or removed).
  - `tsc` clean; `seed.ts` runs clean on a fresh `pyramid_dev`/`pyramid_test` DB; conforms to `docs/04-api/CORE_PATTERNS.md`.

### F15-T04 — FE partner portal: /portal/* shell + submit flow + my-requests timeline
- Status: done
- Depends on: F15-T02
- Estimate: 1d
- Acceptance:
  - A `/portal/*` route group is mounted behind a `RequireRole('PARTNER')` shell (React Router 7); a non-partner hitting `/portal/*` is redirected to the staff Command Center, and a `PARTNER` who lands on any staff route is redirected to `/portal`.
  - The submit-request flow reuses the existing Intake form component, scoped to the partner — on submit it calls `POST /private/requests` via the existing TanStack Query mutation in `frontend/src/api/hooks.ts`; success routes to the my-requests view.
  - The my-requests page reads the scoped `GET /private/requests` list and renders a status-timeline per request (`PROPOSED → APPROVED → SCHEDULED → COMPLETED`, with the `REJECTED` branch and `rejectionReason` shown) using the request lifecycle from `docs/02-domain/REQUESTS.md`.
  - All copy goes through i18n (no hard-coded strings); the portal degrades gracefully if the list is empty (an explicit empty state, not a spinner).
  - `tsc` clean; `npm run build` green; component/route test asserts the `RequireRole('PARTNER')` redirect both directions.

### F15-T05 — FE admin Pending Approvals queue (approve/reject via F10) + AI slot
- Status: done
- Depends on: F15-T02
- Estimate: 0.75d
- Acceptance:
  - A staff **Pending Approvals** page (gated `MANAGER+`) lists `PROPOSED` `EventRequest`s newest-first via `GET /private/requests?status=PROPOSED`, with pagination from the existing list hook.
  - Approve and reject actions call the F10 `POST /private/requests/:id/approve` and `:id/reject` endpoints (`docs/06-features/F10-approvals/SPEC.md`); reject requires a reason field (3–500 chars) before the call fires.
  - The UI surfaces the F10 failure outcomes inline: `409 conflict` (expired hold) shows the re-detected conflict and keeps the row in the queue; `422 validation` (missing/short reason) blocks submit with a field error; a successful approve/reject removes the row and invalidates the list query.
  - Each row renders an **AI-recommendation slot** as a labelled placeholder, wired to be filled by `docs/06-features/F18-ai-wiring/SPEC.md` (the slot exists and is empty/loading until F18 supplies content — no dependency on the AI being live).
  - All copy is i18n; `tsc` clean; `npm run build` green.

### F15-T06 — i18n EN/AL keys + tests (row-scoping matrix + queue actions)
- Status: done
- Depends on: F15-T04, F15-T05
- Estimate: 0.5d
- Acceptance:
  - All new partner-portal and approval-queue strings are added to **both** `frontend/src/locales/en.json` and `al.json` (and any new backend `MESSAGE_KEYS` registered in both `ops-core/.../locales/al.json` and `en.json`); the enforced key-count parity check passes for both layers.
  - The backend row-scoping matrix from F15-T02 is covered (partner-own 200, partner-other 404-not-403, partner-list own-only, staff-all) and the approval-queue actions from F15-T05 are covered (approve happy-path, reject-with-reason, `409` expired-hold surfaced, `422` missing-reason blocked).
  - No string is left untranslated (the AL file has a real Albanian value for every EN key, not an English fallback).
  - `tsc` clean; vitest + FE tests passing; conforms to `docs/04-api/CORE_PATTERNS.md`.

### F15-T07 — Portal: detail route, pager, validation, error mapping
- Status: not_started
- Depends on: F13-T07
- Estimate: 0.5d
- Acceptance:
  - Portal request cards link to a read-only `/portal/:id` detail; list gets a pager + “N of M”; preferredDates show end as well as start.
  - PortalNewRequest validates end>start and maps 422 `fields` per-field (not one generic banner) via the shared apiError helper.

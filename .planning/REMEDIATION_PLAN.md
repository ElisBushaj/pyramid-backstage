# Pyramid Backstage — Remediation Plan (end-to-end)

Fixes every finding in `FRONTEND_AUDIT_REPORT.md`, done **the project's way**: contract changes via new ADRs + openapi sync + DTO/mirror + contract test; new work slotted as `F20+` features with SPEC/TASKS + STATUS regen; ops-core tests (Vitest + property + real-Postgres integration); commit `<type>(F##-T##): subject`. Frontend lands build-green with i18n key parity, then a full re-run of the browser audit as the regression gate.

Effort tags are rough: **S** ≤ half-day · **M** ~1 day · **L** multi-day.

---

## 0. Decisions to confirm before execution (with my recommendations)

| # | Decision | Recommendation | Why it matters |
|---|---|---|---|
| D1 | **Backend in scope?** Several root fixes need ops-core + `openapi.yaml` (pagination, a reservations read endpoint, approve semantics). | **Yes — full-stack.** "Properly/root-cause" implies it; you own ops-core. | If frontend-only, items in Phases B & C become band-aids (relabel mocks, cap-only lists). |
| D2 | **Mock "live" timelines** (Dashboard/Calendar/SpaceDetail). | **Build the real `GET /reservations?start&end` endpoint** and wire `reservationsToBars` (already written). | The alternative (relabel as "preview") leaves the headline surfaces fake. |
| D3 | **AI Copilot** (`/plan`, `/chat` 503 — Alvin's lane). | **We do NOT build AI logic.** We wire the global Copilot like Intake's (already graceful) and make the RequestDetail narrative **data-driven** so it's correct even when AI is down. | Keeps us inside the lane rule; nothing blocks on Alvin. |
| D4 | **Calendar Week view** (currently a dead toggle). | **Ship date-navigation + today now; build the 7-day grid in a follow-up** (or remove the toggle until then). | Week grid is a real build; day-view + nav delivers 90% of value fast. |
| D5 | **Dead "Value" column** on /requests. | **Remove now; wire quote totals later** (needs a quote-per-request rollup). | Wiring it is a small backend rollup; removal is instant credibility. |

I'll proceed on these defaults unless you redirect.

---

## 1. How we work (guardrails — the "properly" part)

- **Every contract change = a new ADR** (`docs/08-decisions/0015+…`, never edit closed ADRs) → sync `ops-core/openapi.yaml` (additive only) → update `ops-core/src/types/api/*` → hand-mirror `frontend/src/api/types/*` → green the **contract/type-sharing test**. (ADR-0008 / `docs/04-api/TYPE_SHARING.md`.)
- **Every new feature = `docs/06-features/F##-…/{SPEC,TASKS}.md`**, status `not_started→in_progress→done`, **regenerate `STATUS.md`** per the protocol, one commit per task.
- **ops-core invariants** (`CORE_PATTERNS.md`): `@controlledResponse`, throw `APIError` w/ `messageKey`, `ValidationHelpers`+express-validator, `ServiceResponse`/`PaginatedServiceResponse`, every mutation writes `AuditEntry`+`OutboxEvent` in **one** tx, reservations decrement under a **serializable tx + row locks**, money via `utils/money.ts`, time/overlap via `utils/time.ts`.
- **Tests**: Vitest next to impl; property tests for availability/conflict; integration on **real Postgres** (no DB mocks). Frontend: type-check + build-green + **al.json/en.json key-count parity**.
- **Ambiguity** → log to `docs/09-questions/OPEN.md` + `.planning/ASSUMPTIONS.md`, implement against the assumption, flag in the commit.

---

## 2. Scaffolding to create first

**New ADRs**
- **ADR-0015 — Paginated list envelope.** Standardize list responses to carry pagination meta (`total,page,pageSize,totalPages`) via `PaginatedServiceResponse`; add `page`/`pageSize` to `GET /audit`. (Step 1: *verify* whether the list controllers already emit `PaginatedServiceResponse` — the convention exists — and the gap is only the client dropping it + openapi not documenting it. That shrinks this to mostly frontend + contract-doc.)
- **ADR-0016 — Reservations-by-window read endpoint.** `GET /private/reservations?start&end[&spaceId][&status]` → `Reservation[]` (or a slim `ScheduleEntry`). Powers the live timelines; read-only, no tx semantics beyond a consistent snapshot.
- **ADR-0017 — Expired-hold approval semantics.** An approve/hold against a **lapsed lease with no live conflict** returns **`410 Gone` `messageKey: reservation.hold_expired`** (re-hold), not the current `429 rate_limited`. Applies to `approvals/service.ts` and the symmetric path in `reservations/service.ts`.

**New feature folders** (SPEC+TASKS each): **F20** pagination · **F21** mutation-error surfacing · **F22** approval reliability · **F23** RBAC client gating · **F24** live-schedule data · **F25** calendar usability · **F26** tasks actionability · **F27** dead-control cleanup · **F28** timezone · **F29** i18n completeness · **F30** polish/quick-wins. (Consolidate if you prefer fewer; the phases below are the real execution unit.)

---

## 3. Phased execution

### Phase A — Stop the bleeding (blockers + high-impact, mostly low-risk) — ~3–4 days
Highest severity first; ships visible reliability fast.

**A1 · Conflicts window fix (XC-2)** — *frontend, S.* Give the Dashboard + AppShell `useConflicts` a real window (reuse `Conflicts.tsx defaultWindow()`; extract to `lib/time.ts` and/or default it inside the hook). Restores the dashboard alert, floor-map red-lighting, and the nav Conflicts badge; kills 2–4 × 422/page. **Verify:** network shows 200, badge/alert render with a seeded overlapping reservation.

**A2 · Approval reliability (blocker) (F22 + ADR-0017)** — *full-stack, M.*
- ops-core: replace `APIError.rateLimited()` on the expired-no-conflict branch with `410 reservation.hold_expired`; keep `429` only for genuine serialization contention (and have it retry-after). Update unit + integration tests (expired-lease approve → 410, fresh hold → 200, real-conflict → 409).
- frontend (RequestDetail + Approvals): handle `410` → inline "This hold expired — re-hold the space" with a **Re-hold** action (`POST /reservations` from the aggregate's space/window/assets); handle `429` with auto-retry/backoff; **gate the "Feasible — ready to approve" banner on `reservation.expiresAt > now`**. **Verify:** approve a fresh hold → SCHEDULED + toast; approve an aged hold → clear re-hold path (no silent 429).

**A3 · Mutation-error surfacing infra + apply (XC-4) (F21)** — *frontend, M.* Add `lib/apiError.ts` `fieldErrorsFrom(err)` + a `useMutationToast({onFieldErrors})` helper that maps `APIError` (422 `fields` → inline, 403 → "insufficient role", 429 → retry note, else → generic toast). Wire onto: RequestDetail approve/reject, Intake create (+ wire `contactEmail`/`contactPhone` field errors), Users create/edit/toggle (stop the frozen-dialog), Portal new (map 422 fields). **Verify:** duplicate-email create shows a message; bad email on Intake highlights the field; failed approve toasts.

**A4 · RBAC client gating (XC-6) (F23)** — *frontend, M.* Add `lib/abilities.ts` (`can(role, action)` from the server role ladder) + a `useCan` hook. Gate: Approvals Approve/Reject (≥MANAGER), Scanner movement form (≥OPS → otherwise read-only view), "New request" (roles that can create), and make `useUsers`/`useDashboardStats`-style admin queries `enabled: isAdmin`. Keep server 403 as defense-in-depth; surface it via A3 if it ever fires. **Verify:** as VIEWER, Approve/Scanner controls are hidden/disabled; no `/admin/users` 403 round-trip.

**A5 · Dead-control triage (XC-5) (F27)** — *frontend, M.*
- Global **Copilot**: wire `inputValue/onInputChange/onSend` via `useCopilot` (mirror Intake) → send hits `/chat`, degrades gracefully.
- Global **Search**: build a minimal command palette (⌘K) over requests/spaces/assets, **or** relabel honestly to "Browse requests" and drop the ⌘K affordance (pick per scope).
- **New task** (/tasks): wire to a create-task dialog (Phase D/F26) or hide until then.
- **Change window** (Spaces + Inventory): wire to the inline date pills (and add the missing `setStart/setEnd` on Inventory) or remove.
- RequestDetail **"Use this"/"Select"** → wire to a re-hold/select-alternative flow (ties to A2) or remove; **"Adjust request"** → carry context (prefill /requests/new) instead of a blank form.
- **Forgot password** → add a route/flow or remove. Login: **redirect authed users away from /login** (check `useMe`).

### Phase B — Trust the data (de-mock the "live" surfaces) (XC-1) — ~3–4 days
**B1 · Reservations-by-window endpoint (F24 + ADR-0016)** — *backend, M.* ops-core route+service+validator returning reservations in `[start,end]` (optionally per `spaceId`/`status`), with buffers via `utils/time.ts`; openapi additive + DTO + mirror + contract test; integration tests.
**B2 · Wire the timelines** — *frontend, M.* `useSchedule(window)` hook → map via the already-written `reservationsToBars`; feed **Dashboard** live schedule, **Calendar**, **SpaceDetail** "Today's schedule". Remove `SAMPLE_TIMELINE_LANES` from production paths (keep the export for storybook only). Keep "• live" only on genuinely live data.
**B3 · RequestDetail narrative (data-driven)** — *frontend, S.* When AI plan is absent, compose the summary from the **real aggregate** (space name, layout capacity, reserved assets, quote total + VAT, task counts) instead of the hardcoded "Blue Hall 180" string. Show an explicit "AI summary unavailable — derived from plan" affordance.
**B4 · Calendar usability (F25, depends B1)** — *frontend, M.* Default to **today**; add prev/next-day + a date picker; real bars from B1; Week view → build a 7-day grid **or** remove the toggle (per D4).

### Phase C — Scale & correctness — ~2–3 days
**C1 · Pagination (F20 + ADR-0015)** — *full-stack, M.* Verify/emit `PaginatedServiceResponse` meta on `/requests`, `/audit`, `/assets/:id/movements`, `/admin/users`; add `page`/`pageSize` to `/audit` (bound it); openapi + mirror; expose meta in the api client (stop discarding it); add pager/infinite-scroll UI + "showing N of M". **Verify:** seed >100 requests / >50 audit rows → UI paginates, no silent truncation.
**C2 · Tasks actionability (F26)** — *frontend, M.* Task status transitions via existing `PATCH /private/tasks/:id` (To-do→In-progress→Done) with optimistic update + invalidate; wire "New task" (scoped to the selected event) → `POST /requests/:id/tasks`; (optional) a bulk tasks-by-window endpoint to retire the N+1.
**C3 · Timezone (F28)** — *frontend, S.* `lib/time.ts formatVenueDateTime(iso)` pinned to `Europe/Tirana`; replace ad-hoc `Intl.DateTimeFormat` in RequestDetail/Calendar(`isoToDecimalHour`)/AssetDetail/Approvals/Tasks.

### Phase D — Completeness & polish — ~2 days
**D1 · i18n (F29)** — *mostly frontend, M.* Frontend owns KPI sub-copy (stop rendering server `.hint` English; key via `t()`); fix `sq-AL` date (Albanian month map or `sq` locale); ICU/branch pluralization ("1 space"); add missing keys (`roles.PARTNER`, `intake.invalid.contactEmail/contactPhone`); i18n the timeline legend; title-case/i18n the Inventory type dropdown. Keep al/en key counts equal.
**D2 · Debounce (XC-9)** — *frontend, S.* `useDebouncedValue(~300ms)` on Requests + Audit search/filters.
**D3 · Polish (F30)** — *frontend, S.* AssetDetail **"Action"→"Status"** label; remove dead **VALUE** column (per D5); relabel/verify **"NATS connected"** pill; exclude PARTNER from "staff" count + add PARTNER to the edit role Select (or hide partner rows) so editing can't silently demote; Audit entity-type → **dropdown** of valid types; Scanner Check-In default location; clear login error banner on input; friendly REQ-id display.

### Phase E — Verify & close out — ~1 day
- ops-core: full Vitest (unit + property + real-Postgres integration) green; contract/type-sharing test green.
- frontend: type-check + build-green + al/en parity.
- **Regression: re-run this exact browser audit** (admin/partner/viewer) and confirm every finding flips to resolved; capture before/after.
- Regenerate `STATUS.md`; finalize ADRs/SPEC/TASKS; open PRs grouped by phase.

---

## 4. Coverage matrix (every audit finding → where it's fixed)

| Audit finding | Fixed in |
|---|---|
| XC-1 mock "live" surfaces (Dashboard/Calendar/SpaceDetail/narrative) | B1–B3 |
| XC-2 useConflicts({}) 422 (alert/floor-map/badge dead) | A1 |
| XC-3 pagination metadata discarded; /audit unbounded; movements/portal/approvals caps | C1 |
| XC-4 silent vs toast mutation errors (approve/intake/users/portal) | A3 |
| XC-5 dead buttons (Copilot/Search/New task/Change window/Use this/Select/Forgot pw) | A5 |
| XC-6 RBAC: Approvals + Scanner write controls for read-only roles | A4 |
| XC-7 browser-local timezone | C3 |
| XC-8 i18n gaps (hints/sq-AL date/legend/PARTNER/plural) | D1 |
| XC-9 search not debounced | D2 |
| XC-10 detail pages refetch full list | C1/optional (add `/:id` reads if desired) |
| **Blocker:** approve 429 silent + "Feasible" lie | A2 |
| /login: forgot-pw dead, no redirect-when-authed, generic error | A5 + A3 |
| /requests: dead VALUE column, no pagination | D3 + C1 |
| Intake: contactEmail 422 invisible, create no onError, copilot confirm/replan no-ops | A3 + A5 |
| RequestDetail: dead Use-this/Select/Adjust, reject no-validation | A5 + A3 |
| Calendar: default day, no nav, Week unimplemented, mock bars | B4 + B1 |
| Spaces/Inventory: dead "Change window"; Inventory window non-functional | A5 |
| SpaceDetail: empty "Today's schedule"; capacities-only edit | B2 + (edit scope: D3) |
| AssetDetail: "Action"→"Status" mislabel | D3 |
| Scanner: RBAC; Check-In location; qty max | A4 + D3 |
| Tasks: N+1, dead New-task, read-only | C2 + A5 |
| Approvals: RBAC, action inconsistency, generic 429 toast | A4 + A2 + A3 |
| Audit: unbounded; case-sensitive free-text filter; no debounce | C1 + D3 + D2 |
| Users: swallowed errors, partner-demote, no pagination, in-flight toggle | A3 + D3 + C1 |
| Portal: dead-end cards, no pagination, no end>start, generic errors | (cards→D4-style detail or accept) + C1 + A3 |
| Shell: NATS pill mislabel | D3 |

*(Two items folded into the closest phase: Portal request-detail route — add a read-only `/portal/:id` if you want clickable cards (small frontend) — and the "Value" column rollup, both flagged as optional/deferred.)*

---

## 5. Sequencing & dependencies
- **A1, A3, A4, A5** are independent frontend tracks — parallelizable immediately.
- **A2** needs ADR-0017 + the ops-core change before the frontend half.
- **B2/B3/B4** depend on **B1** (the new endpoint).
- **C1** needs ADR-0015 (and the verify-step on existing `PaginatedServiceResponse`).
- **C2** uses the existing tasks PATCH (no backend); **C3/D*** are independent.
- Critical path: **ADR-0017→A2** (blocker) and **ADR-0016→B1→B2/B4** (the mocks). Everything else can run alongside.

## 6. Done = 
Every finding in the matrix resolved, all ADRs/SPEC/TASKS written, ops-core + contract + frontend tests green, al/en parity, `STATUS.md` regenerated, and a clean re-run of the browser audit across all three roles.

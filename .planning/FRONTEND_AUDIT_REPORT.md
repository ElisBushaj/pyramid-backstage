# Pyramid Backstage — Frontend QA Audit Report

**Scope:** Every route in the SPA, driven in Chrome against the live stack (Vite :5173 → ops-core :4000, AI :8000), audited as **ADMIN**, **PARTNER**, and **VIEWER**. Each page: console, network/contract (vs `openapi.yaml`), functional (forms/buttons/flows), data/render correctness, UX/design. Code-level root causes confirmed by reading source + a 22-agent hooks-vs-contract cross-reference.
**Method note:** Per the "observe only" brief, no destructive/account mutations were committed. Failing mutations were exercised where they produced no state change (e.g. 429/422). A few states were unreachable on seed data (populated conflict UI, AI proposed-action card) and are flagged as code-confirmed-only.

Severity scale: **blocker** (breaks a core promised flow / data integrity) · **major** · **minor** · **polish**.

---

## Executive summary

The build is visually polished and the **deterministic ops-core surfaces are largely solid** (Spaces, Inventory, Audit, Scanner, the RequestDetail data tabs, the Intake form, RBAC forbidden card). But several **flagship "live" surfaces render fabricated data**, the **conflict + approval pipelines are effectively broken or unfeedbacked**, and there is a **long tail of dead buttons, silent failures, RBAC gaps, and systemic pagination loss**. The single biggest theme: *the product promises "can we make this happen / what's next", but the surfaces that answer that question (dashboard live schedule, calendar, conflicts, approvals) are the least trustworthy.*

The top things to fix before calling this production-ready:
1. The Dashboard "Live schedule", the Calendar bars, and SpaceDetail "Today's schedule" are **mock/empty**, not real reservations — yet labeled "• live".
2. `GET /conflicts` is called with no `start`/`end` on the dashboard + shell → **422 on every page**; conflict alert, floor-map lighting, and the nav conflicts badge are silently dead.
3. The **approve → scheduled** flow returns 429 on any aged hold and **RequestDetail swallows the error** (no toast, no retry) while still claiming "Feasible — ready to approve".
4. A cluster of **dead buttons**: global Copilot (can't send), global Search (navigates instead), Tasks "New task", "Change window" (Spaces + Inventory), RequestDetail "Use this"/"Select", "Forgot password".
5. **RBAC**: Approvals and Scanner show write controls to read-only roles (no client gate).
6. **Systemic**: pagination metadata is discarded app-wide; Audit fetches the entire ledger; Requests/Audit search fire one request per keystroke.

---

## Cross-cutting patterns (read these first — they recur on many pages)

### XC-1 — "Live"-labeled surfaces are mock or hardcoded-empty · **major**
The same `AvailabilityTimeline` mock (`SAMPLE_TIMELINE_LANES`) and empty-lane patterns recur:
- **Dashboard** `/`: `<AvailabilityTimeline/>` rendered with no `lanes` → falls back to the hardcoded 4-lane sample ("Product Launch · 160", "Gala setup", "Networking mixer" — none exist in the data). Labeled "Live schedule — today • live" with a pulsing dot.
- **Calendar** `/calendar`: `spacesToLanes()` grafts `SAMPLE_TIMELINE_LANES[i % 4]` onto any space ops-core reports busy; only busy/free is real, all titles/times/statuses are fabricated. The real adapter (`reservationsToBars`) exists but is dead.
- **SpaceDetail** `/spaces/:id`: "Today's schedule" timeline is hardcoded `reservations: []` → always "free", even when the space is booked.
- **RequestDetail** `/requests/:id`: when the AI `/plan` 503s (always), the "Copilot plan" falls back to a hardcoded i18n string that says "Blue Hall seats 180… a stage… reserved" for **every** request regardless of its real space/size/assets.

**Root cause:** the contract's `/spaces` list doesn't expose per-reservation windows, so the team scaffolded the timeline with samples and never swapped in live data. **Fix:** add a reservations-by-window endpoint (or include reservations on `/spaces?start&end`) and feed `reservationsToBars`; until then, do not paint "• live" on sample data — show an explicit "preview/sample" state.

### XC-2 — `useConflicts` is called without its required window almost everywhere · **major**
Contract requires `start`+`end`. The **Conflicts page** sends them (`?start=now-60d&end=now+60d` → 200 ✓). But **Dashboard** and **AppShell** both call `useConflicts({})` → `GET /conflicts` with no params → **422** (`fields:{start,end}`), firing 2–4× per page. Consequences: the dashboard conflict-alert banner never shows, the floor-map never lights conflicting spaces red, and the **sidebar "Conflicts" badge never shows a count**. Fix: pass a window from the shell/dashboard (and gate the query on it), or default the hook to a sensible window.

### XC-3 — Pagination metadata is discarded app-wide · **major**
`api.request()` returns only `envelope.data`, dropping `total`/`page`/`pageSize`. So **no list can paginate or show "N of M"**: Requests/Tasks cap at `pageSize=100`, Approvals/Portal at 50, all silently truncating. `GET /audit` has **no pagination params at all** and returns the entire ledger (verified: 12 rows regardless of `pageSize=2/8/50`); the dashboard's `?pageSize=8` is ignored. `useAssetMovements` sends no page → truncates to newest 50. Fix: thread pagination through the client envelope and add pager/infinite-scroll UI; bound `/audit`.

### XC-4 — Inconsistent mutation error handling (silent vs toast) · **major**
The same actions are implemented twice with different error UX:
- **Silent failures (no feedback):** RequestDetail Approve (only 409 handled; 429/500 swallowed), Intake create (`create.mutate` has no `onError` → 500/429 silent), Users create/edit/toggle (no `onError` → duplicate-email leaves the dialog frozen open).
- **Proper toasts:** Approvals Approve/Reject, Scanner movement.
Net effect: a user can click a primary action, have it fail, and see **nothing**. Fix: a single mutation-error handler that maps `APIError` (incl. 422 `fields`, 429-retry, 403) to a toast/inline message.

### XC-5 — Dead / no-op interactive controls · **major (several)**
| Control | Location | Behavior |
|---|---|---|
| Copilot panel send | global top-bar (`AppShell`) | input has no `inputValue`/`onSend` wired → send permanently disabled; never calls `:8000` |
| "Search or start a request… ⌘K" | global top-bar | a `<button>` that just `navigate('/requests')`; ⌘K is decorative |
| "New task" | `/tasks` | no `onClick` — primary CTA does nothing |
| "Change window" | `/spaces`, `/inventory` | no `onClick`; on `/inventory` the window state has no setter at all |
| "Use this" / "Recommended" / SpaceCard "Select" | `/requests/:id` | no `onClick`/`onSelect` |
| "Forgot password?" | `/login` | no `onClick`, no `/forgot` route |

### XC-6 — RBAC: write controls shown to read-only roles · **major**
Only ADMIN/Staff is client-gated (nav hidden + forbidden card). Verified as VIEWER: **Approvals** shows Approve/Reject buttons and **Scanner** shows the full movement form — both rely solely on a server 403 on submit (and Scanner/Approve error surfacing is weak). RequestDetail approve and detail-page Edit *are* correctly gated, so the gating is inconsistent. Fix: gate Approvals + Scanner (+ "New request") on `me.role`, or at minimum surface the 403 clearly.

### XC-7 — Timezone: times render in browser-local, not venue-local · **major**
Reservation windows and task due-times use the browser's timezone. The FinTech reservation stored `2026-07-22T09:00–18:00Z` renders as "11:00–20:00" (UTC+2 host). Different viewers/locations see different hours for the same physical booking. For a venue-ops tool this is a correctness risk. Fix: pin all event/venue times to `Europe/Tirana`.

### XC-8 — i18n gaps · **minor**
- API-provided `hint` strings stay English in AL mode (dashboard KPI subs: "new requests this week vs last", etc.).
- `sq-AL` date locale falls back to **en-US** ("Sunday, June 21, 2026" in AL vs en-GB in EN).
- Hardcoded English in the timeline legend and Copilot mock labels.
- `roles.PARTNER` missing from both `al.json` and `en.json` (latent — partner is redirected before it renders).
- Pluralization: "1 spaces in use" (no plural rule on `dashboard.spacesInUseSub`).

### XC-9 — Search/filter inputs are not debounced · **minor**
Requests search and Audit filters fire one request **per keystroke** (verified: typing "Tech" → 4 calls). Combined with XC-3 (audit = full-ledger fetch) this is a per-keystroke full-ledger pull. Fix: ~300ms debounce.

### XC-10 — Detail pages refetch the full list instead of a by-id endpoint · **minor**
`SpaceDetail` and `AssetDetail` derive the record by filtering the full `/spaces` or `/assets` list (no `GET /:id`); deep-links only work because the whole list loads. AssetDetail does use a real `/assets/:id/movements`. Minor N+1.

---

## Per-page findings

### `/login` — Operations sign-in
- **Console/Network:** clean. `POST /public/auth/login` → 200 sets `pb_session`+`pb_csrf`, redirects by role (PARTNER→/portal, else /). Invalid creds → 401.
- **Functional:**
  - *major* — **"Forgot password?" is dead** (no onClick / no route). Verified.
  - *major* — **An already-authenticated user at `/login` is NOT redirected** — the form shows again (route is outside `RequireAuth`, never checks `useMe`). Verified by navigating to `/login` while logged in.
  - *major (code)* — the error banner collapses **all** non-429 failures to "Wrong email or password." A 500 would wrongly claim bad credentials; a non-`APIError` throw shows nothing.
  - *minor* — `noValidate`; whitespace-only email/password passes the disabled-button gate; the error banner isn't cleared when you start typing again.
- **Data/Render:** correct. "Wrong email or password." shown on 401.
- **UX:** clean, centered, EN/AL toggle present. **Fix:** wire Forgot password (or remove it), redirect authed users away from `/login`, distinguish 401 from 5xx/network in the error copy.

### `/` — Dashboard
- **Network:** on load: `dashboard/stats` 200, `requests?pageSize=6` 200, `conflicts` **422 ×2**, `audit?pageSize=8` 200 (returns 12 — pageSize ignored), `spaces` 200, `assets` 200.
- **Data/Render:**
  - *major* — **"Live schedule — today • live" is 100% hardcoded mock** (XC-1). The pulsing "live" badge is actively misleading.
  - *major* — **Conflict alert + floor-map red-lighting are dead** because `useConflicts({})` 422s (XC-2).
  - *ok* — KPIs (Events 3▲3 / Spaces 1/19 / Low-stock 0 / Approvals 2) match `dashboard/stats`. "Where is it?" (AssetLocationBoard) is real (correctly empty). Recent activity (AuditTimeline) is real.
  - *minor* — "1 spaces in use" pluralization (XC-8).
- **Functional:** "+ New request" → /requests/new ✓; floor toggles (Floor 3/0/-1) work (client) ✓; scan link → /scan ✓.
- **UX:** strong at-a-glance layout, but the centerpiece (live schedule) being fake undermines trust. **Fix:** feed real lanes or drop "• live"; restore the conflict window.

### Global shell (`AppShell`) — every staff page
- *major* — **Global Copilot button opens a panel you can never send from** (XC-5). The same `CopilotPanel` is fully wired on Intake but inert here.
- *major* — **Top-bar Search is fake** — navigates to /requests (XC-5).
- *major* — `useConflicts({})` here is the 2nd 422 source; kills the nav conflicts badge (XC-2).
- *minor* — **"NATS connected" pill is mislabeled** — `live = meQuery.isError ? 'degraded' : 'connected'` reflects whether `/me` succeeded, **not** NATS. Verify against real bus state or relabel.
- *ok* — nav approvals badge ("2") works; sidebar collapse works; RBAC nav-hiding works (XC-6); user dropdown + logout (`qc.clear()` → /login) work.

### `/requests` — Requests list
- **Network:** `GET /requests?pageSize=100` (+`status`/`q`).
- **Functional/Data:**
  - *major* — **VALUE column is a permanently-dead column** (`render: () => "—"`). Header "Value" is meaningless; either wire quote totals or remove.
  - *major* — **No pagination** (hard `pageSize=100` cap, no pager) (XC-3).
  - *minor* — search not debounced (XC-9); DATES shows only `preferredDates[0].start`; ID column shows the raw UUID (not a friendly REQ-####).
  - *ok* — tabs (All/Proposed/Approved/Scheduled) + search compose server-side; row click → detail; empty/loading/error states wired.

### `/requests/new` — Intake (+ Chat copilot)
- **Functional:**
  - *ok* — required-field validation (title/organizer/attendees/start/end) blocks submit with inline errors; **end-after-start validated client-side**; server 422 `fields` mapped back for those 5 fields. Verified: empty submit fired no POST; invalid submit → 422, no record created.
  - *major* — **contactEmail / contactPhone 422s are invisible** — those `FormField`s have no `error` prop. Verified: `notanemail` → 422 with no field highlight. If only the email is bad, the form dead-ends ("fix a field" with nothing highlighted).
  - *major* — `create.mutate` has **no `onError`** → 500/429 are silent (XC-4).
  - *minor* — attendees `min={1}` is bypassed by `noValidate`; 0/1.5/neg pass client → extra server round-trip (error does surface after).
  - *ok* — **Chat tab Copilot is the good one**: send is wired, hits `:8000/chat`, and on 503 **degrades gracefully** ("The AI copilot is not connected in this build" + canned reply). Verified.
  - *major (code)* — but the Copilot proposed-action "Confirm hold" / "Re-plan" buttons are no-ops (Intake doesn't pass `onConfirm`/`onReplan`).
  - *note* — the seeded chat says "I've pre-filled the form" but doesn't.

### `/requests/:id` — RequestDetail (the "plan" view)
- **Network:** `GET /requests/:id` (aggregate) 200; `POST :8000/plan` **503**; `spaces`/`assets` (no window); `auth/me`.
- **Functional/Data:**
  - *blocker (combined)* — **Approve fails and the UI says nothing.** `POST /requests/:id/approve` returns **429** on Annual Tech Summit (verified twice); RequestDetail only handles 409, so 429/500 are swallowed — no toast, no retry, status stays "Proposed". Root cause: the approval service throws `rateLimited()` (429, "retryable") when a HELD lease has expired with no live conflict; seed holds expired hours ago, so **approve is permanently 429 for any aged hold** while the page still shows "Feasible — ready to approve" (the `feasible` check ignores hold expiry). The canonical request→approve→scheduled journey can't complete in this environment, with zero user feedback. **Fix (frontend):** surface non-409 approve errors + auto-retry on 429; gate "Feasible" on hold validity. **(Backend dependency:** an expired hold should be a clear 409/410 "re-hold", not a 429.)**
  - *major* — **"Copilot plan" narrative is a hardcoded string** wrong for non-FinTech requests (XC-1). Verified: Annual Tech Summit (Green Hall, 110) shows "Blue Hall seats 180…".
  - *major* — dead buttons: "Use this"/"Recommended" alternatives, SpaceCard "Select" (XC-5); "Adjust request" → blank `/requests/new` (loses context).
  - *major (code)* — Reject dialog has **no client validation** on reason (fires even empty; server min-3 → 422) and the reason isn't reset between opens — **inconsistent with the Approvals page**, which *does* validate (≥3) and toast.
  - *major (tz)* — reservation window renders 11:00–20:00 for a 09:00–18:00Z booking (XC-7).
  - *ok* — Overview/Quote/Tasks/History tabs all render real aggregate data correctly. Quote math is correct (Net 296,000 / VAT 20% 59,200 / Total 355,200 ALL; ALL has no minor unit so no ÷100 needed). Floor map IS data-driven (lights the correct space).
  - *minor* — eventType/layout labels are English `titleCase` (not i18n); capacity fallback is max-across-all-layouts under the requested-layout label.

### `/calendar` — Day-view availability
- *major* — **reservation bars are mock** grafted by lane index (XC-1); the 22-Jul match is coincidental.
- *major* — **hardcoded `DEFAULT_DAY = 2026-07-22`** (opens there, not today — verified "Today" → 21 Jun → "Nothing scheduled").
- *major* — **no date navigation** (only DEFAULT_DAY or "Today"; no prev/next/date-picker).
- *major* — **Week view is an unimplemented placeholder** ("Week view is coming"). Dead toggle.
- *ok* — busy/free signal is real; empty/loading/error states + "Today"/"Jump to today" work.

### `/spaces` — Spaces browse
- *ok* — layout/minCapacity/date-window filters work server-side (verified Theater → "6 match"); rate via `formatMinor` ("80,000 ALL / day", correct for Lek); card/Select → /spaces/:id; empty/error states.
- *minor* — **"Change window" header button is dead** (XC-5); datetime pills render empty; "capacity for requested layout" copy shown even with Layout=All.

### `/spaces/:id` — SpaceDetail
- *major* — **"Today's schedule" is hardcoded empty** → always "free" (XC-1).
- *minor* — derives from full list, no `/spaces/:id` (XC-10); Edit only covers **capacities** (rate/buffers/features read-only even in edit mode).
- *ok* — capacity table, details, features render correctly; Edit gated to OPS+ (entering edit = client-only, no network); Save → `useUpdateSpace` (not exercised). (Contract note: route is OPS-specific but UI grants Edit to OPS/MANAGER/ADMIN — verify MANAGER/ADMIN pass the gate.)

### `/inventory` — Inventory availability
- *major* — **"Availability for this window" is non-functional**: `start`/`end` are `useState('')` **with no setters** and "Change window" has no `onClick` (XC-5). Availability is always the default rollup.
- *ok* — type filter works server-side (verified SEATING → 1 row); meters/low-stock banner/row-nav/empty-loading-error wired.
- *polish* — type options are raw enums ("STAGE_UNIT"), not title-cased like the Spaces dropdown.

### `/inventory/:id` — AssetDetail
- *minor* — the asset **status** field (ACTIVE/MAINTENANCE/RETIRED) is mislabeled **"Action"** (reuses `t('audit.action')`), in both view and edit mode.
- *minor* — derives from full list (XC-10).
- *ok* — KPIs (Total/Available/Held/Checked out), QR code, movement history (empty state + sections), not-found EmptyState, editable type/location/total/status all correct.

### `/scan` — Scanner
- *major (RBAC)* — full movement form shown to read-only VIEWER (XC-6).
- *ok* — pick-list + client search, movement form with validation (toLocation required, qty≥1), **success + error toasts both wired**. `QrScanner` exists (camera unavailable in this env → clear fallback message).
- *minor* — "To location" required even for **Check In** (should default to home/storage); no client-side max on quantity (can attempt > available).

### `/tasks` — Tasks board
- *major* — **N+1 fetch**: `/requests?pageSize=100` then one `/requests/:id/tasks` per request (101 calls at 100 requests).
- *major* — **"New task" is a dead button** (XC-5) — verified.
- *major* — **tasks are read-only**: the "To do" pills aren't interactive; no way to mark done/in-progress, edit, reassign, or reschedule. The product's "what's next" can't be acted on.
- *minor* — only the first 4 events get filter tabs.
- *ok* — event filter works (verified); SETUP/TEARDOWN lanes; overdue banner logic; empty/loading/error states.

### `/approvals` — Pending approvals
- *major (RBAC)* — Approve/Reject shown to VIEWER (XC-6).
- *major (inconsistency)* — same actions, different impl vs RequestDetail (here: error toast + inline reject with ≥3 validation; there: silent approve + modal reject w/ no validation).
- *minor* — error toast is generic ("We hit an unexpected error.") — doesn't explain the 429 expired-hold, so the user just retries fruitlessly (verified the toast appears).
- *ok* — lists PROPOSED (`?status=PROPOSED&pageSize=50`); honest "AI recommendation will appear once the copilot is connected" placeholder; success → refetch.

### `/conflicts` — Conflicts board
- *ok* — **works**: `?start=now-60d&end=now+60d` → 200; correct empty state ("No conflicts right now…" + "View calendar"); loading/error states.
- *note* — populated `ConflictBanner` UI **could not be exercised** (seed has no overlapping reservations — the "planted conflict" is latent because E3 never got a hold). The shared `useConflicts({})` 422s here too (from the shell).

### `/audit` — Audit log
- *major* — **fetches the entire unbounded ledger** (no pagination params exist) (XC-3).
- *minor* — entity-type filter is free-text, **case-sensitive exact match** (no dropdown of valid values — verified `Reservation` works; a typo = empty); filters not debounced (XC-9).
- *ok* — `?entityType=` / `?requestId=` filter server-side; timeline renders actor/action/entity-link/status-diff/timestamp; status rows expand.
- *minor (code)* — `formatDateTime` can render "Invalid Date" on a malformed `at`; diff shows only the first changed scalar.

### `/settings/users` — Staff (ADMIN only)
- *blocker (data-integrity-ish)* — **mutation errors are swallowed** (XC-4): create/edit/toggle have no `onError`; a duplicate-email create leaves the dialog frozen open with no message; a failed Active toggle silently reverts.
- *major* — **PARTNER is shown but not selectable** in create/edit (ROLES omits it). Editing the partner: the `Select` value 'PARTNER' matches no option → shows ADMIN while `form.role` stays PARTNER until touched → **saving can demote the partner**.
- *major* — no pagination/search/sort; "5 staff accounts" counts the external partner as staff.
- *minor* — Active Switch not disabled in-flight → racing PATCHes (`useUpdateUser` is `idempotency:false`); edit can't change password.
- *ok* — non-admin → "403 — Admins only" forbidden card (verified as VIEWER); create password ≥8 client validation; role badges; kebab Edit/Deactivate. (Minor: `/admin/users` 403 still fires ×2 for non-admins.)

### `/portal` — Partner Portal "My requests" (PARTNER)
- *major* — **request cards are non-interactive dead-ends** (no detail route in PortalShell) — verified click does nothing.
- *major* — no pagination (50 cap; total discarded) (XC-3).
- *minor* — shows `preferredDates` **starts only** (each range's end not shown).
- *ok* — server row-scopes to the partner's own requests (`?pageSize=50`); DRAFT→PROPOSED→APPROVED→SCHEDULED stepper; PortalShell bounces staff → /.

### `/portal/new` — Partner new request (PARTNER)
- *major* — **no end-after-start validation** (inverted range submittable).
- *major* — all API errors → one generic banner (`onError → error.generic`); 422 `fields` discarded (no per-field UI).
- *latent (not live)* — `setErr(t('intake.required'))` is dead code (Submit is `disabled={!valid}`, so it's unreachable; the key resolves to an object → would render raw "intake.required" if ever reached). *(The mapping workflow flagged this as a reachable blocker; the disabled button mitigates it — downgraded.)*
- *minor* — contactEmail no client validation; attendees accepts 1.5; datetime tz-lossy.
- *ok* — Submit disabled until valid (verified empty submit shows no banner).

---

## Prioritized top issues (fix in this order)

1. **Approve flow: silent 429 + "Feasible" lie** (`/requests/:id`) — surface non-409 errors, auto-retry/handle 429, and gate "Feasible — ready to approve" on hold validity. (Pair with the backend: expired hold → clear 409/410, not 429.) *Breaks the core journey with no feedback.*
2. **Conflict window bug** (`useConflicts({})` → 422 on dashboard + shell) — dashboard alert, floor-map lighting, and nav badge are dead. One-line-ish fix, high blast radius.
3. **Mock surfaces dressed as live** — Dashboard live schedule, Calendar bars, SpaceDetail "Today's schedule". Either wire real reservation windows or stop labeling them "live".
4. **Calendar is barely usable** — hardcoded default day, no date navigation, Week view unimplemented, mock bars.
5. **Silent mutation failures** (Intake create, Users CRUD, RequestDetail approve) — add a shared mutation-error → toast/inline handler that reads `APIError.fields`.
6. **RBAC: Approvals + Scanner write controls for read-only roles** — gate on `me.role` and/or surface 403s.
7. **Dead buttons** — global Copilot send, global Search, Tasks "New task", "Change window" ×2, RequestDetail "Use this"/"Select", "Forgot password". Either wire or remove; a dead primary CTA reads as broken.
8. **Tasks are read-only** — add status transitions / edit so the operational board is actionable.
9. **Pagination loss** (XC-3) — thread envelope metadata, add pagers, bound `/audit`.
10. **Timezone** (XC-7) — pin to `Europe/Tirana` so booking hours are stable across viewers.

## Quick wins (high-impact, low-effort)

- Remove or wire the **dead buttons** (XC-5) — pure UX credibility.
- Pass a `start`/`end` window to the dashboard/shell `useConflicts` (kills 4 × 422 per page + restores the alert/badge).
- Add **~300ms debounce** to Requests/Audit search (XC-9).
- Fix the **"Action" → "Status"** label on AssetDetail; fix **"1 spaces"** pluralization.
- Remove the dead **VALUE** column on `/requests` (or wire the quote total).
- Relabel the **"NATS connected"** pill (it doesn't reflect NATS).
- Exclude **PARTNER** rows from the "Staff" count / add PARTNER to the edit role list so editing a partner can't silently demote them.
- Add `onError` toasts to Users CRUD and Intake create (re-use the existing toast system already used by Approvals/Scanner).

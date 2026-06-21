# Frontend Audit — Working Notes (raw evidence)

App: http://localhost:5173 · API: http://localhost:4000/api/v1 · Date in app: 2026-06-21
Admin: admin@pyramid.al / Password123! · roles: ADMIN, MANAGER, OPS, VIEWER, PARTNER
curl cookie jar: /tmp/pb_cookies.txt (pb_session + pb_csrf)

Seeded data of record:
- E1 "FinTech Startup Conference" CONFERENCE 180 — Blue Hall @ 2026-07-22 09:00–18:00, APPROVED/SCHEDULED (planted conflict)
- E2 "Annual Tech Summit" CONFERENCE 110 — Green Hall @ 2026-07-24, PROPOSED, held+quoted
- E3 "Community Art Exhibition" EXHIBITION 160 — by PARTNER, PROPOSED, wants Blue@W1+W2
- 19 spaces, 6 asset types. Nothing checked out.

---

## /login — Operations sign-in
- Console clean (only vite + react-devtools).
- Login POST /public/auth/login → 200; sets pb_session + pb_csrf; redirects to /.
- "Forgot password?" is type=button — TODO: test behavior.
- EN/AL toggle present top-right.

## / — Dashboard
Calls on load: GET /private/dashboard/stats 200, /private/requests?pageSize=6 200,
/private/conflicts 422 (x2!), /private/audit?pageSize=8 200, /private/spaces 200, /private/assets 200.

FINDINGS:
- [MAJOR] "Live schedule — today • live" is 100% HARDCODED MOCK. Dashboard.tsx:194 renders
  <AvailabilityTimeline/> with no `lanes` prop; component defaults to SAMPLE_TIMELINE_LANES
  (Blue Hall "FinTech Startup Conf · 180", Orange Hall "Product Launch · 160", Amphitheater free,
  Foyer "Held — Gala setup" + "⚠ Networking mixer"). NONE from API. "Product Launch", "Gala setup",
  "Networking mixer" don't exist in seed. The pulsing "live" badge is actively misleading; never changes.
- [MAJOR/BLOCKER] GET /private/conflicts 422 — useConflicts({}) sends no params, but server REQUIRES
  start+end datetime query params (422 body fields:{start:validation.datetime,end:validation.datetime}).
  Consequence: DashboardConflictAlert banner never renders, FloorMap conflict red-lighting never works
  (conflictSpaceIds always empty). Fires TWICE (duplicate). Frontend bug (hook called without window).
- [MINOR] Pluralization: subtitle "1 spaces in use" — i18n key dashboard.spacesInUseSub = "{{count}} spaces in use",
  no plural handling. (al.json same.)
- [INFO/ok] dashboard/stats response matches rendered KPIs (events 3 ▲3, spaces 1/19, low-stock 0, approvals 2).
- [INFO/ok] AssetLocationBoard is real (useAssets, filter checkedOutQuantity>0) — correctly empty.
- [INFO/ok] Recent activity / AuditTimeline uses real /audit data.
- [minor?] useRequests({pageSize:6}) fetched only to test requests.length===0 for empty-state; data otherwise unused.
- [ok] Floor toggles (Floor 3/0/-1) work (client-side); +New request → /requests/new (to verify).
- [INFO] /private/audit IGNORES pageSize — returns ALL 12 entries for pageSize=2/8/50; envelope has NO pagination meta (no total/page). requests honors pageSize. Affects dashboard (minor: 12 vs 8) and /audit (major).

## /requests — Requests list (Pipeline)
Page call: GET /private/requests?pageSize=100 (useRequests hardcodes pageSize:100, hooks.ts:44). +q,+status when filtering.
- [MAJOR] VALUE column is a DEAD column — Requests.tsx:83 render:()=> "—" hardcoded. Never shows any value for any row.
  Header "Value" is meaningless. Either wire quote totals or remove.
- [MAJOR] No pagination. Hard pageSize=100 cap, no load-more/pager. >100 requests silently truncated. Envelope also has
  no total/page meta to drive a pager.
- [MINOR] Search box NOT debounced — every keystroke fires a request (verified: q=T, q=Te, q=Tec, q=Tech = 4 calls). Needs ~300ms debounce.
- [MINOR] DATES column shows only preferredDates[0].start (Requests.tsx:74). Multi-date requests (Community Art has 2) show one date.
- [POLISH] REQUEST column shows raw truncated UUID (r.id, mono accent), not a friendly REQ-#### identifier.
- [ok] Tabs All/Proposed/Approved/Scheduled → status filter server-side; compose with search (status+q). Verified.
- [ok] Subtitle "N active · M awaiting approval" correct; row click → /requests/:id; empty/loading/error states wired (DataTable).
- [PERF/cross-cut] On every in-app navigation, AppShell refetches dashboard/stats(x), conflicts(422), and dashboard's
  spaces/assets/audit refire — looks like refetchOnWindowFocus/Mount storm (conflicts 422 recurs on nearly every page). Verify.

## /requests/:id — RequestDetail (the "plan" view) [tested on FinTech 265decac, SCHEDULED]
Calls: GET /private/requests/:id (aggregate: request,reservation,quote,tasks,conflicts,audit) 200; POST :8000/plan 503;
GET /private/spaces, /private/assets, /private/auth/me. Tabs Overview/Quote/Tasks/History all render real data ✓.
- [MAJOR] AI POST :8000/plan returns 503 on every load → falls back to TEMPLATED narrative. The fallback
  plan.narrativeFeasible (en.json:210) is a HARDCODED string: "Yes — we can host this. Blue Hall seats 180 theater-style…
  a stage, chairs and wireless mics are reserved… 20% VAT…". Shown for EVERY feasible request regardless of actual
  space/size/assets. (a) Wrong for non-Blue/non-180 requests; (b) claims "a stage … reserved" but reservation has only
  chairs+mics (no stage deck); (c) presented as "Copilot plan" with no "AI offline / preview" indicator. → verify on Annual Tech Summit.
- [MAJOR/UX] "Use this" buttons on Alternatives (RequestDetail.tsx:404) have NO onClick → dead. Also SpaceCard "Select"
  button is dead here (PlanSpaceCard passes no onSelect → no-op). (Alternatives only render on conflict path.)
- [MAJOR? TZ] Reservation window renders in BROWSER-LOCAL tz, not venue-local. API stores 2026-07-22T09:00–18:00Z;
  card shows "22 Jul, 11:00–20:00" (UTC+2). Tasks times also local (07:00/09:00/22:00). Different viewers/locations see
  different hours for the same physical booking. For a venue ops tool this is a correctness risk.
- [INFO] Quote money is CORRECT (not a ÷100 bug): netMinor/vatMinor/totalMinor → Net 296,000 / VAT(20%) 59,200 /
  Total 355,200 ALL. ALL=Lek has no decimal subunit so showing minor as-is is right. (Latent: groupMinor hardcodes
  maximumFractionDigits:0 — would be wrong if a decimal currency like EUR were ever used.)
- [INFO] Quote stays status DRAFT even on a SCHEDULED/CONFIRMED event (seed never finalizes quote) — backend/domain, not FE.
- [POLISH] Each task card shows the parent request UUID as a header link — redundant on the request's own page; raw UUID.
- [ok] Approve/Reject actions only when status=PROPOSED; canApprove gated to MANAGER/ADMIN w/ tooltip for others; reject
  opens ConfirmDialog with reason textarea. Floor map IS data-driven (correctly lights Green Hall for Annual Tech Summit).
- [MAJOR/FE] APPROVE FAILURE IS SILENT. Clicked Approve on Annual Tech Summit (PROPOSED, "Feasible — ready to approve") →
  POST /private/requests/:id/approve returned 429 BOTH times. UI showed NOTHING: no toast, no inline error, button
  unchanged, status still Proposed. RequestDetail only special-cases 409 (ConflictBanner via approveErr.status===409);
  every other error (429/500/403) is swallowed — approve.error is never rendered. No auto-retry either.
- [MAJOR/BACKEND surfaced in FE] The 429 is DETERMINISTIC, not transient. approvals/service.ts:34-46: an expired HELD
  lease with no live conflict → APIError.rateLimited() (429, "retryable"). E2's hold was seeded with a ~15-min lease
  hours ago → permanently expired → approve always 429s. So: (a) the canonical request→approve→SCHEDULED flow cannot be
  completed for ANY aged hold (all seeded holds except the already-approved E1); (b) 429/"rate limited" is the wrong
  semantic for a permanently-expired hold — should be a clear "hold expired, re-hold the space" 409/410; (c) feasible =
  !conflict && !!reservation ignores hold expiry, so the page asserts "ready to approve" when it is not.
  NOTE: did NOT verify via curl POST (correctly blocked by the observe-only guardrail); evidence is 2 browser 429s + code.
- [TO TEST] Reject flow (ConfirmDialog, empty-reason validation — server requires reason len 3-500 per approvals/routes.ts:9;
  FE has no client validation so empty reject likely 422 → check if that error surfaces). Conflict/Alternatives + dead
  "Use this" buttons only render on the 409 path (no seeded request reaches it naturally).

## /calendar — Day-view availability timeline
Page call: GET /private/spaces?start=<day>T08:00:00Z&end=<day>T20:00:00Z → 200. Lanes = real 19-space catalog.
- [MAJOR] Reservation BARS ARE MOCK. /spaces returns only a per-space `available` boolean (NO per-reservation windows —
  confirmed: Blue Hall payload has no reservations field). Calendar.tsx spacesToLanes() grafts SAMPLE_TIMELINE_LANES[i%4]
  onto any space with available===false, "free" otherwise. So titles/times/statuses are fabricated; only busy/free is real.
  The 22-Jul "FinTech Startup Conf · 180 @14:00–18:00" match is COINCIDENTAL (Blue=lane0=sample0). Real window is 09:00–18:00Z.
  reservationsToBars() (the real adapter) is written but UNUSED (dead until contract exposes windows). Code comment admits this.
- [MAJOR] Hardcoded DEFAULT_DAY='2026-07-22' (Calendar.tsx:25). Opens on 22 Jul 2026, not today (21 Jun). Verified: "Today"
  button jumps to "Sunday, 21 June 2026 → Nothing scheduled / All spaces are free".
- [MAJOR] NO date navigation. Only DEFAULT_DAY or Today button — no prev/next day, no date picker. Cannot browse other dates.
- [MAJOR] WEEK view unimplemented — Day/Week toggle's Week shows EmptyState "Week view is coming … isn't available yet". Dead toggle.
- [MINOR/TZ] Real-data path (isoToDecimalHour) uses getUTCHours → would render in UTC, inconsistent w/ RequestDetail's local tz. (Moot while bars are mock.)
- [ok] Empty/loading/error states wired; "Jump to today"/"Today" work; busy/free signal is real.

## /spaces — Spaces browse (Resources)
Page call: GET /private/spaces (no params initially; +layout/minCapacity/start/end as filters change). 19 SpaceCards.
- [ok] Layout filter works server-side: select Theater → /spaces?layout=THEATER → 200, "6 match", theater capacities shown
  (Blue 220, Green 120, Lower Gallery 140, Orange 180, Skyline 80, Yellow 90). minCapacity + date-window also feed query.
- [MINOR/dead] "Change window" header button (Spaces.tsx:62-65) has NO onClick — clicked, nothing happens. Dead/redundant
  (the inline date-window pills are the real control).
- [ok] SpaceCard rate via lib/money formatMinor → "80,000 ALL / day" (correct). Card + "Select" both navigate /spaces/:id.
  Empty/loading/error states + clearFilters wired. Subtitle count/match pluralizes.
- [POLISH] datetime-local pills render empty placeholders; label "capacity for requested layout" shown even with Layout=All
  (no request context on a browse page) — slightly odd copy.

## /spaces/:id — SpaceDetail
Calls: GET /private/spaces (full list) + /auth/me. NO GET /spaces/:id.
- [MINOR/perf] Derives the space by filtering the full 19-item /spaces list client-side (SpaceDetail.tsx:24). Fetches 19 to
  show 1; a direct deep-link only works because the whole list is fetched. (Check contract for a real /spaces/:id endpoint.)
- [MAJOR] "Today's schedule" timeline is hardcoded EMPTY: AvailabilityTimeline lanes=[{...reservations: []}] (line 130).
  Always shows "free" regardless of date/bookings — even Blue Hall on 22 Jul (its FinTech booking) would show free. Dead panel.
- [ok] Edit space: gated to OPS/MANAGER/ADMIN; entering edit mode is client-only (no network ✓); capacity number inputs +
  Save/Cancel. Save → useUpdateSpace PATCH. (Did NOT save — observe-only.)
- [MINOR] Edit only covers CAPACITIES. Day rate, setup/teardown buffers, and features stay read-only in edit mode — partial edit.
- [ok] Capacity/details render correctly (Theater 220/Classroom 120/Banquet 160/Reception 300; rate 80,000 ALL via formatMinor;
  buffers 240/120 min; features). Loading/error states wired.

## /inventory — Inventory availability
Page call: GET /private/assets (no window; +type filter). 6 assets w/ availability meters.
- [MAJOR] "Availability for this window" window feature is NON-FUNCTIONAL. Inventory.tsx:38-39 declares start/end via
  useState('') with NO setter — they can never change. "Change window" button (line 64-67) has NO onClick → DEAD (same
  pattern as Spaces). So availability is always the default rollup; the "window" framing is a lie.
- [ok] Type filter works server-side: SEATING → /assets?type=SEATING → 1 row (Standard chair 400/400). Meters/low-banner
  logic, row→/inventory/:id nav, empty/loading/error states wired.
- [POLISH] Type options are raw enum values (SEATING, MICROPHONE, STAGE_UNIT…), not title-cased/localized (Spaces layout
  dropdown title-cases — inconsistent).

## /inventory/:id — AssetDetail
Calls: GET /private/assets (list) + /assets/:id/movements + /auth/me. Derives asset from list (no GET /assets/:id).
- [MINOR] Mislabel: the asset STATUS row (ACTIVE/MAINTENANCE/RETIRED) is labeled with t('audit.action') → renders
  "Action" instead of "Status" (AssetDetail.tsx:184 view + :168 edit). i18n key reused wrongly.
- [ok] KPIs (Total/Available·window/Held/Checked out), QR code (AssetQr w/ asset id), movement history (empty state +
  checkout/relocation sections), not-found EmptyState (back to list), edit (type/location/total/status, OPS+). Solid.
- [MINOR] Like SpaceDetail, derives detail from full /assets list (no dedicated detail endpoint) — fetches all to show one.

## /scan — Scanner (asset check-in/out/relocate)
Calls: GET /private/assets + /auth/me. Movement submit → useScanAsset POST /assets/:id/movements (NOT submitted — observe-only).
- [ok] Pick-list + client-side search (name/id), movement form (Check out/in/Relocate · Quantity · To location · Note),
  validation (toLocation required + qty>=1 disables button), SUCCESS + ERROR toasts both wired (good — contrast w/ Approve).
- [INFO] QrScanner component exists but camera is unavailable in this env (needs camera + secure context) → shows
  "Camera scan isn't available here — pick an asset below." Environmental, not a code bug.
- [MINOR] "To location" required even for CHECK IN (checking in should default to home/storage, not demand a destination).
- [MINOR] No client-side max on quantity — can attempt to check out > available; relies on server rejection + error toast.

## /tasks — Tasks board (Operations)
Calls: GET /private/requests?pageSize=100, then GET /private/requests/:id/tasks PER request (N+1).
- [MAJOR/perf] N+1 fetch. useAllTasks(allIds) fans out one /requests/:id/tasks per active request. 3 requests → 4 calls;
  100 requests → 101 calls. No batch/aggregate endpoint used.
- [MAJOR/dead] "+ New task" button (Tasks.tsx:59-62) has NO onClick — verified: clicked, nothing happens. Primary CTA dead.
- [MAJOR/gap] Tasks are READ-ONLY. "To do" status pills aren't interactive; no way to mark DONE/IN_PROGRESS, edit, reassign,
  or reschedule a task from the UI. Operational follow-through (the product's "what's next") can't be acted on.
- [MINOR] Only first 4 events get filter tabs (withPlans.slice(0,4)); more events aren't filterable.
- [ok] Event filter works (verified FinTech tab → its 3 tasks); SETUP/TEARDOWN lanes; overdue banner logic (Date.now based);
  empty/loading/error states wired. Only FinTech has tasks in seed (Community Art/Annual Tech return empty).

## /approvals — Pending approvals
Calls: GET /private/requests?status=PROPOSED&pageSize=50. Inline Approve/Reject per row.
- [ok] Approve/Reject DO show toasts: success + ERROR ("We hit an unexpected error.") — VERIFIED by clicking Approve on
  Annual Tech Summit → 429 → danger toast appeared (contrast: RequestDetail approve is silent). onSuccess→refetch (card drops).
- [MAJOR/inconsistency] Same two actions implemented differently across pages: Approvals = error toast + inline reject with
  client validation (reason>=3 chars, button disabled); RequestDetail = silent approve + MODAL reject with NO client validation.
- [MINOR] Error toast is generic ("unexpected error") — doesn't explain the 429 expired-hold; user just retries fruitlessly.
- [INFO] "AI recommendation will appear here once the copilot is connected" — honest placeholder for unwired AI rec.
- [domain] Approving Community Art (no reservation) would SUCCEED → SCHEDULED w/ no space held (backend domain oddity; not FE).

## /audit — Audit log (append-only record)
Calls: GET /private/audit (no params; +requestId/+entityType filters). Renders full timeline.
- [MAJOR/perf] Fetches the ENTIRE unbounded ledger — /audit contract has NO pagination params (confirmed by mapping wf).
  At scale (thousands of entries) the page loads all of them, no load-more/virtualization. Dashboard's pageSize=8 is ignored too.
- [ok] Filter (Request ID + Entity type) works server-side: entityType=Reservation → /audit?entityType=Reservation → 3 rows.
  Timeline renders actor/action/entity-link/status-diff/timestamp well; status rows expand to before/after.
- [MINOR] Entity-type filter is free-text, CASE-SENSITIVE exact match (must type "Reservation" exactly) — should be a dropdown.
- [MINOR] Filters not debounced (each keystroke fires a request — same as Requests search).

## /settings/users — Staff (ADMIN only)
Calls: GET /admin/users (admin tier) + /auth/me. 5 accounts. Add staff dialog verified (Name/Email/Password "At least 8 chars"/Role; Save disabled until valid). Did NOT submit (account creation out of scope).
- [MAJOR/BLOCKER] Mutation errors SWALLOWED (no onError): create/edit (Users.tsx submitDialog) + toggleActive have no error handling. Duplicate-email/422/5xx → dialog stays open, no message (looks frozen); failed Active toggle silently reverts. 422 `fields` discarded.
- [MAJOR] PARTNER shown but NOT selectable in create/edit (ROLES=[ADMIN,MANAGER,OPS,VIEWER]). Editing the partner → Select value 'PARTNER' matches no option → shows ADMIN while form.role stays PARTNER → saving can DEMOTE the partner.
- [MAJOR] No pagination/search/sort on staff list (unbounded).
- [MINOR] Active Switch not disabled in-flight → rapid toggles race (useUpdateUser idempotency:false, no server dedupe).
- [MINOR] "5 staff accounts" includes Pjeter Partner (PARTNER) — an external partner counted as staff.
- [ok] Non-admin → "Lock" forbidden card (RBAC handled client+server 403). Role badges, kebab Edit/Deactivate, create password>=8 client validation.

## /requests/new — Intake (create request) + Chat copilot
Form submit → POST /private/requests (Idempotency-Key + CSRF). VERIFIED: empty submit blocked client-side (inline required errors, no POST); invalid submit (attendees=1.5, email=notanemail, valid dates) → POST → 422 (no record created).
- [ok] Required validation (title/organizer/attendees/start/end) inline + blocks POST; end-after-start validated client-side (good). Server 422 fields mapped to title/organizer/attendees/start(preferredDates)/end.
- [MAJOR] contactEmail/contactPhone server 422 INVISIBLE — those FormFields have NO `error` prop (Intake.tsx:199-217). VERIFIED: "notanemail" → 422 → no field highlight, no message. If only email is bad, submit dead-ends with "fix a field" but nothing highlighted.
- [MAJOR] create.mutate has NO onError → non-422 failures (500/429) are SILENT (button stops spinning, no toast). Same silent pattern as Approve.
- [MINOR] attendees min={1} bypassed by noValidate; 0/1.5/negative not caught client-side → extra server round-trip (error does surface after).
- [MINOR/tz] new Date(start).toISOString() shifts by browser tz (feeds the venue-local tz issue). 
- [ok] Chat tab Copilot: send IS wired (useCopilot → POST :8000/chat). VERIFIED: sent msg → 503 → degrades to "offline" + banner "The AI copilot is not connected in this build" + canned reply. GRACEFUL.
- [MAJOR] Copilot proposed-action "Confirm hold"/"Re-plan" buttons are no-ops (Intake passes onDismiss/onIgnore/onRetry but NOT onConfirm/onReplan). Code-confirmed (state needs live AI to reach).
- [note] Seeded chat claims "I've pre-filled the form" but does NOT prefill anything.
- [CONTRAST] Same CopilotPanel: fully wired here (send+degrade), but DEAD in global AppShell top-bar (no onSend → send always disabled). The global Copilot button is the broken one.

## /login — edge cases (tested as admin)
- [MAJOR] Already-authenticated user at /login is NOT redirected — VERIFIED: admin nav to /login shows the form again (route outside RequireAuth, no useMe check).
- [MAJOR] "Forgot password?" is DEAD — VERIFIED: clicked, no nav/modal (type=button, no onClick, no /forgot route).
- [ok] Invalid creds: POST /public/auth/login → 401 → "Wrong email or password." banner. (Code: generic error collapses ALL non-429 to this — a 500 would wrongly claim bad creds; non-APIError → silent. Couldn't force 500.)
- [MINOR] Sign in disabled until email+password non-empty; whitespace-only passes (code). Error banner not cleared on input edit (code).

## /portal — Partner Portal "My requests" (PARTNER, tested as partner@acme.al)
Login as partner → redirect to /portal ✓. Calls GET /private/requests?pageSize=50 (server row-scopes to partner's own → just Community Art).
- [ok] Shows partner's own requests with DRAFT→PROPOSED→APPROVED→SCHEDULED stepper, status badge, dates.
- [MAJOR] Request cards are NON-INTERACTIVE DEAD-ENDS — VERIFIED: clicked card → URL stays /portal (no detail route exists in PortalShell, only index + /portal/new).
- [MAJOR] No pagination (50 cap; total discarded by client → can't even know there are more).
- [MINOR] Card shows preferredDates STARTS only ("22 Jul 2026, 24 Jul 2026"); each range's end not shown.
- [ok] Header: My requests / New request / EN-AL / Sign out. PortalShell bounces staff→/.

## /portal/new — Partner new request (PARTNER)
Submit → POST /private/requests (Idempotency-Key). 
- [ok] Submit disabled until valid (title+organizer+attendees>=1+start+end). VERIFIED: empty submit blocked, NO error banner appears.
- [LATENT, not live] setErr(t('intake.required')) dead-code (PortalNewRequest.tsx:35-37) — unreachable b/c button disabled when invalid. The key resolves to an OBJECT → would render raw "intake.required" IF reached. (Workflow called this a BLOCKER; the disabled button mitigates it → downgrade to latent.)
- [MAJOR] NO end-after-start validation (valid doesn't check start<end) → inverted range submittable.
- [MAJOR] API errors → single generic banner (onError→error.generic); 422 `fields` discarded (no per-field error UI).
- [MINOR] contactEmail no client validation (native type=email bypassed by JS submit); attendees accepts 1.5 (Number>=1); datetime tz-lossy.

## RBAC verification (logged in as VIEWER = Vera V., read-only role)
- [ok] Sidebar correctly OMITS "Settings / Staff" group for non-admin. Otherwise IDENTICAL surface to admin.
- [ok] /settings/users (direct URL) → "403 — Admins only" forbidden Lock card. BUT still fires GET /admin/users → 403 ×2 (useUsers unconditional; should skip for non-admin). minor.
- [MAJOR/RBAC] /approvals — Approve + Reject buttons FULLY SHOWN & clickable for VIEWER (no client gate). Would 403 on click. VERIFIED in browser.
- [MAJOR/RBAC] /scan — VIEWER can select an asset and the ENTIRE movement form (Check out/in/Relocate, qty, location, note, Record movement) is available. Would 403 on submit. VERIFIED. Read-only user shown a fully functional write form.
- [INFO] "+ New request" shown to VIEWER on dashboard/requests (POST /requests likely 403s for viewer → silent per Intake no-onError).
- [INFO] RequestDetail approve/reject: canApprove gates to MANAGER/ADMIN (viewer sees disabled w/ tooltip) — GOOD gating. SpaceDetail/AssetDetail edit gated to OPS+ (viewer hidden) — GOOD. So gating is INCONSISTENT: present on detail pages, ABSENT on Approvals + Scanner.
- Pattern: only ADMIN/Staff is client-gated + RequestDetail/detail-edit; Approvals + Scanner + create rely purely on server 403, often with no/poor error surfacing.

## /conflicts — Conflicts board
Page call: GET /private/conflicts?start=<now-60d>&end=<now+60d> → 200 ✓ (Conflicts.tsx defaultWindow). 
The 2 extra /conflicts 422s on this page are the AppShell's useConflicts({}) (shell-wide bug, not this page).
- [ok] Empty state correct: "No conflicts right now / Every reservation fits. The schedule is clean…" + "View calendar"→/calendar.
  Loading skeleton + ErrorState(retry) wired. Subtitle pluralizes via conflicts.subtitle/allClear.
- [NOTE] Populated ConflictBanner UI NOT verifiable — seed has no overlapping reservations (planted conflict latent:
  E3 Community Art never got a hold). Couldn't exercise resolve/alternatives actions from real data.
- [cross-ref] Proves the dashboard/shell bug: same endpoint needs start+end; only dashboard/AppShell omit them → 422.

## GLOBAL SHELL (AppShell) — shared chrome on every staff page
- [MAJOR/UX] Global Copilot is permanently NON-FUNCTIONAL. AppShell:208 renders <CopilotPanel state="idle" onClose>
  with NO inputValue/onInputChange/onSend. Send btn disabled={!inputValue?.trim()} → inputValue always undefined →
  send ALWAYS disabled; no onSend wired; never calls live AI (:8000 has /chat,/plan,/health but unused).
  Verified in browser: typed a question, clicked send → no bubble, no network, still "idle". Prominent top-bar
  "Copilot" button opens a chat you can type in but can NEVER submit. (CopilotPanel is "pure presentational" by design,
  but shipping a dead input is a production-readiness problem.)
- [MAJOR/UX] Top-bar "Search or start a request… ⌘K" is FAKE. AppShell:142 it's a <button> onClick=navigate('/requests').
  No search field, no command palette. ⌘K is a decorative <Kbd> hint with no keybinding handler. Misleading affordance.
- [MAJOR] useConflicts({}) called AGAIN in AppShell:52 (2nd consumer → the duplicate 422). Sidebar "Conflicts" nav
  badge (badges.conflicts = conflicts?.length) is ALWAYS undefined → conflict count never shows in nav.
- [MINOR/MAJOR] freshness pill copy/state. live = meQuery.isError ? 'degraded':'connected' (AppShell:87) —
  reflects whether /me succeeded. Relabel to "Up to date"/"Stale" and drive it off the polling freshness
  state (time since the last successful REST poll). The async event subsystem was removed in ADR-0018, so
  there is no bus to reflect.
- [ok] Nav badges: inventory=lowStockAssets (0→hidden), approvals=pendingApprovals (shows "2" ✓), conflicts=broken.
- [ok] RBAC: /settings/users ("Staff") nav only for ADMIN; user-menu "Users" item disabled if !admin; PARTNER→/portal redirect.
- [ok] Sidebar collapse toggle, mobile drawer present.
- [ok] EN/AL locale toggle works + persists across reload (localStorage/zustand). Most static UI translated.
- [MAJOR i18n] In AL mode, API-provided `hint` strings stay ENGLISH: KPI subs "new requests this week vs last",
  "asset lines ≥90% committed", "requests awaiting a manager" (these come from dashboard/stats .hint — server English only).
- [MINOR i18n] sq-AL date falls back to en-US: shows "Sunday, June 21, 2026" in AL (vs en-GB "Sunday, 21 June 2026" in EN).
  formatToday uses Intl 'sq-AL' which isn't supported in this runtime → US fallback (wrong weekday/month language + order).
- [MINOR i18n] AvailabilityTimeline legend (confirmed/held/scheduled/conflict/setup-teardown buffer) hardcoded English (mock).
- TODO shell: ⌘K keybinding?, user menu dropdown, logout (do last).

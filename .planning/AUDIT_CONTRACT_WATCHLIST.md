# Contract-mismatch watchlist + per-route red flags (from mapping workflow, code-level)
Source: frontend-audit-map workflow (22 agents) cross-referencing hooks vs openapi.yaml. To fold into final report.

## A. Pagination metadata discarded (SYSTEMIC, major)
api client request() returns ONLY envelope.data, dropping total/page/pageSize/totalPages. So NO page can paginate.
- useRequests: hardcodes pageSize:100, never sends page. Ripples to Requests/Approvals(50)/Tasks(100)/Portal(50).
- useAudit: contract has ONLY requestId+entityType — no pagination params exist server-side → entire ledger unbounded.
- useAssetMovements: contract supports page/pageSize (default 50, max 100) but hook sends neither → silently truncates to newest 50.

## B. RBAC tier/role mismatches NOT gated client-side (major) — VERIFY with non-admin roles
- useScanAsset POST /assets/:id/scan is OPS+; /scan has NO client gate → VIEWER/PARTNER can fill+submit, only learn via 403 toast. HIGHEST-VALUE.
- useApprove/useReject MANAGER+; RequestDetail gates buttons by me.role, Approvals page does NOT → OPS/VIEWER may click then 403.
- useUpdateSpace PATCH /spaces/:id is OPS-specific; SpaceDetail grants Edit to OPS/MANAGER/ADMIN → MANAGER/ADMIN may 403 (confirm ladder).
- useUpdateAsset PATCH /assets/:id OPS+; AssetDetail grants Edit to OPS/MANAGER/ADMIN.

## C. Idempotency-Key (minor): useUpdateUser idempotency:false (rapid Switch toggles race, no dedupe). login/logout off-convention but contract-consistent. All other mutations idempotency:true ✓.

## D. AI service off-contract (by design): usePlan/aiChat → VITE_AI_URL/plan,/chat — separate service, no envelope/CSRF/creds, throws AIUnavailable → silent degrade.

## E. Conflicts call shape (blocker): useConflicts contract REQUIRES start+end, optional spaceId. Page sends only start/end (no spaceId) →
engine only emits SPACE conflicts when spaceId set → global call may always return []. Dashboard useConflicts({}) sends NOTHING → 422 (CONFIRMED in browser).
useSpaceAvailability GET /spaces/:id/availability is correct but NEVER called (SpaceDetail hardcodes reservations:[]).

## F. Query-param gaps (minor)
- useRequests q capped server-side maxLength 80; UI never enforces (>80 silently rejected).
- useSpaces: `available` only returned when BOTH start+end present; Dashboard/RequestDetail/SpaceDetail/Spaces-default get available:undefined → UIs misread as "Available". List path has no start<end validator.
- useAssets: Inventory/AssetDetail/Scanner send no window → availableQuantity falls back to total; UI reads windowless as windowed.

## G. Body wrapping (mostly aligned): useReject enforces min3 not max500; useUpdateTask invalidates off closure requestId (can diverge).

## H. Response fields UI reads that contract may not populate: ConflictBanner reads c.total (not in contract Conflict) → "0/0 of 0" risk on 409.

---
## Per-route RED FLAGS (code-level, to confirm/refute in browser)

### /audit
- major: no pagination, unbounded ledger fetched+rendered on mount. (CONFIRMED browser: /audit no params)
- major: filter fires full-ledger fetch PER KEYSTROKE (no debounce).
- major: entityType exact case-sensitive free-text, no dropdown → typo = empty indistinguishable. (CONFIRMED works w/ exact "Reservation")
- major: filter not cleared on collapse; no clear control. entityId shown with no link.
- major: formatDateTime renders "Invalid Date" on malformed at.
- minor: diffLine shows only first changed scalar; actorName null → "System" avatar; keystroke→full skeleton flicker.

### /settings/users (ADMIN)
- BLOCKER: create/edit/toggle errors COMPLETELY swallowed (no onError). Duplicate-email 409/422 → dialog stays open, no feedback (looks frozen). Failed toggle silently reverts. (CONFIRMED in code)
- major: no pagination/search/sort; unbounded staff list.
- major: PARTNER role displayed but un-selectable (ROLES omits PARTNER). Editing a PARTNER: Select value 'PARTNER' matches no option → shows ADMIN while form.role stays PARTNER until touched → saving can DEMOTE a partner. (test Edit on partner)
- minor: list query fires for non-admins during me-loading (403 round-trip). Switch never disabled in-flight → racing PATCHes (idempotency:false). Edit can't change password.

### /requests/new (Intake)
- major: contactEmail/contactPhone server 422 invisible (no error wiring on those fields). Submit contactEmail='notanemail'.
- major: expectedAttendees client check only "non-empty"; 0,-3,1.5,1e3 pass → server 422. Number()→NaN→null.
- major: datetime-local→toISOString browser-tz-shifted; partial/invalid date throws uncaught RangeError in submit().
- major: Copilot "Confirm hold"/"Re-plan" are NO-OPS (no POST /reservations).
- minor: missing i18n keys intake.invalid.contactEmail/contactPhone; create.mutate 5xx shows no toast; Copilot mock labels English only.

### /requests/:id (RequestDetail) — (already audited; corroborates)
- major: "Use this"/"Recommended" alternative buttons DEAD (no onClick). (CONFIRMED code)
- major: PlanSpaceCard "Select" + card DEAD. (CONFIRMED code)
- major: "Adjust request" → /requests/new (blank, loses context).
- major: Reject reason ZERO validation, fires when empty, never reset between opens.
- major: spaces/assets fetched no-window → availability absent; "held"/"free" from local feasible bool not server.
- major: Alternatives feasibility FABRICATED client-side (2 ACTIVE spaces cap≥attendees, first "Recommended"), no availability check for conflicting window.
- minor: UUID fallback while loading; eventType/layout labels English titleCase not i18n; capacity fallback = max across all layouts under requested-layout label.

### /portal (PortalRequests, PARTNER)
- Expected: GET /private/requests?pageSize=50 (server row-scopes by createdById for PARTNER = "my requests"). No page/q.
- major: no pagination (50 cap, total discarded). 
- major: cards NON-INTERACTIVE dead-ends — no detail route in PortalShell (only index + /portal/new).
- major: fmtDate(d.start) no guard → "Invalid Date" risk; d.end never shown (multi-day looks single).
- minor: unknown status → blank stepper; rejectionReason no length clamp.
- polish: error title+message both error.generic (identical twice); EmptyState no CTA.

### /portal/new (PortalNewRequest, PARTNER)
- BLOCKER: validation error renders LITERAL string "intake.required" (key resolves to an OBJECT → t() returns raw path). Submit empty → red banner shows "intake.required".
- major: no end-after-start validation (range end<start POSTed).
- major: requirements `layout || avNeeded ? {...}` operator-precedence smell.
- major: datetime-local→toISOString tz-lossy; non-parseable throws uncaught RangeError (mutation never fires, no error).
- major: ALL API errors → one generic banner (error.generic); 422 fields discarded.
- minor: contactEmail no client validation; no success toast.

### /login
- major: "Forgot password?" DEAD no-op (button, no onClick, no /forgot route). (CONFIRMED earlier: type=button)
- major: already-authed user at /login NOT redirected (route outside RequireAuth, no useMe).
- major: generic error collapses ALL non-429 failures to "Wrong email or password" (a 500 wrongly claims bad creds; non-APIError throw → silent).
- minor: noValidate; whitespace-only ' ' passes disabled-gate; error banner not cleared on input edit. Role routing magic-string ==='PARTNER'.

### Nav/RBAC/Auth (shell)
- Single staff shell; all groups visible to every staff role EXCEPT Staff/Users (ADMIN-only nav + page forbidden card + server 403).
- No per-route role guards beyond RequireAuth → MANAGER/OPS/VIEWER see identical surface; under-privileged controls 403 on click.
- PARTNER → /portal redirect; staff → / from /portal. roles.PARTNER MISSING from both al.json+en.json → raw key (latent).
- No LocaleToggle in mobile AppShell top bar.
- Auth state in TanStack Query ['me'] (retry:false, stale 60s), NOT zustand. Logout qc.clear() wipes cache.

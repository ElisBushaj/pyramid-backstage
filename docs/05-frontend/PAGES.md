# Pages — catalog for Claude Design + the build

Every page, the states to design, and the **exact contract endpoints/DTOs it consumes**. Because each page is pinned to the contract (`ops-core/openapi.yaml`), the frontend and backend cannot drift. Design each at **desktop (1280–1440)** and **mobile (390)**, in **EN + AL**.

States legend: `default · loading · empty · error · submitting · conflict · success`. (Not every page has every state; the relevant set is listed.)

## Auth
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 1.1 | `/login` | Staff sign-in (AuthShell, zero-distraction) | default, submitting, invalid-credentials, rate-limited | `POST /public/auth/login` |

## Shell
| § | — | Purpose | States | Consumes |
|---|---|---------|--------|----------|
| 2.1 | AppShell | Sidebar + top bar + copilot toggle + user/role menu | default, sidebar-collapsed, mobile-drawer | `GET /private/auth/me` |

## Overview
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 3.1 | `/` Dashboard | KPIs (events this week, spaces in use, low-stock, pending approvals) + live schedule strip + conflict alerts + recent activity + a building-wide **FloorMap** tile ("what's live in the building", [`FLOOR_MAP.md`](./FLOOR_MAP.md)) + the **"Where is it?"** asset-location widget (refreshed by polling) | default, loading(skeleton KPIs+table), empty(no events), error | `GET /private/requests?status=`, `GET /private/spaces?start&end`, `GET /private/assets?start&end`, `GET /private/conflicts`, `GET /private/assets/:id/movements` |

## Pipeline
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 4.1 | `/requests` | Requests `DataTable` (status, organizer, attendees, dates, value) + filters | default, loading, empty, error | `GET /private/requests` |
| 4.2 | `/requests/new` | **Intake** — choose: chat with copilot OR structured form (organizer, attendees, type, preferred dates, requirements) | default, submitting, validation-error, success→detail | `POST /chat` (AI) · `POST /private/requests` |
| 4.3 | `/requests/:id` | **OperationalPlanView** — the headline. Narrative + **FloorMap** + SpaceCard + ReservationCard + QuoteTable + TaskBoard + ConflictBanner + AuditTimeline + status actions. The `FloorMap` lights this request's `/plan` result (chosen/bundle/conflict/circulation); see [`FLOOR_MAP.md`](./FLOOR_MAP.md) | default(feasible), default(not-feasible→alternatives), loading, conflict, submitting(approve/reject), success | `GET /private/requests/:id` (aggregate) · `POST /plan` (AI) |
| 4.4 | `/calendar` | `ScheduleCalendar` / `AvailabilityTimeline` across spaces (day/week), buffer zones visible, reservations by status | default, loading, empty, hover-popover | `GET /private/spaces`, `GET /private/spaces/:id/availability`, reservations via aggregate |

## Resources
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 5.1 | `/spaces` | Space list (`SpaceCard` grid or table) + availability for a chosen window | default, loading, empty, error | `GET /private/spaces?minCapacity&layout&start&end` |
| 5.2 | `/spaces/:id` | Space detail: capacities per layout, features, rate, buffers, its calendar | default, loading, edit(OPS+), error | `GET /private/spaces/:id/availability`, `PATCH /private/spaces/:id` |
| 5.3 | `/inventory` | Asset list with `InventoryMeter` per line (available/total for the window), location, status | default, loading, empty, low-stock, error | `GET /private/assets?type&quantity&start&end` |
| 5.4 | `/inventory/:id` | Asset detail + where-reserved | default, edit(OPS+) | `PATCH /private/assets/:id` |

## Operations
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 6.1 | `/tasks` | `TaskBoard` across events (SETUP / TEARDOWN lanes) or per request; assign + status | default, loading, empty, overdue, submitting | `GET/POST /private/requests/:id/tasks` |
| 6.2 | `/conflicts` | Active conflicts list → each opens `ConflictBanner` with alternatives | default, empty(no conflicts — calm), loading | `GET /private/conflicts` |
| 6.3 | Approvals (in `/requests/:id`) | Approve / reject with reason; role-gated (MANAGER+); VIEWER sees disabled + tooltip | default, submitting, success, forbidden(403) | `POST /private/requests/:id/approve` · `/reject` |
| 6.4 | `/approvals` | **Pending Approvals queue** — `DataTable` of partner-submitted requests awaiting decision (organizer, attendees, dates, value, submitted-at); row → `/requests/:id` to approve/reject. The single-step queue that replaces email; role-gated (MANAGER+) | default, loading, empty(nothing pending — calm), submitting, forbidden(403) | `GET /private/requests?status=PROPOSED` · `POST /private/requests/:id/approve` · `/reject` |

## Record
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 7.1 | `/audit` | `AuditTimeline` (filter by request/entity); actor, action, before/after, reason | default, loading, empty, error | `GET /private/audit?requestId&entityType` |

## Copilot (overlay, every page)
| § | — | Purpose | States | Consumes |
|---|---|---------|--------|----------|
| 8.1 | `CopilotPanel` | "Can we make this happen?" → plan; `ProposedActionCard` (requiresApproval); **unprompted conflict heads-up** | idle, user-typing, assistant-thinking, plan-preview, proposed-action(confirm), conflict-heads-up, error | `POST /chat`, `GET /private/conflicts` (polled) |

## Admin (ADMIN role)
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 9.1 | `/settings/users` | Staff `DataTable`: create/edit user, role (ADMIN/MANAGER/OPS/VIEWER), active toggle | default, loading, submitting, forbidden | `GET/POST /admin/users`, `PATCH /admin/users/:id` |

## Partner Portal (PARTNER role)
Row-scoped to the signed-in partner (`EventRequest.createdById`); a separate, stripped shell — no internal navigation, no staff data. See [`PARTNER_PORTAL.md`](../02-domain/PARTNER_PORTAL.md) and the routing guards in [`ROUTING.md`](./ROUTING.md).
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 10.1 | `/portal` | **Partner intake** — submit a request: organizer, attendees, type, preferred dates, requirements. Mirrors §4.2's structured form (partner-scoped); creates a `PROPOSED` request that lands in the staff queue (§6.4) | default, submitting, validation-error, success→my-requests | `POST /private/requests` (partner-scoped, `createdById = self`) |
| 10.2 | `/portal/my-requests` | **My requests** — a timeline/list of only this partner's requests with status (DRAFT/PROPOSED/SCHEDULED/REJECTED), submitted-at, and the decision outcome when made; read-only | default, loading, empty(no requests — first-submit CTA), error | `GET /private/requests` (server-filtered to `createdById = self`, F15) |

## Asset tracking (scanner + location)
QR/NFC aggregate-with-movement; see [`ASSET_TRACKING.md`](../02-domain/ASSET_TRACKING.md).
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 11.1 | `/scan` | **Mobile Scanner** — camera scans a QR (encodes `assetId`) → confirm new location → record movement + update live `Asset.location`. Big-touch, single-purpose, designed at 390px (OPS+) | default(camera), scanning, asset-found(confirm location), submitting, success, error(no-camera / unknown code), forbidden(403) | `POST /private/assets/:id/scan` |
| 11.2 | Where-is-it (Dashboard widget §3.1) + `/inventory/:id` | **"Where is it?"** — current `Asset.location` + a recent-movements ledger (from/to, actor, time); the dashboard widget surfaces high-value / recently-moved assets, refreshed by polling | default, loading, empty(no movements), error | `GET /private/assets/:id`, `GET /private/assets/:id/movements` |

## Demo path (maps 1:1 to "what success looks like")
The pages above support the full demo, in order: **4.2 intake (chat)** → **4.3 plan (feasible)** → submit a colliding request → **8.1 conflict heads-up / 6.2 conflict + alternatives** → **4.3 approve (MANAGER)** → **3.1 dashboard updates (on next poll)** → **7.1 audit shows the decision**. See [`docs/07-operations/DEMO_SCRIPT.md`](../07-operations/DEMO_SCRIPT.md).

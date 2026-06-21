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
| 2.1 | AppShell | Sidebar + top bar + freshness pill + copilot toggle + user/role menu | default, sidebar-collapsed, mobile-drawer, fresh / stale | `GET /private/auth/me` |

## Overview
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 3.1 | `/` Dashboard | KPIs (events this week, spaces in use, low-stock, pending approvals) + schedule strip + conflict alerts + recent activity. Freshness via polling the REST contract. | default, loading(skeleton KPIs+table), empty(no events), error | `GET /private/requests?status=`, `GET /private/spaces?start&end`, `GET /private/assets?start&end`, `GET /private/conflicts` |

## Pipeline
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 4.1 | `/requests` | Requests `DataTable` (status, organizer, attendees, dates, value) + filters | default, loading, empty, error | `GET /private/requests` |
| 4.2 | `/requests/new` | **Intake** — choose: chat with copilot OR structured form (organizer, attendees, type, preferred dates, requirements) | default, submitting, validation-error, success→detail | `POST /chat` (AI) · `POST /private/requests` |
| 4.3 | `/requests/:id` | **OperationalPlanView** — the headline. Narrative + SpaceCard + ReservationCard + QuoteTable + TaskBoard + ConflictBanner + AuditTimeline + status actions | default(feasible), default(not-feasible→alternatives), loading, conflict, submitting(approve/reject), success | `GET /private/requests/:id` (aggregate) · `POST /plan` (AI) |
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

## Record
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 7.1 | `/audit` | `AuditTimeline` (filter by request/entity); actor, action, before/after, reason | default, loading, empty, error | `GET /private/audit?requestId&entityType` |

## Copilot (overlay, every page)
| § | — | Purpose | States | Consumes |
|---|---|---------|--------|----------|
| 8.1 | `CopilotPanel` | "Can we make this happen?" → plan; `ProposedActionCard` (requiresApproval); **conflict heads-up** | idle, user-typing, assistant-thinking, plan-preview, proposed-action(confirm), conflict-heads-up, error | `POST /chat`, `GET /private/conflicts` (polled) |

## Admin (ADMIN role)
| § | Route | Purpose | States | Consumes |
|---|-------|---------|--------|----------|
| 9.1 | `/settings/users` | Staff `DataTable`: create/edit user, role (ADMIN/MANAGER/OPS/VIEWER), active toggle | default, loading, submitting, forbidden | `GET/POST /admin/users`, `PATCH /admin/users/:id` |

## Demo path (maps 1:1 to "what success looks like")
The pages above support the full demo, in order: **4.2 intake (chat)** → **4.3 plan (feasible)** → submit a colliding request → **8.1 conflict heads-up / 6.2 conflict + alternatives** → **4.3 approve (MANAGER)** → **3.1 dashboard refreshes (polling)** → **7.1 audit shows the decision**. See [`docs/07-operations/DEMO_SCRIPT.md`](../07-operations/DEMO_SCRIPT.md).

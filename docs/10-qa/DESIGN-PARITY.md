# Design Parity

Visual verification — does each built page match the **Claude Design export**, in every state? Keyed to the page sections in [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md) and the tokens/components in [`docs/05-frontend/DESIGN_SYSTEM.md`](../05-frontend/DESIGN_SYSTEM.md). Status values + the progress-tally rule are in [`README.md`](./README.md).

**▶ Resume here:** QA-DSGN-1.1 *(blocked until the Claude Design export lands — see below)*

## Status note

This list **cannot run until the Claude Design export is in `CLAUDE_DESIGN/`** and the frontend pages are built against it (Phase 2, [`docs/00-strategy/ROADMAP.md`](../00-strategy/ROADMAP.md)). Until then every row is `blocked`. The table is pre-populated from `PAGES.md` so the sweep is ready the moment there's something to compare.

## The method (side-by-side)

1. **Serve the design export over HTTP.** Open the relevant `CLAUDE_DESIGN/` artboard for the page (both the `.jsx`/rendered view and any `.html` export) at the target viewport.
2. **Open the implementation** at the actual route (the running frontend) in another tab at the **same viewport**.
3. **Place them side-by-side** and compare each page **section §X.Y**, at:
   - **Desktop (1280–1440)** *and* **mobile (390)**.
   - **EN *and* AL** (the AL strings must not overflow or clip).
   - **every state** the page declares in `PAGES.md` (`default · loading · empty · error · submitting · conflict · success`, and the operational states).
4. **Verify the seven properties** for each section: **spacing** (±2px), **color** (exact via tokens — never an eyeballed hex), **border-radius** (token scale), **typography** (family + weight + size + line-height + tracking), **elevation** (token scale — a 1px border + soft shadow, never a glow), **motion** (120–280ms ease-out, no bounce), **states** (every declared state renders and matches).
5. For any mismatch: **fix it**, or log a deliberate divergence with a rationale, **before** marking the row `pass`.

A row is `pass` only when desktop + mobile × EN + AL × all its states all match. `na` is legitimate for a state that can't occur in the environment (e.g. a NATS-degraded variant when realtime is off).

## Per-page parity table

Keyed to [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md). Each row covers the page across **desktop + mobile** and **EN + AL**; the **States** column is the set that must each be verified.

### Auth & Shell

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-1.1 | 1.1 | `/login` (AuthShell) | default · submitting · invalid-credentials · rate-limited | blocked |
| QA-DSGN-2.1 | 2.1 | AppShell (sidebar + top bar + live pill + copilot toggle + role menu) | default · sidebar-collapsed · mobile-drawer · NATS-connected · NATS-degraded | blocked |

### Overview

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-3.1 | 3.1 | `/` Dashboard (KPIs + live schedule strip + conflict alerts + recent activity) | default · loading(skeleton) · empty · error | blocked |

### Pipeline

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-4.1 | 4.1 | `/requests` (DataTable + filters) | default · loading · empty · error | blocked |
| QA-DSGN-4.2 | 4.2 | `/requests/new` (intake — chat OR structured form) | default · submitting · validation-error · success | blocked |
| QA-DSGN-4.3 | 4.3 | `/requests/:id` (OperationalPlanView) | feasible · not-feasible(alternatives) · loading · conflict · submitting(approve/reject) · success | blocked |
| QA-DSGN-4.4 | 4.4 | `/calendar` (ScheduleCalendar / AvailabilityTimeline, buffer zones visible) | default · loading · empty · hover-popover | blocked |

### Resources

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-5.1 | 5.1 | `/spaces` (SpaceCard grid/table + window availability) | default · loading · empty · error | blocked |
| QA-DSGN-5.2 | 5.2 | `/spaces/:id` (detail: capacities/features/rate/buffers/calendar) | default · loading · edit(OPS+) · error | blocked |
| QA-DSGN-5.3 | 5.3 | `/inventory` (asset list + InventoryMeter per line) | default · loading · empty · low-stock · error | blocked |
| QA-DSGN-5.4 | 5.4 | `/inventory/:id` (detail + where-reserved) | default · edit(OPS+) | blocked |

### Operations

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-6.1 | 6.1 | `/tasks` (TaskBoard — SETUP/TEARDOWN lanes; assign + status) | default · loading · empty · overdue · submitting | blocked |
| QA-DSGN-6.2 | 6.2 | `/conflicts` (active conflicts → ConflictBanner + alternatives) | default · empty(calm) · loading | blocked |
| QA-DSGN-6.3 | 6.3 | Approvals (in `/requests/:id`; MANAGER+; VIEWER disabled+tooltip) | default · submitting · success · forbidden(403) | blocked |

### Record & Copilot

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-7.1 | 7.1 | `/audit` (AuditTimeline — actor/action/before-after/reason) | default · loading · empty · error | blocked |
| QA-DSGN-8.1 | 8.1 | CopilotPanel (overlay, every page) | idle · user-typing · assistant-thinking · plan-preview · proposed-action(confirm) · conflict-heads-up · error | blocked |

### Admin

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-9.1 | 9.1 | `/settings/users` (staff DataTable; role + active toggle; ADMIN) | default · loading · submitting · forbidden | blocked |

> When the export lands: flip the rows to `not_started`, fill the **total** + counts in [`README.md`](./README.md)'s tally (one row per `(page × viewport × locale × state)` if counting granularly, or per page-ID if counting coarsely — pick one and note it), and move the ▶ Resume pointer to `QA-DSGN-1.1`.

## Cross-references

- **The page catalog (source of these rows):** [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md).
- **Tokens, components, the seven properties' source values:** [`docs/05-frontend/DESIGN_SYSTEM.md`](../05-frontend/DESIGN_SYSTEM.md).
- **The visual-language decision:** [ADR-0007](../08-decisions/0007-tailwind-radix.md). **When this phase starts:** [`docs/00-strategy/ROADMAP.md`](../00-strategy/ROADMAP.md) Phase 2.

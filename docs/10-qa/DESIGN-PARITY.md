# Design Parity

Visual verification — does each built page match the **Claude Design export**, in every state? Keyed to the page sections in [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md) and the tokens/components in [`docs/05-frontend/DESIGN_SYSTEM.md`](../05-frontend/DESIGN_SYSTEM.md). Status values + the progress-tally rule are in [`README.md`](./README.md).

**▶ Resume here:** QA-DSGN-1.1 *(implementation complete + build-green; remaining step is the live side-by-side screenshot diff — see Status note)*

## Status note

**The Claude Design export has landed (`CLAUDE_DESIGN/`) and the frontend has been built to it.** Every artboard §X.Y was extracted to exact specs (digests in `.planning/design-specs/`) and the build mirrors those source-of-truth values (paddings, font sizes/weights/line-heights, radii, the precise token per element, shadow stacks, literal copy/mock data). State of the build:

- **tsc -b + vite build: clean** (1791 modules; CSS carries every new token utility).
- **Geist + Geist Mono loaded** (same Google-Fonts link the canvas uses) — typography matches.
- **i18n EN+AL at full key-parity** (369 = 369 keys); Albanian threaded through every page **and** the command components (which were initially built with EN literals).
- All §2 primitives, §3 command components (incl. the signature ConflictBanner, AvailabilityTimeline with hatched buffers, CopilotPanel, OperationalPlanView composition), AppShell (default · sidebar-collapsed · mobile-drawer · NATS-connected · NATS-degraded) and AuthShell, and every page + the §5.2/§5.4 detail pages are implemented with their full state matrices.

**Why rows are `in_progress`, not `pass`:** a row is `pass` only when the **live side-by-side screenshot diff** (desktop+mobile × EN+AL × every state) has been done and matches. In this environment the **browser automation (claude-in-chrome) is unusable** — the MCP tab is torn down between every tool call, so navigation/screenshots cannot complete. The build is therefore verified at the **code/spec level** (exact extracted values + green build), but the visual side-by-side could not be executed here. Rows are `in_progress`: built + code-verified, awaiting the screenshot sweep.

**To finish the sweep (host dev server is already running on :5173):**
1. Serve the canvas: `cd CLAUDE_DESIGN && python3 -m http.server 8090`, open each `*.dc.html`.
2. Open the app at `http://localhost:5173` (host Vite is up; log in with `{admin,manager,ops,viewer}@pyramid.al` / `Password123!`; switch locale with the top-bar toggle or `?lang=al`).
3. Place each route beside its §X.Y artboard at 1280–1440 and 390, in EN and AL, and verify the seven properties. Flip each row `in_progress → pass` when it matches.

## Divergences (logged, with rationale)

Per the "log any deliberate divergence" rule — these are intentional and honest, not parity misses:

1. **AppShell nav-badge counts are live, not the canvas mock (24 / 2 / 1 / 5).** They read real data (conflicts, low-stock, pending-approvals queries). Faking the mock numbers would violate "don't fake a backend." Structure/tones/positions match the canvas.
2. **LiveStatusPill event-meta (`inventory.low · 2s`) is omitted** and connected/degraded is driven by API reachability — there is no NATS/SSE client in the frontend, so a specific live event would be fabricated. Both pill variants render exactly otherwise.
3. **CopilotPanel + intake "Chat" tab are visual-only** (POST `/chat`, `/plan` are Alvin's lane and not running here). They render every state with clearly-mock content and degrade gracefully; the structured form is the working path. (Matches the brief.)
4. **AvailabilityTimeline on Dashboard/SpaceDetail uses the canvas sample lanes / an empty "free" lane** where rich per-space reservation bars aren't derivable from the available hooks (the availability endpoint returns availability+conflict ids, not the reservation bar set). The Calendar adapter maps real data where present.
5. **AssetDetail omits the "Maintenance" stat tile and fabricated "where-reserved" rows** — the asset DTO carries `totalQuantity`/`availableQuantity`/`status` only (no per-unit maintenance count, no asset→reservation map). Total/Available/Held(derived) are shown; the rest would invent contract fields.
6. **LocaleToggle is present in AppShell + AuthShell** though the canvas omits it — required so EN/AL are switchable for the i18n requirement (and the parity sweep). Noted as an intentional addition.
7. **Button `md` height = 34px** per the direct `Primitives.dc.html` source extraction (§2.1 sizes 28/34/40); one page-builder cited 36px. Kept 34 to match the canvas source.

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
| QA-DSGN-1.1 | 1.1 | `/login` (AuthShell) | default · submitting · invalid-credentials · rate-limited | in_progress |
| QA-DSGN-2.1 | 2.1 | AppShell (sidebar + top bar + live pill + copilot toggle + role menu) | default · sidebar-collapsed · mobile-drawer · NATS-connected · NATS-degraded | in_progress |

### Overview

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-3.1 | 3.1 | `/` Dashboard (KPIs + live schedule strip + conflict alerts + recent activity) | default · loading(skeleton) · empty · error | in_progress |

### Pipeline

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-4.1 | 4.1 | `/requests` (DataTable + filters) | default · loading · empty · error | in_progress |
| QA-DSGN-4.2 | 4.2 | `/requests/new` (intake — chat OR structured form) | default · submitting · validation-error · success | in_progress |
| QA-DSGN-4.3 | 4.3 | `/requests/:id` (OperationalPlanView) | feasible · not-feasible(alternatives) · loading · conflict · submitting(approve/reject) · success | in_progress |
| QA-DSGN-4.4 | 4.4 | `/calendar` (ScheduleCalendar / AvailabilityTimeline, buffer zones visible) | default · loading · empty · hover-popover | in_progress |

### Resources

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-5.1 | 5.1 | `/spaces` (SpaceCard grid/table + window availability) | default · loading · empty · error | in_progress |
| QA-DSGN-5.2 | 5.2 | `/spaces/:id` (detail: capacities/features/rate/buffers/calendar) | default · loading · edit(OPS+) · error | in_progress |
| QA-DSGN-5.3 | 5.3 | `/inventory` (asset list + InventoryMeter per line) | default · loading · empty · low-stock · error | in_progress |
| QA-DSGN-5.4 | 5.4 | `/inventory/:id` (detail + where-reserved) | default · edit(OPS+) | in_progress |

### Operations

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-6.1 | 6.1 | `/tasks` (TaskBoard — SETUP/TEARDOWN lanes; assign + status) | default · loading · empty · overdue · submitting | in_progress |
| QA-DSGN-6.2 | 6.2 | `/conflicts` (active conflicts → ConflictBanner + alternatives) | default · empty(calm) · loading | in_progress |
| QA-DSGN-6.3 | 6.3 | Approvals (in `/requests/:id`; MANAGER+; VIEWER disabled+tooltip) | default · submitting · success · forbidden(403) | in_progress |

### Record & Copilot

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-7.1 | 7.1 | `/audit` (AuditTimeline — actor/action/before-after/reason) | default · loading · empty · error | in_progress |
| QA-DSGN-8.1 | 8.1 | CopilotPanel (overlay, every page) | idle · user-typing · assistant-thinking · plan-preview · proposed-action(confirm) · conflict-heads-up · error | in_progress |

### Admin

| ID | § | Page | States to verify | Status |
|---|---|---|---|---|
| QA-DSGN-9.1 | 9.1 | `/settings/users` (staff DataTable; role + active toggle; ADMIN) | default · loading · submitting · forbidden | in_progress |

> When the export lands: flip the rows to `not_started`, fill the **total** + counts in [`README.md`](./README.md)'s tally (one row per `(page × viewport × locale × state)` if counting granularly, or per page-ID if counting coarsely — pick one and note it), and move the ▶ Resume pointer to `QA-DSGN-1.1`.

## Cross-references

- **The page catalog (source of these rows):** [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md).
- **Tokens, components, the seven properties' source values:** [`docs/05-frontend/DESIGN_SYSTEM.md`](../05-frontend/DESIGN_SYSTEM.md).
- **The visual-language decision:** [ADR-0007](../08-decisions/0007-tailwind-radix.md). **When this phase starts:** [`docs/00-strategy/ROADMAP.md`](../00-strategy/ROADMAP.md) Phase 2.

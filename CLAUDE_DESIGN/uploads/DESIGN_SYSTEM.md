# Design System — Pyramid Backstage Command Center

> This is the **brief you hand to Claude Design**. It defines the visual language, tokens, primitives, and command-center components from which every page and every state is composed. Pair it with [`PAGES.md`](./PAGES.md) (the page × state × endpoint catalog). The build mirrors the export per [`docs/10-qa/DESIGN-PARITY.md`](../10-qa/DESIGN-PARITY.md), and the token values below are the source for `frontend/src/styles/tokens.css`.

## 1. Design principles — "calm command center"

The Pyramid team is non-technical and under time pressure. The product replaces email/Excel chaos, so it must feel **instantly legible, trustworthy, and quiet**. The reference is Apple's pro tools (the macOS system apps, Linear, Things) — not a colorful SaaS dashboard.

1. **Monochrome by default, color only for meaning.** The interface is near-grayscale. The single calm-blue accent marks the *one* primary action on a screen and live signals. Color otherwise appears **only** to encode operational status (conflict / held / confirmed / scheduled). A screen with no problems is almost colorless — calm.
2. **Whitespace is the layout.** Generous spacing, few borders, no boxes-in-boxes. Group by proximity and a hairline, not by heavy cards.
3. **Typography carries the hierarchy.** One type family, a tight scale, strong weight contrast. Numbers (capacities, quantities, money, times) are tabular and prominent — this is an operational tool.
4. **Depth is a whisper.** Elevation is a 1px border + a soft shadow, never a glow. Two surface levels on a page, max.
5. **Motion is functional.** 120–280ms, ease-out. Things slide and fade to show *where they came from* (a drawer, a row). Nothing bounces.
6. **Every state is designed.** Loading (skeleton), empty (a helpful first action), error, submitting, success, and the operational states (conflict, held-expiring) are first-class — not afterthoughts.
7. **Density with air.** Tables and timelines are information-dense but never cramped: 40–44px rows, comfortable line-height, aligned numerals.

## 2. Tokens (the contract)

Defined as CSS custom properties on `:root` in `frontend/src/styles/tokens.css`, bridged to Tailwind utilities via `@theme inline`. **Never reference a raw hex in a component** — use the semantic token (`bg-surface`, `text-text-secondary`, `bg-accent`). Dark mode overrides the same vars under `[data-theme="dark"]`; ship light.

### 2.1 Color

```
/* Surfaces — paper, two elevation levels */
--surface           #FFFFFF      /* page + cards */
--surface-subtle    #F7F8FA      /* app chrome, sunken panels, table headers */
--surface-sunken    #F1F3F5      /* wells, inset areas */
--surface-inverted  #0B0D12      /* tooltips, command palette */

/* Text — ink on paper */
--text-primary      #0B0D12      /* headings, key numbers */
--text-secondary    #51555E      /* body, labels */
--text-tertiary     #8A8F98      /* meta, placeholders, timestamps */
--text-inverted     #FFFFFF
--text-on-accent    #FFFFFF

/* Borders — hairlines */
--border-subtle     #ECEEF1      /* dividers, table lines, default inputs */
--border-strong     #D7DBE0      /* hover, emphasized inputs */
--border-focus      #2F6FED      /* focus ring */

/* Accent — ONE calm blue. Primary actions + live signals only. */
--accent            #2F6FED
--accent-hover      #2A63D4
--accent-pressed    #244FB0
--accent-muted      #EEF3FE      /* tints, selected rows, the AI copilot surface */

/* Operational status — the ONLY other colors. Each paired with a subtle bg. */
--success / --success-subtle   #1A7F4B / #E9F6EF   /* available, confirmed, on-track */
--warning / --warning-subtle   #9A6B00 / #FBF3E0   /* HELD (lease ticking), low inventory */
--danger  / --danger-subtle    #C8372D / #FBECEA   /* CONFLICT, rejected, overdue */
--info    / --info-subtle       #2F6FED / #EEF3FE   /* scheduled, neutral notice (== accent) */
```

**Status → token mapping (use everywhere, consistently):**

| Operational state | Token | Used by |
|---|---|---|
| Available / Confirmed / Done / Feasible | `success` | space free, reservation CONFIRMED, task DONE, plan feasible |
| Held (lease ticking) / Low inventory / Proposed | `warning` | reservation HELD + `expiresAt`, `inventory.low`, request PROPOSED |
| Conflict / Rejected / Overdue | `danger` | `conflict.detected`, request REJECTED, task overdue |
| Scheduled / Informational | `info` | request SCHEDULED, neutral banners |
| Draft / Released / Inactive | neutral (`text-tertiary`) | request DRAFT, reservation RELEASED |

### 2.2 Typography

```
--font-sans  'SF Pro Text','Geist',-apple-system,system-ui,sans-serif
--font-mono  'SF Mono','Geist Mono',ui-monospace,Menlo,monospace   /* IDs, times, code */
```

Scale (size / line-height / weight / tracking):

| Token | Size / LH | Weight | Use |
|---|---|---|---|
| `display` | 32 / 38 | 600, −0.02em | page hero numbers (rare) |
| `h1` | 24 / 30 | 600, −0.01em | page title |
| `h2` | 19 / 26 | 600 | section title |
| `h3` | 16 / 22 | 600 | card / panel title |
| `body` | 14 / 21 | 400 | default text |
| `body-strong` | 14 / 21 | 550 | emphasized body, labels |
| `small` | 13 / 18 | 400 | secondary meta |
| `caption` | 12 / 16 | 500, 0.01em | chips, table headers (uppercase optional) |
| `mono` | 13 / 18 | 450 | IDs, timestamps, quantities |

Numbers use `font-variant-numeric: tabular-nums` everywhere they're compared (tables, meters, money).

### 2.3 Spacing, radius, elevation, motion, z

```
Spacing  4-pt grid: 4 8 12 16 24 32 48 64  (page gutters 24 mobile / 32 desktop)
Radius   --radius-xs 4 · sm 6 · md 10 · lg 16 · pill 999   (inputs/buttons 6–10; cards 10–16; chips pill)
Elevation
  --elev-flat    none
  --elev-raised  0 1px 2px rgba(11,13,18,.04), 0 0 0 1px rgba(11,13,18,.06)   /* cards, popovers */
  --elev-overlay 0 16px 40px -12px rgba(11,13,18,.18), 0 2px 6px rgba(11,13,18,.05), 0 0 0 1px rgba(11,13,18,.06)  /* modals, drawers */
Motion   --dur-micro 120ms · --dur-std 200ms · --dur-page 280ms
         --ease-std cubic-bezier(0.2,0,0,1) · --ease-exit cubic-bezier(0.4,0,1,1)
Z        sticky 100 · dropdown 200 · drawer 300 · modal 400 · toast 500 · tooltip 600
```

## 3. Primitives (built on Radix, in `frontend/src/components/ui/`)

Each is `forwardRef`, accepts `className`, forwards props, variant-driven via `cva`. Generate every variant × state in the components artboard.

| Primitive | Variants | States to show |
|---|---|---|
| `Button` | primary / secondary / ghost / danger; sm·md·lg; iconLeft/Right; `loading`; `fullWidth` | default, hover, pressed, focus-visible, disabled, loading |
| `IconButton` | ghost / subtle; sm·md | + tooltip on hover |
| `Input` / `Textarea` | sm·md·lg; states default/error | empty(placeholder), focus, filled, error+message, disabled, with prefix/suffix |
| `Select` / `Combobox` | sm·md | closed, open(list), search, selected, empty-results |
| `Checkbox` / `Radio` / `Switch` | — | unchecked, checked, indeterminate, focus, disabled |
| `FormField` | — | label + control + hint + error wiring |
| `Dialog` (modal) | sm·md·lg | overlay + content; confirm/destructive footer |
| `Drawer` | right / bottom(mobile) | — |
| `Popover` / `Tooltip` / `DropdownMenu` | — | — |
| `Toast` | info/success/warning/danger | enter/exit |
| `Tabs` / `SegmentedControl` | — | active underline |
| `Badge` / `StatusBadge` | neutral/success/warning/danger/info; dot variant | — |
| `Avatar` | sm·md; initials fallback | — |
| `Skeleton` / `Spinner` | — | shimmer |
| `Tooltip`, `Kbd` | — | — |

## 4. Command-center components (domain-specific, built once)

The heart of the product. Generate each with its full state set. Each maps to contract data (see `PAGES.md`).

- **`StatusBadge`** — the universal status pill. Variants per the status→token table (DRAFT, PROPOSED, APPROVED, SCHEDULED, COMPLETED, REJECTED · HELD, CONFIRMED, RELEASED · TODO/IN_PROGRESS/DONE/BLOCKED · conflict). Dot + label; `mono` for the related ID.
- **`ConflictBanner`** — the signature moment. A `danger`-tinted inset that renders a `Conflict[]`: type, the human `detail`, the colliding window, the `conflictingRequestIds`, and — for `ASSET_OVERALLOCATED` — a `requested / available` meter. Primary action "See alternatives", secondary "Adjust". This is what the AI's "Blue is taken — Orange seats 180, shall I hold it?" renders into.
- **`AvailabilityTimeline` / `ScheduleCalendar`** — horizontal time axis per space (day/week). Bars = reservations colored by status; the lighter **buffer zone** (setup/teardown) is shown as a hatched extension so setup overlaps are visible. Hover → popover with the request. Empty lanes read "free". This is the "digital twin" surface.
- **`InventoryMeter`** — for an asset: a horizontal bar `available / total` with the held portion in `warning`. Crosses to `danger` past a threshold (`inventory.low`). Tabular numbers.
- **`SpaceCard`** — name, floor, capacity for the requested layout (big tabular number), feature chips, day rate, and an availability dot for the active window.
- **`ReservationCard`** — space, window, asset list, `StatusBadge`; for HELD shows a **lease countdown** to `expiresAt` (turns `warning` as it nears).
- **`QuoteTable`** — line items (label, kind chip, qty, unit, subtotal), then NET / VAT (20%) / **TOTAL** emphasized. Currency `ALL`, tabular, grouped thousands.
- **`TaskBoard`** — two lanes **SETUP** and **TEARDOWN**; cards show title, owner/assignee avatar, `dueAt` (relative + absolute), status. Overdue → `danger`.
- **`OperationalPlanView`** — the headline artifact: a single scroll composing SpaceCard + ReservationCard + QuoteTable + TaskBoard + (ConflictBanner if any) + the AI **narrative** at top. Feasible vs not-feasible variants. This is the `GET /requests/:id` aggregate / `POST /plan` output rendered.
- **`CopilotPanel`** — right-side or full chat. `ChatMessage` (user / assistant), an **assistant "thinking" state**, `ProposedActionCard` (e.g. "Hold Blue Hall" with a confirm button → `requiresApproval`), and inline plan previews. The copilot surface uses `accent-muted`. Includes the **unprompted conflict heads-up** state (a pushed message on `conflict.detected`).
- **`KPIStat`** — dashboard tiles (events this week, spaces in use, low-stock assets, pending approvals): big tabular number + label + tiny trend/▲▼.
- **`AuditTimeline`** — vertical, append-only: actor avatar + name, action verb, entity, timestamp (mono), expandable before/after diff, reason. The "complete record".
- **`DataTable`** — sortable, paginated, empty/loading/error states, row hover, optional row-selection; used for requests, assets, audit, users.
- **`PageHeader`** — title + breadcrumb + the single primary action (accent) + filters row.
- **`EmptyState` / `ErrorState`** — illustrationless, calm: a one-line explanation + the helpful first action.

## 5. Shells & navigation

- **`AppShell`** — left sidebar (collapsible) + top bar. Sidebar groups: **Overview** (Dashboard), **Pipeline** (Requests, Calendar), **Resources** (Spaces, Inventory), **Operations** (Tasks, Conflicts, Approvals), **Record** (Audit), and (ADMIN) **Settings** (Users). Top bar: global search / request-intake launcher, a **live status pill** (NATS-connected, shows last event), the copilot toggle, the user menu + role badge.
- **`AuthShell`** — centered, zero-distraction staff login.
- **Mobile**: sidebar → bottom-anchored drawer; the copilot → full-screen sheet; tables → stacked cards. Designed at 390px.

## 6. Cross-cutting

- **Accessibility**: WCAG AA contrast (the palette is tuned for it); visible `:focus-visible` ring (`--border-focus`); full keyboard nav; ARIA on icon-only buttons; status is never color-only (always a label/icon too — critical for the conflict/held distinction).
- **Responsive**: mobile-first; `md:` (768) tablet, `lg:` (1024) desktop. Sidebar collapses < lg.
- **i18n**: every string from `i18n/{al,en}.json`. **Albanian runs ~20–30% longer** — design buttons/labels/chips to flex without truncation. Show both locales side-by-side in the export.
- **Dark mode**: tokens are dark-capable; design **light**, but keep contrast relationships so `[data-theme="dark"]` works later.

## 7. What to generate (the Claude Design canvas)

Produce a canvas (`index.html` + per-flow `.html` + `.jsx`) with these sections, each artboard at **desktop 1280–1440** and **mobile 390**, in **EN and AL**:

1. **Tokens** — color, type, spacing/radius/elevation/motion artboards (the contract).
2. **Primitives** — every component in §3, all variants × states in a grid.
3. **Command components** — every component in §4 with its state set (esp. `ConflictBanner`, `AvailabilityTimeline`, `OperationalPlanView`, `CopilotPanel`).
4. **Shells** — AppShell (desktop + mobile drawer), AuthShell.
5. **Pages** — every page in [`PAGES.md`](./PAGES.md), each with its listed states (default / loading / empty / error / submitting / **conflict** / success).

Use inline styles referencing the CSS-var tokens above (the marketplace export convention), mock data that matches the contract shapes (real-looking: "Blue Hall", "FinTech Startup Conference", 180 attendees, 134,000 ALL), and label each artboard `§X.Y` so parity can be checked 1:1.

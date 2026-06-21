# 03 — Shells (§2) — Design Spec Digest & Gap Analysis

**Canvas source:** `CLAUDE_DESIGN/Shells.dc.html` (§2 "Shells"; artboards §2.1 AppShell ×2 + §2.1 mobile drawer + §1.1 AuthShell)
**Build target:** `frontend/src/components/shell/{AppShell,AuthShell,LocaleToggle,RequireAuth}.tsx` + `frontend/src/routes/RootLayout.tsx`
**Docs:** `docs/05-frontend/DESIGN_SYSTEM.md` §5 (Shells & navigation), `PAGES.md` §1.1 / §2.1

**Canvas helmet** loads Geist (400;450;500;550;600;700) + Geist Mono (400;450;500) from Google Fonts. The wrapper font stack is `'SF Pro Text','Geist',-apple-system,system-ui,sans-serif`. (See `00-tokens.md §FONTS` — the build never loads Geist; that font bug is global, not re-litigated here, but every weight below assumes Geist is present.)

**One keyframe is defined in the canvas helmet** and used by the freshness pill dot:
```css
@keyframes pulseDot { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.8); } }
```
Animation shorthand on the connected dot: `pulseDot 1.8s ease-in-out infinite`.

The page renders **5 artboards across 3 frame rows**:
- §2.1 row A — AppShell default (1280px, data up to date, Dashboard active, sidebar expanded).
- §2.1 row B — AppShell sidebar-collapsed + data stale (1120px, Requests active).
- §2.1 / §1.1 row C — Mobile drawer (390px) + AuthShell (390px).

So the **5 shell states** required by `PAGES.md §2.1` (default, sidebar-collapsed, mobile-drawer, fresh, stale) all appear: up-to-date is shown in row A, stale in row B, expanded in A, collapsed in B, mobile-drawer in C; AuthShell is §1.1.

---

## Shared shell helpers (exact values from the canvas)

### Logo (`logo(size)`, default 30; AppShell uses 28, drawer 26, AuthShell 44)
- Container: `size × size`, `border-radius:8px` (→ `--radius-sm` 6 is closest token but canvas is **8px** — see GAP), `background:linear-gradient(135deg,#2F6FED,#244FB0)` (i.e. `--accent` → `--accent-pressed`), flex-centered, `flex-shrink:0`.
- Inner SVG: `width/height = size*0.55`, `viewBox 0 0 18 18`. Two paths:
  - Outline triangle `M9 1.5 16.5 16.5H1.5L9 1.5Z`, `stroke:#fff` (→ `--text-inverted`), `stroke-width:1.4`, `stroke-linejoin:round`.
  - Inner filled triangle `M9 6 12.5 13H5.5L9 6Z`, `fill:#fff`, `fill-opacity:0.35`.
- **This is a real pyramid mark**, not a plain blue square.

### Avatar (`avatar(initials, size, color)`, default 30)
- `size × size`, `border-radius:999px` (→ `--radius-pill`), `background` = passed color (top bar uses `#DCE6FB` — a light accent tint, no exact token; close to `--accent-muted` #EEF3FE but bluer), default `#E3E7EC`.
- `color:#51555E` (→ `--text-secondary`) for initials, `font-size: size*0.4`, `font-weight:600`.
- `box-shadow:inset 0 0 0 1px rgba(11,13,18,.06)` (the inner hairline ring — same alpha as `--elev-raised` ring), `flex-shrink:0`.

### Icon (`icon(d,size,color)`)
- SVG `viewBox 0 0 16 16`, default size 16, single `<path>` `stroke:currentColor` (override-able), `stroke-width:1.5`, `stroke-linecap:round`, `stroke-linejoin:round`. **Stroke icons, 1.5 weight** — matches lucide defaults closely.

### Frame label (`frameLabel`)
- Row: `display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:14px`.
- §-number: `font-family:'Geist Mono',monospace; font-size:12px; color:#8A8F98` (→ `--text-tertiary`).
- Title `<h2>`: `font-size:19px; line-height:26px; font-weight:600; margin:0` (→ DS `h2`).
- Subtitle: `font-size:13px; color:#8A8F98` (→ `--text-tertiary`).

### Artboard wrapper (`artboard(w,body,label)`)
- Column, `gap:10px`. Optional label above: `font-size:12px; color:#51555E; font-weight:550` (→ `--text-secondary`).
- Card: `width = w px`, `background:#fff` (→ `--surface`), `border-radius:4px` (→ `--radius-xs`), `box-shadow:0 1px 3px rgba(0,0,0,.1)`, `overflow:hidden`. (This shadow is the canvas chrome, not a token — it's the "screenshot frame", not part of the shell UI.)

---

## §2.1 — AppShell (default · data up to date · sidebar expanded)

**Frame label:** `§2.1 — AppShell — default` · sub `sidebar groups · top bar · freshness pill · copilot toggle · role badge`.
**Artboard:** `Desktop · 1280 · up to date`, width **1280px**. Active nav = **Dashboard**, `fresh:'ok'`, not collapsed.

### Outer layout (`appShell`)
- Root: `height:620px; display:flex` → sidebar (fixed) + content column.

### Sidebar (expanded)
- `width:220px` (collapsed = 64px — see §2.1-collapsed), `flex-shrink:0`.
- `border-right:1px solid #ECEEF1` (→ `--border-subtle`).
- `background:#F7F8FA` (→ `--surface-subtle`).
- `display:flex; flex-direction:column; height:100%`.

**Sidebar header (brand):**
- `height:56px; display:flex; align-items:center; gap:10px; padding:0 16px; justify-content:flex-start; border-bottom:1px solid #ECEEF1` (→ `--border-subtle`).
- Logo at size **28**, then brand text `font-size:14px; font-weight:600` (→ `--text-primary` inherited #0B0D12), literal copy **"Backstage"** (NOTE: not "Pyramid Backstage" — sidebar uses the short "Backstage").

**Sidebar nav body:**
- `flex:1; overflow:auto; padding:16px 10px`.
- Renders the 6 nav groups (Settings group always rendered in the canvas mock — the ADMIN gate is build-side).

**Nav group (`navGroup`):**
- Wrapper `margin-bottom:18px`.
- Group title (hidden when collapsed): `font-size:11px; color:#8A8F98` (→ `--text-tertiary`), `text-transform:uppercase; letter-spacing:0.05em; font-weight:600; padding:0 12px; margin-bottom:6px`.

**Nav item (`navItem`):**
- `display:flex; align-items:center; gap:11px; height:34px; padding:0 12px` (collapsed: `padding:0`, `justify-content:center`), `border-radius:8px`, `margin-bottom:2px; cursor:pointer; position:relative`.
- **Default item:** `background:transparent; color:#51555E` (→ `--text-secondary`), `font-weight:400`. Icon color `#8A8F98` (→ `--text-tertiary`).
- **Active item:** `background:#EEF3FE` (→ `--accent-muted`), `color:#2F6FED` (→ `--accent`), `font-weight:550`. Icon color `#2F6FED` (→ `--accent`).
- Icon: `icon(it.icon, 16)` inside `<span style="display:inline-flex">`.
- Label text `font-size:14px`.
- **Badge** (count chip, only expanded): `margin-left:auto; font-size:11px; font-weight:600; border-radius:999px; padding:1px 7px; font-family:'Geist Mono',monospace`.
  - Normal badge: `color:#8A8F98` (→ `--text-tertiary`), `background:#F1F3F5` (→ `--surface-sunken`).
  - Danger badge (`badgeDanger:true`): `color:#C8372D` (→ `--danger`), `background:#FBECEA` (→ `--danger-subtle`).

### The 5 nav GROUPS + Settings (EXACT labels, icons, badges)

Icon `d` strings are 16×16 viewBox paths from `navData()`:

| Group | Item | icon key + path `d` | badge | maps to (route) |
|---|---|---|---|---|
| **Overview** | Dashboard | `dash` `M2.5 8 8 3l5.5 5M4 7v6h8V7` (house) | — | `/` |
| **Pipeline** | Requests | `req` `M4 3h8v10H4zM6 6h4M6 9h4` (doc w/ lines) | **`24`** (neutral) | `/requests` |
| **Pipeline** | Calendar | `cal` `M3 4h10v9H3zM3 7h10M6 2v3M10 2v3` (calendar) | — | `/calendar` |
| **Resources** | Spaces | `spaces` `M2.5 13V6L8 2.5 13.5 6v7M6 13V9h4v4` (building) | — | `/spaces` |
| **Resources** | Inventory | `inv` `M2.5 5 8 2.5 13.5 5v6L8 13.5 2.5 11zM2.5 5 8 7.5 13.5 5` (box) | **`2`** DANGER | `/inventory` |
| **Operations** | Tasks | `tasks` `M3 5h2v2H3zM7 6h6M3 9h2v2H3zM7 10h6` (checklist) | — | `/tasks` |
| **Operations** | Conflicts | `conf` `M8 5v3.5M8 11v.2M8 1.5 1 13.5h14L8 1.5Z` (warning triangle) | **`1`** DANGER | `/conflicts` |
| **Operations** | Approvals | `appr` `M3 8.5 6 11l7-7` (check) | **`5`** (neutral) | (in `/requests/:id`) |
| **Record** | Audit | `audit` `M8 4v4l3 1.5M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Z` (clock) | — | `/audit` |
| **Settings** | Users | `users` `M5.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z…` (people) | — | `/settings/users` |

**Critical:** the canvas has **TEN nav items in 6 groups**. The Operations group has **THREE** items: Tasks, **Conflicts (badge 1, danger)**, **Approvals (badge 5)**. The current build is missing **Approvals** entirely and all badges.

### Sidebar footer (Collapse toggle)
- `padding:12px 10px; border-top:1px solid #ECEEF1` (→ `--border-subtle`).
- Renders a `navItem` labelled **"Collapse"** with chevron icon `M10 3.5 5.5 8 10 12.5` (left-pointing « when expanded) / `M6 3.5 10.5 8 6 12.5` (right-pointing » when collapsed). Same 34px item styling.

### Top bar (`topBar`, fresh/up-to-date variant here)
- `height:56px; border-bottom:1px solid #ECEEF1` (→ `--border-subtle`); `background:#fff` (→ `--surface`); `display:flex; align-items:center; padding:0 20px; gap:14px`.

**Search / request-intake launcher (left):**
- `display:flex; align-items:center; gap:8px; flex:1; max-width:420px; height:34px; padding:0 12px; border-radius:8px; background:#F7F8FA` (→ `--surface-subtle`); `border:1px solid #ECEEF1` (→ `--border-subtle`); `color:#8A8F98` (→ `--text-tertiary`).
- Search icon `M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10ZM11 11l3 3`, size **15**.
- Placeholder text `font-size:13px`, literal copy **"Search or start a request…"**.
- Trailing **⌘K kbd**: `margin-left:auto; font-family:'Geist Mono',monospace; font-size:11px; background:#fff` (→ `--surface`); `border:1px solid #D7DBE0` (→ `--border-strong`); `border-radius:5px; padding:1px 6px`; literal **"⌘K"**.

**Right cluster:** `margin-left:auto; display:flex; align-items:center; gap:12px`, containing in order: freshness pill → Copilot button → user/role block.

**Freshness pill (`freshnessPill`) — UP-TO-DATE variant:** (reflects how recently the polled REST data refreshed)
- `display:inline-flex; align-items:center; gap:8px; height:30px; padding:0 12px; border-radius:999px` (→ `--radius-pill`).
- `background:#E9F6EF` (→ `--success-subtle`); `border:1px solid rgba(26,127,75,.2)` (success #1A7F4B at 20% — no exact token, derive from `--success`).
- Dot: `7px × 7px; border-radius:999px; background:#1A7F4B` (→ `--success`); `animation:pulseDot 1.8s ease-in-out infinite`.
- Label: `font-size:12px; font-weight:600; color:#15613A` (a darker success ink, NOT `--success` #1A7F4B — see GAP), literal copy **"Up to date"**.
- Trailing last-refresh meta: `font-size:11px; color:#8A8F98` (→ `--text-tertiary`); `font-family:'Geist Mono',monospace`; literal copy **"updated 2s ago"**. (Only present in the up-to-date state.)

**Copilot toggle button:**
- `<button>`: `height:34px; display:inline-flex; align-items:center; gap:7px; padding:0 12px; border-radius:8px; background:#EEF3FE` (→ `--accent-muted`); `border:1px solid #DCE6FB` (a light accent border — no exact token, between `--accent-muted` and `--accent`); `color:#2F6FED` (→ `--accent`); `font-size:13px; font-weight:550; cursor:pointer`.
- Sparkle icon `M8 2.5 9.2 6l3.3 .2-2.6 2 1 3.3L8 9.7 5.1 11.5l1-3.3L3.5 6.2 6.8 6 8 2.5Z`, size **14**, stroke `#2F6FED`.
- Literal copy **"Copilot"**.

**User menu + role badge:**
- Wrapper: `display:flex; align-items:center; gap:8px; padding-left:12px; border-left:1px solid #ECEEF1` (→ `--border-subtle`) — a left hairline divider from the copilot button.
- Avatar `avatar('EH', 30, '#DCE6FB')` — initials **"EH"**, size 30, accent-tinted bg `#DCE6FB`.
- Text block:
  - Name: `font-size:13px; font-weight:600; line-height:15px`, literal **"Elira H."** (→ `--text-primary`).
  - Role: `font-size:11px; color:#9A6B00` (→ `--warning`); `font-weight:600`, literal **"MANAGER"** (uppercase). The MANAGER role badge renders in `--warning` ink.

### Content body (default page = Dashboard preview)
- Content column: `flex:1; display:flex; flex-direction:column; min-width:0`.
- Page area: `flex:1; background:#fff` (→ `--surface`); `padding:28px 32px; overflow:hidden`.
- `<h1>`: `font-size:24px; font-weight:600; margin:0 0 4px; letter-spacing:-0.01em` (→ DS `h1`), literal **"Dashboard"**.
- Sub `<p>`: `font-size:14px; color:#51555E` (→ `--text-secondary`); `margin:0 0 20px`, literal **"Tuesday, 22 July 2026 · 4 spaces in use"**.
- KPI grid: `display:grid; grid-template-columns:repeat(4,1fr); gap:14px`. Each tile: `border:1px solid #ECEEF1` (→ `--border-subtle`); `border-radius:10px` (→ `--radius-md`); `padding:14px`.
  - Tile label: `font-size:12px; color:#51555E` (→ `--text-secondary`); `margin-bottom:8px`.
  - Tile value: `font-size:24px; font-weight:600; font-family:'Geist Mono',monospace; font-variant-numeric:tabular-nums`; color `#0B0D12` (→ `--text-primary`), **except "Low-stock" value which is `#C8372D`** (→ `--danger`).
  - KPI data: `[['Events this week','12'],['Spaces in use','4 / 6'],['Low-stock','2'],['Pending','5']]`.
- (This dashboard content is a *preview inside the shell artboard*; the real Dashboard page is §3.1 — but it tells us the main content region uses `padding:28px 32px` and `background:#fff`.)

---

## §2.1 — AppShell (sidebar COLLAPSED · DATA STALE)

**Frame label:** `§2.1 — AppShell — sidebar collapsed · data stale`.
**Artboard:** `Desktop · collapsed rail · data stale`, width **1120px**. Active = **Requests**, `collapsed:true`, `fresh:'degraded'`.

### Collapsed sidebar (rail)
- `width:64px` (vs 220 expanded).
- Header: `padding:0; justify-content:center` (logo only, **no "Backstage" text**).
- Nav: group **titles are hidden** (`collapsed ? null`). Items render icon-only: `padding:0; justify-content:center`, **no label, no badge** (`!collapsed && it.badge` gate hides badges when collapsed).
- Footer Collapse item: icon-only, chevron flips to `M6 3.5 10.5 8 6 12.5` (right-pointing, "expand").
- Active item (Requests) still `background:#EEF3FE` + `color:#2F6FED`, now a centered icon-only pill.

### Top bar — STALE variant (`freshnessPill('degraded')`)
Same top-bar geometry; only the pill changes:
- `background:#FBF3E0` (→ `--warning-subtle`); `border:1px solid rgba(154,107,0,.25)` (warning #9A6B00 at 25% — derive from `--warning`).
- Dot: `7px; background:#9A6B00` (→ `--warning`); **`animation:'none'`** (stale dot does NOT pulse — static).
- Label: `font-size:12px; font-weight:600; color:#7A5500` (a darker warning ink, NOT `--warning` #9A6B00 — see GAP), literal copy **"Stale"**.
- **No trailing last-refresh meta** (the `updated 2s ago` span is `ok ? … : null` — absent when stale).

---

## §2.1 — Mobile drawer (390px)

**Frame label:** `§2.1 / §1.1 — Mobile drawer · AuthShell` · sub `390px · bottom-anchored drawer · centered login`.
**Artboard:** `Mobile · 390 · nav drawer`, width **390px**.

### Structure (`mobileDrawer`)
- Root: `position:relative; height:740px; background:#fff`.
- **Dimmed app behind** (`position:absolute; inset:0; background:#F7F8FA` → `--surface-subtle`):
  - A mobile top bar: `height:52px; border-bottom:1px solid #ECEEF1` (→ `--border-subtle`); `background:#fff; display:flex; align-items:center; padding:0 16px; gap:12px`.
    - Hamburger icon `M2.5 4h11M2.5 8h11M2.5 12h11`, size **18**, color `#0B0D12` (→ `--text-primary`).
    - Logo size **26**.
    - Brand text `font-size:15px; font-weight:600`, literal **"Backstage"**.
- **Scrim** overlay: `position:absolute; inset:0; background:rgba(11,13,18,.4)` (ink #0B0D12 at 40% — the modal/drawer scrim).
- **Bottom drawer:**
  - `position:absolute; left:0; right:0; bottom:0; background:#fff` (→ `--surface`).
  - `border-radius:18px 18px 0 0` (top corners rounded 18px — close to `--radius-lg` 16 but canvas is **18**; see GAP).
  - `box-shadow:0 -16px 40px -12px rgba(11,13,18,.25)` (upward overlay shadow; note: the `--elev-overlay` token uses `.18` alpha + extra layers — canvas drawer is a single heavier `.25` upward shadow).
  - `padding:10px 14px 24px; max-height:86%; overflow:auto`.
  - **Grab handle:** `width:36px; height:4px; border-radius:999px; background:#D7DBE0` (→ `--border-strong`); `margin:4px auto 14px` (centered).
  - Renders all 6 nav groups **expanded** (`collapsed:false`) — full labels, badges, group titles. Same `navGroup`/`navItem` styles as desktop.

---

## §1.1 — AuthShell (centered, zero-distraction)

**Frame label:** part of row C; artboard label `AuthShell · §1.1`, width **390px** (canvas frame), inner card 380px.

### Structure (`authShell`)
- Outer: `min-height:620px; background:#F7F8FA` (→ `--surface-subtle`); `display:flex; align-items:center; justify-content:center; padding:40px`.
- Inner column: `width:380px`.

**Brand header (centered):**
- Column: `display:flex; flex-direction:column; align-items:center; margin-bottom:28px`.
- Logo size **44**.
- `<h1>`: `font-size:20px; font-weight:600; margin:16px 0 4px`, literal **"Pyramid Backstage"** (full name here, unlike the sidebar's "Backstage").
- `<p>`: `font-size:13px; color:#8A8F98` (→ `--text-tertiary`); `margin:0`, literal **"Operations sign-in"**.

**Login card:**
- `background:#fff` (→ `--surface`); `border-radius:14px` (between `--radius-md` 10 and `--radius-lg` 16 — canvas is **14**; see GAP).
- `box-shadow:0 1px 2px rgba(11,13,18,.04), 0 0 0 1px rgba(11,13,18,.06)` — **exactly `--elev-raised`**.
- `padding:24px`.

**Field (`field(label,val,ph)`):** `margin-bottom:14px`.
- Label: `display:block; font-size:13px; font-weight:550; margin-bottom:6px` (→ `--text-primary` inherited).
- Input box: `height:40px; display:flex; align-items:center; padding:0 13px; border-radius:8px; border:1px solid #D7DBE0` (→ `--border-strong`); `font-size:14px`. Color `#0B0D12` (→ `--text-primary`) when filled, `#8A8F98` (→ `--text-tertiary`) for placeholder.
- Field 1: label **"Work email"**, value **"elira.hoxha@pyramid.al"** (filled, ink).
- Field 2: label **"Password"**, no value, placeholder **"••••••••"** (8 bullets, tertiary).

**Sign-in button:**
- `width:100%; height:40px; border-radius:8px; background:#2F6FED` (→ `--accent`); `color:#fff` (→ `--text-on-accent`); `border:none; font-size:14px; font-weight:600; cursor:pointer; margin-top:4px`.
- Literal copy **"Sign in"**.

**Forgot password link:**
- `text-align:center; margin-top:14px; font-size:13px; color:#2F6FED` (→ `--accent`), literal **"Forgot password?"**.

**Footer note:**
- `text-align:center; font-size:12px; color:#8A8F98` (→ `--text-tertiary`); `margin-top:20px; font-family:'Geist Mono',monospace`, literal **"Staff only · access is audited"**.

---

## Color → token quick map (this area)

| Raw hex / value | Token | Where |
|---|---|---|
| `#FFFFFF` | `--surface` / `--text-inverted` / `--text-on-accent` | content bg, cards, top bar, logo strokes |
| `#F7F8FA` | `--surface-subtle` | sidebar bg, search input bg, AuthShell bg, mobile app-behind |
| `#F1F3F5` | `--surface-sunken` | neutral nav badge bg (`#F1F3F5`) |
| `#0B0D12` | `--text-primary` / `--surface-inverted` | headings, names, hamburger, scrim base ink |
| `#51555E` | `--text-secondary` | nav item default text, sub-copy, KPI labels, avatar initials |
| `#8A8F98` | `--text-tertiary` | group titles, placeholders, meta, event-time mono |
| `#ECEEF1` | `--border-subtle` | all sidebar/topbar hairlines, KPI tile borders |
| `#D7DBE0` | `--border-strong` | ⌘K kbd border, AuthShell input border, grab handle |
| `#2F6FED` | `--accent` / `--info` / `--border-focus` | active nav, copilot text, sign-in btn, links, logo |
| `#244FB0` | `--accent-pressed` | logo gradient end |
| `#EEF3FE` | `--accent-muted` | active nav bg, copilot button bg |
| `#DCE6FB` | (no exact token — light accent tint) | avatar bg, copilot button border |
| `#1A7F4B` | `--success` | up-to-date dot |
| `#E9F6EF` | `--success-subtle` | up-to-date pill bg |
| `#15613A` | (darker success ink, NOT `--success`) | "Up to date" label text |
| `rgba(26,127,75,.2)` | derive from `--success` | up-to-date pill border |
| `#9A6B00` | `--warning` | stale dot, MANAGER role text |
| `#FBF3E0` | `--warning-subtle` | stale pill bg |
| `#7A5500` | (darker warning ink, NOT `--warning`) | "Stale" label text |
| `rgba(154,107,0,.25)` | derive from `--warning` | stale pill border |
| `#C8372D` | `--danger` | danger nav badges (Inventory/Conflicts), Low-stock KPI |
| `#FBECEA` | `--danger-subtle` | danger nav badge bg |
| `rgba(11,13,18,.4)` | scrim (ink @40%) | mobile drawer scrim |
| `rgba(11,13,18,.06)` | `--elev-raised` ring | avatar inset ring, AuthShell card ring |

**Radii used:** nav items / search / copilot / sidebar header buttons = **8px** (no exact token; sits between `--radius-sm` 6 and `--radius-md` 10); ⌘K kbd = **5px**; KPI tiles = **10px** (`--radius-md`); pills/dots/handle = **999px** (`--radius-pill`); AuthShell card = **14px**; mobile drawer = **18px** top; logo = **8px**.

---

# GAP ANALYSIS

Current build files read: `AppShell.tsx`, `AuthShell.tsx`, `LocaleToggle.tsx`, `RequireAuth.tsx`, `RootLayout.tsx`, plus `ui/Badge.tsx` and `i18n/{en,al}.json`.

## AppShell — `frontend/src/components/shell/AppShell.tsx`

### EXISTS (correct or close)
- Left sidebar + top-bar two-column flex. `bg-surface-subtle` root.
- 6 nav groups iterated from a `groups` array, group titles uppercase 11px tracking, ADMIN-gated Settings/Users via `me.role === 'ADMIN'`.
- Active state uses `bg-accent-muted text-accent`; default `text-text-secondary`. Search launcher (navigates to `/requests`). User name + role + sign-out. `LocaleToggle`. Sticky header.
- i18n nav keys already exist for all groups/items (`nav.overview…nav.users`) in both locales.

### MISSING vs canvas
- **Approvals nav item** — Operations group must be **Tasks, Conflicts, Approvals**. Build has only Tasks + Conflicts. Add an Approvals item (badge `5`). No route exists (`PAGES.md` says approvals live inside `/requests/:id`) — link to `/requests?status=PROPOSED` or a placeholder; needs an i18n key `nav.approvals`.
- **All nav badges** — canvas: Requests `24` (neutral), Inventory `2` (danger), Conflicts `1` (danger), Approvals `5` (neutral). Build renders no badges at all. Badge = `margin-left:auto`, 11px/600, mono, `radius-pill`, `padding:1px 7px`; neutral `bg-surface-sunken text-text-tertiary`, danger `bg-danger-subtle text-danger`.
- **Sidebar-collapsed state** — entire collapsed rail (64px, icon-only, hidden labels/titles/badges, Collapse footer toggle) is absent. No collapse state, no toggle, no width switch (220↔64).
- **Mobile bottom-drawer** — no mobile nav at all. Sidebar is `hidden … lg:flex`, so below `lg` there is **no navigation whatsoever** (no hamburger, no drawer). Must build the 52px mobile top bar (hamburger + logo + "Backstage") and the bottom-anchored drawer (`radius 18px 18px 0 0`, grab handle, scrim `rgba(11,13,18,.4)`, all groups expanded).
- **Collapse footer toggle** — the `border-top` footer with the Collapse item + chevron is missing.
- **Copilot toggle button** — completely absent. Canvas: `bg-accent-muted border #DCE6FB text-accent`, 34px, sparkle icon + "Copilot". (i18n `copilot.title` = "Copilot" exists.)
- **⌘K kbd hint** in the search launcher — missing. Canvas: mono 11px, `border-strong`, `radius 5px`, "⌘K".
- **Freshness pill up-to-date variant + last-refresh meta** — build always shows the degraded-ish `info` Badge. Missing the up-to-date success-tinted pill with pulsing dot + `updated 2s ago` mono meta.
- **The pyramid logo mark** — build uses `<div className="size-6 rounded-sm bg-accent" />` (a plain blue square). Canvas uses a real triangle/pyramid SVG with the `135deg #2F6FED→#244FB0` gradient and 8px radius.
- **Sidebar header brand text** — build shows full `brand.name` ("Pyramid Backstage"); canvas sidebar shows short **"Backstage"**.

### WRONG vs canvas
- **Freshness pill is the wrong state by default.** Build hardcodes `<Badge tone="info">…{t('live.degraded')}</Badge>` in info-blue. Canvas default is **up to date** (success-tinted, "Up to date", green pulsing dot + last-refresh meta). Both variants must exist and be driven by the polling freshness state (whether the last REST poll succeeded recently vs went stale). Copy: design literals are **"Up to date" / "Stale"**; add `live.fresh`/`live.stale` keys (or repurpose the existing `live.connected`/`live.degraded`).
- **Sidebar width** — build `w-60` = **240px**; canvas expanded is **220px**. Change to `w-[220px]`.
- **Sidebar background** — build sidebar is `bg-surface` (white); canvas sidebar is `bg-surface-subtle` (#F7F8FA), and the **content area** is white. Build has it inverted (root subtle, sidebar white). Swap: sidebar → `bg-surface-subtle`, main content → `bg-surface`.
- **Nav item metrics** — build: `gap-2.5` (10px) / `px-2 py-1.5` / `text-[13px]` / `rounded-sm` (6px). Canvas: `gap:11px` / `height:34px` fixed / `padding:0 12px` / `font-size:14px` / `border-radius:8px`. Active weight build `500`, canvas `550`; default weight build `500`, canvas `400`.
- **Nav default text color** — build hover swaps to `text-text-primary`; canvas default item icon is `--text-tertiary` and text `--text-secondary`; no hover spec in canvas (static mock), keep hover subtle.
- **Group spacing** — build `mb-4` (16px); canvas `margin-bottom:18px`. Group-title padding build `px-2` (8px); canvas `padding:0 12px`. Title tracking build `0.04em`; canvas `0.05em`.
- **Top bar height** — build `h-14` = **56px** (matches). But build uses `bg-surface/90 backdrop-blur`; canvas top bar is solid `#fff` (no blur). Padding build `px-4 md:px-6`; canvas `padding:0 20px`.
- **Search launcher** — build `max-w-72` (288px) / `h-8` (32px) / icon `size-3.5`. Canvas `max-width:420px` / `height:34px` / icon size 15 / gap 8px. Build has no ⌘K and no `flex:1`.
- **Avatar** — build `size-8` (32px), `bg-surface-inverted text-text-inverted` (black bg, white initials). Canvas: 30px, `#DCE6FB` accent-tint bg, `#51555E` initials, inset ring. Build also has no avatar inset ring.
- **Role badge color** — build role is `text-text-tertiary` (gray); canvas MANAGER is `#9A6B00` (`--warning`) bold. (Role color may want to be role-driven, but MANAGER specifically renders warning-ink in the canvas.)
- **Name/role typography** — build name `text-[12px]/550`; canvas `13px/600` line-height 15px. Role build `11px` tertiary; canvas `11px/600` warning.
- **Sign-out affordance** — build has a separate `LogOut` icon button (red on hover). Canvas shows no explicit sign-out icon in the top bar (it's inside a user menu, not shown expanded) — acceptable to keep, but note it's an addition.
- **Main content max-width** — build `max-w-[1180px] … py-6 md:py-8`. Canvas content region is full-width within the shell with `padding:28px 32px`. The 1180 cap is a build choice; align page gutter to `28px/32px` per canvas (DS says 24 mobile / 32 desktop).
- **Mobile gutters** — build `px-4`; DS/canvas desktop content padding is 32px horizontal, 28px vertical.

### Build plan — AppShell
1. Replace the blue-square logo with a `PyramidLogo` SVG component (triangle paths, `linear-gradient(135deg,#2F6FED,#244FB0)`, `rounded-[8px]`, accepting a `size` prop). Use it in sidebar header (28), mobile bar (26), AuthShell (44).
2. Add collapse state (Zustand or local `useState` persisted): sidebar width `220 ↔ 64`, hide labels/titles/badges + center items when collapsed, add the footer Collapse item with flipping chevron. Sidebar `bg-surface-subtle`; main `bg-surface`.
3. Add the **Approvals** Operations item + i18n `nav.approvals`. Add a `badge?: string` + `badgeTone?: 'neutral'|'danger'` field to `NavItem`; render the mono pill at `ml-auto` (hidden when collapsed). Wire the four counts (Requests 24, Inventory 2 danger, Conflicts 1 danger, Approvals 5) — placeholder/static until query-backed.
4. Rework nav-item metrics: `h-[34px] gap-[11px] px-3 rounded-[8px]`, active `font-[550] bg-accent-muted text-accent`, default `font-[400] text-text-secondary`, icon `text-text-tertiary`/active `text-accent`, `size-4`. Group `mb-[18px]`, title `px-3 tracking-[0.05em]`.
5. Build a `FreshnessPill` with `fresh | stale` variants exactly per `freshnessPill` (success/warning subtle bg + matching borders, 7px dot, fresh pulses via a `@keyframes pulseDot` added to globals, `updated 2s ago` mono meta only when fresh). Wire to the polling freshness signal (time since the last successful REST poll); default optimistic = fresh. Use copy "Up to date"/"Stale".
6. Add the **Copilot** toggle button (sparkle icon, `bg-accent-muted border-[#DCE6FB] text-accent h-[34px] rounded-[8px]`) that opens the CopilotPanel (§8.1).
7. Add **⌘K kbd** to the search launcher; widen to `max-w-[420px] h-[34px] flex-1`, icon 15, add `Search or start a request…` copy (currently `requests.searchPlaceholder` — keep but align copy).
8. Avatar: 30px, accent-tint bg, secondary initials, `shadow-[inset_0_0_0_1px_rgba(11,13,18,.06)]`. Role badge ink driven by role (MANAGER → `text-warning`).
9. Add the **mobile shell**: below `lg`, render a 52px top bar (hamburger + 26 logo + "Backstage") and a Radix `Drawer` (bottom) reusing the nav groups expanded, with grab handle `36×4 rounded-pill bg-border-strong`, `rounded-t-[18px]`, scrim `bg-[rgba(11,13,18,.4)]`, `shadow-[0_-16px_40px_-12px_rgba(11,13,18,.25)]`, `z-drawer`.
10. Top bar: drop `backdrop-blur`, solid `bg-surface`, `px-5` (20px). Content `px-8 py-7` desktop (28/32).

## AuthShell — `frontend/src/components/shell/AuthShell.tsx`

### EXISTS
- Centered `min-h-screen` on `bg-surface-subtle`, `max-w-[380px]` column, brand `<h1>` 20px/600 + tertiary subtitle, card `rounded-lg border bg-surface p-6 shadow-raised`, children slot. `LocaleToggle` top-right.

### MISSING vs canvas
- **Logo** — canvas centers the 44px pyramid logo above the title; build has no logo.
- **Footer note** — `Staff only · access is audited` mono 12px tertiary, `margin-top:20px`, centered. Absent.
- Brand-block bottom margin: canvas `28px` between brand and card; build `mb-6` (24px).

### WRONG vs canvas
- **Subtitle copy** — canvas "Operations sign-in"; build i18n `auth.subtitle` = "Pyramid Backstage — staff access". Title copy matches ("Pyramid Backstage").
- **Card radius** — build `rounded-lg` = 16px (`--radius-lg`); canvas card is **14px**. (Minor; either accept `rounded-lg` or `rounded-[14px]`.)
- **Card border** — build adds `border border-border-subtle` *and* `shadow-raised`. Canvas uses **only** `--elev-raised` (which already includes the `0 0 0 1px` ring) — the explicit border is a doubled hairline. Drop `border border-border-subtle`, keep `shadow-raised`.
- **LocaleToggle placement** — build pins it `absolute right-4 top-4`. Canvas AuthShell has no locale toggle (it's a pure centered card). Acceptable as a build addition, but it deviates from "zero-distraction".
- **Field/button styling** is supplied by `children` (the LoginForm), not AuthShell — verify the form matches canvas fields (40px inputs, `border-strong`, 8px radius, 14px) and the full-width 40px accent "Sign in" button + "Forgot password?" link. Those live in the login page, not this file — flag for the Auth page digest.

### Build plan — AuthShell
1. Add the 44px `PyramidLogo` centered above the title inside the brand block; set brand-block `mb-7` (28px).
2. Fix `auth.subtitle` copy to **"Operations sign-in"** (both locales) or add a dedicated `auth.authShellSubtitle` key.
3. Add the footer note `<p>` with `auth.footerNote` = "Staff only · access is audited" (mono, 12px, `text-text-tertiary`, `mt-5`, centered). Add the i18n key in both locales.
4. Remove the explicit `border border-border-subtle` from the card (rely on `shadow-raised` ring); set radius to `rounded-[14px]`.
5. Decide on the LocaleToggle: either remove for true zero-distraction parity, or keep top-right as an intentional addition (recommend keep — i18n is a hard requirement — but note the deviation).

## LocaleToggle — `frontend/src/components/shell/LocaleToggle.tsx`
- Not present in the canvas at all (the design omits a locale switch). Build keeps it as a required-for-i18n addition. **No canvas reference; nothing to match.** Styling is internally consistent (pill segmented control, inverted-active). Leave as-is.

## RequireAuth / RootLayout
- `RequireAuth.tsx` (auth gate → `/login`) and `RootLayout.tsx` (Suspense + ScrollRestoration) have no canvas counterpart — they are routing chassis, not visual shells. The only design-relevant note: the `RootSkeleton`/`RequireAuth` loading fallbacks use `text-text-secondary`/`text-text-tertiary` "Loading…" which is fine and calm. No gap.

## i18n keys to add (both `en.json` + `al.json`, counts must match)
- `nav.approvals` (EN "Approvals" / AL "Miratimet").
- `live.fresh` = "Up to date" / "I përditësuar"; `live.stale` = "Stale" / "I vjetëruar" (or repurpose `live.connected`/`live.degraded`; current values "Live"/"Polling" don't match the canvas copy).
- `live.lastRefresh` is dynamic ("updated 2s ago") — derived from the time since the last successful REST poll, not a static string.
- `auth.footerNote` = "Staff only · access is audited" / "Vetëm për stafin · qasja regjistrohet".
- Fix `auth.subtitle` → "Operations sign-in" / "Hyrje për operacionet" (or add `auth.shellSubtitle`).
- `shell.copilot` / reuse `copilot.title` ("Copilot") for the toggle.
- `nav.collapse` = "Collapse" / "Palos" for the footer toggle.

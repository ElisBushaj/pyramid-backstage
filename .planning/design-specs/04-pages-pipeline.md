# Design Digest — PAGES: Auth, Overview, Pipeline (§1.1, §3.1, §4.1–4.4)

Source of truth: `CLAUDE_DESIGN/Pages.dc.html` (`<script type="text/x-dc">` inline React). Every value below is quoted verbatim from that file. Token names map per `frontend/src/styles/tokens.css`. The canvas hard-codes raw hex; the build must substitute the named token.

## Token reference (raw hex → token), used throughout this digest

| Raw hex | Token | Notes |
|---|---|---|
| `#FFFFFF` | `--surface` / `--text-inverted` / `--text-on-accent` | page/card paper |
| `#F7F8FA` | `--surface-subtle` | chrome, table headers, sidebar |
| `#F1F3F5` | `--surface-sunken` | wells, disabled bg, segmented track, chips |
| `#0B0D12` | `--text-primary` / `--surface-inverted` | ink, user chat bubble |
| `#51555E` | `--text-secondary` | body, labels |
| `#8A8F98` | `--text-tertiary` | meta, placeholders, timestamps |
| `#B8BDC6` | `--text-disabled` | disabled fg, "free" italic |
| `#ECEEF1` | `--border-subtle` | hairlines, dividers, default card border |
| `#D7DBE0` | `--border-strong` | input borders, dashed empty border |
| `#2F6FED` | `--accent` / `--info` / `--border-focus` | primary action, IDs, live signal |
| `#2A63D4` | `--accent-hover` | — |
| `#244FB0` | `--accent-pressed` | scheduled bar text, logo gradient end |
| `#EEF3FE` | `--accent-muted` / `--info-subtle` | selected nav, scheduled tint, copilot |
| `#DCE6FB` | (no exact token — accent tint; closest `--accent-muted`) | copilot borders, scheduled buffer, avatars |
| `#1A7F4B` | `--success` | available/confirmed |
| `#E9F6EF` | `--success-subtle` | success bg |
| `#15613A` | (darker success text, no token) | success body text |
| `#9A6B00` | `--warning` | held/proposed/low |
| `#FBF3E0` | `--warning-subtle` | warning bg |
| `#7A5500` | (darker warning text, no token) | warning body text |
| `#C8372D` | `--danger` | conflict/rejected/overdue |
| `#FBECEA` | `--danger-subtle` | danger bg |
| `#9E2B23` / `#7A2A23` | (darker danger text, no token) | conflict body text |
| `#EEF0F3`→`#F6F7F9` | `--skeleton-base`→`--skeleton-sheen` | shimmer gradient |
| radius `4/6/8/10/12/14/999` | `--radius-xs/sm/control/md/lg(≈16)/pill` | canvas uses 12 & 14 = `lg`-ish; tokens lock `lg=16` |

Fonts: sans = `'SF Pro Text','Geist',-apple-system,system-ui,sans-serif` (`--font-sans`); mono = `'Geist Mono',monospace` (`--font-mono`). Geist family is loaded from Google Fonts weights 400;450;500;550;600;700 + Geist Mono 400;450;500.

Shared keyframes declared in canvas `<style>`:
- `@keyframes spin { to { transform: rotate(360deg); } }`
- `@keyframes shimmer { 0% { background-position:-200px 0 } 100% { background-position:200px 0 } }` (skel uses `400px 100%` backgroundSize)
- `@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`
- `@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }`
- `.hatch-buffer { background-image: repeating-linear-gradient(45deg, rgba(138,143,152,.28) 0 4px, transparent 4px 8px); }`

Shared button helper `btn()`: height `36px` (sm `30px`), padding `0 16px` (sm `0 12px`), `fontSize:14px`, `fontWeight:550`, `borderRadius:8px` (`--radius-control`), gap `7px`. primary `bg #2F6FED / #fff`; secondary `bg #fff / #0B0D12 / 1px #D7DBE0`; ghost `transparent / #51555E`; danger `bg #C8372D / #fff`; disabled `bg #F1F3F5 / #B8BDC6 / 1px #ECEEF1`.

Shared `badge(fg,sub,label)`: inline-flex, gap `6px`, `bg=sub`, `border:1px solid {fg}26` (15% alpha), `borderRadius:999px`, padding `3px 10px`, `fontSize:12px`, `fontWeight:600`, `color:fg`; 6px dot of `fg` unless `noDot`.

Shell (`screen()`): fixed `1280×720` (plan boards use `h:860`), white bg. Left `sidebar()` width `212px`; `topbar()` height `56px`. **Pages in the build render INSIDE AppShell already**, so per-page work targets only the content body below `pageHeader`.

`pageHeader(crumb,title,sub,action)`: padding `24px 32px 18px`, `borderBottom:1px solid #ECEEF1`. Breadcrumb row: `fontSize:12px`, `color:#8A8F98`, gap `7px`, separator `/` in `#C4C8CE`, last crumb `#51555E`, marginBottom `7px`. Title `h1` `fontSize:24px`, `fontWeight:600`, `letterSpacing:-0.01em`. Sub `p` `fontSize:14px`, `color:#51555E`, `margin:4px 0 0`. Action sits right (flex-start, space-between, wrap).

---

## §1.1 — Login (AuthShell)

States declared in `renderVals`: **default · submitting · invalid-credentials · rate-limited**. Built by `loginShell(state)`.

### Layout
- Outer auth panel: `width:440px; height:600px; background:#F7F8FA` (`--surface-subtle`); centered; padding `32px`.
- Inner column: `width:360px`.
- Brand block (centered column, `marginBottom:24px`): logo `44px` (gradient square `linear-gradient(135deg,#2F6FED,#244FB0)`, radius `8px`, white triangle svg) → `h1` "Pyramid Backstage" `fontSize:20px; fontWeight:600; margin:14px 0 4px` → `p` "Operations sign-in" `fontSize:13px; color:#8A8F98; margin:0`.
- Card: `background:#fff; borderRadius:14px` (≈`--radius-lg`); shadow `0 1px 2px rgba(11,13,18,.04), 0 0 0 1px rgba(11,13,18,.06)` = `--elev-raised`; padding `24px`.
- Banner (above card, when present): flex gap `9px`, padding `10px 12px`, `borderRadius:8px`, marginBottom `14px`, alert icon `15px` + text `fontSize:13px; lineHeight:18px`.

### Fields (`field()`)
- Each: marginBottom `14px`. Label `fontSize:13px; fontWeight:550; marginBottom:6px`. Control: `height:40px`, padding `0 13px`, `borderRadius:8px`, `border:1px solid #D7DBE0` (error → `#C8372D`), `fontSize:14px`, text `#0B0D12` when filled else placeholder `#8A8F98`. Error line below: `fontSize:13px; color:#C8372D; marginTop:5px`.
- "Work email" prefilled `elira.hoxha@pyramid.al`.
- "Password" placeholder `••••••••`; submitting shows value `••••••••`.

### Button (`btn`, full width `height:40px; borderRadius:8px; fontSize:14px; fontWeight:600`)
- default/invalid: `background:#2F6FED; color:#fff`, label "Sign in".
- submitting: `#2F6FED` at `opacity:.9`, spinner (14px, `border:2px solid rgba(255,255,255,.4)`, `borderTopColor:#fff`, `spin 700ms`) + "Signing in…".
- rate-limited: disabled style `background:#F1F3F5; color:#B8BDC6; border:1px solid #ECEEF1`, label "Sign in".
- "Forgot password?" link: centered, marginTop `14px`, `fontSize:13px; color:#2F6FED`.

### State-specific copy + banners
- **default**: no banner. Email filled, password placeholder.
- **submitting**: no banner, spinner button, password shows dots.
- **invalid-credentials**: banner `bg:#FBECEA; border:1px solid rgba(200,55,45,.28); fg:#9E2B23` text **"Invalid email or password. Please try again."**; email field shown error (red border, empty error line) and password error line **"Invalid email or password."**.
- **rate-limited**: banner `bg:#FBF3E0; border:1px solid rgba(154,107,0,.28); fg:#7A5500` text **"Too many attempts. Try again in 4:58."**; button disabled.

---

## §3.1 — Dashboard

States: **default · loading · empty · error(data stale) · mobile·390**. Built by `dashboardBody(state)` + `mDash()`.

### Default layout (`padding:24px 32px`)
1. **Title block** (marginBottom `20px`): `h1` "Dashboard" `24px/600/-0.01em margin:0 0 4px`; `p` **"Tuesday, 22 July 2026 · 4 spaces in use"** `14px/#51555E`.
2. **KPI grid**: `grid-template-columns:repeat(4,1fr); gap:14px; marginBottom:22px`. Each `kpi()`: card `border:1px solid #ECEEF1; borderRadius:10px; padding:16px`. Label `fontSize:13px; color:#51555E; marginBottom:10px`. Value row baseline gap `8px`: number `fontSize:28px; fontWeight:600; font-mono; tabular-nums; letterSpacing:-0.02em; color:#0B0D12` (alert→`#C8372D`); trend `fontSize:12px; fontWeight:600` `#1A7F4B` up / `#C8372D` down, prefixed `▲`/`▼`. Sub line `fontSize:12px; color:#8A8F98; marginTop:3px`.
   - KPIs (literal): **"Events this week" = `12`, ▲3, "vs. last week"**; **"Spaces in use" = `4 / 6`, "now"**; **"Low-stock assets" = `2`** (alert red), **"mic, stage deck"**; **"Pending approvals" = `5`, ▼2, "awaiting manager"**.
3. **Conflict alert** (`conflictAlert`, marginBottom `18px`): `bg:#FBECEA; border:1px solid rgba(200,55,45,.28); borderRadius:10px; padding:14px 16px; flex gap:12px`. Warning-triangle icon `18px #C8372D`. Title **"1 active conflict"** `14px/600/#9E2B23`; detail **"Networking Mixer (REQ-0151) clashes with Blue Hall on 22 Jul."** `13px/#7A2A23`. Right: danger sm button **"Resolve"**.
4. **Live schedule strip header**: `13px/600/#51555E`, marginBottom `10px`. Text **"Live schedule — today"** + live pill: `11px/600/#1A7F4B`, 6px pulsing `#1A7F4B` dot (`pulse 1.8s`), label **"live"**.
5. **Schedule strip card**: `border:1px solid #ECEEF1; borderRadius:10px; padding:14px 16px`. Three lanes **Blue Hall / Orange Hall / Foyer**; each row flex, borderTop `1px solid #F1F3F5` (not first), label col `width:100px; 13px/500`; track `flex:1; height:42px; position:relative`.
   - Bars (`stripBar`): absolute `top:8px; height:26px; borderRadius:5px; padding:0 8px`; label `11px/600`. Colors `C`: conf `{bg:#E9F6EF,bd:#1A7F4B,t:#15613A}`; sch `{#EEF3FE,#2F6FED,#244FB0}`; held `{#FBF3E0,#9A6B00,#7A5500}`; cf `{#FBECEA,#C8372D,#9E2B23}`.
   - Bar data: Blue Hall **"FinTech Conf · 180"** left 45% width 28% (conf); Orange Hall **"Product Launch"** left 8% width 26% (sch); Foyer **"Gala setup (held)"** left 62% width 22% (held) + **"⚠ Mixer"** left 78% width 18% (cf).

### Loading
`padding:24px 32px`. Title skel: `skel('200px',24)` + `skel('280px',14)` (gap 8, mb 24). KPI grid 4 cards each `border 1px #ECEEF1; radius:10px; padding:16px; gap:12px` → `skel('60%',12)` + `skel('40%',28)`. Then one strip card `border; radius:10; padding:16; gap:14` × 4 `skel('100%',14)`. Skel = `linear-gradient(90deg,#EEF0F3 25%,#F6F7F9 50%,#EEF0F3 75%); backgroundSize:400px 100%; shimmer 1.4s`, radius `6px`.

### Empty
`padding:24px 32px`. `h1` "Dashboard"; `p` **"Tuesday, 22 July 2026"** (`14px/#51555E; mb:32`). Box `border:1px dashed #D7DBE0; borderRadius:12px; padding:56px 24px; text-align:center`. Icon tile `44×44; radius:11px; bg:#F1F3F5; color:#8A8F98` calendar icon `20px`. Title **"No events this week"** `16px/600/mb:6`. Body **"When requests are approved and scheduled, they'll show up here."** `14px/#8A8F98/mb:18`. Primary button **"New request"** with `+` icon (13px) left.

### Error (data-stale board — topbar pill shows stale)
`padding:24px 32px`. `h1` "Dashboard" (`mb:32`). Box `border:1px solid #ECEEF1; radius:12px; padding:56px 24px; center`. Icon tile `44×44; radius:11; bg:#FBECEA; color:#C8372D` alert `20px`. Title **"Couldn't load the dashboard"**. Body **"The connection to ops-core timed out."** Secondary button **"Retry"**.
- Stale topbar pill (from `topbar('degraded')`): `bg:#FBF3E0; border:1px solid rgba(154,107,0,.25)`, 7px `#9A6B00` dot (no pulse), text **"Stale"** `12px/600/#7A5500`. (Up to date = `#E9F6EF`, pulsing `#1A7F4B` dot, "Up to date" `#15613A`.)

### Mobile (`mDash()`, 390 wrapper)
`mobile()` shell: width `390; height:780`. Header `48px`: hamburger icon `18px #0B0D12` + title **"Backstage"** `16px/600`; right "Live" pill `bg:#E9F6EF`, 6px `#1A7F4B` dot, **"Live"** `11px/600/#15613A`. Bottom tab bar `58px`: Home(active `#2F6FED`)/Requests/Calendar/More, icons `19px`, labels `10px`.
- Body padding `16px`: `h1` "Dashboard" `22px/600/mb:16`. KPI grid `repeat(2,1fr); gap:10px; mb:16`, each card `border; radius:10; padding:12`, label `12px/#51555E/mb:6`, value `22px/600/font-mono` (alert→`#C8372D`). KPIs: Events `12`, Spaces `4/6`, Low-stock `2`(alert), Pending `5`. Conflict box `bg:#FBECEA; border; radius:10; padding:14`, triangle `18px`, **"1 conflict"** `13px/600/#9E2B23` + **"REQ-0151 clashes with Blue Hall"** `12px/#7A2A23`.

---

## §4.1 — Requests (DataTable)

States: **default · loading · empty · error**. Built by `requestsBody(state)`.

### Header
`pageHeader(['Pipeline','Requests'], 'Requests', sub, action)`. Sub = **"24 active · 5 awaiting approval"** (empty → **"No active requests"**). Action = primary **"New request"** + `+` icon.

### Filter segmented control (`padding:16px 20px 0`)
`display:inline-flex; gap:2px; padding:3px; background:#F1F3F5; borderRadius:8px`. Pills: **All · Proposed · Approved · Scheduled · Conflict**. Each `padding:5px 12px; 13px/550; borderRadius:6px`; active (All) `background:#fff; color:#0B0D12; boxShadow:0 1px 2px rgba(11,13,18,.08)`; inactive `transparent/#51555E`.

### Table (`padding:14px 20px 24px`; outer `border:1px solid #ECEEF1; borderRadius:10px; overflow:hidden`)
- **Grid columns (exact):** `160px 1fr 100px 130px 120px 120px`, gap `12px`.
- **Header row**: `padding:11px 20px; background:#F7F8FA; borderTop+Bottom:1px solid #ECEEF1; fontSize:11px; color:#8A8F98; uppercase; letterSpacing:0.04em; fontWeight:500`. Cols **Request ▾ · Organizer · Attendees(right) · Dates · Value(right) · Status**. Sort caret ` ▾` on Request only.
- **Body rows**: `padding:14px 20px; borderBottom:1px solid #ECEEF1; align-items:center; fontSize:14px`. Cells: ID `font-mono 13px color:#2F6FED`; Organizer `fontWeight:500`; Attendees `right, font-mono, tabular-nums`; Dates `#51555E font-mono 13px`; Value `right, font-mono, tabular-nums, fontWeight:550` + ` ALL` suffix (or `—`); Status = badge.
- **Mock rows (literal):**
  1. `REQ-2026-0142` · FinTech Startup Conf · `180` · 22 Jul 2026 · `154,800` · APPROVED (`#1A7F4B/#E9F6EF`)
  2. `REQ-2026-0151` · Networking Mixer · `90` · 22 Jul 2026 · `48,000` · CONFLICT (`#C8372D/#FBECEA`)
  3. `REQ-2026-0139` · Product Launch · `160` · 21 Jul 2026 · `132,000` · SCHEDULED (`#2F6FED/#EEF3FE`)
  4. `REQ-2026-0148` · Tech Meetup · `75` · 23 Jul 2026 · `39,500` · PROPOSED (`#9A6B00/#FBF3E0`)
  5. `REQ-2026-0155` · Annual Gala · `300` · 24 Jul 2026 · `—` · DRAFT (`#8A8F98/#F1F3F5`)

### Loading
5 rows, `padding:15px 20px`, each cell a `skel` (col 2 = `70%`, others `80%`, height 12).

### Empty (inside table card, `padding:64px 20px; center`)
Icon tile `44×44; radius:11; bg:#F1F3F5; color:#8A8F98` requests icon. Title **"No requests yet"** `16px/600`. Body **"New event requests will appear here as they arrive."** Primary **"New request"** + `+`.

### Error (inside table card, `padding:64px 20px; center`)
Icon tile `44×44; radius:11; bg:#FBECEA; color:#C8372D` alert. Title **"Couldn't load requests"**. Body **"The connection to ops-core timed out."** Secondary **"Retry"**.

---

## §4.2 — Request intake

States: **default (chat + form) · validation-error · submitting · success→detail**. Built by `intakeBody(state)`.

### Header
`pageHeader(['Pipeline','New request'], 'New request', sub, null)`. Sub default **"Chat with Copilot or fill the form"**; validation → **"Please fix the highlighted field"**.

### Two-column body (`display:flex; minHeight:560px`)
**Left form** (`flex:1; padding:22px 24px; maxWidth:440px`):
- Eyebrow **"Structured form"** `12px/600/#8A8F98; uppercase; letterSpacing:0.04em; mb:16`.
- `fieldRow(label,val,err,ph)`: mb `16px`; label `14px/550/mb:6`; control `height:38px; padding:0 12px; borderRadius:8px; border:1px solid #D7DBE0` (err→`#C8372D`); `fontSize:14px`; filled `#0B0D12` else placeholder `#8A8F98`. Error line `13px/#C8372D/mt:5`.
- Fields (literal): **Organizer** = "Adriana Marku"; **Expected attendees** placeholder "e.g. 180" (validation → empty + error **"Attendee count is required."**); **Event type** = "Conference"; **Preferred dates** = "22–22 Jul 2026".
- **Requirements** textarea: label `14px/550`; box `min-height:72px; padding:10px 12px; radius:8px; border:1px solid #D7DBE0; 14px/#51555E/lh:20px`, value **"Stage, podium, 2 wireless mics, hybrid streaming, coffee for 180."**
- Submit: primary **"Create request & plan"**; submitting → **"Creating…"** with spinner (14px) icon-left.

**Right chat panel** (`width:400px; borderLeft:1px solid #ECEEF1; background:#F7F9FE`):
- Header bar `padding:14px 18px; borderBottom:1px solid #DCE6FB; background:#EEF3FE`: 22px `#2F6FED` rounded sparkle tile + **"Or describe it to Copilot"** `14px/600`.
- Messages (`flex:1; padding:18px`):
  - User bubble (right): `maxWidth:80%; background:#0B0D12; color:#fff; borderRadius:12px 12px 4px 12px; padding:10px 13px; 14px/lh:20`. Text **"We need to host a 180-person fintech conference on 22 July."**
  - Assistant bubble (left): `maxWidth:82%; background:#fff; border:1px solid #E3E7EC; borderRadius:12px 12px 12px 4px; padding:10px 13px`. Text **"Got it — I've pre-filled the form. Blue Hall fits 180 theater-style. Add requirements or hit create."**
- Composer (`padding:14px 18px; borderTop:1px solid #DCE6FB`): pill `height:40px; radius:10px; bg:#fff; border:1px solid #D7DBE0; padding:0 6px 0 14px`. Placeholder **"Message Copilot…"** `14px/#8A8F98`; send button 28px `#2F6FED` radius `7px` arrow icon.

### Success
`padding:24px 32px`. `pageHeader([...],'Request created',null,null)`. Banner: `border:1px solid rgba(26,127,75,.25); background:#E9F6EF; borderRadius:12px; padding:20px; flex gap:14px; maxWidth:640px`. 36px white tile `color:#1A7F4B` check icon `18px`. Title **"REQ-2026-0156 created"** `15px/600`. Body **"Generating the operational plan…"** `13px/#15613A`. Primary **"View plan"** with chevron icon-right.

---

## §4.3 — Request detail (OperationalPlanView)

States: **feasible · not-feasible→alternatives · conflict · loading(POST /plan) · submitting approve · success→scheduled · mobile·plan**. Built by `planBody(variant)` + `mPlan()`. Boards use `screen(...,{h:860})`.

### Header (all non-loading)
`pageHeader(['Pipeline','REQ-2026-0142'], 'FinTech Startup Conference', '180 attendees · Conference · 22 Jul 2026', <status + actions>)`.
- **status** badge by variant: success→APPROVED(`#1A7F4B/#E9F6EF`); conflict→CONFLICT(`#C8372D/#FBECEA`); feasible & notfeasible→PROPOSED(`#9A6B00/#FBF3E0`).
- **actions**: feasible → primary **"Approve plan"** + secondary **"Reject"**; not-feasible → primary **"Re-plan with Orange Hall"** + secondary **"Reject request"**; submitting → primary **"Approving…"**(spinner) + secondary **"Reject"** disabled; success → APPROVED badge + text **"Scheduled · reservations confirmed"** `13px/#15613A`.

### Narrative card (`background:#F7F9FE; border:1px solid #DCE6FB; borderRadius:12px; padding:18px 20px; marginBottom:22px`)
- Row: 24px `#2F6FED` sparkle tile (radius 7) + **"Copilot plan"** `13px/600/#2F6FED`, mb 10.
- **Feasible** `p` `15px/lh:23/#0B0D12`: **"Yes — we can host this. Blue Hall seats 180 theater-style and is free 14:00–18:00 on 22 Jul. I've reserved a stage, 180 chairs and 2 wireless mics, and drafted a quote of 154,800 ALL (incl. 20% VAT). Setup and teardown tasks are assigned."** (`<strong>` on "Yes — we can host this." and "154,800 ALL").
- **Not feasible** `p`: **"Not as requested. Blue Hall is taken on 22 Jul. Orange Hall seats 180 and is free that day — or Blue Hall is open on 23 Jul. Pick an alternative below and I'll re-plan."** (`<strong>` on "Not as requested." and "Orange Hall seats 180").

### Conflict banner (conflict variant only, `marginBottom:22px`)
`background:#FBECEA; border:1px solid rgba(200,55,45,.28); borderRadius:12px; padding:18px`. Row: triangle `16px #C8372D` + `h3` **"Blue Hall is double-booked"** `16px/600` + type chip **"SPACE_DOUBLE_BOOKED"** (`font-mono 11px/600/#C8372D; bg:#fff; border:1px solid rgba(200,55,45,.25); radius:5px; padding:2px 7px`). Body `14px/#7A2A23/lh:21/mb:14`: **"A networking mixer (REQ-0151) was just confirmed for Blue Hall 18:00–20:00, overlapping your teardown buffer."** Buttons: primary **"See alternatives"** (chevron right) + secondary **"Adjust request"**.

### Alternatives (not-feasible only, `marginBottom:22px`)
Heading **"Alternatives"** `13px/600/#51555E/mb:10`. `altCard()` row flex gap `14px`:
- Card: `flex:1; minWidth:180px; border:1px solid {sel?#2F6FED:#ECEEF1}; borderRadius:10px; padding:14px; background:{sel?#F7F9FE:#fff}`. Name `15px/600` + (if sel) badge **"RECOMMENDED"** (`#2F6FED/#EEF3FE`, noDot). Capacity number `24px/600/font-mono/tabular-nums` + "theater" `12px/#8A8F98`. Note `13px/#51555E/mb:12`. Button **"Use this"** sm (primary if sel else secondary).
- Cards: **Orange Hall / 180 / "Free 22 Jul · same rate · no stage built-in" / selected(recommended)**; **Blue Hall / 220 / "Free 23 Jul · your first choice, next day" / not selected**.

### Space + Reservation cards (`display:flex; gap:20px; flex-wrap; marginBottom:22px`)
**SpaceCard** (`flex:1; minWidth:260px; border:1px solid #ECEEF1; borderRadius:12px; padding:18px`):
- Header: name `16px/600` ("Blue Hall" feasible / "Orange Hall" not), "Main floor" `13px/#8A8F98`; right availability dot `8px #1A7F4B` + **"Available"** `12px/600/#1A7F4B`.
- Capacity row (borderBottom `1px #ECEEF1; pb:12; mb:12`): `180` `30px/600/font-mono/letterSpacing:-0.02em` + "theater" `13px/#8A8F98`.
- Feature chips: **Stage · Hybrid AV · Step-free**, each `12px/#51555E; bg:#F1F3F5; radius:999px; padding:3px 9px`.

**ReservationCard** (`flex:1; minWidth:260px; border:1px solid {feasible?rgba(154,107,0,.3):#ECEEF1}; borderRadius:12px; overflow:hidden`):
- Lease banner (feasible only): `bg:#FBF3E0; padding:8px 16px; borderBottom:1px solid rgba(154,107,0,.2)`. Left **"Lease expires in"** `12px/600/#9A6B00`; right **"12:04"** `font-mono 15px/600/#9A6B00` with `pulse 1.6s` animation.
- Body `padding:16px`: title **"Reservation"** `15px/600`, **"22 Jul · 14:00–18:00"** `13px/#51555E/font-mono`; right badge HELD(`#9A6B00/#FBF3E0`) feasible / PROPOSED(`#8A8F98/#F1F3F5`) not.
- Asset rows (borderTop `1px #ECEEF1; pt:10`): each `13px` flex space-between — **Standard chair ×180 · Wireless mic ×2 · Stage deck ×1** (qty `font-mono/600` prefixed `×`).

### Quote (`border:1px solid #ECEEF1; borderRadius:12px; padding:18px; marginBottom:22px`)
Title **"Quote"** `15px/600/mb:14`. Line grid `1fr 70px 120px; gap:12px; padding:9px 0; borderBottom:1px solid #ECEEF1; 14px`. Qty col `right/font-mono/#51555E`; amount col `right/font-mono/600`.
- Items: **Blue Hall — venue rate ×1 80,000 · Standard chair ×180 21,600 · Wireless microphone ×2 7,000 · Stage deck ×1 12,000 · Setup & teardown crew ×6 8,400**.
- Totals block (`marginLeft:auto; width:260px; mt:12`): **Net 129,000 ALL**, **VAT (20%) 25,800 ALL** (`14px/#51555E`, value font-mono). **Total** row: `borderTop:2px solid #0B0D12; pt:10` — label "Total" `15px/600`; value **"154,800 ALL"** `font-mono 19px/700` with " ALL" `12px/#8A8F98/400`.

### Task board mini (`marginBottom:22px`)
Title **"Setup & teardown plan"** `15px/600/mb:14`. Two columns `flex gap:24px`:
- Lane label `12px/600/uppercase/letterSpacing:0.04em/#51555E/mb:10`.
- `tcard(title,owner,color,rel,st)`: `bg:#fff; border:1px solid {OVERDUE?rgba(200,55,45,.3):#ECEEF1}; borderRadius:10px; padding:11px 13px; mb:9`. Title `13px/500/lh:18/mb:9`. Footer: avatar 22px + relative time `12px` (`#8A8F98`, overdue `#C8372D/600`) + status badge (noDot). Status colors `sc`: TODO `#8A8F98/#F1F3F5`, IN_PROGRESS `#2F6FED/#EEF3FE`, OVERDUE `#C8372D/#FBECEA`.
- **Setup**: "Arrange 180 chairs — theater" EH(`#DCE6FB`) "in 3h" IN_PROGRESS; "Sound check — 2 wireless mics" LK(`#E9F6EF`) "in 4h" TODO.
- **Teardown**: "Strike stage & store deck" AM(`#FBF3E0`) "in 9h" TODO; "Return mics to inventory" LK "in 9h" TODO.

### Loading (POST /plan)
`pageHeader([...],'FinTech Startup Conference',null,null)`. `padding:24px 32px`. Narrative skel card `bg:#F7F9FE; border:1px solid #DCE6FB; radius:12; padding:20; gap:10; mb:22`: spinner 16px (`border:2px solid #DCE6FB; borderTopColor:#2F6FED`) + **"Copilot is building the plan…"** `14px/550/#2F6FED`, then `skel('90%',12)` + `skel('70%',12)`. Two skel cards (`flex gap:20; mb:22`), each `height:150px; border; radius:12; padding:18`: card A `skel 50%/16, 30%/28, 70%/12`; card B `skel 50%/16, 80%/12, 60%/12`.

### Mobile plan (`mPlan()`, title "Plan")
`padding:16px`. ID **"REQ-2026-0142"** `font-mono 12px/#8A8F98/mb:4`; `h1` **"FinTech Conference"** `19px/600`; PROPOSED badge mb 14. Narrative `bg:#F7F9FE; border:1px #DCE6FB; radius:10; padding:14`: "Copilot plan" `12px/600/#2F6FED` + `p` **"Yes — we can host this. Blue Hall seats 180 and is free 14:00–18:00. Quote 154,800 ALL."** Lease card `border:1px rgba(154,107,0,.3); radius:10`: banner `bg:#FBF3E0` "Lease expires" + "12:04"; body "Blue Hall" `15px/600` + "22 Jul · 14:00–18:00". Total card flex: "Total" + **"154,800 ALL"** `18px/700`. Full-width primary **"Approve plan"** `height:44px; radius:10; 15px/600`.

---

## §4.4 — Calendar / availability

States: **default · loading · empty · hover-popover**. Built by `calendarBody(state)`.

### Time axis math
`startH=8, endH=20, span=12`; `pos(h)=((h-8)/12)*100`. Ticks every 2h (08:00…20:00): vertical `borderLeft:1px solid #F1F3F5`; label above `font-mono 11px/#8A8F98` at `top:-20px; left:-14px`, formatted `(h<10?'0':'')+h+':00'`.

### Default
`pageHeader(['Pipeline','Calendar'], 'Calendar', 'Tuesday, 22 July 2026', <seg + Today>)`.
- **Segmented control** (`seg`): `inline-flex; gap:2px; padding:3px; bg:#F1F3F5; radius:8px`; pills **Day** (active `#fff; #0B0D12; shadow`) / **Week** (`#51555E`); `padding:5px 14px; 13px/550; radius:6px`. Plus secondary sm **"Today"** button.
- Content `padding:24px 32px`.
- **Legend** (`flex gap:16; mb:16`): swatches `13×11px; radius:3px` for confirmed(`#E9F6EF/#1A7F4B`), held(`#FBF3E0/#9A6B00`), scheduled(`#EEF3FE/#2F6FED`), conflict(`#FBECEA/#C8372D`), each `12px/#51555E` label; plus a hatched swatch (`.hatch-buffer; bg:#E3E7EC`) labeled **"setup / teardown"**.
- **Grid**: `position:relative; border:1px solid #ECEEF1; borderRadius:10px; paddingTop:24px; overflow:visible`.
- **Lanes** (`laneRows`): each `display:flex; borderTop:1px solid #F1F3F5` (not first). Label col `width:150px; padding:13px 16px; borderRight:1px solid #ECEEF1`: name `14px/550` + **"cap {n}"** `12px/#8A8F98/font-mono`. Track `flex:1; position:relative; height:50px`, ticks behind.
  - Lane data: **Blue Hall (cap 220)** → "FinTech Conf · 180" 14–18 setup 1.5h teardown 1h (conf); **Orange Hall (cap 180)** → "Product Launch" 9–12 setup 1h teardown .5h (sch); **Amphitheater (cap 400)** → empty (free); **Foyer (cap 120)** → "Gala setup (held)" 16–19 setup 2h teardown 1h (held) + "⚠ Mixer" 18–20 no buffers (cf).
  - Empty lane → italic **"free"** `13px/#B8BDC6/font-style:italic` at `left:12px; top:17px`.
- **Bar (`bar`)**: absolute `top:9px; height:30px`. Buffer extensions use `.hatch-buffer` filled with per-status `buf` color; main block `bg:bg; border:1px solid bd; padding:0 9px; label 11px/600/t`. Buffer `buf` colors `C`: conf `#D7EEE0`, held `#F1E4C4`, sch `#DCE6FB`, cf (none). Corner radii: outer corners `5px`, joins with buffer squared (`borderRadius` computed `(setup?0:5) (teardown?0:5) (teardown?0:5) (setup?0:5)`).

### Loading
`pageHeader([...],'Calendar',null,null)`. `padding:24px 32px`. Card `border:1px #ECEEF1; radius:10; padding:30px 16px; gap:18`; 4 rows flex gap 16: `skel('120px',14)` + `skel('70%',26)`.

### Empty
`pageHeader([...],'Calendar','Sunday, 27 July 2026',null)`. Box `border:1px dashed #D7DBE0; radius:12; padding:72px 24px; center`. Icon tile `44×44; radius:11; bg:#F1F3F5; color:#8A8F98` calendar `20px`. Title **"Nothing scheduled"** `16px/600`. Body **"No reservations on this day. All spaces are free."** Secondary **"Jump to today"**.

### Hover popover
Same as default plus `popover`: absolute `left:48%; top:62px; width:210px; bg:#fff; borderRadius:10px`; shadow `0 16px 40px -12px rgba(11,13,18,.22), 0 0 0 1px rgba(11,13,18,.08)` (≈`--elev-overlay`); padding `12px; zIndex:5`. Header: **"FinTech Conf"** `13px/600` + CONFIRMED badge (`#1A7F4B/#E9F6EF`, noDot). Body `font-mono 12px/#51555E/lh:18`: **"180 pax · theater / 14:00–18:00 / setup 12:30 · teardown 19:00"** (`<br>` separated). Secondary sm **"Open request"**. Arrow: 9px white square rotated 45° at `top:-5px; left:24px` with `boxShadow:-1px -1px 0 rgba(11,13,18,.06)`.

---

# GAP ANALYSIS

Method: each page's current `*.tsx` was read in full. "EXISTS" = present & roughly correct; "MISSING" = absent vs canvas; "WRONG" = present but diverges. Build plans cite concrete edits.

## §1.1 Login — `frontend/src/pages/Login.tsx` + `components/shell/AuthShell.tsx`

**EXISTS:** AuthShell centered card on `bg-surface-subtle`; brand `h1` `20px/600` + subtitle `13px/tertiary`; card `rounded-lg border bg-surface p-6 shadow-raised`; email + password `FormField`s; danger banner (`rounded-sm bg-danger-subtle px-3 py-2 text-[13px] text-danger`); full-width submit `Button` with `loading` + disabled when fields empty; rate-limited vs invalid copy keyed off `error.status === 429`.

**MISSING:**
- **Logo mark** — canvas brand block leads with a 44px gradient triangle logo (`linear-gradient(135deg,#2F6FED,#244FB0)`, radius 8); AuthShell has none.
- **"Operations sign-in"** subtitle wording — confirm `auth.subtitle` resolves to this; canvas uses exactly "Operations sign-in".
- **Forgot password?** link — canvas shows it centered under the button (`13px/accent`); absent in build.
- **Warning-tinted (not danger) rate-limit banner** — canvas rate-limited banner is `--warning-subtle`/`--warning` ("Too many attempts. Try again in 4:58."), but the build renders ALL errors in the single danger banner. Rate-limit should be a warning banner, distinct from invalid (danger).
- **Field-level error styling on invalid** — canvas marks the email field red-bordered (empty error line) and password field error "Invalid email or password."; build only shows the top banner.

**WRONG:**
- **Banner radius** — build uses `rounded-sm` (6px); canvas banner is `borderRadius:8px` (`--radius-control`). Card is `rounded-lg` in build (16) vs canvas `14px` (the canvas value is between sm and lg; tokens lock `lg=16` so keep `rounded-lg` but note divergence).
- **Single banner for both error classes** — needs to branch: 429 → warning banner; other → danger banner + field errors.

**Build plan:**
1. Add the logo mark to `AuthShell` brand block (28–44px gradient triangle; reuse the AppShell logo component if one exists).
2. Add a "Forgot password?" centered link below the form (`text-[13px] text-accent`, keyed `auth.forgotPassword`).
3. In `Login.tsx`, split the banner: `error?.status===429` → `<p className="rounded-control bg-warning-subtle px-3 py-2 text-[13px] text-warning">`; else danger banner. Pass `invalid`/`error` into the email+password `FormField`/`Input` so invalid-credentials shows red borders + the password error line.
4. Verify `auth.subtitle` = "Operations sign-in" in `i18n/{al,en}.json`.

## §3.1 Dashboard — `frontend/src/pages/Dashboard.tsx`

**EXISTS:** PageHeader + "New request" primary; 4-up KPI grid (`grid-cols-2 lg:grid-cols-4`) via `KPIStat` (label/value/delta/loading; mono 28px tabular value; up/down arrow trend); a recent-activity Card with rows (title `14px/550`, organizer·attendees `12px/tertiary`, StatusBadge); empty state for no events.

**MISSING (large):**
- **Date subtitle** — canvas title sub "Tuesday, 22 July 2026 · 4 spaces in use"; build PageHeader has no `subtitle`.
- **KPI sub-lines & alert coloring** — canvas KPIs carry a `sub` line ("vs. last week", "now", "mic, stage deck", "awaiting manager") and the Low-stock value turns `--danger`. `KPIStat` supports `hint` but Dashboard passes none; no alert/danger value variant exists.
- **Conflict alert banner** — the prominent `--danger-subtle` "1 active conflict · Networking Mixer (REQ-0151) clashes with Blue Hall on 22 Jul." with a danger **"Resolve"** button is entirely absent.
- **Live schedule strip** — the whole horizontal schedule (Blue/Orange/Foyer lanes with colored status bars + the pulsing "live" pill + "Live schedule — today" header) is absent. Build shows a generic recent-requests list instead.
- **Loading skeleton parity** — build relies on `KPIStat loading` only; canvas loading also skeletons the title (`200/24` + `280/14`) and the strip card (4 × `100%/14`).
- **Error state** — canvas has a dedicated "Couldn't load the dashboard / The connection to ops-core timed out. / Retry" card; build has no dashboard error branch.
- **Stale-data chrome** — canvas error board flips the topbar pill to "Stale" warning; that lives in AppShell, not this page, but the page should still tolerate the stale signal.
- **Mobile** — canvas `mDash` (2-up KPI grid, conflict box, bottom-tab shell). Responsive handled by shell, but the 2-up KPI at 390 already matches (`grid-cols-2`).

**WRONG:**
- The recent-activity list is a reasonable stand-in but does NOT match the canvas, which has **no** plain activity list on the dashboard — it has the live schedule strip + conflict alert. Realign to the canvas composition.
- `KPIStat` label is `uppercase tracking-[0.02em] text-tertiary 12px`; canvas KPI label is `13px/#51555E` (secondary, not uppercase). Minor; reconcile.

**Build plan:**
1. Add `subtitle` to PageHeader: localized "Tuesday, 22 July 2026 · 4 spaces in use" (derive from `Date` + spaces-in-use stat).
2. Extend `KPIStat` props: `hint` already exists — wire the four hints; add an `alert?:boolean` that switches the value to `text-danger`. Pass `alert` for low-stock.
3. Build a `DashboardConflictAlert` block (`rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3.5`, triangle 18px, title `14px/600 text-danger`, detail `13px`, danger sm "Resolve" button → `/conflicts`). Render only when `conflicts.length`.
4. Build a `LiveScheduleStrip` (or reuse a mini `AvailabilityTimeline`) with the "Live schedule — today" header + pulsing live pill; lanes with status-colored bars. Replace the recent-requests list.
5. Add `isError`/`refetch` → ErrorState card matching copy.
6. Skeleton the title + strip during loading, not just KPIs.

## §4.1 Requests — `frontend/src/pages/Requests.tsx`

**EXISTS:** PageHeader + primary "New request"; search `Input` + status `Select` filters; `Table`/`THead`/`TH`/`TR`/`TD`; columns Title/Organizer/Attendees(right)/Type/Dates/Status; ID is the row click target; loading (`LoadingBlock`), error (`ErrorState` + retry), empty (`EmptyState`) branches; attendees `font-mono tabular-nums`, dates `font-mono 12px`.

**MISSING / WRONG vs canvas:**
- **Column set differs** — canvas columns are **Request(ID) · Organizer · Attendees · Dates · Value · Status** with a sortable Request column (caret ▾). Build shows **Title** (not the mono ID) as col 1 and adds a **Type** column; it has **no Value column**. Add a mono ID first column (`text-accent`) and a **Value** column (`font-mono tabular-nums 550` + " ALL"). The canvas leads with the REQ-ID, not the title — the title appears as Organizer? No: canvas col2 "Organizer" holds the event name ("FinTech Startup Conf"). Reconcile naming: canvas treats col1=ID, col2=event name.
- **Filter UI is a Select dropdown, not the segmented pill** — canvas uses a segmented control (All · Proposed · Approved · Scheduled · Conflict) in `bg-surface-sunken` track. Build uses a free-text search + a native `<select>`. Replace (or augment) with the `SegmentedControl` matching the 5 canvas tabs; note canvas has **no free-text search** on this page (search lives in the topbar).
- **Sub-line** — canvas header sub "24 active · 5 awaiting approval" (empty → "No active requests"). Build PageHeader has no subtitle.
- **Status header label** — build line 57 `t('status.DRAFT').replace(/.*/, 'Status')` is a hack; use a proper `requests.statusHeader` key. Canvas header literally reads "STATUS" (uppercase via the `11px uppercase` header style).
- **Table chrome** — canvas table header is `bg-surface-subtle`, `11px uppercase tracking-0.04em #8A8F98`, with top+bottom hairlines; verify `THead`/`TH` match (`letterSpacing:0.04em`, not 0.02).

**Build plan:**
1. Add mono ID column 1 (`font-mono text-[13px] text-accent`) and a **Value** column (`text-right font-mono tabular-nums font-[550]` + " ALL" / "—"). Drop or relocate the Type column to match the 6-col canvas grid `160px 1fr 100px 130px 120px 120px`.
2. Replace the `<Select>` status filter with a `SegmentedControl` (All/Proposed/Approved/Scheduled/Conflict); remove the on-page search Input (topbar owns it).
3. Add header subtitle "24 active · 5 awaiting approval".
4. Replace the `replace(/.*/,'Status')` hack with `t('requests.statusHeader')`.

## §4.2 Intake — `frontend/src/pages/Intake.tsx`

**EXISTS:** PageHeader (title + subtitle); a structured form Card with title/organizer/attendees/email/phone/eventType/layout/start/end/notes/av/catering; FormField + Input/Select/Textarea; field-error wiring via `err.fieldError`; submit `loading` → "Creating…"; cancel ghost; navigate to `/requests/:id` on success.

**MISSING (large):**
- **Two-pane chat + form layout** — canvas §4.2 is a side-by-side **structured form (left, maxWidth 440) + Copilot chat panel (right, 400px, `bg #F7F9FE`)**. Build is a single centered form card; the entire right chat column (header "Or describe it to Copilot", the user/assistant bubbles, the composer) is absent.
- **"Structured form" eyebrow** — `12px/600 uppercase` label above the fields.
- **Success state screen** — canvas success is a dedicated green banner "REQ-2026-0156 created / Generating the operational plan… / View plan". Build instead navigates straight to detail on success (acceptable, but the canvas intermediate success card is missing; at minimum the success→detail transition is fine, but consider the interstitial).
- **Submitting copy** — build "Creating…" matches; ensure spinner icon-left present (Button `loading` handles it).
- **Validation-error subtitle** — canvas flips header sub to "Please fix the highlighted field"; build keeps the static subtitle.

**WRONG:**
- `fieldError` maps ALL field errors to the generic `error.generic` string; canvas shows specific copy ("Attendee count is required."). Use per-field messages.

**Build plan:**
1. Restructure to `flex` two-column: keep the form left (cap width ~440), add a right `CopilotPanel`-style chat column (`border-l bg-[--copilot surface] w-[400px]`) with the header, two seeded bubbles, and a composer. Behind a feature flag if the AI isn't wired — but the layout must match.
2. Add the "Structured form" eyebrow above fields.
3. On `validation` error, swap subtitle to "Please fix the highlighted field".
4. Replace generic field errors with field-specific i18n keys (e.g. `field.expectedAttendees.required`).
5. (Optional) Add the success interstitial card before navigating, or keep direct nav.

## §4.3 RequestDetail (OperationalPlanView) — `frontend/src/pages/RequestDetail.tsx`

**EXISTS:** PageHeader (title + "organizer · N attendees · type" subtitle) with StatusBadge + Approve/Reject actions; MANAGER/ADMIN gate with a disabled+tooltip Approve for viewers; Reject dialog with reason textarea (≥3 chars); ConflictBanner when `conflicts.length`; feasible green strip + no-reservation neutral strip; ReservationCard (space/window/lease-when-HELD/assets), QuoteTable, TaskBoard, AuditTimeline; loading (`LoadingBlock`) + error states; 409 approve error re-renders a ConflictBanner.

**MISSING vs canvas:**
- **Copilot narrative card** — the `#F7F9FE / #DCE6FB` "Copilot plan" card with the feasible/not-feasible prose is the headline of the canvas and is **absent**. Build only shows a one-line green "feasible" strip. Add the full narrative card (sparkle tile + "Copilot plan" + the long feasible/not-feasible paragraph).
- **SpaceCard** — canvas shows a dedicated SpaceCard (name, "Main floor", capacity `30px` mono, feature chips, availability dot). Build has no SpaceCard — only the reservation card. Add it.
- **Alternatives block** (not-feasible variant) — the two `altCard`s (Orange Hall recommended / Blue Hall next-day) with "Use this" buttons are absent. Add for the not-feasible path.
- **Lease countdown styling** — canvas shows a pulsing `12:04` mono countdown in a `--warning-subtle` banner atop the reservation card; build shows lease as a static `Row` "leaseEnds" datetime. Add the warning lease banner with a live countdown.
- **Conflict type chip** — canvas conflict banner header carries a mono "SPACE_DOUBLE_BOOKED" chip + `h3` "Blue Hall is double-booked" + "See alternatives"/"Adjust request" actions. Verify `ConflictBanner` renders the type chip prominently (it renders `t(conflict.{type})` as a `13px/550` label, not the mono pill) and the "See alternatives" primary action (build only passes an "Adjust" secondary).
- **Task board lanes SETUP/TEARDOWN** — verify `TaskBoard` renders two labeled lanes matching canvas; the canvas mini cards include relative time + status badge.
- **Quote total emphasis** — canvas Total is `19px/700` mono with `border-top:2px solid #0B0D12`; `QuoteTable` uses `16px/600` and a 1px border-top. Bump to match.
- **Submitting actions** — canvas submitting shows "Approving…" primary + disabled "Reject"; build disables only via `loading` — confirm Reject becomes disabled while approving.
- **Success header** — canvas success shows APPROVED badge + "Scheduled · reservations confirmed" text in the header; build just shows the StatusBadge.
- **Mobile plan** — `mPlan` composition (ID, title, PROPOSED, narrative, lease card, total card, full-width Approve). Build is desktop two-column; ensure it stacks acceptably at 390.

**WRONG:**
- Layout is a 2-col grid `1.6fr 1fr` (audit in the right rail). Canvas §4.3 is a **single vertical scroll**: narrative → conflict/alternatives → Space+Reservation row → Quote → Tasks. Audit is a separate page (§7.1) in canvas, not in the right rail of the plan. Consider moving audit out or keeping it as an addition (note the divergence).

**Build plan:**
1. Add a `PlanNarrative` card at top (copilot surface, sparkle, feasible/not-feasible prose) driven by `reservation`/`conflicts` presence.
2. Add a `SpaceCard` to the plan (name, floor, capacity mono 30px, feature chips, availability dot) alongside the reservation card in a `flex gap-5` row.
3. Add the lease-countdown warning banner (pulsing mono countdown) to the reservation card when `status==='HELD' && expiresAt`.
4. Add the not-feasible **Alternatives** block (alt cards + "Use this" → re-plan).
5. In ConflictBanner usage, pass a primary **"See alternatives"** action + the **"Adjust request"** secondary; ensure the mono type chip renders.
6. Bump QuoteTable Total to `19px/700` + `border-t-2 border-text-primary`.
7. Add the success-header text and submitting Reject-disabled.
8. Reconsider the right-rail audit vs single-scroll canvas layout.

## §4.4 Calendar — `frontend/src/pages/Calendar.tsx`

**EXISTS:** PageHeader + a date `Input`; per-space rows with name + a single full-width free/busy bar (green `available` / red `unavailable`); loading via `LoadingBlock`.

**MISSING (almost everything):**
- **Time axis** — canvas is a real horizontal timeline (08:00–20:00, 2h ticks, mono labels). Build has a binary full-width bar with no time positioning.
- **Status-colored reservation bars** — canvas places bars by start/end with 4 status colors (confirmed/held/scheduled/conflict). Build only knows available/unavailable.
- **Buffer (setup/teardown) hatched zones** — the signature `.hatch-buffer` extensions are absent.
- **Legend** — the swatch legend (confirmed/held/scheduled/conflict + hatched setup/teardown) is absent.
- **Day/Week segmented control + "Today" button** — absent.
- **Capacity sublabel** ("cap 220") per lane — absent.
- **Empty state** — canvas "Nothing scheduled / No reservations on this day… / Jump to today" dashed card is absent (build only has a loading branch; no empty/hover).
- **Hover popover** — the per-reservation popover (request name + CONFIRMED badge + "180 pax · theater / 14:00–18:00 / setup 12:30 · teardown 19:00" + "Open request") is absent.
- **Title subtitle** "Tuesday, 22 July 2026" — absent.

**WRONG:**
- The whole surface is a placeholder ("a light availability view") and does not implement the `ScheduleCalendar`/`AvailabilityTimeline` the canvas (and DESIGN_SYSTEM §4) specifies. This is the largest single gap in the assignment.

**Build plan:**
1. Build a real `ScheduleCalendar`/`AvailabilityTimeline`: `pos(h)=((h-8)/12)*100`, ticks every 2h with mono labels, lane rows (150px label col + relative track `height:50px`).
2. Render reservation bars positioned by window, colored by status via the `C` map; render setup/teardown as `.hatch-buffer` extensions (define the keyframe-less hatch class in CSS).
3. Add the legend, Day/Week SegmentedControl, "Today" button, and per-lane "cap N" sublabel.
4. Add empty ("Nothing scheduled" / "Jump to today") and hover-popover states (overlay `--elev-overlay`, arrow, CONFIRMED badge, mono detail block, "Open request").
5. Add the "Tuesday, 22 July 2026" subtitle.

---

## Cross-cutting token/font notes for the build

- The canvas hard-codes darker status text (`#15613A` success, `#7A5500` warning, `#9E2B23`/`#7A2A23` danger) and `#DCE6FB` (accent tint) and `#E0A300` (held meter) and `#E3E7EC` (avatar bg) that have **no exact token**. Either add tokens (`--success-text`, `--warning-text`, `--danger-text`, `--accent-tint`) or use the closest existing (`--success`/`--warning`/`--danger` for text, `--accent-muted` for tints). Flag in build for consistency.
- Radius: canvas uses `12px` and `14px` for cards/banners; tokens lock `--radius-md=10`, `--radius-lg=16`. Map canvas-12 → `--radius-md`(10) or a new `--radius-12`; canvas-14 → `--radius-lg`(16). Pick one convention and apply globally.
- All buttons in canvas are `borderRadius:8px` = `--radius-control`; confirm the `Button` primitive uses `rounded-control` (8), not `rounded-sm`/`md`.
- Mono numerals everywhere comparisons happen (`font-variant-numeric:tabular-nums`) — already used in KPIStat/QuoteTable; ensure Requests Value + Calendar tick labels + lease countdown all set it.
- Live signals (freshness pill, "live" dot, lease countdown) use `pulse`/`spin` animations from the canvas `<style>`; ensure those keyframes exist in `globals.css`.

# Design Spec Digest — Command Components (§3.1–§3.14)

Source of truth: `CLAUDE_DESIGN/Command.dc.html` (inline React in `<script type="text/x-dc">`).
Token mapping: `frontend/src/styles/tokens.css`. Every raw hex below is followed by its semantic token.
Current impl audited: `frontend/src/components/command/*` + overlapping `frontend/src/components/ui/*`.

## Token quick-map (hex → token) used throughout this canvas

| Raw hex | Token | Notes |
|---|---|---|
| `#FFFFFF` | `--surface` / `--text-inverted` / `--text-on-accent` | white |
| `#F7F8FA` | `--surface-subtle` | frame `bg` for several artboards, table header, audit reason well |
| `#F1F3F5` | `--surface-sunken` | chips bg, meter track, segmented-control track, badge neutral bg |
| `#0B0D12` | `--text-primary` / `--surface-inverted` | ink, user chat bubble bg |
| `#51555E` | `--text-secondary` | body, labels |
| `#8A8F98` | `--text-tertiary` | meta, mono ids in neutral, placeholders |
| `#ECEEF1` | `--border-subtle` | hairlines, card borders, dividers |
| `#D7DBE0` | `--border-strong` | secondary-button border, dashed empty borders, audit reason rule |
| `#2F6FED` | `--accent` / `--info` | primary btn, links, scheduled, copilot icon |
| `#2A63D4` | `--accent-hover` | (not in canvas, token only) |
| `#244FB0` | `--accent-pressed` | scheduled bar text `#244FB0` |
| `#EEF3FE` | `--accent-muted` / `--info-subtle` | info/scheduled subtle bg, copilot header bg |
| `#1A7F4B` | `--success` | available/confirmed/done |
| `#E9F6EF` | `--success-subtle` | success badge bg |
| `#9A6B00` | `--warning` | held/low-stock/proposed/blocked |
| `#FBF3E0` | `--warning-subtle` | warning badge bg |
| `#C8372D` | `--danger` | conflict/overdue/rejected/out-of-stock |
| `#FBECEA` | `--danger-subtle` | danger badge bg |
| radius `4` | `--radius-xs` | bubble tail corner |
| radius `6` | `--radius-sm` | buttons, timeline bars, chips small |
| radius `7` | (no token; closest `--radius-sm`=6) | conflict-banner warning icon tile |
| radius `8` | (no token; between sm/md) | btn radius in canvas (note mismatch below) |
| radius `10` | `--radius-md` | cards/tables/popovers/well |
| radius `11` | (no token; ~`--radius-md`) | EmptyState icon tile |
| radius `12` | (no token; between md/lg) | banner/card/copilot bubble outer |
| radius `14` | (no token; ~`--radius-lg`16) | frame card, copilot shell |
| radius `999` | `--radius-pill` | pills, dots, meters |
| shadow `0 1px 2px rgba(11,13,18,.04), 0 0 0 1px rgba(11,13,18,.06)` | `--elev-raised` | frame cards |
| shadow `0 16px 40px -12px rgba(11,13,18,.22) ...` | ≈`--elev-overlay` (canvas uses .22 alpha vs token .18) | timeline popover |

> NOTE on radii: the canvas uses several **non-token radii** (7, 8, 11, 12, 14). The frontend should map to nearest tokens: btn 8→`--radius-sm`(6) is the current impl choice; cards 12/14→`--radius-lg`(16). Flag these as deliberate token-snapping, not 1:1 px. The shared `btn()` helper uses **`borderRadius:8px`** which is between sm(6) and md(10).

---

## Shared frame chrome (every §3.x artboard)

- Page bg `#DBDEE3` (canvas gray, not a token — it's the export backdrop only).
- Frame wrapper: `marginBottom:44px`. Header row: `marginBottom:14px`, `display:flex`, `align-items:baseline`, `gap:10px`, `flex-wrap:wrap`.
  - Section number: Geist Mono, **12px**, `#8A8F98`/`--text-tertiary`.
  - Title `h2`: **19px / 26px line-height / weight 600**, `#0B0D12`/`--text-primary`.
  - Sub note: **13px**, `#8A8F98`/`--text-tertiary`.
- Frame body card: `background` = `#fff`/`--surface` (or `#F7F8FA`/`--surface-subtle` when `opts.bg` set), `borderRadius:14px` (≈`--radius-lg`), `box-shadow: 0 1px 2px rgba(11,13,18,.04), 0 0 0 1px rgba(11,13,18,.06)` (`--elev-raised`), `padding:28px` (default).
- `label()` helper (the small uppercase tag above sub-groups): Geist Mono, **11px**, `#8A8F98`/`--text-tertiary`, `text-transform:uppercase`, `letter-spacing:0.04em`, `margin-bottom:12px`.

### Shared `btn()` helper (used in many artboards)
- `display:inline-flex`, `align-items:center`, `gap:7px`, height **34px** (md) / **30px** (`opts.sm`), padding `0 14px` (md) / `0 12px` (sm), font **14px** (md) / **13px** (sm), `font-weight:550`, `border-radius:8px`, `white-space:nowrap`.
- primary: bg `#2F6FED`/`--accent`, text `#fff`/`--text-on-accent`, border transparent.
- secondary: bg `#fff`/`--surface`, text `#0B0D12`/`--text-primary`, border `1px solid #D7DBE0`/`--border-strong`.
- ghost: transparent bg, text `#0B0D12`/`--text-primary`.
- danger: bg `#C8372D`/`--danger`, text `#fff`/`--text-on-accent`.
- Optional `iconLeft`/`iconRight` (13px stroke-1.5 svg).

### Shared `badge()` helper (the StatusBadge primitive)
- `display:inline-flex`, `align-items:center`, `gap:6px`, bg = subtle color, **border `1px solid {fg}26`** (i.e. fg hex at 0x26≈15% alpha), `border-radius:999px`/`--radius-pill`, padding **`3px 10px`**, font **12px / weight 600**, color = fg, `white-space:nowrap`.
- Dot (unless `opts.noDot`): `6px × 6px` pill, bg = fg.
- This is THE canonical badge shape. (Current `ui/Badge.tsx` differs — see gap analysis.)

### Shared `avatar()` helper
- Default size **28px** (timeline/audit use 28; tasks use 24). `border-radius:999px`, bg `#E3E7EC` (or per-row tint), text `#51555E`/`--text-secondary`, font `size*0.4` weight 600, `box-shadow: inset 0 0 0 1px rgba(11,13,18,.06)`. Avatar tints used: `#DCE6FB` (blue), `#E9F6EF` (green/`--success-subtle`), `#FBF3E0` (amber/`--warning-subtle`), `#EEF3FE` (info/`--accent-muted`), `#F1F3F5` (gray/`--surface-sunken`).

---

## §3.1 — StatusBadge
**sub:** "dot + label · never color-only · mono for related ID"

### Layout
Four labelled groups stacked, each a `label()` then a flex-wrap row (`gap:10px`, `margin-bottom:8px`). 20px spacer divs between groups.

### Groups & exact badges (fg / subtle-bg / label)
1. **Request lifecycle** (`label('Request lifecycle')`):
   - DRAFT — `#8A8F98`/`--text-tertiary` on `#F1F3F5`/`--surface-sunken` (neutral)
   - PROPOSED — `#9A6B00`/`--warning` on `#FBF3E0`/`--warning-subtle`
   - APPROVED — `#1A7F4B`/`--success` on `#E9F6EF`/`--success-subtle`
   - SCHEDULED — `#2F6FED`/`--info` on `#EEF3FE`/`--info-subtle`
   - COMPLETED — `#1A7F4B`/`--success` on `#E9F6EF`/`--success-subtle`
   - REJECTED — `#C8372D`/`--danger` on `#FBECEA`/`--danger-subtle`
2. **Reservation**: HELD (`#9A6B00`/`#FBF3E0`), CONFIRMED (`#1A7F4B`/`#E9F6EF`), RELEASED (`#8A8F98`/`#F1F3F5`).
3. **Task**: TODO (`#8A8F98`/`#F1F3F5`), IN PROGRESS (`#2F6FED`/`#EEF3FE`), DONE (`#1A7F4B`/`#E9F6EF`), BLOCKED (`#9A6B00`/`#FBF3E0`), OVERDUE (`#C8372D`/`#FBECEA`).
4. **Conflict + with related ID (mono)**: CONFLICT (`#C8372D`/`#FBECEA`) with dot; then a `noDot` CONFLICT badge followed by a mono `REQ-0151` in `#8A8F98`/`--text-tertiary` at 13px Geist Mono, the two wrapped in an inline-flex `gap:6px`.

> Token-mapping note: canvas BLOCKED = **warning** (`#9A6B00`). Current impl maps BLOCKED→`danger`. WRONG — see gap.

### Typography
12px / weight 600, sans. Mono id 13px Geist Mono.

---

## §3.2 — ConflictBanner  ⭐ signature moment
**sub:** "type · detail · window · IDs · over-allocation meter" · frame `bg:#F7F8FA`/`--surface-subtle`.

Three stacked variants (`display:flex; flex-direction:column; gap:20px`), each preceded by a `label()`:
1. `SPACE_DOUBLE_BOOKED`
2. `ASSET_OVERALLOCATED — with requested / available meter`
3. `SETUP_WINDOW_OVERLAP`

### Banner container (`conflictBanner()`)
- bg `#FBECEA`/`--danger-subtle`, border `1px solid rgba(200,55,45,.28)` (danger @ ~28%), `border-radius:12px` (≈`--radius-lg`), `padding:20px`.

### Header row (`gap:10px`, flex-wrap)
- **Warning-icon tile**: `26px × 26px`, `border-radius:7px`, bg `#fff`/`--surface`, `box-shadow: inset 0 0 0 1px rgba(200,55,45,.2)`, centered, icon color `#C8372D`/`--danger`. Icon path = warning triangle `M8 5v3.5M8 11v.2M8 1.5 1 13.5h14L8 1.5Z` at 15px.
- **Title h3**: **16px / weight 600**, `#0B0D12`/`--text-primary`. Copy per variant:
  - "Blue Hall is double-booked"
  - "Not enough wireless microphones"
  - "Setup overlaps another teardown"
- **Type chip**: Geist Mono, **11px / weight 600**, color `#C8372D`/`--danger`, bg `#fff`/`--surface`, border `1px solid rgba(200,55,45,.25)`, `border-radius:5px`, padding `2px 7px`. Text = the literal conflict type (e.g. `SPACE_DOUBLE_BOOKED`).

### Detail paragraph
- **14px / 21px line-height**, color **`#7A2A23`** (a dark-danger ink, NOT a token — danger-on-subtle text). `margin:12px 0 0`. Exact copy:
  - SPACE: "Blue Hall is already confirmed for the FinTech Startup Conference during this window. Two events cannot occupy the same space."
  - ASSET: "This plan needs 6 wireless mics, but only 2 are free in the requested window — 4 are held by other events."
  - SETUP: "Your 12:30 setup for Blue Hall starts before the previous event's teardown finishes at 13:00. Turnaround needs 30 more minutes."

### Meta row (`gap:28px`, flex-wrap, `margin-top:14px`)
- Two columns, each: a tiny label **11px** `#A6564E` (muted danger label ink, not a token) uppercase `letter-spacing:0.04em` `margin-bottom:4px`; then value.
  - "Colliding window" → value Geist Mono **13px** `#0B0D12`/`--text-primary` `tabular-nums`. Copy e.g. "22 Jul 2026 · 14:00–18:00" / "22 Jul 2026 · 12:30–13:00".
  - "Conflicting requests" → row of id chips (`gap:6px`): Geist Mono **12px**, `#C8372D`/`--danger`, bg `#fff`/`--surface`, border `1px solid rgba(200,55,45,.25)`, `border-radius:5px`, padding `2px 7px`. Ids: `['REQ-0142','REQ-0151']`, `['REQ-0142','REQ-0139']`, `['REQ-0142','REQ-0140']`.

### Over-allocation meter (ASSET_OVERALLOCATED only) ⭐
- Container: `margin-top:16px`, bg `#fff`/`--surface`, `border-radius:10px`/`--radius-md`, border `1px solid rgba(200,55,45,.2)`, `padding:14px`.
- Top line (`justify-content:space-between`, **13px**, `margin-bottom:8px`):
  - left: meter label `#51555E`/`--text-secondary` → "Wireless microphone".
  - right (Geist Mono, `tabular-nums`): "**requested 6**" in `#C8372D`/`--danger` weight 600, then " / available 2 of 8" in `#8A8F98`/`--text-tertiary`.
- Bar: `position:relative`, height **10px**, `border-radius:999px`, bg `#F1F3F5`/`--surface-sunken`, `overflow:hidden`.
  - **Available segment**: absolute left:0, width `avail/total*100`% = 25%, solid `#1A7F4B`/`--success`.
  - **Over-allocation hatch**: absolute `left: availPct%`, width `(reqPct - availPct)%`, bg `rgba(200,55,45,.18)`, **`borderLeft:1px dashed #C8372D`**/`--danger`, and class **`.hatch-danger`** = `repeating-linear-gradient(45deg, rgba(200,55,45,.35) 0 4px, transparent 4px 8px)`. `reqPct = min(100, req/total*100)`.
- Meter mock: `{ label:'Wireless microphone', req:6, avail:2, total:8 }`.

### Action row (`gap:10px`, `margin-top:18px`)
- Primary btn "See alternatives" with right-chevron icon (`M6 3.5 10.5 8 6 12.5` 13px white).
- Secondary btn "Adjust request".

---

## §3.3 — AvailabilityTimeline / ScheduleCalendar  ⭐ hatched buffers
**sub:** "bars by status · hatched setup/teardown buffers · hover popover"

### Axis math
- `startH=8`, `endH=20`, `span=12`. `pos(h) = (h-8)/12*100`%. Hour ticks every 2h (8,10,…,20).

### Legend (above grid, `gap:18px`, `margin-bottom:18px`, `align-items:center`)
- Four swatches `confirmed / held / scheduled / conflict`: each a `14px × 12px` chip `border-radius:3px`, bg = status `bg`, border `1px solid` status `border`; label **12px** `#51555E`/`--text-secondary`.
- Plus a "setup / teardown buffer" item: a `.hatch-buffer` chip (`14×12`, radius 3, bg `#E3E7EC`).

### Status color sets (bar bg / border / text / buffer-bg)
| status | bg | border | text | bufBg |
|---|---|---|---|---|
| confirmed | `#E9F6EF`/`--success-subtle` | `#1A7F4B`/`--success` | `#15613A` | `#D7EEE0` |
| held | `#FBF3E0`/`--warning-subtle` | `#9A6B00`/`--warning` | `#7A5500` | `#F1E4C4` |
| scheduled | `#EEF3FE`/`--info-subtle` | `#2F6FED`/`--info` | `#244FB0`/`--accent-pressed` | `#DCE6FB` |
| conflict | `#FBECEA`/`--danger-subtle` | `#C8372D`/`--danger` | `#9E2B23` | `#F3D6D2` |
> `text` and `bufBg` colors are darker derived tints — NOT direct tokens; carry as literals.

### Grid container
- `position:relative`, border `1px solid #ECEEF1`/`--border-subtle`, `border-radius:10px`/`--radius-md`, `overflow:visible`, `padding-top:24px` (room for hour labels).

### Lane row (per space)
- `display:flex`, `border-top: 1px solid #F1F3F5`/`--surface-sunken` (except first lane = none).
- **Left gutter**: width **150px**, `padding:14px 16px`, `border-right:1px solid #ECEEF1`/`--border-subtle`.
  - Name: **14px / weight 550** `--text-primary`.
  - Capacity: **12px** `#8A8F98`/`--text-tertiary` Geist Mono → "cap 220".
- **Lane track**: `flex:1`, `position:relative`, height **52px**. Contains the hour-tick verticals + bars (or "free").
- Hour ticks: vertical `border-left:1px solid #F1F3F5`/`--surface-sunken`; label above (`top:-20px`, `left:-14px`) Geist Mono **11px** `#8A8F98`/`--text-tertiary`, e.g. "08:00".

### Lanes & mock data
1. **Blue Hall** (cap 220): bar "FinTech Startup Conf · 180", `start:14 end:18 setup:1.5 teardown:1`, color **confirmed**.
2. **Orange Hall** (cap 180): bar "Product Launch · 160", `start:9 end:12 setup:1 teardown:0.5`, color **scheduled**.
3. **Amphitheater** (cap 400): no bars → renders italic "free" (`#B8BDC6`, 13px, `font-style:italic`, abs `left:12px top:18px`).
4. **Foyer** (cap 120): two bars —
   - "Held — Gala setup", `start:16 end:19 setup:2 teardown:1`, color **held**.
   - "⚠ Networking mixer", `start:18 end:20`, color **conflict** (no buffers).

### Bar rendering (`bar()`) ⭐ buffer geometry
- Outer wrapper positioned at `left:pos(start-setup)%`, width spans `pos(end+teardown) - pos(start-setup)`%, `top:8px`, height **34px**.
- **Setup buffer** (if `setup`): absolute left:0, height 100%, width = setup fraction of the wrapper, class **`.hatch-buffer`**, bg = `c.bufBg`, `border-radius:6px 0 0 6px` (rounded only on outer-left).
- **Main block**: positioned after the setup buffer, width = event fraction, bg `c.bg`, border `1px solid c.border`, corner radius is `0` on any side touching a buffer and `6px` on free sides (`(setup?0:6) (teardown?0:6) (teardown?0:6) (setup?0:6)`). `display:flex; align-items:center; padding:0 10px; overflow:hidden`. Label inside: **12px / weight 600**, color `c.text`, `white-space:nowrap`.
- **Teardown buffer** (if `teardown`): absolute right:0, class `.hatch-buffer`, bg `c.bufBg`, `border-radius:0 6px 6px 0`.
- `.hatch-buffer` = `repeating-linear-gradient(45deg, rgba(138,143,152,.28) 0 4px, transparent 4px 8px)` (gray hatch over `bufBg`). THIS IS THE BUFFER-ZONE RENDER.

### Hover popover (demo, statically placed)
- Abs `left:46% top:56px`, width **210px**, bg `#fff`/`--surface`, `border-radius:10px`/`--radius-md`, **shadow `0 16px 40px -12px rgba(11,13,18,.22), 0 0 0 1px rgba(11,13,18,.08)`** (≈`--elev-overlay`, alpha .22 vs token .18), `padding:12px`, `z-index:5`.
- Header: title "FinTech Startup Conf" (**13px / weight 600**) + CONFIRMED badge (`noDot`, `#1A7F4B`/`#E9F6EF`).
- Body: Geist Mono **12px / 18px lh** `#51555E`/`--text-secondary`: "180 pax · theater" / "14:00–18:00" / "setup 12:30 · teardown 19:00" (br-separated).
- **Tail/arrow**: `9px × 9px` `#fff` square `rotate(45deg)` at `top:-5px left:24px`, `box-shadow:-1px -1px 0 rgba(11,13,18,.06)`.

---

## §3.4 — InventoryMeter
**sub:** "available / total · held portion amber · crosses to danger when low"

### Row (`invMeter()`) — `display:grid`, columns **`200px 1fr 150px`**, `gap:20px`, `align-items:center`, `padding:14px 0`, `border-bottom:1px solid #ECEEF1`/`--border-subtle`.
1. **Name col**: name **14px / weight 550** `--text-primary`; location **12px** `#8A8F98`/`--text-tertiary`.
2. **Meter col**:
   - Track: `position:relative`, height **12px**, `border-radius:999px`, bg `#F1F3F5`/`--surface-sunken`, `overflow:hidden`, `box-shadow: inset 0 0 0 1px rgba(11,13,18,.05)`.
   - Available segment: `width = avail/total*100`%, bg = `#1A7F4B`/`--success` (OK/low) or **`#C8372D`/`--danger` when `state==='danger'`**.
   - Held segment (if `held`): abs `left:availPct%`, width `held/total*100`%, bg **`#E0A300`** (a brighter amber than `--warning #9A6B00`; literal).
   - Legend under bar (`gap:14px`, `margin-top:6px`, **12px** `#8A8F98`/`--text-tertiary`): "available" swatch (`7×7` radius-2, color = availColor) + "held {n}" swatch (`#E0A300`) when held>0.
3. **Right col** (`text-align:right`):
   - Big count: Geist Mono **15px / weight 600** `tabular-nums`, color `#0B0D12`/`--text-primary` (or `#C8372D`/`--danger` if danger). Format "{avail} / {total}".
   - State badge below: if `low` → "LOW STOCK" (`#9A6B00`/`#FBF3E0`, `noDot`); if `danger` → "OUT OF STOCK" (`#C8372D`/`#FBECEA`, `noDot`); else plain "in stock" **12px** `#8A8F98`/`--text-tertiary`.

### Mock rows
1. Standard chair — "Store A · level −1", avail 320 / held 60 / total 500, state ok.
2. Wireless microphone — "AV cabinet · backstage", avail 2 / held 4 / total 8, state low.
3. Stage deck (6×4m) — "Loading bay", avail 0 / held 1 / total 2, state danger.

---

## §3.5 — SpaceCard
**sub:** "capacity for requested layout (big tabular) · features · day rate · availability dot" · frame `bg:#F7F8FA`.

### Card (`spaceCard()`) — width **280px**, bg `#fff`/`--surface`, border `1px solid #ECEEF1`/`--border-subtle`, `border-radius:12px` (≈`--radius-lg`), `padding:18px`, shadow `0 1px 2px rgba(11,13,18,.04)` (raised, no ring half).
- **Header** (`justify-content:space-between`, `align-items:flex-start`):
  - Left: name **16px / weight 600** `--text-primary`; floor **13px** `#8A8F98`/`--text-tertiary`.
  - Right availability pill (inline-flex, `gap:6px`, **12px / weight 600**): dot `8×8` + label. Free → `#1A7F4B`/`--success` "Available"; held → `#9A6B00`/`--warning` "Held".
- **Capacity block** (`margin:16px 0`, `padding-bottom:14px`, `border-bottom:1px solid #ECEEF1`):
  - Big number: Geist Mono **30px / weight 600** `tabular-nums`, `letter-spacing:-0.02em` (display-ish). + layout word **13px** `#8A8F98`/`--text-tertiary`.
  - Caption "capacity for requested layout" **12px** `#8A8F98`/`--text-tertiary` `margin-top:2px`.
- **Feature chips** (`flex-wrap`, `gap:6px`, `margin-bottom:14px`): each **12px** `#51555E`/`--text-secondary`, bg `#F1F3F5`/`--surface-sunken`, `border-radius:999px`, padding `3px 9px`.
- **Footer** (`justify-content:space-between`, `align-items:center`):
  - Rate: Geist Mono **14px / weight 600** `tabular-nums` (e.g. "80,000") + " / day" **12px** `#8A8F98` weight 400.
  - Secondary btn "Select" (`sm`).

### Mock
1. Blue Hall — "Main floor · west wing", cap **220**, layout "theater", features [Stage, Hybrid AV, Step-free, Air-con], rate "80,000", free.
2. Foyer — "Ground · entrance", cap **120**, layout "reception", features [Bar, Coat check, Natural light], rate "42,000", held.

---

## §3.6 — ReservationCard
**sub:** "HELD shows a lease countdown that warms to amber" · frame `bg:#F7F8FA`.

### Card (`reservationCard()`) — width **300px**, bg `#fff`/`--surface`, border `1px solid` = `rgba(154,107,0,.3)` (warning @30%) when HELD else `#ECEEF1`/`--border-subtle`, `border-radius:12px`, `overflow:hidden`, shadow `0 1px 2px rgba(11,13,18,.04)`.

- **HELD lease strip** (only when HELD): bg `#FBF3E0`/`--warning-subtle`, `padding:8px 16px`, `justify-content:space-between`, `border-bottom:1px solid rgba(154,107,0,.2)`.
  - Left: clock icon (`M8 4.5v3.5l2 1.5M8 1.5a6.5 6.5 0 1 0 0 13...` 13px `#9A6B00`) + "Lease expires in" **12px / weight 600** `#9A6B00`/`--warning`.
  - Right: **countdown** Geist Mono **15px / weight 600** `#9A6B00`/`--warning` `tabular-nums`, **`animation: pulse 1.6s ease-in-out infinite`** (`@keyframes pulse {0%,100%{opacity:1} 50%{opacity:.35}}`). Mock "12:04".
- **Body** (`padding:16px`):
  - Header row (`margin-bottom:12px`, `align-items:flex-start`): left = space **16px / weight 600** + window **13px** `#51555E`/`--text-secondary` Geist Mono (`margin-top:2px`); right = StatusBadge.
    - CONFIRMED → `#1A7F4B`/`#E9F6EF` (with dot); HELD → `#9A6B00`/`#FBF3E0`; RELEASED → `#8A8F98`/`#F1F3F5`.
  - Assets section (`border-top:1px solid #ECEEF1`, `padding-top:12px`):
    - Label "Reserved assets" **11px** `#8A8F98`/`--text-tertiary` uppercase `letter-spacing:0.04em` `margin-bottom:8px`.
    - Each asset row (`justify-content:space-between`, **13px**, `padding:3px 0`): name `#51555E`/`--text-secondary`; qty Geist Mono **weight 600** `tabular-nums` "×{q}".

### Mock
1. Blue Hall · "22 Jul · 14:00–18:00" · **HELD** · countdown "12:04" · assets [Standard chair ×180, Wireless microphone ×2, Stage deck ×1].
2. Blue Hall · same window · **CONFIRMED** · same assets.
3. Orange Hall · "19 Jul · 10:00–14:00" · **RELEASED** · assets [Banquet round ×20, Linen set ×20].

---

## §3.7 — QuoteTable
**sub:** "line items → NET / VAT 20% / TOTAL emphasized · currency ALL · tabular"

### Container width **620px**.
- **Header grid** — columns **`1fr 90px 70px 110px 120px`**, `gap:12px`, `padding:0 0 10px`, **11px** `#8A8F98`/`--text-tertiary` uppercase `letter-spacing:0.04em`, `border-bottom:1px solid #ECEEF1`. Cols: "Line item", "Kind", "Qty"(right), "Unit"(right), "Subtotal"(right).
- **Rows** (same grid) — `padding:12px 0`, `border-bottom:1px solid #ECEEF1`, `align-items:center`, **14px**:
  - Label: weight 500 `--text-primary`.
  - **Kind chip** (`badge` noDot): SPACE → `#2F6FED`/`#EEF3FE`; ASSET → `#51555E`/`#F1F3F5`; LABOR → `#9A6B00`/`#FBF3E0`.
  - Qty / Unit: right-aligned Geist Mono `tabular-nums` `#51555E`/`--text-secondary` ("×{qty}", unit raw string).
  - Subtotal: right Geist Mono `tabular-nums` **weight 600** `--text-primary`.
- **Line items (mock)**:
  | label | kind | qty | unit | sub |
  |---|---|---|---|---|
  | Blue Hall — venue rate | SPACE | 1 | 80,000 | 80,000 |
  | Standard chair | ASSET | 180 | 120 | 21,600 |
  | Wireless microphone | ASSET | 2 | 3,500 | 7,000 |
  | Stage deck (6×4m) | ASSET | 1 | 12,000 | 12,000 |
  | Setup & teardown crew | LABOR | 6 | 1,400 | 8,400 |
- **Totals block**: `margin-top:14px`, `margin-left:auto`, width **280px**.
  - Row (`justify-content:space-between`, non-emph `padding:7px 0`): label **14px** `#51555E`; value Geist Mono `tabular-nums` **14px / weight 550** `--text-primary` + " ALL" suffix (**12px** `#8A8F98` weight 400).
  - "Net" 129,000 · "VAT (20%)" 25,800.
  - Then a **`border-top:2px solid #0B0D12`** (`--text-primary`) `margin-top:6px`.
  - "Total" row emphasized: label **15px / weight 600** `--text-primary` (`padding:14px 0 0`); value **19px / weight 700** Geist Mono + " ALL" suffix. Value **154,800**.

---

## §3.8 — TaskBoard
**sub:** "SETUP / TEARDOWN lanes · owner · dueAt (relative + absolute) · overdue = danger" · frame `bg:#F7F8FA`.

### Layout: two lanes, `display:flex`, `gap:28px`, `flex-wrap`. Each lane `flex:1`, `min-width:280px`.
- **Lane header** (`gap:8px`, `margin-bottom:12px`): an icon (`#51555E`) + title **13px / weight 600** uppercase `letter-spacing:0.04em` `#51555E`/`--text-secondary` + count pill: **12px** `#8A8F98`, bg `#F1F3F5`/`--surface-sunken`, `border-radius:999px`, `padding:1px 8px`, Geist Mono.
  - Setup lane icon = plus `M8 1.5v13M1.5 8h13`; Teardown lane icon = minus `M3 8h10`.
- **Cards stack**: `flex-direction:column`, `gap:10px`.

### Task card (`taskCard()`) — bg `#fff`/`--surface`, border `1px solid` = `rgba(200,55,45,.3)` (danger@30%) if OVERDUE else `#ECEEF1`/`--border-subtle`, `border-radius:10px`/`--radius-md`, `padding:12px 14px`, shadow `0 1px 2px rgba(11,13,18,.04)`.
- Title: **14px / weight 500 / 19px lh** `--text-primary` `margin-bottom:10px`.
- Footer (`justify-content:space-between`, `align-items:center`):
  - Left (`gap:8px`): **avatar 24px** with row tint + relative time **12px**; OVERDUE → `#C8372D`/`--danger` weight 600, else `#8A8F98`/`--text-tertiary` weight 400.
  - Right: status badge (`noDot`), color set:
    - TODO `#8A8F98`/`#F1F3F5` · IN_PROGRESS `#2F6FED`/`#EEF3FE` · DONE `#1A7F4B`/`#E9F6EF` · BLOCKED **`#9A6B00`/`#FBF3E0`** · OVERDUE `#C8372D`/`#FBECEA`. Label = status with `_`→space.

### Mock data
- **Setup**: "Arrange 180 chairs — theater layout" (EH `#DCE6FB`, due "22 Jul · 11:00", "in 3h", IN_PROGRESS) · "Sound check — 2 wireless mics" (LK `#E9F6EF`, "22 Jul · 12:30", "in 4h", TODO) · "Stage deck assembly" (AM `#FBF3E0`, "22 Jul · 10:00", "overdue 1h", OVERDUE).
- **Teardown**: "Strike stage & store deck" (AM `#FBF3E0`, "22 Jul · 19:00", "in 9h", TODO) · "Return mics to inventory" (LK `#E9F6EF`, "22 Jul · 19:30", "in 9h", BLOCKED).

> Note: canvas shows BOTH relative ("in 3h") AND absolute ("22 Jul · 11:00"); the relative is what's rendered next to the avatar. The absolute due is carried in mock but the card only displays `rel`.

---

## §3.9 — CopilotPanel  ⭐ multi-state
**sub:** "muted-accent surface · thinking · ProposedActionCard (requiresApproval) · unprompted conflict heads-up" · frame `bg:#F7F8FA`.

Three shells side by side (`display:flex`, `gap:24px`, `flex-wrap`), titles `idle / plan-preview`, `assistant-thinking`, `conflict heads-up (unprompted)`.

### Shell (`copilotShell()`) — width **360px**, bg **`#F7F9FE`** (near-`--accent-muted`, a paler blue tint; literal), border `1px solid #DCE6FB` (light blue, ≈scheduled bufBg), `border-radius:14px`, `overflow:hidden`, shadow `0 1px 2px rgba(11,13,18,.04)`, `flex-direction:column`.
- **Header bar** (`gap:9px`, `padding:12px 16px`, `border-bottom:1px solid #DCE6FB`, bg **`#EEF3FE`/`--accent-muted`**):
  - Spark-icon tile `22×22`, `border-radius:6px`/`--radius-sm`, bg `#2F6FED`/`--accent`, white spark icon (`M8 2.5 9.2 6l3.3 .2...`).
  - "Copilot" **14px / weight 600** `--text-primary`.
  - Right meta: state title Geist Mono **11px** `#8A8F98`/`--text-tertiary` (`margin-left:auto`).
- **Body**: `padding:16px`, `min-height:160px`.

### Chat message (`chatMsg()`)
- Wrapper `display:flex`, `justify-content: flex-end` (user) / `flex-start` (assistant), `margin-bottom:12px`.
- Bubble `max-width:78%`, padding `10px 13px`, **14px / 20px lh**:
  - **user**: bg `#0B0D12`/`--surface-inverted`, text `#fff`/`--text-inverted`, no border, `border-radius:12px 12px 4px 12px` (tail bottom-right), no shadow.
  - **assistant**: bg `#fff`/`--surface`, text `#0B0D12`/`--text-primary`, border `1px solid #E3E7EC`, `border-radius:12px 12px 12px 4px` (tail bottom-left), shadow `0 1px 2px rgba(11,13,18,.04)`.

### State: idle / plan-preview (shell 1)
- user msg "Can we host a 180-person conference on 22 Jul?"
- assistant msg "Yes — Blue Hall seats 180 theater-style and is free 14:00–18:00. I've drafted a plan with a quote of 154,800 ALL."
- **ProposedActionCard** (`proposedAction()`): bg `#fff`, border `1px solid #DCE6FB`, `border-radius:12px`, `padding:14px`, `margin-top:4px`.
  - Header (`gap:8px`, `margin-bottom:8px`): "Proposed action" **11px / weight 600** `#2F6FED`/`--accent` uppercase `letter-spacing:0.04em`; + badge "REQUIRES APPROVAL" (`#9A6B00`/`#FBF3E0`, `noDot`).
  - Title "Hold Blue Hall" **14px / weight 600** `margin-bottom:4px`.
  - Body **13px / 19px lh** `#51555E`/`--text-secondary` `margin-bottom:12px`: "22 Jul 2026 · 14:00–18:00 · for FinTech Startup Conf (180 pax). A 15-minute lease will be placed."
  - Buttons (`gap:8px`): primary "Confirm hold" (sm) + ghost "Dismiss" (sm).

### State: assistant-thinking (shell 2)
- user msg "What about the Foyer for the after-party?"
- **thinking()** indicator: assistant-style bubble (bg `#fff`, border `1px solid #E3E7EC`, `border-radius:12px 12px 12px 4px`, `padding:12px 14px`, `gap:5px`): three `6×6` accent dots `#2F6FED` each `animation: blink 1.2s ease-in-out {i*0.18}s infinite` (`@keyframes blink {0%,100%{opacity:1} 50%{opacity:.2}}`); then label "Checking availability…" **13px** `#8A8F98`/`--text-tertiary` `margin-left:6px`.

### State: conflict heads-up / unprompted (shell 3)
- assistant msg "Your Blue Hall plan is ready to approve."
- **headsUp()**: assistant-aligned, `max-width:88%`, bg `#FBECEA`/`--danger-subtle`, border `1px solid rgba(200,55,45,.28)`, `border-radius:12px 12px 12px 4px`, `padding:12px 14px`.
  - Header (`gap:7px`, `margin-bottom:6px`): warning-triangle icon (14px `#C8372D`) + "Heads up — this clashes" **13px / weight 600** `#9E2B23` (dark-danger ink).
  - Body **13px / 19px lh** `#7A2A23` `margin-bottom:10px`: "A networking mixer (REQ-0151) just took the Foyer 18:00–20:00, overlapping your teardown. Want me to re-plan?"
  - Buttons (`gap:8px`): **danger** "Re-plan" (sm) + secondary "Ignore" (sm).

> States named in assignment: idle, user-typing, assistant-thinking, plan-preview, proposed-action, conflict-heads-up, error. Canvas explicitly renders: idle/plan-preview (combined shell 1), assistant-thinking, conflict-heads-up. **user-typing and error are NOT drawn in this canvas** — derive from primitives (input + thinking; error reuses ErrorState/headsUp pattern).

---

## §3.10 — KPIStat
**sub:** "big tabular number + label + trend ▲▼" · frame `bg:#F7F8FA`.

### Tile (`kpi()`) — `flex:1`, `min-width:180px`, bg `#fff`/`--surface`, border `1px solid #ECEEF1`/`--border-subtle`, `border-radius:12px`, `padding:18px`, shadow `0 1px 2px rgba(11,13,18,.04)`.
- Label: **13px** `#51555E`/`--text-secondary` `margin-bottom:10px`. (Note: canvas label is **13px sentence-case secondary**, not uppercase tertiary.)
- Value row (`align-items:baseline`, `gap:10px`):
  - Number: Geist Mono **30px / weight 600** `tabular-nums` `letter-spacing:-0.02em`; color `#C8372D`/`--danger` if `alert` else `#0B0D12`/`--text-primary`.
  - Trend (if present): **13px / weight 600**, `#1A7F4B`/`--success` if `trendUp` else `#C8372D`/`--danger`, with `▲`/`▼` glyph (inline-flex `gap:2px`).
- Sub: **12px** `#8A8F98`/`--text-tertiary` `margin-top:4px`.

### Mock tiles (`gap:16px`, flex-wrap)
1. "Events this week" — 12, trend +3 up, sub "vs. last week".
2. "Spaces in use" — "4 / 6", sub "now".
3. "Low-stock assets" — 2, **alert** (danger number), sub "wireless mic, stage deck".
4. "Pending approvals" — 5, trend +2 **down** (▼ danger), sub "awaiting manager".

---

## §3.11 — AuditTimeline
**sub:** "actor · action verb · entity · mono timestamp · expandable diff · reason"

### Container `position:relative`, `padding-left:8px`. Entries stacked.
### Entry row — `display:flex`, `gap:14px`, `position:relative`, `padding-bottom:22px` (last = 0).
- **Connector line** (all but last): abs `left:13px`, `top:30px`, `bottom:0`, width **2px**, bg `#ECEEF1`/`--border-subtle`.
- **Avatar 28px** with row tint.
- **Content**:
  - Line 1 **14px / 20px lh**: actor name weight 600 `--text-primary`; " {verb} " `#51555E`/`--text-secondary`; entity Geist Mono **13px** `#2F6FED`/`--accent`.
  - Time: **12px** `#8A8F98`/`--text-tertiary` Geist Mono `margin-top:2px`.
  - Reason (if any): **13px** `#51555E`/`--text-secondary` `margin-top:6px`, bg `#F7F8FA`/`--surface-subtle`, **`border-left:2px solid #D7DBE0`/`--border-strong`**, `padding:6px 10px`, `border-radius:0 6px 6px 0`, wrapped in curly quotes ""…"".
  - Diff toggle (if `diff`): **12px** `#2F6FED`/`--accent`, cursor pointer, copy "▸ status: PROPOSED → APPROVED".

### Mock entries
1. Elira Hoxha (EH, `#DCE6FB`) **approved** `REQ-2026-0142` · "22 Jul 2026 · 09:14:02" · reason "Capacity and budget confirmed with organizer." · diff yes.
2. Copilot (AI, `#EEF3FE`) **generated plan for** `REQ-2026-0142` · "…09:02:55" · no reason/diff.
3. Liam Kovaçi (LK, `#E9F6EF`) **held Blue Hall for** `REQ-2026-0142` · "…08:58:11".
4. System (SY, `#F1F3F5`) **created** `REQ-2026-0142` · "…08:55:40".

---

## §3.12 — DataTable (4 states)
**sub:** "sortable · paginated · default / loading / empty / error · row hover" · frame `bg:#F7F8FA`.

Layout: default full-width, then a 2-col grid (`1fr 1fr`) of loading|empty, then error (max-width 520px). Each preceded by `label()`.

### Outer: border `1px solid #ECEEF1`/`--border-subtle`, `border-radius:10px`/`--radius-md`, `overflow:hidden`.
### Header grid — columns **`150px 1fr 100px 130px 130px 120px`**, `gap:12px`, `padding:10px 16px`, bg `#F7F8FA`/`--surface-subtle`, `border-bottom:1px solid #ECEEF1`, **11px** `#8A8F98`/`--text-tertiary` uppercase `letter-spacing:0.04em` weight 500. Cols: Request (with " ▾" sort glyph), Organizer, Attendees(right), Dates, Value(right), Status. (Attendees & Value right-aligned.)

### default rows — same grid, `padding:13px 16px`, `border-bottom:1px solid #ECEEF1`, `align-items:center`, **14px**:
- Request id: Geist Mono **13px** `#2F6FED`/`--accent`.
- Organizer: weight 500 `--text-primary`.
- Attendees: right Geist Mono `tabular-nums`.
- Dates: `#51555E`/`--text-secondary` Geist Mono **13px**.
- Value: right Geist Mono `tabular-nums` weight 550.
- Status: a StatusBadge.
- **Rows (mock)**: REQ-2026-0142 / FinTech Startup Conf / 180 / 22 Jul 2026 / 154,800 ALL / APPROVED(`#1A7F4B`/`#E9F6EF`) · REQ-2026-0151 / Networking Mixer / 90 / 22 Jul 2026 / 48,000 ALL / CONFLICT(`#C8372D`/`#FBECEA`) · REQ-2026-0139 / Product Launch / 160 / 21 Jul 2026 / 132,000 ALL / SCHEDULED(`#2F6FED`/`#EEF3FE`) · REQ-2026-0155 / Annual Gala / 300 / 24 Jul 2026 / — / DRAFT(`#8A8F98`/`#F1F3F5`).

### loading state — 4 skeleton rows, same grid, `padding:14px 16px`. Each cell a `12px` bar `border-radius:6px`, bg `linear-gradient(90deg,#EEF0F3 25%,#F6F7F9 50%,#EEF0F3 75%)`, `background-size:400px 100%`, **`animation: shimmer 1.4s linear infinite`** (`@keyframes shimmer {0%{background-position:-200px 0} 100%{200px 0}}`). Width 70% for col 1 (organizer), else 80%.

### empty state — `padding:48px 16px`, centered:
- Icon tile `40×40`, `border-radius:10px`, bg `#F1F3F5`/`--surface-sunken`, color `#8A8F98`/`--text-tertiary`, doc icon (`M3 4h10v8H3zM3 7h10` 18px).
- Title "No requests yet" **15px / weight 600** `margin-bottom:5px`.
- Body "New event requests will appear here as they arrive." **13px** `#8A8F98` `margin-bottom:16px`.
- Primary btn "New request" (sm) with plus icon.

### error state — `padding:48px 16px`, centered:
- Icon tile `40×40`, `border-radius:10px`, bg `#FBECEA`/`--danger-subtle`, color `#C8372D`/`--danger`, warning icon (`M8 5v3.5M8 11v.2` 18px).
- Title "Couldn't load requests" **15px / weight 600**.
- Body "The connection to ops-core timed out." **13px** `#8A8F98` `margin-bottom:16px`.
- Secondary btn "Retry" (sm).

---

## §3.13 — PageHeader
**sub:** "title + breadcrumb + single primary action + filters row"

- **Breadcrumb** (`gap:8px`, **13px** `#8A8F98`/`--text-tertiary`, `margin-bottom:8px`): "Pipeline" / "/" / "Requests" (last segment `#51555E`/`--text-secondary`).
- **Title row** (`align-items:flex-start`, `justify-content:space-between`, `flex-wrap`, `gap:12px`):
  - Left: h1 "Requests" **24px / weight 600** `letter-spacing:-0.01em`; sub "24 active · 5 awaiting approval" **14px** `#51555E`/`--text-secondary` `margin:4px 0 0`.
  - Right (`gap:10px`): secondary "Export" + primary "New request" (plus icon).
- **Filters row** (`gap:10px`, `margin-top:18px`, `flex-wrap`):
  - **Segmented control**: container `padding:3px`, bg `#F1F3F5`/`--surface-sunken`, `border-radius:8px`, `gap:2px`. Tabs ["All","Proposed","Approved","Scheduled"], each `padding:5px 12px` **13px / weight 550** `border-radius:6px`. Active (All): bg `#fff`/`--surface`, text `#0B0D12`/`--text-primary`, shadow `0 1px 2px rgba(11,13,18,.08)`. Inactive: transparent, `#51555E`/`--text-secondary`.
  - **Search box**: `height:32px`, `padding:0 12px`, `border-radius:8px`, border `1px solid #D7DBE0`/`--border-strong`, **13px** `#8A8F98`/`--text-tertiary`, `gap:8px`, search icon + "Search…".

---

## §3.14 — EmptyState / ErrorState
**sub:** "illustrationless · calm · one line + a helpful first action" · frame `bg:#F7F8FA`.

Two cards side by side (`gap:20px`, flex-wrap). Shared shape (`ee()`): `flex:1`, `min-width:280px`, bg `#fff`/`--surface`, **border `1px dashed #D7DBE0`/`--border-strong`**, `border-radius:12px`, `padding:40px 28px`, `text-align:center`.
- Icon tile `44×44`, `border-radius:11px`, bg + color per state, centered, `margin:0 auto 16px`; icon 20px.
- Title **16px / weight 600** `margin-bottom:6px`.
- Message **14px / 20px lh** `#8A8F98`/`--text-tertiary`, `max-width:280px` auto-centered, `margin-bottom:18px`.
- Action btn centered.

### Empty card
- Icon tile bg `#F1F3F5`/`--surface-sunken`, color `#8A8F98`/`--text-tertiary`, icon `M4 5h8v6H4zM4 8h8`.
- Title "No conflicts right now".
- Msg "Every reservation fits. The schedule is clean — nothing needs your attention."
- Secondary btn "View calendar" (sm).

### Error card
- Icon tile bg `#FBECEA`/`--danger-subtle`, color `#C8372D`/`--danger`, icon `M8 5v3.5M8 11v.2`.
- Title "Something went wrong".
- Msg "We couldn't reach ops-core. Your work is safe — try again in a moment."
- Secondary btn "Retry" (sm).

---

# GAP ANALYSIS

## MISSING components (no impl file at all)
- **§3.3 AvailabilityTimeline / ScheduleCalendar** — NO component. `pages/Calendar.tsx` exists but no reusable lane/bar/buffer/popover component. The entire hatched-buffer geometry, status color sets, hour axis, hover popover, and "free" lanes are unbuilt.
- **§3.6 ReservationCard** — NO component. HELD lease strip, pulsing countdown, asset list table all missing.
- **§3.9 CopilotPanel** — NO component. Shell, chat bubbles (user/assistant tails), thinking dots, ProposedActionCard, conflict heads-up all missing. (Most-impactful gap.)
- **OperationalPlanView** — NO component (named in DESIGN_SYSTEM §4; not its own §3 artboard but required as the composing scroll). Missing.
- **§3.12 DataTable** — only a thin `ui/Table.tsx` (Table/THead/TH/TR/TD wrappers). NO unified `DataTable` with built-in loading-shimmer / empty / error states, sort glyph, or column-template. The shimmer animation (`@keyframes shimmer`) is not defined; `Skeleton` uses `animate-pulse` not shimmer.

## §3.1 StatusBadge — impl `ui/StatusBadge.tsx` + `ui/Badge.tsx`
EXISTS: tone-mapped Badge with dot, i18n labels. Good coverage of the lifecycle.
WRONG/ MISSING:
- **BLOCKED tone**: impl maps `BLOCKED:'danger'`; canvas BLOCKED = **warning** (`#9A6B00`/`#FBF3E0`). Fix `TONE.BLOCKED = 'warning'`.
- **OVERDUE** not in TONE map at all — canvas has it (`#C8372D`/`#FBECEA`). Add `OVERDUE:'danger'`.
- **CONFLICT** status not mapped — add `CONFLICT:'danger'`.
- Badge metrics differ from canvas `badge()`: impl padding `px-2.5 py-0.5` (10px/2px), font `12px weight 550`, **no border**. Canvas: padding **`3px 10px`**, weight **600**, **border `1px solid {fg}26`**. Add the 15%-alpha border ring and bump weight to 600; verify vertical padding 3px.
- Dot size matches (`size-1.5` = 6px). Good.
- Missing the "badge + trailing mono related-ID" composed pattern (CONFLICT + `REQ-0151`). Add an optional `relatedId` slot rendering Geist Mono 13px tertiary.
Build plan: edit `Badge` cva to add `border border-current/15` and `font-[600]`, padding `py-[3px] px-2.5`; extend `TONE` (BLOCKED→warning, add OVERDUE/CONFLICT); add optional trailing-id render.

## §3.2 ConflictBanner — impl `command/ConflictBanner.tsx`
EXISTS: danger-tinted box, AlertTriangle, type label, detail, window, conflictingRequestIds, an ASSET_OVERALLOCATED meter.
WRONG/MISSING vs canvas:
- **No icon tile**: canvas has a `26×26` white tile with `inset 0 0 0 1px rgba(200,55,45,.2)` ring; impl uses a bare lucide icon.
- **No type chip**: canvas shows a mono type chip (`#C8372D` on white, border, radius 5). Impl renders the type only as translated text inside the list, not as a header chip.
- **Title**: impl `text-[15px]` danger; canvas title is **16px `#0B0D12`** (ink, not danger) — the danger is in the icon/chip, not the H3. Change to 16px text-primary.
- **Detail color**: canvas detail = `#7A2A23` (dark danger ink); impl uses `text-text-secondary`. Use a danger-ink utility.
- **Meta layout**: canvas has a structured 2-col meta row ("Colliding window" mono value + "Conflicting requests" chips). Impl crams window + ids as inline mono lines with a "↳" prefix. Rebuild as labelled columns; ids become chips.
- **Meter is BROKEN**: impl width math is `(c.requested / Math.max(1, c.requested)) * 100` = always **100%**, and it has no available segment, no `of total`, no hatch, no dashed divider. Canvas meter = success available segment + **`.hatch-danger`** over-allocation segment with `borderLeft:1px dashed #C8372D`, label "requested 6 / available 2 of 8". Needs `total` in the Conflict type; rebuild meter to canvas spec including the `.hatch-danger` CSS class (not yet defined in app CSS).
- **Actions**: canvas always shows "See alternatives" (primary, chevron) + "Adjust request" (secondary) inside the banner; impl takes optional `actions` prop only. Provide default actions.
- **Per-conflict vs single**: impl loops conflicts into one banner with a shared title `conflict.title`; canvas shows one banner per conflict with its own title/type/detail/window/ids. Restructure to one banner per Conflict.
- Container radius: impl `rounded-lg`(16) vs canvas 12 — acceptable token-snap but note.
Build plan: add `.hatch-danger`/`.hatch-buffer` keyframe-free CSS to globals; add `total`/`requested`/`available` to Conflict meter type; rewrite component to: icon tile + 16px ink title + mono type chip + `#7A2A23` detail + 2-col meta + chip ids + corrected meter + default action buttons; render one banner per conflict.

## §3.4 InventoryMeter — impl `command/InventoryMeter.tsx`
EXISTS: a single-line bar + count, low→danger.
MISSING vs canvas:
- **No held segment** (amber `#E0A300`). Canvas overlays held portion after available. Add `held` prop + segment.
- **No 3-col grid** (name/loc col, meter col, right count+badge col). Impl is just bar+count.
- **No name/location**, no inline legend ("available" / "held N" swatches), no LOW STOCK / OUT OF STOCK / "in stock" badge, no `inset` track shadow.
- **Danger threshold**: impl uses `available <= total*0.1`; canvas drives state explicitly (`ok`/`low`/`danger`) — `danger` = avail 0, `low` = a low band. Use an explicit `state` or `low`/`danger` flags rather than a hardcoded 10%.
- Bar height: impl `h-2`(8px); canvas **12px**. Track color matches (`surface-sunken`).
Build plan: expand props to `{ name, location, available, held, total, state }`; render 3-col grid, held amber segment (`#E0A300` literal — no exact token; closest `--warning`), inset shadow, legend, and the state badge.

## §3.5 SpaceCard — impl `command/SpaceCard.tsx`
EXISTS: name/floor, big cap number (Geist Mono 28px), feature chips, day rate, availability dot.
WRONG/MISSING:
- **Cap number size**: impl 28px; canvas **30px** with `letter-spacing:-0.02em`. Bump.
- **No capacity divider/caption**: canvas has a bordered cap block + "capacity for requested layout" caption (12px). Add.
- **No "Select" button** footer — canvas has secondary "Select" (sm) at footer right. Add.
- **Availability copy**: impl uses available true/false → success/danger; canvas held state = **warning** "Held" (not danger). Add a held/warning variant.
- Card width: impl flexible; canvas fixed **280px** (acceptable to keep responsive, but match padding 18px).
- Floor line: canvas "Main floor · west wing" (full); impl shows `floor · kind`. Align to canvas text composition.
Build plan: bump number to 30px/-0.02em, add cap divider + caption, add held→warning availability variant, add footer Select button.

## §3.6 ReservationCard — MISSING (build new `command/ReservationCard.tsx`)
Build to spec: 300px card, HELD top strip (warning-subtle, clock icon, "Lease expires in", pulsing mono countdown), header (space + mono window + StatusBadge), assets section (label + name/qty×N rows). Add `@keyframes pulse` to CSS. Status border: HELD → `rgba(154,107,0,.3)`.

## §3.7 QuoteTable — impl `command/QuoteTable.tsx`
EXISTS: line items (kind badge, label, qty, unit, subtotal), NET/VAT/TOTAL with emphasis, ALL via formatMinor.
WRONG/MISSING:
- **Column template**: canvas uses `1fr 90px 70px 110px 120px` grid with a separate **Kind** column; impl puts the kind badge inline before the label in a `<table>`. Canvas has Kind as its own column. Restructure (or keep table but add Kind col).
- **Kind chip colors**: canvas SPACE=info, ASSET=neutral, LABOR=warning. Impl uses `tone="neutral"` for all kinds. Map kind→tone.
- **Totals**: canvas has a **2px solid ink** rule above Total, Total value **19px/700**, " ALL" suffix in 12px tertiary; impl Total is 16px/600 and relies on formatMinor for currency. Bump Total to 19px/700, add ink rule, split currency suffix.
- **Header size/casing**: canvas header 11px uppercase tertiary; impl 12px uppercase tertiary — minor.
- **Totals width**: canvas totals block is 280px right-aligned; impl is full-width `dl`. Constrain to ~280px / ml-auto.
Build plan: add kind→tone map; restructure to grid with Kind column; add 2px ink rule + 19px/700 Total + " ALL" suffix span; right-align 280px totals block.

## §3.8 TaskBoard — impl `command/TaskBoard.tsx`
EXISTS: 2 lanes (SETUP/TEARDOWN), count, cards with title + StatusBadge + owner + dueAt, overdue danger.
WRONG/MISSING:
- **Lane header icons**: canvas has plus/minus icons before the lane title. Missing.
- **Count pill**: canvas count is a pill (mono, surface-sunken bg, radius-pill); impl is bare mono text. Make a pill.
- **Owner = avatar**: canvas shows a **24px avatar** (initials, tinted) + relative time; impl shows owner as plain text. Add Avatar.
- **Relative time**: canvas shows "in 3h" / "overdue 1h" (relative); impl shows absolute `formatDateTime` only. Add relative formatting; overdue→danger weight 600.
- **Status set**: canvas card status badge uses noDot; BLOCKED=warning, OVERDUE=danger. Ensure TaskBoard's StatusBadge honors corrected tones (see §3.1).
- Card radius: canvas 10 (md); impl `rounded-md`(10) ✓. Card border on overdue → `rgba(200,55,45,.3)` — impl doesn't change border, only text. Add overdue border.
- Lane gap: canvas `gap:28px`; impl grid `gap-4`(16px). Bump to ~28.
Build plan: add lane icons + count pill; render Avatar(owner) + relative time; add overdue card border; widen lane gap.

## §3.9 CopilotPanel — MISSING (build new `command/CopilotPanel.tsx` + subcomponents)
Build: shell (360px, `#F7F9FE` bg, `#DCE6FB` border, `#EEF3FE` header, spark tile), ChatMessage (user ink bubble tail-BR / assistant white bubble tail-BL), thinking() (3 blink dots + "Checking availability…"), ProposedActionCard ("Proposed action" + REQUIRES APPROVAL badge + title + body + Confirm/Dismiss), headsUp() (danger bubble + warning icon + Re-plan(danger)/Ignore(secondary)). Add `@keyframes blink`. Also add user-typing (input + caret) and error states (reuse ErrorState/headsUp) which the canvas does not draw.

## §3.10 KPIStat — impl `command/KPIStat.tsx`
EXISTS: Card tile, label, big mono number, delta ▲/▼ (success/danger), hint.
WRONG/MISSING:
- **Label style**: impl `12px uppercase tracking text-tertiary`; canvas label is **13px sentence-case `#51555E`/secondary**. Change.
- **Number size**: impl 28px; canvas **30px** with `-0.02em`. Bump.
- **Alert variant**: canvas turns the number `#C8372D`/danger when `alert` (low-stock tile). Impl has no alert prop. Add `alert` → danger number.
- **Trend glyph**: canvas uses `▲`/`▼` text glyphs at 13px/600; impl uses lucide ArrowUp/ArrowDown size-3. Acceptable but note size (canvas trend text 13px). Trend down should be danger even if the metric isn't "bad" — canvas "Pending approvals +2 ▼" is danger. Impl colors by `delta>0` sign; canvas colors by `trendUp` flag (independent of sign). Switch to an explicit `trendUp` boolean.
- Card radius: canvas 12; impl Card default — verify.
Build plan: relabel to 13px secondary; number 30px/-0.02em; add `alert` prop; add explicit `trendUp` to decouple color from sign; keep hint 12px tertiary.

## §3.11 AuditTimeline — impl `command/AuditTimeline.tsx`
EXISTS: vertical ol, connector line, actor/action/entity/time, expandable diff+reason.
WRONG/MISSING:
- **No avatar**: canvas uses a 28px tinted avatar per entry; impl uses a small `2.5` dot on the rail. Replace dot with Avatar(initials, tint).
- **Connector geometry**: canvas line `left:13px top:30px`, width 2px `#ECEEF1`; impl uses `border-l` on the li with `-ml-[21px]` dot. Rework to match avatar+rail.
- **Action color**: canvas action verb is `#51555E` secondary text, entity is `#2F6FED`/accent mono. Impl puts `action` in accent mono and `entityType` in tertiary — swap: verb→secondary, entity→accent.
- **Reason styling**: canvas reason is a quoted block with `border-left:2px #D7DBE0`, bg surface-subtle, radius `0 6px 6px 0`, always shown (not behind toggle). Impl hides reason behind the diff toggle. Show reason inline; keep diff behind toggle.
- **Diff line**: canvas shows a single "▸ status: PROPOSED → APPROVED" accent line; impl renders JSON before/after. Provide the compact status-transition line as the collapsed affordance.
- Time format: canvas "22 Jul 2026 · 09:14:02" (with seconds) mono tertiary ✓ (ensure seconds).
Build plan: swap dot→avatar, fix rail offsets, swap verb/entity colors, render reason as always-visible quoted block, add compact diff line.

## §3.12 DataTable — MISSING unified component (only `ui/Table.tsx` primitives)
Build new `command/DataTable.tsx` (or `ui/DataTable.tsx`): column config with grid template, sort glyph " ▾" on sortable headers, hover rows, and built-in `loading` (shimmer rows — add `@keyframes shimmer` + the gradient util), `empty` (icon tile + title + body + action), `error` (danger icon tile + title + body + Retry). Header bg `surface-subtle`, 11px uppercase tertiary. Right-align numeric columns.

## §3.13 PageHeader — impl `ui/PageHeader.tsx`
EXISTS: title (24px/600/-0.01em), subtitle, actions, filters slot.
MISSING:
- **No breadcrumb**: canvas has "Pipeline / Requests" breadcrumb above title. Add optional `breadcrumb` prop/row (13px tertiary, last segment secondary).
- **Filters are a bare slot**: canvas shows a SegmentedControl + Search box as the filter row pattern. The header accepts `filters` children, so this is satisfiable by callers, but there's no SegmentedControl primitive (DESIGN_SYSTEM lists Tabs/SegmentedControl — verify it exists; not in `ui/` listing). Build SegmentedControl.
Build plan: add breadcrumb row; ensure a SegmentedControl + search-input pattern exists for the filters slot.

## §3.14 EmptyState / ErrorState — impl `ui/Feedback.tsx`
EXISTS: EmptyState + ErrorState + Skeleton/Spinner/LoadingBlock.
WRONG/MISSING:
- **No icon tile**: canvas cards have a 44×44 tinted icon tile (surface-sunken/danger-subtle). Impl has none. Add an `icon` + tile.
- **No title vs message split**: canvas has a 16px/600 title AND a 14px tertiary message; impl has only a single `title` line. Add `message` (sub) line.
- **Border**: canvas uses `1px dashed #D7DBE0`/border-strong for BOTH empty and error; impl ErrorState uses solid `danger-subtle` border+bg (filled), EmptyState uses dashed border-subtle. Align ErrorState to dashed border-strong on white (calm, not a filled danger box) — match canvas "calm" intent.
- **Padding**: canvas `40px 28px`; impl `px-6 py-14`. Match.
- ErrorState message tone: canvas message is tertiary (calm), not danger text. Impl error text is `text-danger`. Soften to tertiary; danger lives only in the icon tile.
Build plan: add icon-tile + title/message split; switch ErrorState to dashed border-strong on white with tertiary message and danger-only icon tile.

## CSS / keyframes to add to globals (currently absent)
- `.hatch-buffer` = `repeating-linear-gradient(45deg, rgba(138,143,152,.28) 0 4px, transparent 4px 8px)` — timeline buffers + legend.
- `.hatch-danger` = `repeating-linear-gradient(45deg, rgba(200,55,45,.35) 0 4px, transparent 4px 8px)` — conflict over-allocation meter.
- `@keyframes pulse` (opacity 1→.35) — ReservationCard countdown.
- `@keyframes blink` (opacity 1→.2) — Copilot thinking dots.
- `@keyframes shimmer` (background-position -200px→200px) — DataTable loading.
(`@keyframes spin` already implied via Button's `animate-spin`; verify shimmer/blink/pulse exist.)

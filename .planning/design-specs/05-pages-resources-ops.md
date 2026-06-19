# Design Digest — Pages: Resources & Operations (§5.1–5.4, §6.1–6.3)

> Source of truth: `CLAUDE_DESIGN/Pages.dc.html`, inline React in `<script type="text/x-dc">`.
> Token map from `frontend/src/styles/tokens.css`. Every hex below is given raw + token.
> Fonts: sans = Geist (`--font-sans`), mono = Geist Mono (`--font-mono`). The canvas loads `Geist` + `Geist Mono` from Google Fonts; tokens prefer SF Pro/SF Mono then Geist. Treat **Geist / Geist Mono** as the design intent.

## Token quick-reference (used throughout these pages)

| Raw hex | Token | Notes |
|---|---|---|
| `#FFFFFF` | `--surface` / `--text-on-accent` | card + page bg |
| `#F7F8FA` | `--surface-subtle` | table headers, chrome, sunken panels |
| `#F1F3F5` | `--surface-sunken` | wells, chip bg, meter track, segmented track |
| `#0B0D12` | `--text-primary` / `--surface-inverted` | headings, key numbers |
| `#51555E` | `--text-secondary` | body, labels |
| `#8A8F98` | `--text-tertiary` | meta, placeholders, timestamps |
| `#ECEEF1` | `--border-subtle` | dividers, table lines, default inputs |
| `#D7DBE0` | `--border-strong` | secondary-button border, emphasized inputs |
| `#2F6FED` | `--accent` / `--border-focus` / `--info` | primary action, IDs, live signal |
| `#2A63D4` | `--accent-hover` | — |
| `#244FB0` | `--accent-pressed` | — |
| `#EEF3FE` | `--accent-muted` / `--info-subtle` | selected row, copilot tint, info badge bg |
| `#1A7F4B` | `--success` | available, confirmed, done |
| `#E9F6EF` | `--success-subtle` | success badge bg |
| `#9A6B00` | `--warning` | held, low inventory, proposed |
| `#FBF3E0` | `--warning-subtle` | warning badge bg |
| `#C8372D` | `--danger` | conflict, overdue, out-of-stock |
| `#FBECEA` | `--danger-subtle` | danger badge bg |
| `#B8BDC6` | `--text-disabled` | disabled control fg |
| `#EEF0F3`→`#F6F7F9` | `--skeleton-base`→`--skeleton-sheen` | shimmer gradient |
| radius `4` | `--radius-xs` | board frame |
| radius `6` | `--radius-sm` | skeleton, small chips |
| radius `8` | `--radius-control` | buttons, inputs, segmented track, sidebar item |
| radius `10` | `--radius-md` | cards, KPI tiles, alerts, task cards |
| radius `12` | (between md/lg) | the larger cards in these pages use **12px** literally — closest token `--radius-lg`(16) is bigger; build with explicit `rounded-[12px]` |
| radius `16` | `--radius-lg` | login card (14px there actually) |
| radius `999` | `--radius-pill` | dots, chips, badges, meter |

**Off-palette hexes seen in these pages (flag — not in tokens.css):**
- `#E0A300` — the "held" portion of the inventory meter / asset stat (a brighter amber than `--warning #9A6B00`). Canvas uses it for the **held bar fill** and the "Held 4" stat. **Build decision needed:** either add a token (e.g. `--warning-bar`) or map to `--warning`. Current `InventoryMeter` does not render a held segment at all.
- `#D7EEE0` — buffer (setup/teardown) hatch base fill in §5.2 timeline (a pale success-green). Pair with the `.hatch-buffer` repeating-linear-gradient overlay.
- `#15613A` — darker success text used inside success badges/banners ("Available now", live label). Not tokenized; treat as a darkened `--success`.
- `#7A2A23` / `#9E2B23` — darker danger text used in conflict detail copy. Not tokenized; darkened `--danger`.
- `#7A5500` — darker warning text in low-stock banner. Darkened `--warning`.
- `#E3E7EC` — default avatar bg.
- `#DCE6FB` — accent-tinted avatar bg / copilot button border.
- `#C4C8CE` — breadcrumb separator.

**Global keyframes** (in canvas `<style>`): `spin` (700ms linear, used on submit spinners), `shimmer` (1.4s linear, skeleton), `pulse` (1.8s ease-in-out, live dots), `blink`. Buffer hatch: `repeating-linear-gradient(45deg, rgba(138,143,152,.28) 0 4px, transparent 4px 8px)`.

**Shared chrome (the `screen()` wrapper, applies to every desktop board here):**
- Screen frame: `1280×720px`, `display:flex`, white bg. Sidebar 212px + content column.
- **Sidebar** (`#F7F8FA`, right border `1px #ECEEF1`, width 212px): 56px logo header; nav groups Overview / Pipeline / Resources / Operations / Record / Settings. Group label `11px/600 #8A8F98 uppercase letter-spacing .05em`. Item: 33px tall, 8px radius, gap 11px, `14px`; active = bg `#EEF3FE`(accent-muted) + fg `#2F6FED`(accent) + weight 550. Badges on items: Requests `24`, **Inventory `2` (danger)**, **Conflicts `1` (danger)**, Approvals `5`. Active page for these boards: Spaces / Inventory / Tasks / Conflicts / Approvals.
- **Topbar** (56px, white, bottom border `1px #ECEEF1`): search pill ("Search or start a request…" + ⌘K), NATS pill (`#E9F6EF` connected / `#FBF3E0` degraded, pulsing dot), Copilot button (`#EEF3FE` bg, `#2F6FED` text, border `#DCE6FB`), avatar "EH" + "Elira H." + role "MANAGER" (`#9A6B00`).
- **`pageHeader(crumb, title, sub, action)`**: padding `24px 32px 18px`, bottom border `1px #ECEEF1`. Breadcrumb row `12px #8A8F98`, last crumb `#51555E`, separator `/` in `#C4C8CE`, 7px gap, 7px bottom margin. Title `h1 24px/600 letter-spacing -0.01em #0B0D12`. Sub `14px #51555E`, 4px top margin. Action right-aligned, `flex-wrap`, 14px gap.

**Shared button (`btn(variant,label,opts)`):** height **36px** (sm = **30px**), padding `0 16px` (sm `0 12px`), `14px/550`, radius **8px**, gap 7px. primary `#2F6FED`/white; secondary white/`#0B0D12`/border `1px #D7DBE0`; danger `#C8372D`/white; disabled `#F1F3F5` bg / `#B8BDC6` text / border `1px #ECEEF1`. Note: canvas button = **36px**; current `Button.tsx` md = **34px** (minor; sm matches at 30 vs current 28 → off by 2px).

---

# §5.1 Spaces  (`/spaces`)  — current: `frontend/src/pages/Spaces.tsx`

Page header: crumb `Resources / Spaces`, title **Spaces**, sub `6 spaces · availability for 22 Jul` (empty state: `0 of 6 match`), action = secondary btn **"Change window"** with calendar icon (`M3 4h10v9H3zM6 2v3M10 2v3`, 13px).

**Filters row** (padding `16px 32px 0`, flex gap 10px, wrap). Three pill controls, each `34px` tall, `8px` radius, border `1px #D7DBE0`, padding `0 12px`, `13px`, gap 7px:
1. Date window: calendar icon + `"22 Jul · 14:00–18:00"` (text `#0B0D12`).
2. `"Min capacity"` label (`#51555E`) + mono value `"150"` (weight 600, `#0B0D12`).
3. `"Layout"` label (`#51555E`) + `"Theater"` (weight 550, `#0B0D12`) + chevron icon (`M4 6l4 4 4-4`, 12px).

**Grid** (padding `18px 32px 24px`): `display:grid; grid-template-columns:repeat(3,1fr); gap:16px`.

### SpaceCard (default)
- Container: border `1px #ECEEF1`, radius **12px**, padding **18px**, bg white, shadow `0 1px 2px rgba(11,13,18,.04)` (= `--elev-raised` first layer).
- **Top row** (space-between, margin-bottom 12px):
  - Left: name `16px/600 #0B0D12`; floor `13px #8A8F98`.
  - Right: availability dot+label, inline-flex gap 6px, `12px/600`. Free → `#1A7F4B`(success) text + 8px dot; booked → `#9A6B00`(warning) text + dot. Copy: **"Free in window"** / **"Booked"**.
- **Capacity row** (baseline, gap 8px, padding-bottom 12px, bottom border `1px #ECEEF1`, margin-bottom 12px): big number mono `28px/600 letter-spacing -0.02em #0B0D12` + layout label `13px #8A8F98` (e.g. "theater", "fixed seating", "reception", "boardroom", "classroom").
- **Feature chips** (flex wrap gap 6px, margin-bottom 14px): each `12px #51555E`, bg `#F1F3F5`(surface-sunken), radius 999px, padding `3px 9px`.
- **Footer row** (space-between, center): rate mono `15px/600` + `" ALL/day"` suffix in `11px/400 #8A8F98`; then secondary **"View"** btn (sm).
- Mock cards (6): **Blue Hall** / Main floor · west wing / 220 / theater / [Stage, Hybrid AV, Step-free, Air-con] / 80,000 / free. **Orange Hall** / east wing / 180 / theater / [Stage, Hybrid AV, Step-free] / 72,000 / free. **Amphitheater** / Lower level / 400 / fixed seating / [Raked seating, Pro AV, Booth] / 140,000 / booked. **Foyer** / Ground · entrance / 120 / reception / [Bar, Coat check, Natural light] / 42,000 / booked. **Skyline Room** / Level 5 / 60 / boardroom / [Conf. table, Screen, Catering] / 30,000 / free. **Studio A** / Level 2 / 40 / classroom / [Modular, Whiteboards] / 18,000 / free.

### Loading
3-col grid of 6 skeleton cards. Each: border `1px #ECEEF1`, radius 12px, padding 18px, flex-col gap 12px, with skeletons `60%×16`, `40%×28`, `100%×12`, `70%×12`. Skeleton = shimmer gradient `linear-gradient(90deg,#EEF0F3 25%,#F6F7F9 50%,#EEF0F3 75%)`, `400px 100%`, `shimmer 1.4s linear infinite`, radius 6px.

### Empty
Dashed panel: border `1px dashed #D7DBE0`(border-strong), radius 12px, padding `56px 24px`, centered. Icon tile 44×44, radius 11px, bg `#F1F3F5`, fg `#8A8F98`, building/space icon (`M2.5 13V6L8 2.5 13.5 6v7M6 13V9h4v4`, 20px). Title `16px/600` **"No spaces match"**. Body `14px #8A8F98` **"No space fits 150 theater in this window. Try a smaller capacity or a different time."** Action: secondary **"Clear filters"**.

### Error
Solid panel: border `1px #ECEEF1`, radius 12px, padding `56px 24px`, centered. Icon tile 44×44 radius 11px, bg `#FBECEA`(danger-subtle), fg `#C8372D`(danger), warning icon (`M8 5v3.5M8 11v.2`, 20px). Title **"Couldn't load spaces"**. Body **"The connection to ops-core timed out."** Action: secondary **"Retry"**.

### Gap analysis — Spaces.tsx
**EXISTS:** PageHeader w/ title + filters (Select layout, Input minCapacity, two datetime-locals); `useSpaces` query; isLoading → `LoadingBlock`; empty → `EmptyState`; else 3-col responsive grid of `SpaceCard`.
**MISSING / WRONG:**
1. No subtitle (`6 spaces · availability for 22 Jul` / `0 of 6 match`). Add `subtitle` prop.
2. No breadcrumb. Canvas shows `Resources / Spaces`. PageHeader has no crumb support — add a `breadcrumb?: string[]` prop or accept the project decided to drop crumbs (verify against other pages; canvas always shows them).
3. No "Change window" action button in header.
4. Filters are raw `<Select>`/`<Input>` dropdowns, not the canvas's **pill-style filter chips** (34px, bordered, labeled "Min capacity 150" / "Layout Theater"). Canvas shows a single date-window pill summarizing start–end, not two separate datetime inputs. Rework filters to chip style.
5. **No error state** — page only handles loading/empty/default. Add `isError` → `ErrorState title={t('spaces.error')} onRetry={refetch}`.
6. **SpaceCard gaps** (SpaceCard.tsx):
   - Card padding is `px-5 py-4` (20×16) vs canvas **18px** all around. Set `p-[18px]`.
   - Card gap `gap-3`(12) ok, but canvas has explicit divider under the capacity row (border-bottom on capacity row) — current card has no internal divider. Add `border-b border-border-subtle pb-3` to the capacity block.
   - Floor line renders `{floor} · {kind}` but canvas floor is a single human string ("Main floor · west wing") — current shows kind separately; acceptable but verify copy source.
   - Availability label uses success/danger; canvas uses success/**warning** ("Booked" is warning `#9A6B00`, not danger). Change booked → `text-warning`.
   - Dot size: canvas 8px; current `size-1.5`(6px). Bump to `size-2`.
   - Capacity number leading: canvas `letter-spacing -0.02em`; current has `leading-none` but no tracking. Add `tracking-[-0.02em]`.
   - Rate: canvas `15px/600` with `ALL/day` suffix `11px`; current `13px` with `/ day`. Bump to `text-[15px] font-[600]`, suffix `text-[11px]`. **No "View" button** in current card — canvas has a secondary "View" btn linking to `/spaces/:id`. Add it.
   - Feature chip text `11px` matches; padding canvas `3px 9px` vs current `px-2 py-0.5`(8×2). Use `px-[9px] py-[3px]`.
**BUILD PLAN:** Extend PageHeader with breadcrumb; add subtitle + Change-window action; convert filters to chip controls; add error branch; rebuild SpaceCard padding/divider/availability-tone/rate-size/View-button.

---

# §5.2 Space detail  (`/spaces/:id`)  — current: **NO FILE — route missing, page missing**

Route `spaces/:id` is **absent** from `routes/index.tsx`. There is no `SpaceDetail.tsx`. This whole page must be built from scratch. Endpoint per PAGES.md: `GET /private/spaces/:id/availability`, `PATCH /private/spaces/:id`.

Page header: crumb `Resources / Spaces / Blue Hall`, title **Blue Hall**.
- **default** sub: `Main floor · west wing`; action area = "Available now" status (inline-flex gap 6px, `13px/600 #1A7F4B`, 8px success dot) **+** secondary **"Edit space"** btn with pencil icon (`M11 2.5 13.5 5 6 12.5 3 13l.5-3z`, 13px).
- **edit (OPS+)** sub: `Editing · OPS`; action = **"EDIT MODE"** pill (`11px/600 #2F6FED`, bg `#EEF3FE`, radius 999px, padding `4px 10px`) + primary **"Save changes"** + secondary **"Cancel"**.

**Body** (padding `24px 32px`): two cards side-by-side (flex gap 20px, wrap), then full-width availability timeline below (margin-top 20px).

### Capacity card (`capCard`)
flex:1, min-width 300px, border `1px #ECEEF1`, radius 12px, padding 20px. Title `15px/600` **"Capacity per layout"** (mb 14px). Then `fieldVal` rows for: Theater 220, Classroom 120, Banquet 160, Reception 300, Boardroom 40.
`fieldVal(label,val,unit)` row: space-between, padding `11px 0`, bottom border `1px #ECEEF1`. Label `14px #51555E`. Value mono `14px/600`, unit (" pax") in `#8A8F98 weight400`.
**Edit mode:** each value becomes an input chip — 32px tall, min-width 90px, right-aligned, padding `0 10px`, radius 7px, **border `1px #2F6FED`**, bg `#F7F9FE`(pale accent), mono `14px/600`.

### Details card (`sideCard`)
Same frame. Title **"Details"**. Rows: Day rate `80,000` ALL; Setup buffer `90` min; Teardown buffer `60` min. Then a Features block (padding-top 14px): label `13px #51555E` **"Features"** (mb 8px) + chips [Stage, Hybrid AV, Step-free, Air-con, Blackout, Riggable] — same chip style (`12px #51555E`, `#F1F3F5`, 999px, `3px 9px`).

### Availability timeline (`avail`)
border `1px #ECEEF1`, radius 12px, padding `24px 20px 16px`, margin-top 20px. Title `15px/600` **"Today's schedule · setup & teardown buffers"** (mb 24px). Track: `position:relative; height:50px`.
- **Time axis:** start 8:00, end 20:00, ticks every 2h (`08:00`…`20:00`), each a vertical `1px #F1F3F5` line; tick label mono `11px #8A8F98` positioned `-20px` top.
- **Setup buffer bar** (`.hatch-buffer`): 12:30→14:00, top 9px, height 30px, bg `#D7EEE0`, radius `5px 0 0 5px`, with diagonal hatch overlay.
- **Event bar:** 14:00→18:00, top 9px, height 30px, bg `#E9F6EF`(success-subtle), border `1px #1A7F4B`(success), label `11px/600 #15613A` **"FinTech Conf · 180"**, padding `0 9px`.
- **Teardown buffer bar:** 18:00→19:00, hatch, bg `#D7EEE0`, radius `0 5px 5px 0`.

### Loading
Two side-by-side card skeletons (flex gap 20px), each border `1px #ECEEF1`, radius 12px, padding 20px, flex-col gap 14px: left = skeletons `50%×18, 100%×12, 100%×12, 70%×12`; right = `40%×18, 100%×26, 80%×12`.

### Error
Single centered panel (border `1px #ECEEF1`, radius 12px, padding `56px 24px`): danger icon tile, title **"Couldn't load this space"**, body **"The connection to ops-core timed out."**, secondary **"Retry"**.

### Gap analysis — §5.2
**EXISTS:** Nothing. No route, no component, no `useSpace(id)`/`useSpaceAvailability(id)` hook wired into a page (check `api/hooks` for availability hooks).
**MISSING:** Entire page. SpaceCard "View" button has nowhere to link.
**BUILD PLAN:**
1. Add route `{ path: 'spaces/:id', element: <SpaceDetail /> }`.
2. Create `pages/SpaceDetail.tsx`: header with breadcrumb + "Available now"/"Edit space"; two cards (Capacity per layout, Details); availability timeline.
3. Build an `AvailabilityTimeline` command component (8:00–20:00 axis, status-colored event bars, hatched buffer extensions per `--success`/`#D7EEE0`). DESIGN_SYSTEM §4 names this component but it does not exist in `components/command/`.
4. Edit mode (OPS+ role gate): toggle fields to bordered-accent inputs, swap header action to Save/Cancel + EDIT MODE pill. Wire `PATCH /private/spaces/:id`.
5. Loading & error branches.

---

# §5.3 Inventory  (`/inventory`)  — current: `frontend/src/pages/Inventory.tsx`

Page header: crumb `Resources / Inventory`, title **Inventory**, sub `Availability for 22 Jul · 14:00–18:00` (low-stock state: `2 assets low for this window`), action = secondary **"Change window"** (calendar icon 13px).

**Low-stock banner** (only in `low-stock` state): margin `18px 32px 0`, bg `#FBF3E0`(warning-subtle), border `1px rgba(154,107,0,.28)`, radius 10px, padding `12px 16px`, flex gap 10px. Warning icon `#9A6B00` 16px + text `13px #7A5500`: **"Wireless microphone and Stage deck won't cover all held events in this window."** (the two names bold).

**Table** (padding `18px 32px 24px`): outer wrapper border `1px #ECEEF1`, radius 10px, overflow hidden.
- **Header row:** grid `220px 1fr 160px`, gap 20px, padding `11px 20px`, bg `#F7F8FA`, top+bottom border `1px #ECEEF1`, `11px #8A8F98 uppercase letter-spacing .04em weight500`. Columns: **"Asset"**, **"Availability · 22 Jul 14:00–18:00"**, **"In window"** (right-aligned).
- **Meter row** (`meter()`): grid `220px 1fr 160px`, gap 20px, center, padding `15px 20px`, top border `1px #ECEEF1`.
  - Col 1: name `14px/550` + location `12px #8A8F98`.
  - Col 2: the bar — `position:relative; height:12px; radius:999px; bg:#F1F3F5; inset shadow 0 0 0 1px rgba(11,13,18,.05)`. Available fill from left, width `avail/total%`, color `#1A7F4B` (or `#C8372D` when danger). Held segment starts at `avail%`, width `held/total%`, color **`#E0A300`**. Below bar (margin-top 6px, gap 14px, `12px #8A8F98`): legend "● available" (7px square swatch, color matches fill) + "● held N" (swatch `#E0A300`).
  - Col 3 (right): mono `15px/600 tabular-nums` `"avail / total"` (danger→`#C8372D`); below it either **LOW STOCK** badge (`#9A6B00`/`#FBF3E0`, noDot) / **OUT OF STOCK** badge (`#C8372D`/`#FBECEA`, noDot) / `"in stock"` text `12px #8A8F98`.
  - Mock rows: **Standard chair** / Store A · level −1 / 320 avail, 60 held, 500 total / ok. **Banquet round table** / Store B / 40, 8, 60 / ok. **Wireless microphone** / AV cabinet · backstage / 2, 4, 8 / **low**. **Stage deck (6×4m)** / Loading bay / 0, 1, 2 / **danger (OUT OF STOCK)**.

### Loading
4 skeleton rows: grid `220px 1fr 160px`, gap 20px, padding `18px 20px`, top border, skeletons `70%×14, 100%×12, 60%×14`.

### Empty
border `1px dashed #D7DBE0`, radius 12px, padding `64px 24px`, centered. Box icon tile (`M2.5 5 8 2.5 13.5 5v6L8 13.5 2.5 11zM2.5 5 8 7.5 13.5 5`, 20px). Title **"No assets yet"**. Body **"Add chairs, tables, AV gear and more to track availability."** Action: primary **"Add asset"** (plus icon).

### Error
border `1px #ECEEF1`, radius 12px, padding `64px 24px`, centered. Danger icon tile, **"Couldn't load inventory"**, **"The connection to ops-core timed out."**, secondary **"Retry"**.

### Gap analysis — Inventory.tsx
**EXISTS:** PageHeader + filters (type Select, two datetime inputs); `useAssets`; loading→LoadingBlock; empty→EmptyState; else a generic `Table` with cols Name/Type/Location/Available(`InventoryMeter`)/Status(`StatusBadge`).
**MISSING / WRONG:**
1. Wrong column structure. Canvas is **3 columns** (Asset / Availability / In window) on a `220px 1fr 160px` grid, NOT the 5-col Name/Type/Location/Available/Status table. Combine name+location into col 1; the meter+legend is col 2; the "avail/total + stock badge" is col 3. Rebuild as the grid layout, not the generic `Table`.
2. No subtitle / no "Change window" action / no breadcrumb.
3. **No low-stock banner** and **no low-stock subtitle**. Add a warning banner above the table when any asset is low.
4. **No error state.** Add `isError` → ErrorState.
5. **InventoryMeter is wrong** (`InventoryMeter.tsx`):
   - It takes only `available`/`total` — **no held segment**. Canvas renders a second amber (`#E0A300`) segment for held. Add a `held` prop and a second positioned fill.
   - Bar height `h-2`(8px) vs canvas **12px**. Bar has no inset shadow (`inset 0 0 0 1px rgba(11,13,18,.05)`); add it.
   - No legend row ("● available", "● held N"). Canvas shows it under the bar.
   - Low threshold: current `available <= total*0.1`. Canvas distinguishes **low** (warning, available>0) vs **danger/out-of-stock** (available===0). Current only has a single `low→danger`. Add `available===0` → danger + "OUT OF STOCK", `low` → warning + "LOW STOCK".
   - Number is `13px` inline; canvas separates it to col 3 as `15px/600` with a stock badge underneath. Restructure (the meter component should not own the number; the row layout does, OR pass a `variant`).
6. Header copy on the "Availability" column must echo the chosen window string.
**BUILD PLAN:** Replace generic Table with the 3-col grid; add held segment + legend + 12px bar + inset shadow to InventoryMeter (or a new layout); add low-stock banner + subtitle + error branch + Change-window action; per-row stock badge logic (in-stock / LOW STOCK / OUT OF STOCK).

---

# §5.4 Asset detail  (`/inventory/:id`)  — current: **NO FILE — route missing, page missing**

Route `inventory/:id` is **absent**. No `AssetDetail.tsx`. Build from scratch. Endpoint: `PATCH /private/assets/:id`.

Page header: crumb `Resources / Inventory / Wireless microphone`, title **Wireless microphone**.
- **default (where-reserved)** sub: `AV cabinet · backstage`; action = secondary **"Edit asset"** (pencil icon 13px).
- **edit (OPS+)** sub: `Editing · OPS`; action = **"EDIT MODE"** pill (`#2F6FED`/`#EEF3FE`) + primary **"Save changes"** + secondary **"Cancel"**.

**Body** (padding `24px 32px`):
1. **Stat tiles row** (flex gap 14px, wrap, mb 20px). Each `stat()`: flex:1, min-width 120px, border `1px #ECEEF1`, radius 10px, padding `14px 16px`. Label `13px #51555E` (mb 8px); value mono `24px/600`, colorable. Tiles: **Total** 8 (`#0B0D12`); **Available · window** 2 (`#9A6B00` warning); **Held** 4 (**`#E0A300`**); **Maintenance** 2 (`#0B0D12`).
2. **Two cards** (flex gap 20px, wrap): Details card + Where-it's-reserved card.

### Details card (`detailCard`)
flex:1, min-width 280px, border `1px #ECEEF1`, radius 12px, padding 20px. Title **"Details"** (mb 8px). `field()` rows (space-between, padding `11px 0`, bottom border `1px #ECEEF1`): Type **Audio**; Location **AV cabinet · backstage**; Total units **8**; Status → **ACTIVE** badge (`#1A7F4B`/`#E9F6EF`, noDot). Value `14px/550`. **Edit mode:** value → input chip 32px, min-width 150px, padding `0 10px`, radius 7px, border `1px #2F6FED`, bg `#F7F9FE`, `14px/550`.

### Where-it's-reserved card (`whereCard`)
flex:1, min-width 320px, same frame. Title **"Where it's reserved"** (mb 14px). Rows (flex center gap 12px, padding `11px 0`, bottom border `1px #ECEEF1`):
- left: event name `14px/550` + line `12px #8A8F98 mono` `"REQ-id · window"`.
- mid: mono `14px/600` quantity `"×N"`.
- right: status badge (noDot).
- Mock: **FinTech Conference** / REQ-2026-0142 · 22 Jul · 14:00–18:00 / ×2 / **HELD** (`#9A6B00`/`#FBF3E0`). **Product Launch** / REQ-2026-0139 · 21 Jul · 10:00–13:00 / ×2 / **CONFIRMED** (`#1A7F4B`/`#E9F6EF`).

### Gap analysis — §5.4
**EXISTS:** Nothing. SpaceCard/Inventory rows have no detail link target.
**MISSING:** Entire page + route + `useAsset(id)` hook.
**BUILD PLAN:**
1. Add route `{ path: 'inventory/:id', element: <AssetDetail /> }`.
2. `pages/AssetDetail.tsx`: header (breadcrumb, Edit asset / EDIT MODE); 4 stat tiles; Details card + Where-reserved card.
3. Stat tile + where-reserved-row are new presentational pieces; the stat tile is close to `KPIStat` — reuse/adapt (`KPIStat.tsx` exists).
4. Held color decision (`#E0A300` vs `--warning`).
5. Edit mode (OPS+) with bordered-accent inputs + `PATCH /private/assets/:id`.

---

# §6.1 Tasks board  (`/tasks`)  — current: `frontend/src/pages/Tasks.tsx`

Page header: crumb `Operations / Tasks`, title **Tasks**, sub `across 4 events · SETUP / TEARDOWN` (overdue state: `1 task overdue`), action = primary **"New task"** (plus icon `M8 3.5v9M3.5 8h9`, 13px).

**Overdue banner** (overdue state only): margin `18px 32px 0`, bg `#FBECEA`(danger-subtle), border `1px rgba(200,55,45,.28)`, radius 10px, padding `12px 16px`, flex gap 10px. Conflict/warning triangle icon `#C8372D` 16px + text `13px #7A2A23`: **"Build stage — Product Launch is 2 hours overdue and blocks setup."** (first phrase bold).

**Filters** (padding `16px 32px 0`): segmented control — inline-flex gap 2px, padding 3px, bg `#F1F3F5`, radius 8px. Tabs `["All events","FinTech Conf","Product Launch"]`, each `5px 12px`, `13px/550`, radius 6px; active (first) = bg white + shadow `0 1px 2px rgba(11,13,18,.08)` + `#0B0D12`; inactive `#51555E`.

**Board** (padding `18px 32px 24px`, flex gap 28px, wrap): two lanes.
`lane(title,icon,count,cards)`: flex:1, min-width 320px. Lane header (flex center gap 8px, mb 14px): icon `#51555E`; title `13px/600 uppercase letter-spacing .04em #51555E` (**SETUP** plus icon `M8 3.5v9M3.5 8h9`; **TEARDOWN** minus icon `M3 8h10`); count chip `12px #8A8F98`, bg `#F1F3F5`, radius 999px, padding `1px 8px`, mono.

`tcard(...)`: bg white, border `1px #ECEEF1` (overdue → `1px rgba(200,55,45,.3)`), radius 10px, padding `13px 14px`, mb 10px, shadow `0 1px 2px rgba(11,13,18,.04)`.
- Event tag: mono `11px #2F6FED` (mb 6px) — e.g. "REQ-0142 · FinTech Conf".
- Title: `14px/500 line-height 19px` (mb 11px).
- Footer (space-between center): left = avatar 24px (tinted) + relative-time `12px #8A8F98` (overdue → `#C8372D weight600`); right = either **"Saving…"** spinner state (`12px/600 #2F6FED` + 12px spinning ring `border-2 #DCE6FB top #2F6FED`) OR a status badge (noDot).
- Absolute due line (mt 8px): mono `11px #8A8F98` — e.g. "22 Jul · 11:00".
- Status colors (`sc`): TODO `#8A8F98`/`#F1F3F5`; IN_PROGRESS `#2F6FED`/`#EEF3FE`; DONE `#1A7F4B`/`#E9F6EF`; BLOCKED `#9A6B00`/`#FBF3E0`; OVERDUE `#C8372D`/`#FBECEA`.

**Mock — Setup lane (3):** "Arrange 180 chairs — theater layout" / REQ-0142 · FinTech Conf / EH avatar / in 3h / 22 Jul · 11:00 / IN_PROGRESS (in submitting state → "Saving…"). "Sound check — 2 wireless mics" / LK / in 4h / 22 Jul · 12:00 / TODO. Third = (default) "Hang banners — Foyer" / REQ-0148 Tech Meetup / LK / tomorrow / 23 Jul · 09:00 / TODO — OR (overdue) "Build stage — Product Launch" / REQ-0139 / AM / **2h overdue** / 21 Jul · 08:00 / OVERDUE.
**Teardown lane (3):** "Strike stage & store deck" / AM / in 9h / 22 Jul · 19:00 / TODO. "Return mics to inventory" / LK / in 9h / 22 Jul · 19:30 / TODO. "Clear Foyer — Product Launch" / REQ-0139 / EH / done / 21 Jul · 14:00 / DONE.

### Loading
Two skeleton lanes (flex gap 28px): each lane header skeleton `40%×14`, then 3 skeleton cards (border `1px #ECEEF1`, radius 10px, padding 14px, flex-col gap 10px) of `50%×11, 90%×14, 40%×12`.

### Empty
Single panel: border `1px #ECEEF1`, radius 12px, padding `72px 24px`, centered. **Success-tinted** icon tile 48×48, radius 12px, bg `#E9F6EF`(success-subtle), fg `#1A7F4B`, checkmark (`M3 8.5 6 11l7-7`, 22px). Title `17px/600` **"All caught up"**. Body `14px #8A8F98` max-width 320px **"No open setup or teardown tasks. New tasks appear here when a plan is approved."**

### Submitting
Same as default but the IN_PROGRESS card's footer-right shows the **"Saving…"** spinner instead of its badge.

### Gap analysis — Tasks.tsx + TaskBoard.tsx
**EXISTS:** PageHeader + a single request-`Select` filter; `useRequests`+`useTasks`; loading→LoadingBlock; empty→EmptyState; else `TaskBoard`. TaskBoard has SETUP/TEARDOWN lanes, per-task overdue detection (`dueAt < now && status!==DONE`), StatusBadge.
**MISSING / WRONG:**
1. Filter is a single `<Select>` of request titles, not the **segmented control** (`All events / FinTech Conf / Product Launch`). Replace with a `SegmentedControl`.
2. No subtitle (`across 4 events · SETUP / TEARDOWN` / `1 task overdue`), no breadcrumb, **no "New task" primary action**.
3. **No overdue banner.** Add a danger banner when any task is overdue.
4. **No submitting/"Saving…" state** on individual cards. Add per-card busy spinner footer.
5. **No error state** (page silently shows nothing on error).
6. **TaskBoard card structure differs:**
   - No **event tag** line (mono `11px #2F6FED` "REQ-xxx · Event"). The board is filtered per-request in current impl, so the tag was dropped — but canvas shows tasks from multiple events with tags. Add event tag.
   - Card layout: current has title+badge on one row, then owner/due on a meta row. Canvas: event tag → title → footer(avatar+rel-time | badge) → absolute-due. Reorder. Add a real **avatar** (24px, tinted) for owner, not plain text.
   - Card padding `px-3 py-2.5` vs canvas `13px 14px`. Radius `rounded-md`(10) matches. Add shadow `0 1px 2px rgba(11,13,18,.04)` and overdue red border.
   - Relative time ("in 3h", "2h overdue", "tomorrow", "done") is absent — current shows only absolute `formatDateTime`. Add relative formatting; overdue → `#C8372D weight600`.
   - Empty-lane placeholder differs (current shows per-lane dashed box; canvas just shows fewer cards — that's fine).
   - Lane header: current count is plain mono; canvas wraps count in a chip (`#F1F3F5` pill). Lane title color current `text-text-tertiary`(#8A8F98) vs canvas `#51555E`(secondary). Lane icons (plus/minus) absent in current — add.
7. **Empty state** in canvas is a positive success-tinted "All caught up" panel, not the generic gray `EmptyState`. Build a custom success empty for tasks.
**BUILD PLAN:** Add segmented filter, subtitle, New-task action, overdue banner, error branch, per-card Saving state; rebuild TaskBoard card (event tag, avatar, relative time, shadow, overdue border) and lane header (icon + count chip); custom "All caught up" empty.

---

# §6.2 Conflicts  (`/conflicts`)  — current: `frontend/src/pages/Conflicts.tsx`

Page header: crumb `Operations / Conflicts`, title **Conflicts**, sub `1 active conflict`. No action button.

**Body** (padding `18px 32px 24px`): conflict rows (`row()`):
- Container: border `1px rgba(200,55,45,.3)` when active (else `#ECEEF1`), radius 12px, padding `16px 18px`, mb 12px, bg `#FFFBFB` when active (else white).
- Top row (space-between center, wrap, gap 12px): left = triangle icon `#C8372D` 16px + title `15px/600` + **type chip** (mono `11px/600 #C8372D`, bg `#FBECEA`, radius 5px, padding `2px 7px`); right = primary **"See alternatives"** btn (sm).
- Detail `p`: `14px line-height 20px #7A2A23`, mt 10px.
- Request-id chips (flex gap 6px, mt 10px): each mono `12px #C8372D`, bg `#FBECEA`, radius 5px, padding `2px 7px`.
- Mock: title **"Blue Hall double-booked"**, type **SPACE_DOUBLE_BOOKED**, detail **"A networking mixer (REQ-0151) was confirmed for Blue Hall 18:00–20:00, overlapping the FinTech Conference teardown."**, ids `[REQ-0142, REQ-0151]`, active=true.

### Empty (calm)
border `1px #ECEEF1`, radius 12px, padding `72px 24px`, centered. **Success** icon tile 48×48, radius 12px, bg `#E9F6EF`, fg `#1A7F4B`, checkmark (`M3 8.5 6 11l7-7`, 22px). Title `17px/600` **"No conflicts right now"**. Body `14px #8A8F98` max-width 320px line-height 20px **"Every reservation fits. The schedule is clean — nothing needs your attention."** Action: secondary **"View calendar"**.

### Mobile · conflict (`mConflict`, 390px)
390×780 phone frame: top bar 48px (hamburger + "Conflict" title + green "Live" pill), bottom tab bar 58px (Home/Requests/Calendar/More). Body padding 16px:
- h1 `19px/600` "Conflict" (mb 14px).
- Danger card: bg `#FBECEA`, border `1px rgba(200,55,45,.28)`, radius 10px, padding 16px. Header (gap 8px): triangle icon `#C8372D` 16px + **"Blue Hall double-booked"** `15px/600`. Type chip on white: mono `11px #C8372D`, bg white, border `1px rgba(200,55,45,.25)`, radius 5px, padding `2px 7px`. Detail `14px #7A2A23 line-height 20px`: **"A mixer (REQ-0151) took Blue Hall 18:00–20:00, overlapping teardown."** Two full-width buttons (42px, radius 10px): primary **"See alternatives"** (#2F6FED), secondary **"Adjust request"** (white, border `1px #D7DBE0`).

### Gap analysis — Conflicts.tsx + ConflictBanner.tsx
**EXISTS:** PageHeader + filters (space Select + two datetime inputs); `useConflicts` (gated on start+end); a "not ready" hint; loading→LoadingBlock; >0 → `ConflictBanner`; ===0 → a custom calm success box.
**MISSING / WRONG:**
1. **Filter model differs.** Canvas has NO filter row — it shows a server-side list of active conflicts. Current requires the user to pick a space + window before anything loads (`ready = !!start && !!end`). PAGES.md endpoint is `GET /private/conflicts` (list). Drop the mandatory window-gating; show the active conflict list by default. (Filters optional.)
2. No subtitle (`1 active conflict`), no breadcrumb.
3. **Conflict presentation differs.** Canvas renders **per-conflict cards** (one bordered red card each with title + type chip + "See alternatives" + detail + id chips). Current uses the single `ConflictBanner` aggregate (a list inside one tinted box). For this page, render each conflict as its own card with the "See alternatives" action (sm primary) and id chips, matching `row()`. The `ConflictBanner` component is right for the request-detail inline moment, but the Conflicts page wants discrete cards.
4. **ConflictBanner styling vs `row()`:**
   - Banner has no per-conflict **type chip** (mono red pill) — it shows `t('conflict.${type}')` as text. Canvas shows the raw type as a mono chip. Add the chip.
   - Banner has no **"See alternatives" / "Adjust"** actions baked in (only optional `actions` slot). The page cards each have a sm primary "See alternatives".
   - Detail text color: current `text-text-secondary`(#51555E); canvas `#7A2A23` (dark danger). For conflict cards use the darker red.
   - Id chips: current renders `↳ id, id` as one mono line; canvas renders each id as a separate red pill chip (`#FBECEA`, radius 5px). Change to chips.
   - Active card bg `#FFFBFB` + border `rgba(200,55,45,.3)` — current banner is `bg-danger-subtle` flat. For the page row use the lighter near-white red bg.
5. **Empty state is close** (current: success-subtle box w/ ShieldCheck + `conflict.none`). Canvas uses a 48px tile, 17px title "No conflicts right now", body line, **"View calendar"** action. Current lacks the title/body split, the icon tile, and the action button. Upgrade to match (success tile + two-line copy + secondary "View calendar").
6. **No mobile variant** — current relies on responsive reflow. Verify the mobile conflict card renders the two stacked full-width buttons.
7. **No error state** for the conflicts list.
**BUILD PLAN:** Drop window-gating (load `/conflicts` list); add subtitle; render per-conflict cards (title + mono type chip + sm "See alternatives" + dark-red detail + red id-chips + active bg `#FFFBFB`); upgrade empty to titled success panel with "View calendar"; add error branch; verify mobile stacking.

---

# §6.3 Approvals (in request detail)  — current: **NO standalone file; partially in `RequestDetail.tsx`?** (verify)

The canvas renders Approvals as its own screen (`screen('Approvals', approvalsBody(...))`) under `/approvals`, though PAGES.md row 6.3 says approvals live **inside `/requests/:id`**. There is **no `Approvals.tsx`** and **no `/approvals` route**. The approve/reject controls per PAGES.md belong in `RequestDetail` — verify whether RequestDetail already implements them; the canvas board is the spec for the control cluster either way.

Page header: crumb `Operations / Approvals`, title **Approvals**.
- **default (MANAGER)** sub `5 awaiting decision`; no header action.
- **forbidden (VIEWER)** sub `Read-only for your role`; header action = **"VIEWER"** pill (`11px/600 #8A8F98`, bg `#F1F3F5`, radius 999px, padding `4px 10px`).

**Body** (padding `24px 32px`): a single approval `card`: max-width 620px, border `1px #ECEEF1`, radius 12px, padding 22px.
- Top (space-between, mb 14px): left = event `16px/600` **"FinTech Startup Conference"** + meta mono `13px #8A8F98` **"REQ-2026-0142 · 154,800 ALL"**; right = status badge — **PROPOSED** (`#9A6B00`/`#FBF3E0`) by default, **APPROVED** (`#1A7F4B`/`#E9F6EF`) in success.
- Description `14px #51555E line-height 21px` (mb 18px): **"Plan is feasible — Blue Hall, 180 theater, quote 154,800 ALL incl. VAT. Approving will confirm reservations and schedule setup tasks."**
- Footer (state-dependent):
  - **default:** flex gap 10px → primary **"Approve plan"** + secondary **"Reject"**.
  - **submitting:** primary **"Approving…"** with white spinner (14px ring `border-2 rgba(255,255,255,.4) top #fff`, `spin 700ms`) + secondary **"Reject"** **disabled**.
  - **success:** flex center gap 10px → success tile 28×28 radius 7px bg `#E9F6EF` fg `#1A7F4B` checkmark (15px) + text `14px/550 #15613A` **"Approved by Elira H. · reservations confirmed · audit recorded"**.
  - **forbidden (VIEWER):** flex-col gap 12px → an info notice (flex gap 9px, bg `#F7F8FA`, border `1px #ECEEF1`, radius 10px, padding `12px 14px`): lock icon (`M5 7V5a3 3 0 0 1 6 0v2M4 7h8v6H4z`, 16px `#8A8F98`) + text `13px #51555E line-height 19px` **"You're signed in as VIEWER. Approving and rejecting requires MANAGER or above."** (VIEWER bold). Then row (gap 10px): **"Approve plan" disabled** + **"Reject" disabled** (both `#F1F3F5`/`#B8BDC6`/border `#ECEEF1`). The spec note in PAGES.md says VIEWER sees disabled + **tooltip** — add a tooltip on the disabled buttons explaining the role gate.

### Gap analysis — §6.3
**EXISTS:** No `Approvals.tsx`, no `/approvals` route. Approve/reject logic may exist inside `RequestDetail.tsx` — **must inspect** to know which states are implemented (default/submitting/success/forbidden). The canvas approval-card cluster is the visual spec.
**MISSING:**
- The approval **card** (event title + meta + status badge + feasibility description + action cluster).
- **Forbidden/VIEWER** path: role gate → disabled Approve/Reject + the `#F7F8FA` lock notice + tooltip.
- **Submitting** path: "Approving…" spinner + disabled Reject.
- **Success** path: green confirmation strip "Approved by … · reservations confirmed · audit recorded".
- Subtitle (`5 awaiting decision` / `Read-only for your role`) + the VIEWER role pill in header.
**BUILD PLAN:**
1. Decide placement: per PAGES.md, embed the approval control cluster inside `RequestDetail.tsx` (role-gated for MANAGER+). The standalone `/approvals` screen in the canvas is the visual reference; if a standalone Approvals page is desired, add the route + page.
2. Build the approval card: header (title + `REQ-id · total ALL` + StatusBadge), feasibility paragraph, action footer.
3. Role gating from the auth/user store: VIEWER → both buttons `disabled` + Tooltip ("Requires MANAGER or above") + the lock notice. MANAGER+ → live Approve/Reject.
4. Wire `POST /private/requests/:id/approve` + `/reject`. Submitting → "Approving…" spinner, Reject disabled. Success → green confirmation strip; flip badge to APPROVED.

---

## Cross-cutting build notes for this area

1. **PageHeader needs a breadcrumb prop.** Every canvas page in this area shows a `Resources / …` or `Operations / …` crumb (last segment `#51555E`, others `#8A8F98`, `/` separators `#C4C8CE`). Current `PageHeader` has only title/subtitle/actions/filters. Add `breadcrumb?: string[]`.
2. **Two new routes + two new pages**: `spaces/:id` → `SpaceDetail.tsx`, `inventory/:id` → `AssetDetail.tsx`. Wire "View"/row links from §5.1/§5.3.
3. **New `AvailabilityTimeline` command component** (DESIGN_SYSTEM §4) for §5.2 — does not exist in `components/command/`.
4. **InventoryMeter** must gain a `held` segment (color decision: `#E0A300` vs `--warning`) + legend + 12px bar + inset shadow + low/out-of-stock badge logic.
5. **TaskBoard card** rebuild: event tag, owner avatar, relative time, overdue red border, per-card "Saving…" state.
6. **Conflicts page** should render a server list of per-conflict cards (drop window-gating), with mono type chips + red id-chips + "See alternatives".
7. **Error states** are missing on Spaces, Inventory, Tasks, Conflicts — all four need an `isError → ErrorState/Retry` branch (canvas error copy: "Couldn't load X" / "The connection to ops-core timed out." / Retry).
8. **Off-token hexes** (`#E0A300`, `#D7EEE0`, `#15613A`, `#7A2A23`, `#9E2B23`, `#7A5500`) appear in this area — either add tokens or document the darkened-status mapping before building.
9. Button height: canvas md = 36px, sm = 30px; current `Button.tsx` md = 34px, sm = 28px. Decide whether to bump to match the canvas (2px each).

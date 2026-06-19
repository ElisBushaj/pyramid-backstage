# §2 Primitives — Design Spec & Gap Analysis

Source of truth: `CLAUDE_DESIGN/Primitives.dc.html` (inline React in `<script type="text/x-dc">`).
Current impl: `frontend/src/components/ui/`.
Token map: `frontend/src/styles/tokens.css` + `globals.css` (`@theme inline`).

This digest captures EXACT canvas values (raw hex/px + token name) and a concrete build plan per primitive. Every value below is quoted from the raw source.

---

## Global / canvas conventions

- **Page bg**: `#DBDEE3` (canvas chrome only — not a token; the artboard frames sit on it).
- **Font stack on canvas root**: `'SF Pro Text','Geist',-apple-system,system-ui,sans-serif` → token `--font-sans`. Body text color `#0B0D12` → `--text-primary`.
- **Mono**: `'Geist Mono',monospace` → `--font-mono`. Used for §-labels, cell labels, state labels, IDs, Kbd.
- **Font weights loaded**: Geist 400;450;500;550;600;700 + Geist Mono 400;450;500. Note canvas uses **550** for buttons/labels (a real loaded weight, NOT 500).
- **Frame card** (each `§X.Y` panel wrapper): bg `#fff` (`--surface`), `border-radius:14px` (≈ `--radius-lg` 16; canvas literal is 14, NOT a token — see note), shadow `0 1px 2px rgba(11,13,18,.04), 0 0 0 1px rgba(11,13,18,.06)` = **exactly `--elev-raised`**, padding `28px`.
  - NOTE: frame radius `14px` is between `--radius-md` (10) and `--radius-lg` (16). For build, cards use `--radius-lg`. The 14 is a canvas-only chrome detail; do not chase it in primitives.
- **Cell label** (the small UPPERCASE caption above each specimen): `font-mono`, `11px`, color `#8A8F98` (`--text-tertiary`), `text-transform:uppercase`, `letter-spacing:0.03em`.
- **State label** (under toggle specimens): `font-mono`, `11px`, `#8A8F98` (`--text-tertiary`).
- **Section header** (`§X.Y` + title): num is `font-mono 12px #8A8F98`; title `h2` is `19px / 26px / weight 600` (= `--h2`); sub is `13px #8A8F98`.

---

## §2.1 Button

CVA-style matrix: **4 variants × 6 states**, plus a SIZES / ICON / FULL-WIDTH row.

### Shared button shape (`btn()`)
- `display:inline-flex; align-items:center; justify-content:center;`
- `gap:7px` between icon/spinner/label (NOTE: **7px**, not 8).
- `border-radius:8px` → between `--radius-sm` (6) and `--radius-md` (10). Canvas literal **8px**. (Current impl uses `rounded-sm`=6 — WRONG, see gap.)
- `font-weight:550`; `font-family:inherit`; `white-space:nowrap`.
- Default border `1px solid transparent`.

### Sizes (`sizes` map)
| Size | height | padding-x | font-size |
|---|---|---|---|
| `sm` | **28px** | **12px** | **13px** |
| `md` | **34px** | **14px** | **14px** |
| `lg` | **40px** | **18px** | **14px** (NOT 15) |

### Variant × State color grid (exact)

**primary** (text `#fff` = `--text-on-accent`):
| State | bg (raw) | token | extra |
|---|---|---|---|
| default | `#2F6FED` | `--accent` | shadow none |
| hover | `#2A63D4` | `--accent-hover` | |
| pressed | `#244FB0` | `--accent-pressed` | |
| focus | `#2F6FED` (`--accent`) | | + `box-shadow:0 0 0 3px rgba(47,111,237,.35)` |
| disabled | `#F1F3F5` (`--surface-sunken`) | | text `#B8BDC6`, border `1px solid transparent`, cursor `not-allowed` |
| loading | `#2F6FED` (`--accent`) | | spinner left, label `Saving` |

**secondary** (text `#0B0D12` = `--text-primary`; border `1px solid #D7DBE0` = `--border-strong`):
| State | bg (raw) | token |
|---|---|---|
| default | `#fff` | `--surface` |
| hover | `#F7F8FA` | `--surface-subtle` |
| pressed | `#F1F3F5` | `--surface-sunken` |
| focus | `#fff` (`--surface`) | + shadow `0 0 0 3px rgba(47,111,237,.35)` + border `1px solid #2F6FED` (`--border-focus`) |
| disabled | `#fff` (`--surface`) | text `#B8BDC6`, border `1px solid #ECEEF1` (`--border-subtle`) |
| loading | `#fff` | spinner color `#8A8F98` (`--text-tertiary`) |

**ghost** (text `#0B0D12` = `--text-primary`; border transparent):
| State | bg (raw) | token |
|---|---|---|
| default | `transparent` | |
| hover | `#F1F3F5` | `--surface-sunken` |
| pressed | `#ECEEF1` | `--border-subtle` |
| focus | `transparent` | + shadow `0 0 0 3px rgba(47,111,237,.35)` + border `1px solid #2F6FED` (`--border-focus`) |
| disabled | `#fff` (`--surface`) | text `#B8BDC6` |
| loading | `transparent` | spinner `#8A8F98` (`--text-tertiary`) |

**danger** (text `#fff` = `--text-inverted`):
| State | bg (raw) | token |
|---|---|---|
| default | `#C8372D` | `--danger` |
| hover | `#AE2F26` | (no token — darker danger) |
| pressed | `#94271F` | (no token — darker danger) |
| focus | `#C8372D` (`--danger`) | + shadow `0 0 0 3px rgba(47,111,237,.35)` (blue ring even on danger) |
| disabled | `#F1F3F5` (`--surface-sunken`) | text `#B8BDC6` |

**Focus ring (all variants)**: `0 0 0 3px rgba(47,111,237,.35)` — a 3px blue glow at 35% alpha. `47,111,237` = `#2F6FED` = `--accent`/`--border-focus`.
**Disabled text**: `#B8BDC6` — a NEW gray not in tokens (sits between `--border-strong` #D7DBE0 and `--text-tertiary` #8A8F98). Used as the universal disabled-foreground across §2.1–2.2.

### Spinner (`spinner()`)
- `display:inline-block; width/height = size` (button uses **13px**), `border:2px solid {trackColor}`, `border-top-color:{color}`, `border-radius:999px` (`--radius-pill`), `animation:spin 700ms linear infinite`.
- On primary/danger: track `rgba(255,255,255,.4)`, top `#fff`. On secondary/ghost: passed `#8A8F98` for both.
- `@keyframes spin { to { transform: rotate(360deg); } }`.

### Sizes / Icons / Full-width row
- Row separated by `padding-top:20px; border-top:1px solid #ECEEF1` (`--border-subtle`), `gap:40px`.
- SIZES cell: three primary buttons labeled `Small` / `Medium` / `Large`.
- ICON LEFT/RIGHT cell: secondary `New request` with left plus-icon `M8 3.5v9M3.5 8h9`; primary `See alternatives` with right chevron `M6 3.5 10.5 8 6 12.5`. Icons via `iconSvg()`: `15×15` default, `viewBox 0 0 16 16`, `stroke:currentColor`, `stroke-width:1.5`, round caps/joins.
- FULL WIDTH cell: width-200 container, primary `Approve plan`, `width:100%`.

### Literal copy
`Generate plan` (matrix), `Saving` (loading), `Small/Medium/Large`, `New request`, `See alternatives`, `Approve plan`.

---

## §2.2 IconButton

Square icon-only buttons, `34px × 34px`, `border-radius:8px`.

### GHOST variant (states default/hover/focus/disabled)
- icon color `#51555E` (`--text-secondary`); disabled icon `#B8BDC6`.
| State | bg (raw) | token | border | shadow |
|---|---|---|---|---|
| default | `transparent` | | `1px solid transparent` | none |
| hover | `#F1F3F5` | `--surface-sunken` | transparent | none |
| focus | `transparent` | | `1px solid #2F6FED` (`--border-focus`) | `0 0 0 3px rgba(47,111,237,.3)` |
| disabled | `transparent` | | transparent | none; icon `#B8BDC6` |

NOTE focus ring here is `.3` alpha (vs `.35` on Button).

### SUBTLE variant
- One specimen: bg `#F1F3F5` (`--surface-sunken`), border `1px solid transparent`, icon `#51555E` (`--text-secondary`). `34×34`, radius 8. Icon = hamburger `M3 8h10M3 4h10M3 12h10`.

### WITH TOOLTIP (hover) cell
- Button: bg `#F1F3F5` (`--surface-sunken`), icon `#0B0D12` (`--text-primary`), filter-icon `M2.5 4h11M5 8h6M7 12h2`.
- Tooltip bubble above: `position:absolute; bottom:42px`, bg `#0B0D12` (`--surface-inverted`), color `#fff` (`--text-inverted`), `font-size:12px`, `padding:5px 9px`, `border-radius:6px` (`--radius-sm`), `box-shadow:0 4px 12px rgba(0,0,0,.2)`, `white-space:nowrap`. Copy: **`Filter`**.
- Arrow: `8×8` square, bg `#0B0D12`, `transform:rotate(45deg)`, `bottom:-4px`, centered.

### Icon glyph (generic, `iconSvg` 16px): question-ish `M8 2.5a2 2 0 0 1 2 2c0 1.5-2 2-2 4M8 11.5v.5`.

---

## §2.3 Input / Textarea

Single-line control: `height:38px`, `padding:0 12px`, `border-radius:8px`, `display:flex; align-items:center; gap:8px`.

### State grid (`input()`)
| State | border (raw) | token | bg | shadow | text color |
|---|---|---|---|---|---|
| empty (placeholder) | `1px solid #D7DBE0` | `--border-strong` | `#fff` | none | placeholder `#8A8F98` (`--text-tertiary`) |
| focus | `1px solid #2F6FED` | `--border-focus` | `#fff` | `0 0 0 3px rgba(47,111,237,.18)` | value `#0B0D12` |
| filled | `1px solid #D7DBE0` | `--border-strong` | `#fff` | none | `#0B0D12` (`--text-primary`) |
| error | `1px solid #C8372D` | `--danger` | `#fff` | none | + message below |
| disabled | `1px solid #ECEEF1` | `--border-subtle` | `#F7F8FA` (`--surface-subtle`) | none | text `#B8BDC6` |

- **Default border is `--border-strong` (#D7DBE0)**, NOT `--border-subtle`. (Current impl uses `border-subtle` — WRONG.)
- **Focus ring** = `0 0 0 3px rgba(47,111,237,.18)` (18% alpha — softer than button's .35). This is a SHADOW ring, not an `outline`.
- Value text `font-size:14px`.
- Placeholder value text in canvas: `Search requests…`. Filled value: `FinTech Startup Conference`.

### Error message
- Wrap becomes `flex-col gap:6px`; message span `font-size:13px; color:#C8372D` (`--danger`). Copy: **`Attendee count is required`**.

### Prefix / Suffix
- prefix span: `color:#8A8F98` (`--text-tertiary`), `14px`. Copy `#`.
- suffix span: `color:#8A8F98` (`--text-tertiary`), `13px`, **`font-mono`**. Copy `pax`. Value shown `180`.

### Textarea
- Default: `width:100%; min-height:80px; padding:10px 12px; border-radius:8px; border:1px solid #D7DBE0` (`--border-strong`); `font-size:14px; line-height:21px; color:#0B0D12`.
- Focus: border `1px solid #2F6FED` (`--border-focus`) + `box-shadow:0 0 0 3px rgba(47,111,237,.18)`; placeholder text `#8A8F98`.
- Copy (filled): `Requirements: stage, podium, 2 wireless mics, hybrid streaming, coffee service for 180.` Placeholder (focus): `Add requirements…`.

---

## §2.4 Select / Combobox

### Closed trigger (`selClosed`)
- `display:flex; justify-content:space-between; align-items:center; height:38px; padding:0 12px; border-radius:8px; border:1px solid #D7DBE0` (`--border-strong`); bg `#fff`; `font-size:14px; width:220px`.
- Value `Theater`. Chevron-down icon `M4 6.5 8 10l4-3.5`, `14px`.

### Dropdown panel (`dropdownPanel`)
- `border-radius:10px` (`--radius-md`); `border:1px solid #ECEEF1` (`--border-subtle`); bg `#fff`; `padding:6px`.
- **Shadow**: `0 16px 40px -12px rgba(11,13,18,.18), 0 0 0 1px rgba(11,13,18,.06)` — NOTE this is `--elev-overlay` MINUS the middle `0 2px 6px` layer. For build use `--elev-overlay` (the extra middle layer is negligible).
- width 220 (list) or 240 (combobox).

### Option row (`optRow`)
- `padding:8px 12px; font-size:14px; border-radius:6px` (`--radius-sm`).
- Unselected: color `#51555E` (`--text-secondary`), weight 400, bg transparent.
- Selected: color `#0B0D12` (`--text-primary`), weight 550, bg `#EEF3FE` (`--accent-muted`), trailing check `M2.5 6.2 4.8 8.5 9.5 3.5` (14px).
- Options: `Theater`*, `Banquet`, `Classroom`, `Reception`.

### Combobox · search header
- search row: `flex; gap:8px; padding:8px 10px; margin:-6px -6px 6px; border-bottom:1px solid #ECEEF1` (`--border-subtle`). Magnifier icon `M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10ZM11 11l3 3` (14). Typed text `Blue` at `14px #0B0D12`.
- Results: `Blue Hall`* (selected), `Blue Lounge`.

### Empty results
- search text `Xyz`; empty msg `padding:18px 12px; text-align:center; font-size:13px; color:#8A8F98` (`--text-tertiary`). Copy: **`No spaces match "Xyz"`** (smart quotes in source).

---

## §2.5 Checkbox / Radio / Switch

Three stacked groups, each separated by `padding-top:22px; border-top:1px solid #ECEEF1`. Group title `13px / weight 550`, `margin-bottom:14px`. Each `toggleRow` lays specimens `gap:28px` with a mono `11px #8A8F98` state label beneath.

### Checkbox (`checkbox()`) — `18×18`, `border-radius:5px`
| State | bg | border | shadow | mark |
|---|---|---|---|---|
| unchecked | `#fff` | `1px solid #D7DBE0` (`--border-strong`) | none | none |
| checked | `#2F6FED` (`--accent`) | `1px solid #2F6FED` | none | white check `M2.5 6.2 4.8 8.5 9.5 3.5` `stroke #fff width 1.8`, 11×11 |
| indeterminate | `#2F6FED` (`--accent`) | `1px solid #2F6FED` | none | white bar `9×2`, `border-radius:1px`, `#fff` |
| focus | `#fff` | `1px solid #D7DBE0` | `0 0 0 3px rgba(47,111,237,.3)` | none |
| disabled | `#F1F3F5` (`--surface-sunken`) | `1px solid #ECEEF1` (`--border-subtle`) | none | none |

Radius `5px` = between `--radius-xs`(4) and `--radius-sm`(6). Build: `--radius-xs` or literal 5.

### Radio (`radio()`) — `18×18`, `border-radius:999px` (`--radius-pill`), `box-sizing:border-box`
| State | bg | border |
|---|---|---|
| unchecked | `#fff` | `1px solid #D7DBE0` (`--border-strong`) |
| checked | `#fff` | **`5px solid #2F6FED`** (`--accent`) — thick ring forms the dot |
| focus | `#fff` | `1px solid #D7DBE0` + `0 0 0 3px rgba(47,111,237,.3)` |
| disabled | `#F1F3F5` (`--surface-sunken`) | `1px solid #ECEEF1` (`--border-subtle`) |

### Switch (`toggle()`) — track `36×21`, `border-radius:999px`
| State | track bg | knob |
|---|---|---|
| unchecked | `#D7DBE0` (`--border-strong`) | left `2px` |
| checked | `#2F6FED` (`--accent`) | left `17px` |
| focus | (unchecked track) + `0 0 0 3px rgba(47,111,237,.3)` | |
| disabled-on | `#A8C4F5` (no token — muted accent) | |
| disabled-off | `#ECEEF1` (`--border-subtle`) | |

- Knob: `17×17`, `top:2px`, `border-radius:999px`, bg `#fff`, `box-shadow:0 1px 2px rgba(0,0,0,.2)`.
- **Transition**: `background 120ms cubic-bezier(0.2,0,0,1)` (track) + `left 120ms cubic-bezier(0.2,0,0,1)` (knob) → `--dur-micro` + `--ease-std`.

States shown: checkbox `[unchecked, checked, indeterminate, focus, disabled]`; radio/switch `[unchecked, checked, focus, disabled]`.

---

## §2.6 FormField

Two-column grid (`1fr 1fr`, `gap:28px`, `max-width:700px`). Each field is `flex-col gap:7px`.

### Valid field
- `<label>`: `font-size:14px; font-weight:550` (color inherits `#0B0D12`).
- control: filled input, value `180`.
- hint span: `font-size:13px; color:#8A8F98` (`--text-tertiary`). Copy: `Used to match space capacity and seating layout.`
- Label copy: `Expected attendees`.

### Error field
- label `Preferred date *` (`14px/550`).
- control: error input, placeholder `Select date`.
- error msg below: `13px #C8372D` (`--danger`). Copy: `Pick at least one preferred date.`

NOTE: canvas FormField label is `14px / 550` and inherits `--text-primary`. Hint/error are `13px`. (Current impl label is `13px / 550 / text-secondary` and hint/error `12px` — WRONG sizes, see gap.)

---

## §2.7 Dialog (modal)

Rendered inside a demo well (`bg:#EBEDF0; padding:32px; border-radius:10px; overflow:hidden`).

- **Overlay**: `position:absolute; inset:0; background:rgba(11,13,18,.35)` (35% ink scrim). NO blur in canvas.
- **Content panel**: `width:440px`; bg `#fff` (`--surface`); `border-radius:14px` (≈ `--radius-lg`); `padding:24px`; **shadow `0 16px 40px -12px rgba(11,13,18,.28), 0 2px 6px rgba(11,13,18,.06)`** — note `.28` (heavier than `--elev-overlay`'s `.18`) and NO `0 0 0 1px` ring layer.
- **Header row**: `flex; align-items:center; gap:12px; margin-bottom:10px`.
  - Icon chip: `32×32; border-radius:8px; background:#FBECEA` (`--danger-subtle`); icon color `#C8372D` (`--danger`); warning-triangle glyph `M8 5v3.5M8 11v.2M8 2 1.5 13.5h13L8 2Z` (16px).
  - Title `<h3>`: `font-size:16px; font-weight:600` (`--h3`).
- **Body `<p>`**: `font-size:14px; line-height:21px; color:#51555E` (`--text-secondary`); `margin:0 0 20px`. Copy: `The organizer will be notified and any held reservations released. This is recorded in the audit log.`
- **Footer**: `flex; justify-content:flex-end; gap:10px` — secondary `Cancel` + danger `Reject request`.
- Title copy: `Reject this request?`

NOTE: this is a confirm/destructive dialog with a LEADING ICON CHIP and NO top-right close X in the body. (Current impl has a header with bottom border + close X, no icon chip — different layout.)

---

## §2.8 Drawer

Right-anchored panel in a `260px`-tall well (`bg:#EBEDF0; border-radius:10px; overflow:hidden; justify-content:flex-end`).

- **Scrim**: `position:absolute; inset:0; background:rgba(11,13,18,.3)` (30%).
- **Panel**: `width:320px`; bg `#fff`; **shadow `-16px 0 40px -12px rgba(11,13,18,.18)`** (left-cast); `padding:20px`; `flex-col gap:14px`. NO border-radius (full-height edge panel).
- **Header**: `flex; justify-content:space-between; align-items:center`. Title `<h3>` `16px/600` `Reservation`; close X (icon `M4 4l8 8M12 4l-8 8`, 16) color `#8A8F98` (`--text-tertiary`).
- **Status badge**: warning badge `HELD · 12:04` — fg `#9A6B00` (`--warning`), bg `#FBF3E0` (`--warning-subtle`).
- **Meta line**: `font-size:14px; color:#51555E` (`--text-secondary`); `line-height:21px`. Copy: `Blue Hall · 22 Jul 2026 · 14:00–18:00`.
- **Divider**: `height:1px; background:#ECEEF1` (`--border-subtle`).
- **Motion caption**: mono `12px #8A8F98`: `right · slides in 280ms` → `--dur-page` 280ms, `--ease-std`. (Bottom variant on mobile per sub-label `right (desktop) · bottom (mobile)`.)

---

## §2.9 Popover / Tooltip / DropdownMenu

Three cells side-by-side (`gap:40px`).

### TOOLTIP
- bg `#0B0D12` (`--surface-inverted`); color `#fff` (`--text-inverted`); `font-size:12px; padding:5px 9px; border-radius:6px` (`--radius-sm`). Copy: `Lease expires 22 Jul 14:12`.

### POPOVER
- `width:220px`; bg `#fff`; `border-radius:10px` (`--radius-md`); **shadow `0 16px 40px -12px rgba(11,13,18,.18), 0 0 0 1px rgba(11,13,18,.06)`** (= overlay minus middle layer); `padding:14px`.
- Title: `font-size:13px; font-weight:600; margin-bottom:6px` — `FinTech Startup Conf`.
- Body: `font-size:13px; color:#51555E` (`--text-secondary`); `line-height:19px`. Copy: `180 pax · theater` / `14:00–18:00 + buffers`.

### DROPDOWN MENU
- `width:200px`; bg `#fff`; `border-radius:10px`; same overlay shadow; `padding:6px`.
- Item (`menuItem`): `flex; gap:10px; padding:7px 10px; border-radius:6px` (`--radius-sm`); `font-size:14px`. Default text `#0B0D12` (`--text-primary`), icon `#8A8F98` (`--text-tertiary`). Danger item text+icon `#C8372D` (`--danger`).
- Items: `Duplicate` (icon `M5 5h7v7H5zM3 3h7`), `Edit` (`M3 11l8-8 2 2-8 8H3z`), separator `height:1px; background:#ECEEF1; margin:5px 0`, then danger `Release hold` (X icon).

---

## §2.10 Toast

`toast(fg, sub, icon, title, msg)` — four toasts wrap `gap:18px`.

- Card: `flex; gap:12px; width:340px`; bg `#fff`; `border-radius:10px` (`--radius-md`); **shadow `0 16px 40px -12px rgba(11,13,18,.18), 0 0 0 1px rgba(11,13,18,.06)`**; `padding:14px`; **`border-left:3px solid {fg}`** (status accent rail).
- Icon chip: `22×22; border-radius:6px` (`--radius-sm`); bg `{sub}`; color `{fg}`; `flex-shrink:0`.
- Title: `font-size:14px; font-weight:600`. Message: `font-size:13px; color:#51555E` (`--text-secondary`); `margin-top:2px; line-height:18px`.
- Close X: `#8A8F98` (`--text-tertiary`), icon `M4 4l8 8M12 4l-8 8` (13px).

### Four variants (fg / sub):
| Variant | fg (raw) | token | sub (raw) | token | icon glyph | Title | Message |
|---|---|---|---|---|---|---|---|
| info | `#2F6FED` | `--info`/`--accent` | `#EEF3FE` | `--info-subtle`/`--accent-muted` | `M8 7v4M8 5v.2` | `Info` | `Plan regenerated with updated dates.` |
| success | `#1A7F4B` | `--success` | `#E9F6EF` | `--success-subtle` | check `M2.5 6.2 4.8 8.5 9.5 3.5` | `Approved` | `Request scheduled. Reservations confirmed.` |
| warning | `#9A6B00` | `--warning` | `#FBF3E0` | `--warning-subtle` | `M8 5v3.5M8 11v.2` | `Hold expiring` | `Blue Hall lease expires in 2 minutes.` |
| danger | `#C8372D` | `--danger` | `#FBECEA` | `--danger-subtle` | `M8 5v3.5M8 11v.2` | `Conflict detected` | `Blue Hall is double-booked on 22 Jul.` |

Sub-label: `info / success / warning / danger · enter & exit` (slide+fade per motion principle).

---

## §2.11 Tabs / SegmentedControl

### Tabs (`tab(label, active)`)
- Tab item: `padding:10px 2px; font-size:14px`. Active: `font-weight:600; color:#0B0D12` (`--text-primary`); `border-bottom:2px solid #0B0D12`. Inactive: `font-weight:400; color:#8A8F98` (`--text-tertiary`); `border-bottom:2px solid transparent`.
- Tab strip container: `flex; gap:24px; border-bottom:1px solid #ECEEF1` (`--border-subtle`); `width:100%`.
- Tabs: `Overview`* / `Quote` / `Tasks` / `Audit`.

### SegmentedControl (`segBtn(label, active)`)
- Track: `inline-flex; gap:2px; padding:3px; background:#F1F3F5` (`--surface-sunken`); `border-radius:8px`.
- Segment: `padding:6px 16px; font-size:13px; font-weight:550; border-radius:6px` (`--radius-sm`). Active: color `#0B0D12` (`--text-primary`); bg `#fff` (`--surface`); `box-shadow:0 1px 2px rgba(11,13,18,.08)`. Inactive: color `#51555E` (`--text-secondary`); bg transparent; no shadow.
- Segments: `Day`* / `Week` / `Month`.

---

## §2.12 Badge / StatusBadge

`badge(fg, sub, label, dot)` — pill, `flex; gap:6px`; bg `{sub}`; **`border:1px solid {fg}26`** (the fg hex + `26` alpha hex = ~15%); `border-radius:999px` (`--radius-pill`); `padding:3px 10px`; `font-size:12px; font-weight:600`; color `{fg}`; `white-space:nowrap`. Dot: `6×6; border-radius:999px; background:{fg}` (unless `dot===false`).

NOTE the canvas badge has a **1px translucent border in the fg color** (`{fg}26`). (Current `Badge.tsx` has NO border — see gap.) Also font-weight is **600** here (current impl 550).

### Nine status specimens (fg / sub → token):
| Label | fg | token | sub | token |
|---|---|---|---|---|
| `DRAFT` | `#8A8F98` | `--text-tertiary` (neutral) | `#F1F3F5` | `--surface-sunken` |
| `PROPOSED` | `#9A6B00` | `--warning` | `#FBF3E0` | `--warning-subtle` |
| `APPROVED` | `#1A7F4B` | `--success` | `#E9F6EF` | `--success-subtle` |
| `SCHEDULED` | `#2F6FED` | `--info` | `#EEF3FE` | `--info-subtle` |
| `CONFIRMED` | `#1A7F4B` | `--success` | `#E9F6EF` | `--success-subtle` |
| `HELD` | `#9A6B00` | `--warning` | `#FBF3E0` | `--warning-subtle` |
| `RELEASED` | `#8A8F98` | neutral | `#F1F3F5` | `--surface-sunken` |
| `REJECTED` | `#C8372D` | `--danger` | `#FBECEA` | `--danger-subtle` |
| `CONFLICT` | `#C8372D` | `--danger` | `#FBECEA` | `--danger-subtle` |

NOTE: neutral subtle bg in canvas is `#F1F3F5` (`--surface-sunken`), NOT `#F7F8FA`. Current impl neutral uses `bg-surface-subtle` (#F7F8FA) — minor mismatch.
NOTE: `APPROVED` maps to **success** color in the canvas badge specimen, while `StatusBadge.tsx` maps APPROVED→`info`. The DESIGN_SYSTEM status table says APPROVED→success domain; align to canvas (success) for the visual.

---

## §2.13 Avatar

`avatar(initials, size, color)` — `border-radius:999px` (`--radius-pill`); bg `{color}` default `#E3E7EC`; color `#51555E` (`--text-secondary`); centered; `font-size:size*0.4; font-weight:600`; **`box-shadow:inset 0 0 0 1px rgba(11,13,18,.06)`** (subtle inner ring).

### Sizes & specimens
- `EH` @ `40px` bg `#E3E7EC` (neutral gray).
- `LK` @ `32px` bg `#DCE6FB` (blue tint — no token; ~accent-muted family).
- `AM` @ `24px` bg `#E9F6EF` (`--success-subtle`).
- **Stacked group**: `display:flex; margin-left:12px`; each avatar `28px` with `box-shadow:0 0 0 2px #fff` (white ring) and `margin-right:-8px` overlap (last has 0). Members: `EH` (#E3E7EC), `LK` (#DCE6FB), `+3` (#F1F3F5 = `--surface-sunken`).
- Font sizes: 40→16px, 32→12.8px, 28→11.2px, 24→9.6px (size×0.4).

---

## §2.14 Skeleton / Spinner

### Skeleton (`skel(w,h)`)
- `border-radius:6px` (`--radius-sm`); **`background:linear-gradient(90deg,#EEF0F3 25%,#F6F7F9 50%,#EEF0F3 75%)`**; `background-size:400px 100%`; **`animation:shimmer 1.4s linear infinite`**.
- `@keyframes shimmer { 0% { background-position:-200px 0; } 100% { background-position:200px 0; } }`.
- Specimen block: `flex-col gap:10px; width:280px` → rows `skel('60%',16)`, `skel('100%',12)`, `skel('90%',12)`, `skel('40%',12)`.
- NOTE: this is a **shimmer gradient sweep**, NOT a `pulse` opacity fade. Colors `#EEF0F3` / `#F6F7F9` are near `--surface-sunken`/`--surface-subtle` but distinct literals.

### Spinner
- Same `spinner()` as §2.1. SPINNER cell: `flex; gap:16px` → `spinner(16,'#2F6FED')` (accent) + `spinner(22,'#8A8F98')` (tertiary). `border:2px`, `border-top-color:{color}`, `border-radius:999px`, `spin 700ms linear infinite`.

---

## §2.15 Kbd

`kbd(k)` — `inline-flex; align-items:center; height:22px; padding:0 7px; border-radius:5px`; bg `#F7F8FA` (`--surface-subtle`); `border:1px solid #D7DBE0` (`--border-strong`); **`box-shadow:0 1px 0 #D7DBE0`** (bottom-edge "key" depth); `font-mono`; `font-size:12px`; color `#51555E` (`--text-secondary`).
- Specimens: `⌘` `K` — label `open command palette` (`13px #8A8F98`, mx 8) — `⌘` `↵` — `submit` (`13px #8A8F98`).
- Radius `5px` (between xs 4 / sm 6).

---

# GAP ANALYSIS

Legend: ✅ exists/correct · ⚠️ exists but wrong · ❌ missing.

## §2.1 Button — `Button.tsx` ⚠️
EXISTS: cva with primary/secondary/ghost/danger; sm/md/lg; fullWidth; loading (Loader2 spinner); asChild via Slot.
WRONG:
- **Radius**: `rounded-sm` (6px) → canvas wants **8px**. Add a custom radius (e.g. `rounded-[8px]` or new `--radius-button`).
- **Sizes**: `sm h-8`(32) / `md h-9`(36) / `lg h-11`(44) → canvas is **28 / 34 / 40**. lg font `text-[15px]` → canvas **14px**. md px `px-4`(16) → canvas **14px**. sm/lg px also differ (canvas 12/18).
- **gap-2**(8) → canvas **7px**.
- **danger hover**: `hover:opacity-90` → canvas wants explicit `#AE2F26` hover / `#94271F` pressed.
- **secondary hover**: only `hover:bg-surface-subtle`; missing `active:bg-surface-sunken` pressed.
- **ghost**: text is `text-text-secondary` → canvas ghost text is `--text-primary` (#0B0D12); add `active:bg-border-subtle` pressed.
- **disabled**: uses `disabled:opacity-50` → canvas uses explicit disabled bg `--surface-sunken` (filled) and text `#B8BDC6`. Opacity approach loses the exact spec; acceptable but not pixel-parity.
- **focus**: `focus-visible:outline-2 outline-border-focus outline-offset-2` → canvas focus is a **3px shadow ring `rgba(47,111,237,.35)`** + (secondary/ghost) a `--border-focus` border. Switch to `focus-visible:ring`/shadow approach for parity.
- **weight**: `font-[550]` ✅ correct.
BUILD PLAN: retune `size` heights/px/font (28/34/40, px 12/14/18, fs 13/14/14, gap 7px); set `rounded-[8px]`; add danger `hover:bg-[#AE2F26] active:bg-[#94271F]`; secondary/ghost add `active:` pressed bgs and ghost `text-text-primary`; replace focus outline with `focus-visible:shadow-[0_0_0_3px_rgba(47,111,237,0.35)]` (+ border on secondary/ghost); set explicit disabled styles (`disabled:bg-surface-sunken disabled:text-[#B8BDC6]`). Spinner: 13px in-button is fine via `size-3.5`.

## §2.2 IconButton — ❌ NO FILE
MISSING entirely. Build new `IconButton.tsx`: `34×34`, `rounded-[8px]`, variants `ghost`/`subtle`. ghost: transparent → `hover:bg-surface-sunken`, focus `border-border-focus`+`shadow-[0_0_0_3px_rgba(47,111,237,.3)]`, icon `text-text-secondary`, disabled icon `#B8BDC6`. subtle: `bg-surface-sunken` icon `text-text-secondary`. Accept `aria-label` (icon-only a11y). sm size variant too (DESIGN_SYSTEM lists sm·md). Pair with `Tooltip` for the hover-tooltip pattern.

## §2.3 Input / Textarea — `Input.tsx` ⚠️
EXISTS: Input, Textarea, Select (native) with `invalid`; base shared class; `h-9` input; `min-h-20 py-2` textarea.
WRONG:
- **height**: `h-9`(36) → canvas **38px** (`h-[38px]`).
- **radius**: base uses `rounded-sm`(6) → canvas **8px**.
- **default border**: `border-border-subtle` → canvas default is **`--border-strong`** (#D7DBE0). The `hover:border-border-strong` is then redundant.
- **focus**: `focus-visible:outline-2 outline-border-focus outline-offset-0` → canvas focus = **`border-border-focus` + shadow `0 0 0 3px rgba(47,111,237,.18)`** (18% — softer than button). Replace outline with border+ring shadow.
- **error**: `border-danger` ✅ but no built-in message (that's FormField's job — ok).
- **disabled**: `disabled:opacity-50` → canvas disabled = `bg-surface-subtle` + `border-border-subtle` + text `#B8BDC6`.
- **prefix/suffix & gap**: not supported. Canvas has prefix (`#`, tertiary) / suffix (`pax`, mono tertiary) slots and `gap:8px`. Add optional `prefix`/`suffix` props with a flex wrapper.
- **Textarea**: `min-h-20`(80) ✅; padding `py-2`(8) vs canvas `10px 12px` (close). line-height not set → add `leading-[21px]`.
BUILD PLAN: base → `h-[38px] rounded-[8px] border-border-strong`; focus via `focus-visible:border-border-focus focus-visible:shadow-[0_0_0_3px_rgba(47,111,237,0.18)] focus-visible:outline-none`; disabled → explicit subtle bg + #B8BDC6 text; add prefix/suffix wrapper variant; textarea `leading-[21px] px-3 py-2.5`.

## §2.4 Select / Combobox — ⚠️ partial (native only)
EXISTS: native `<select>` in Input.tsx (styled trigger only).
MISSING: the Radix Select / Combobox popover (`@radix-ui/react-select` installed) — closed trigger (220w, chevron `M4 6.5 8 10l4-3.5`), open panel (`rounded-md` 10, `shadow-overlay`, `p-1.5`), option rows (selected: `bg-accent-muted text-text-primary font-[550]` + check), combobox search header (border-bottom, magnifier), empty-results state (`No spaces match "…"`, 13px tertiary, centered). 
BUILD PLAN: new `Select.tsx` (Radix Select) + `Combobox.tsx`. Trigger `h-[38px] rounded-[8px] border-border-strong px-3`; content `rounded-md border-border-subtle shadow-overlay p-1.5`; item `px-3 py-2 rounded-sm`, selected `bg-accent-muted text-text-primary font-[550]`; combobox adds a search row + empty state.

## §2.5 Checkbox / Radio / Switch — ❌ NO FILES
MISSING all three (Radix `react-checkbox`, `react-switch` installed; radio not installed — add `@radix-ui/react-radio-group`).
BUILD PLAN:
- `Checkbox.tsx`: `18×18 rounded-[5px] border-border-strong`; checked `bg-accent border-accent` + white check svg (width 1.8); indeterminate white `9×2` bar; focus `shadow-[0_0_0_3px_rgba(47,111,237,.3)]`; disabled `bg-surface-sunken border-border-subtle`.
- `Radio.tsx`: `18×18 rounded-pill border-border-strong`; checked `border-[5px] border-accent`; focus ring `.3`; disabled muted.
- `Switch.tsx`: track `36×21 rounded-pill bg-border-strong`, checked `bg-accent`, knob `17×17` `translate-x` 2→17, `transition` `duration-micro ease-std`, knob shadow `0 1px 2px rgba(0,0,0,.2)`, disabled-on `#A8C4F5` / disabled-off `--border-subtle`.

## §2.6 FormField — `FormField.tsx` ⚠️
EXISTS: label + children + error/hint wiring; `gap-1.5`(6) ✅ (canvas 7px — close).
WRONG:
- **label**: `text-[13px] font-[550] text-text-secondary` → canvas is **`text-[14px] font-[550]`** inheriting **`--text-primary`**. Change size 13→14 and color to `text-text-primary`.
- **hint/error**: `text-[12px]` → canvas **13px**. Change to `text-[13px]`.
- gap: `gap-1.5`(6) → canvas `7px` (`gap-[7px]`), minor.
BUILD PLAN: label `text-[14px] font-[550] text-text-primary`; hint `text-[13px] text-text-tertiary`; error `text-[13px] text-danger`; gap-[7px].

## §2.7 Dialog — `Dialog.tsx` ⚠️
EXISTS: Radix Dialog Root/Trigger/Close; `DialogContent` with title + close X + body; overlay `bg-black/30 backdrop-blur-[1px]`; `rounded-lg shadow-overlay`; max width 520.
WRONG / MISSING vs canvas confirm-dialog:
- Canvas dialog has a **leading status icon chip** (`32×32 rounded-[8px] bg-danger-subtle text-danger` warning glyph) + inline `<h3>` title in the body (NO header bottom-border, NO top-right X). Current is a generic titled-with-close header — keep for general dialogs but add a **confirm/destructive layout** (icon chip + title row, body `<p>` `text-text-secondary`, footer `justify-end gap-2.5` Cancel + danger action).
- Overlay scrim canvas `rgba(11,13,18,.35)` vs current `black/30` (.30) + blur. Canvas has NO blur. Use `bg-[rgba(11,13,18,0.35)]`, drop blur for parity (or keep — minor).
- Content radius: current `rounded-lg`(16) ≈ canvas 14 (ok). Shadow: canvas confirm shadow is `.28` 2-layer; current `shadow-overlay` `.18` 3-layer — acceptable.
- width 440 (confirm) vs current 520 (md) — make width a size prop (sm 440 / md 520 / lg).
BUILD PLAN: add a `ConfirmDialog`/`AlertDialog` variant (icon chip, no header border/X, body p, end-aligned footer). Footer gap `gap-2.5`(10). Add `size` prop for width.

## §2.8 Drawer — ❌ NO FILE
MISSING. Build `Drawer.tsx` (Radix Dialog with side positioning, or `vaul`-style). Right variant: `width:320px`, full height, `bg-surface`, `shadow-[-16px_0_40px_-12px_rgba(11,13,18,.18)]`, `p-5 gap-3.5 flex-col`, scrim `bg-[rgba(11,13,18,0.3)]`, header (title `text-[16px]/600` + close X `text-text-tertiary`), slide-in `280ms` (`--dur-page` `--ease-std`). Bottom variant for mobile (`md:` breakpoint).

## §2.9 Popover / Tooltip / DropdownMenu — ⚠️ Tooltip only
EXISTS: `Tooltip.tsx` (Radix) — `bg-surface-inverted text-text-inverted text-[12px] px-2.5 py-1.5 rounded-sm shadow-overlay` + arrow + fade. ✅ matches canvas tooltip (`12px`, inverted, `padding 5px 9px`≈`py-1.5 px-2.5`, `rounded-sm`).
- Minor: canvas tooltip padding `5px 9px` vs current `py-1.5 px-2.5`(6/10) — negligible.
MISSING: `Popover.tsx` (Radix popover installed) — `w-[220px] rounded-md shadow-overlay p-3.5`, title `13px/600`, body `13px text-text-secondary leading-[19px]`. `DropdownMenu.tsx` (Radix installed) — `rounded-md shadow-overlay p-1.5`, item `gap-2.5 px-2.5 py-1.5 rounded-sm text-[14px]`, icon `text-text-tertiary`, separator `h-px bg-border-subtle my-1.5`, destructive item `text-danger`.
BUILD PLAN: add `Popover.tsx` + `DropdownMenu.tsx` per above. Tooltip is fine.

## §2.10 Toast — ❌ NO FILE
MISSING (Radix `react-toast` installed). Build `Toast.tsx` + a `ToastProvider`/viewport. Card: `flex gap-3 w-[340px] bg-surface rounded-md shadow-overlay p-3.5 border-l-[3px]` with the rail color per tone (`--info/--success/--warning/--danger`). Icon chip `22×22 rounded-sm bg-{tone-subtle} text-{tone}`. Title `14px/600`, message `13px text-text-secondary mt-0.5 leading-[18px]`. Close X `text-text-tertiary`. Tone variants info/success/warning/danger with correct icons. Enter slide+fade, exit per `--ease-exit`.

## §2.11 Tabs / SegmentedControl — ❌ NO FILE
MISSING (Radix `react-tabs` installed). 
- `Tabs.tsx`: trigger `px-0.5 py-2.5 text-[14px]`; active `font-[600] text-text-primary border-b-2 border-text-primary`; inactive `font-[400] text-text-tertiary border-b-2 border-transparent`; list `flex gap-6 border-b border-border-subtle`.
- `SegmentedControl.tsx`: track `inline-flex gap-0.5 p-[3px] bg-surface-sunken rounded-[8px]`; segment `px-4 py-1.5 text-[13px] font-[550] rounded-sm`; active `bg-surface text-text-primary shadow-[0_1px_2px_rgba(11,13,18,.08)]`; inactive `text-text-secondary`.

## §2.12 Badge / StatusBadge — `Badge.tsx` / `StatusBadge.tsx` ⚠️
EXISTS: `Badge` cva tones neutral/success/warning/danger/info + `dot`; `StatusBadge` maps status→tone with i18n label.
WRONG:
- **No border**. Canvas badge has `border:1px solid {fg}26` (translucent fg). Add per-tone `border` with fg-color at ~15% (e.g. `border border-success/15` or explicit rgba). 
- **font-weight**: current `font-[550]` → canvas **600**.
- **padding**: current `px-2.5 py-0.5`(10/2) → canvas `3px 10px` (`px-2.5 py-[3px]`). 
- **dot size**: current `size-1.5`(6) ✅. gap `gap-1.5`(6) ✅.
- **neutral bg**: current `bg-surface-subtle`(#F7F8FA) → canvas neutral sub is **`--surface-sunken`** (#F1F3F5).
- **StatusBadge APPROVED**: maps to `info` → canvas specimen shows APPROVED as **success** (green). Reconcile (canvas favors success); SCHEDULED stays info ✅, PROPOSED warning ✅, CONFLICT danger ✅, RELEASED neutral ✅.
BUILD PLAN: add `font-[600]`, `py-[3px]`, per-tone translucent border, neutral bg → `bg-surface-sunken`; set APPROVED→success in `StatusBadge` TONE map (and confirm against DESIGN_SYSTEM status table — APPROVED is in the success domain).

## §2.13 Avatar — ❌ NO FILE
MISSING (Radix `react-avatar` installed). Build `Avatar.tsx`: `rounded-pill`, sizes sm(24)/md(32)/lg(40), initials fallback `font-[600] text-text-secondary`, default bg `#E3E7EC`, `box-shadow:inset 0 0 0 1px rgba(11,13,18,.06)`, font-size = size×0.4. Plus an `AvatarStack` (28px each, `-ml-2` overlap, `ring-2 ring-surface` white ring, trailing `+N` chip `bg-surface-sunken`).

## §2.14 Skeleton / Spinner — `Feedback.tsx` ⚠️
EXISTS: `Skeleton` (`animate-pulse rounded-sm bg-surface-sunken`), `Spinner` (Loader2 `size-4 text-text-tertiary`), `LoadingBlock`.
WRONG:
- **Skeleton motion**: canvas uses a **shimmer gradient sweep** (`linear-gradient(90deg,#EEF0F3,#F6F7F9,#EEF0F3)`, `background-size:400px`, `@keyframes shimmer 1.4s`), NOT `animate-pulse`. Add a `shimmer` keyframe + gradient bg for parity. radius `rounded-sm`(6) ✅.
- **Spinner**: Lucide Loader2 is fine visually; canvas spinner is a 2px ring `spin 700ms`. Sizes: canvas shows 16 (accent) + 22 (tertiary). Current single `size-4 text-text-tertiary` — add a `size`/`tone` prop (accent option, 700ms).
BUILD PLAN: define `@keyframes shimmer` in globals; Skeleton → `bg-[linear-gradient(90deg,#EEF0F3_25%,#F6F7F9_50%,#EEF0F3_75%)] bg-[length:400px_100%] animate-[shimmer_1.4s_linear_infinite]`. Add Spinner `tone` (accent/tertiary) + size, `animate-spin` (700ms via `duration` or custom).

## §2.15 Kbd — ❌ NO FILE
MISSING. Build `Kbd.tsx`: `inline-flex items-center h-[22px] px-[7px] rounded-[5px] bg-surface-subtle border border-border-strong shadow-[0_1px_0_#D7DBE0] font-mono text-[12px] text-text-secondary`. Render children (e.g. `⌘`, `K`, `↵`).

---

# Summary — what to build/fix

**Brand-new files needed** (Radix pkgs mostly already installed): `IconButton`, `Checkbox`, `Radio` (needs `@radix-ui/react-radio-group`), `Switch`, `Select`/`Combobox` (Radix Select), `Drawer`, `Popover`, `DropdownMenu`, `Toast` (+provider), `Tabs`, `SegmentedControl`, `Avatar` (+AvatarStack), `Kbd`.

**Retune existing**: `Button` (sizes 28/34/40, radius 8, gap 7, danger/ghost/secondary state bgs, shadow focus ring, explicit disabled), `Input/Textarea` (h-38, radius 8, default border-strong, shadow focus ring .18, disabled bg, prefix/suffix), `FormField` (label 14/text-primary, hint/error 13), `Dialog` (add confirm/destructive layout + size prop), `Badge` (font 600, translucent border, py-3px, neutral bg sunken), `StatusBadge` (APPROVED→success), `Skeleton` (shimmer not pulse).

**New token-ish constants to introduce**: disabled foreground `#B8BDC6`; danger hover/pressed `#AE2F26`/`#94271F`; button radius 8px; focus-ring shadows `rgba(47,111,237,.35|.30|.18)`. Recommend adding these to `tokens.css` (`--text-disabled`, `--danger-hover`, `--danger-pressed`, `--radius-control:8px`, `--ring-strong/--ring-soft`) rather than scattering literals.

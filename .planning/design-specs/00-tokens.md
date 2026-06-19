# 00 — Tokens (§1) — Design Spec Digest & Gap Analysis

**Canvas source:** `CLAUDE_DESIGN/Tokens.dc.html` (§1, 10 artboards §1.1–§1.10) + `CLAUDE_DESIGN/index.dc.html`
**Build target:** `frontend/src/styles/tokens.css` + `frontend/src/styles/globals.css` + `frontend/index.html`
**Docs:** `docs/05-frontend/DESIGN_SYSTEM.md` §2

This is the contract. Every component references these semantic vars — never a raw hex. The canvas asserts a value set that is, with very few exceptions, an **exact match** to `tokens.css`. The single material gap is **fonts are never actually loaded in the build** (see §FONTS). A handful of canvas-only values (`--surface-sunken`, `--ease-exit` per the bottom strip, `--border-strong`) are present in `tokens.css`; one swatch color `#F1F3F5` ("Sunken") and a chrome hex `#D7DBE0` (border-strong) appear in the canvas and are accounted for. All deltas are enumerated below.

---

## FONTS — the one critical gap (read first)

### Canvas loads Geist + Geist Mono from Google Fonts
Every `.dc.html` `<helmet>` carries:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;450;500;550;600;700&family=Geist+Mono:wght@400;450;500&display=swap" rel="stylesheet">
```

- **Geist** weights loaded: `400, 450, 500, 550, 600, 700`.
- **Geist Mono** weights loaded: `400, 450, 500`.
- `display=swap`.

### Font-family stacks used in the canvas inline styles
- Sans wrapper (every artboard root `<div>`): `font-family:'SF Pro Text','Geist',-apple-system,system-ui,sans-serif;`
- Mono (labels, hex values, spec strings, mono type sample): `font-family:'Geist Mono',monospace;`

> Note: the canvas wrapper lists `'SF Pro Text'` **first**, then `'Geist'`. Because the canvas explicitly loads Geist via Google Fonts, on a non-Apple machine the text renders in **Geist** (the design intent). The mono stack is `'Geist Mono',monospace` with **no** `'SF Mono'` first — so canvas mono is always **Geist Mono**.

### tokens.css stacks (build)
```css
--font-sans: 'SF Pro Text', 'Geist', -apple-system, system-ui, sans-serif;
--font-mono: 'SF Mono', 'Geist Mono', ui-monospace, Menlo, monospace;
```
The **string definitions match** the canvas sans stack (and `DESIGN_SYSTEM.md §2.2`). Mono stack adds `'SF Mono'` first + `ui-monospace, Menlo` — a superset, fine.

### THE BUG: nothing loads Geist in the build
- `frontend/index.html` has **no** Google Fonts `<link>`, **no** `<link rel="preconnect">`.
- No `@font-face` and no `@import` of any font in `globals.css` / `tokens.css`.
- No `@fontsource/geist*` (or any geist) package in `node_modules`; no local `.woff2` files anywhere under `frontend/`.

**Consequence:** the build only ever shows Geist on a machine that already has SF Pro Text (Apple) or Geist installed locally. On Linux/Windows CI and most reviewer machines, both `'SF Pro Text'` and `'Geist'` miss and it falls through to `-apple-system` (also absent off-Apple) → `system-ui`. **The design's actual typeface (Geist) is never rendered.** This silently breaks parity on metrics, x-height, and the `font-weight:450/550` intermediate weights that only Geist ships.

**Fix (pick one):**
1. **Self-host via Fontsource (preferred, no network at runtime):**
   ```bash
   npm i @fontsource-variable/geist @fontsource-variable/geist-mono
   ```
   then in `globals.css` (top, after the `@import "./tokens.css";`):
   ```css
   @import '@fontsource-variable/geist';
   @import '@fontsource-variable/geist-mono';
   ```
   Variable fonts cover the 450/550 intermediate weights the scale needs.
2. **Match the canvas exactly (Google Fonts CDN):** add to `frontend/index.html` `<head>`:
   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;450;500;550;600;700&family=Geist+Mono:wght@400;450;500&display=swap" rel="stylesheet">
   ```
   Verify `450` and `550` are in the weight axis (the canvas requests both).

Either way the weight axis MUST include **450** (mono token) and **550** (body-strong, swatch names) — these are non-default weights the type scale depends on and the OS system font cannot supply.

---

## §1.1 — Color · Surfaces

4-up grid (`grid-template-columns:repeat(4,1fr); gap:16px`), each swatch in a raised card (`#fff`, `border-radius:14px`, raised shadow, `padding:24px`). Swatch block: `height:72px; border-radius:10px; box-shadow:inset 0 0 0 1px rgba(11,13,18,.08)`. Sub-label is `Geist Mono 11px` at `opacity:.85`.

| Name | Canvas hex | var | tokens.css | sub-label | match |
|---|---|---|---|---|---|
| Surface | `#FFFFFF` | `--surface` | `#FFFFFF` | page + cards | ✅ |
| Subtle | `#F7F8FA` | `--surface-subtle` | `#F7F8FA` | chrome, headers | ✅ |
| Sunken | `#F1F3F5` | `--surface-sunken` | `#F1F3F5` | wells, insets | ✅ |
| Inverted | `#0B0D12` | `--surface-inverted` | `#0B0D12` | tooltips, palette | ✅ |

Swatch name uses `font-size:13px; font-weight:550; color:#0B0D12` (`--text-primary`); var-name `Geist Mono 12px #8A8F98` (`--text-tertiary`); hex line `Geist Mono 12px #51555E` (`--text-secondary`).

## §1.2 — Color · Text

4-up grid. Block is `height:72px` showing a `22px / weight:600` glyph "Ag" in the swatch color, on white (or `#0B0D12` for inverted).

| Name | Canvas hex | var | tokens.css | match |
|---|---|---|---|---|
| Primary | `#0B0D12` | `--text-primary` | `#0B0D12` | ✅ |
| Secondary | `#51555E` | `--text-secondary` | `#51555E` | ✅ |
| Tertiary | `#8A8F98` | `--text-tertiary` | `#8A8F98` | ✅ |
| Inverted | `#FFFFFF` | `--text-inverted` | `#FFFFFF` (on `#0B0D12`) | ✅ |

> `--text-on-accent: #FFFFFF` exists in `tokens.css` but is **not** shown as its own swatch in the canvas (it equals `--text-inverted`). Not a gap.

## §1.3 — Color · Borders

3-up grid (`repeat(3,1fr)`).

| Name | Canvas hex | var | tokens.css | sub-label | match |
|---|---|---|---|---|---|
| Subtle | `#ECEEF1` | `--border-subtle` | `#ECEEF1` | dividers, inputs | ✅ |
| Strong | `#D7DBE0` | `--border-strong` | `#D7DBE0` | hover, emphasis | ✅ |
| Focus | `#2F6FED` | `--border-focus` | `#2F6FED` | focus ring | ✅ |

## §1.4 — Accent (ONE calm blue)

4-up grid.

| Name | Canvas hex | var | tokens.css | sub-label | match |
|---|---|---|---|---|---|
| Accent | `#2F6FED` | `--accent` | `#2F6FED` | default | ✅ |
| Hover | `#2A63D4` | `--accent-hover` | `#2A63D4` | hover | ✅ |
| Pressed | `#244FB0` | `--accent-pressed` | `#244FB0` | pressed | ✅ |
| Muted tint | `#EEF3FE` | `--accent-muted` | `#EEF3FE` | copilot surface | ✅ |

## §1.5 — Operational status

4-up grid of status demo cards (fg + subtle bg). Each card: `border-radius:10px; background:<subtle>; box-shadow:inset 0 0 0 1px rgba(11,13,18,.06); padding:14px`. Inside: a pill chip (`border-radius:999px; padding:3px 10px 3px 8px; border:1px solid <fg>33`) with a `7px` dot in `<fg>` + label `12px/600 <fg>`; below it two `28px` squares `border-radius:7px` (one solid fg, one subtle).

| Name | fg hex | subtle hex | fg var | subtle var | chip label | match |
|---|---|---|---|---|---|---|
| Success | `#1A7F4B` | `#E9F6EF` | `--success` | `--success-subtle` | `CONFIRMED` | ✅ |
| Warning | `#9A6B00` | `#FBF3E0` | `--warning` | `--warning-subtle` | `HELD` | ✅ |
| Danger | `#C8372D` | `#FBECEA` | `--danger` | `--danger-subtle` | `CONFLICT` | ✅ |
| Info | `#2F6FED` | `#EEF3FE` | `--info` | `--info-subtle` | `SCHEDULED` | ✅ |

> `--info` / `--info-subtle` deliberately equal `--accent` / `--accent-muted` (`#2F6FED` / `#EEF3FE`). All 8 hexes match `tokens.css`.

### Status → token mapping table (5 rows)
Header bar `background:#F7F8FA; border-bottom:1px solid #ECEEF1; 12px/500; letter-spacing:0.03em; uppercase; color:#8A8F98`. Columns `1.4fr 0.8fr 2fr`: **Operational state / Token / Used by**. Each row `padding:13px 24px; border-bottom:1px solid #ECEEF1`. Token cell is a pill (`background:<subtle>; 12px/600; color:<fg>` + `6px` dot).

| Operational state (literal copy) | Token | fg | subtle | "Used by" copy |
|---|---|---|---|---|
| Available / Confirmed / Done / Feasible | `success` | `#1A7F4B` | `#E9F6EF` | space free, reservation CONFIRMED, task DONE, plan feasible |
| Held / Low inventory / Proposed | `warning` | `#9A6B00` | `#FBF3E0` | reservation HELD + expiresAt, inventory low, request PROPOSED |
| Conflict / Rejected / Overdue | `danger` | `#C8372D` | `#FBECEA` | conflict.detected, request REJECTED, task overdue |
| Scheduled / Informational | `info` | `#2F6FED` | `#EEF3FE` | request SCHEDULED, neutral banners |
| Draft / Released / Inactive | `neutral` | `#8A8F98` | `#F1F3F5` | request DRAFT, reservation RELEASED |

> **`neutral` is a semantic pairing the canvas asserts** but `tokens.css` does NOT define as named vars: `neutral` fg `#8A8F98` = `--text-tertiary`, `neutral` subtle `#F1F3F5` = `--surface-sunken`. `DESIGN_SYSTEM.md §2.1` confirms neutral = "`text-tertiary`" (no dedicated token). **Not a hex gap** — both values exist under other names — but StatusBadge's `neutral` variant must map to `--text-tertiary` on `--surface-sunken`. Optional nicety: add `--neutral: var(--text-tertiary); --neutral-subtle: var(--surface-sunken);` aliases so the 5 status families are symmetric. Low priority.

## §1.6 — Typography (the type scale)

Container card `padding:8px 24px`. Each row: `display:flex; align-items:baseline; gap:24px; padding:16px 0; border-bottom:1px solid #ECEEF1`. Left column fixed `width:150px`: token name (`Geist Mono 13px/500 #0B0D12`) + spec (`Geist Mono 12px #8A8F98`). Right: the live sample at the row's size/lh/weight/tracking, `color:#0B0D12`, `font-variant-numeric:tabular-nums`; mono row uses `'Geist Mono',monospace`.

| Token | Size/px | LH/px | Weight | Tracking | Mono? | Sample (literal) |
|---|---|---|---|---|---|---|
| `display` | 32 | 38 | 600 | `-0.02em` | — | `134,000 ALL` |
| `h1` | 24 | 30 | 600 | `-0.01em` | — | `FinTech Startup Conference` |
| `h2` | 19 | 26 | 600 | (none / 0) | — | `Operational Plan` |
| `h3` | 16 | 22 | 600 | (none / 0) | — | `Blue Hall — Reservation` |
| `body` | 14 | 21 | 400 | (none / 0) | — | `Matched space and generated quote for 180 attendees.` |
| `body-strong` | 14 | 21 | 550 | (none / 0) | — | `Capacity for theater layout` |
| `small` | 13 | 18 | 400 | (none / 0) | — | `Held lease expires in 12m 04s` |
| `caption` | 12 | 16 | 500 | `0.01em` | — | `STATUS · ATTENDEES · VALUE` |
| `mono` | 13 | 18 | 450 | (none / 0) | ✅ Geist Mono | `REQ-2026-0142 · 22 Jul 2026 14:00` |

Matches `DESIGN_SYSTEM.md §2.2` exactly. **Weights 450 and 550 are required and only Geist ships them** (see §FONTS). `tokens.css` defines **no type-scale custom properties** — the scale lives only in Tailwind utilities / component classes. See gap note below.

## §1.7 — Spacing

Card `padding:28px 24px`. Bars `display:flex; align-items:flex-end; gap:20px; flex-wrap:wrap`. Each bar: `width:<v>px; height:48px; background:#2F6FED; border-radius:3px` with a `Geist Mono 12px #51555E` numeric caption.

**Steps (px):** `4, 8, 12, 16, 24, 32, 48, 64` — the 4-pt grid. Sub-label on §1.7 header: "4-pt grid · gutters 24 mobile / 32 desktop".

> `tokens.css` defines **no spacing custom properties** — spacing is Tailwind's default 4px-based scale (`p-1`=4, `p-2`=8, `p-3`=12, `p-4`=16, `p-6`=24, `p-8`=32, `p-12`=48, `p-16`=64). All 8 steps are reachable. Not a hard gap; see note.

## §1.8 — Radius

Card `padding:28px 24px`. Boxes `display:flex; align-items:flex-end; gap:20px; flex-wrap:wrap`. Each box `width:64px; height:64px; background:#F1F3F5; box-shadow:inset 0 0 0 1px #D7DBE0`, radius applied to **TL/TR/BR** corners only (BL square); the `999` box is demoed at `32px` actual radius but labeled `999`. Caption `Geist Mono 12px #51555E`.

| Canvas value | var | tokens.css | match |
|---|---|---|---|
| `4` | `--radius-xs` | `4px` | ✅ |
| `6` | `--radius-sm` | `6px` | ✅ |
| `10` | `--radius-md` | `10px` | ✅ |
| `16` | `--radius-lg` | `16px` | ✅ |
| `999` | `--radius-pill` | `999px` | ✅ |

> Note: the cards/swatches throughout the canvas use `border-radius:14px`, and `box-shadow:inset 0 0 0 1px #D7DBE0` on the radius demo uses `--border-strong` `#D7DBE0` (background `#F1F3F5` = `--surface-sunken`). `14px` is a one-off demo-card radius and is NOT a token — production cards use `--radius-lg` (16) per `DESIGN_SYSTEM.md` ("cards 10–16"). Don't add a 14px token.

## §1.9 — Elevation

Panel `background:#F7F8FA; padding:36px 24px`. Each chip: a `120×72` white tile `border-radius:10px` with the shadow applied; name `13px/550`, use-label `Geist Mono 11px #8A8F98`.

| Name | Use | Shadow (exact) | var | tokens.css | match |
|---|---|---|---|---|---|
| flat | none | `none` | `--elev-flat` | `none` | ✅ |
| raised | cards, popovers | `0 1px 2px rgba(11,13,18,.04), 0 0 0 1px rgba(11,13,18,.06)` | `--elev-raised` | `0 1px 2px rgba(11, 13, 18, 0.04), 0 0 0 1px rgba(11, 13, 18, 0.06)` | ✅ |
| overlay | modals, drawers | `0 16px 40px -12px rgba(11,13,18,.18), 0 2px 6px rgba(11,13,18,.05), 0 0 0 1px rgba(11,13,18,.06)` | `--elev-overlay` | `0 16px 40px -12px rgba(11, 13, 18, 0.18), 0 2px 6px rgba(11, 13, 18, 0.05), 0 0 0 1px rgba(11, 13, 18, 0.06)` | ✅ |

Exact 3-layer stacks match (canvas writes `.18`/`.05`/`.06`; tokens.css writes `0.18`/`0.05`/`0.06` — identical values).

> `index.dc.html` card-hover shadow is `0 16px 40px -12px rgba(11,13,18,.18), 0 2px 6px rgba(11,13,18,.05), 0 0 0 1px rgba(11,13,18,.1)` — same as `--elev-overlay` but the **ring alpha is `.1` instead of `.06`**. This is an index-page-only hover treatment, not a token. Note for the index/landing build only.

## §1.10 — Motion

Card `padding:24px`. 3-up grid of demo rows. Each row: token name (`Geist Mono 13px/500`), `val · use` (`Geist Mono 12px #8A8F98`), and a `4px` track `background:#EEF3FE` (`--accent-muted`) with a `40%` fill `background:#2F6FED` (`--accent`) animated `infinite alternate`. Bottom strip (`border-top:1px solid #ECEEF1`, `Geist Mono 12px #51555E`) lists the easings.

| Token | Value | Use | tokens.css | match |
|---|---|---|---|---|
| `--dur-micro` | `120ms` | hover, toggles | `120ms` | ✅ |
| `--dur-std` | `200ms` | popovers, tabs | `200ms` | ✅ |
| `--dur-page` | `280ms` | drawers, pages | `280ms` | ✅ |
| `--ease-std` | `cubic-bezier(0.2,0,0,1)` | (default ease-out) | `cubic-bezier(0.2, 0, 0, 1)` | ✅ |
| `--ease-exit` | `cubic-bezier(0.4,0,1,1)` | exits | `cubic-bezier(0.4, 0, 1, 1)` | ✅ |

Demo keyframes: `@keyframes mo120/mo200/mo280 { from{translateX(0)} to{translateX(150%)} }`, run as `mo<ms> <ms>ms cubic-bezier(0.2,0,0,1) infinite alternate`. Header copy: "functional · ease-out · never bouncy".

## Z-index scale (asserted by docs, NOT shown as a canvas artboard)

The canvas has no z-scale artboard, but `DESIGN_SYSTEM.md §2.3` asserts it and `tokens.css` defines it:

| Layer | Value | tokens.css | match |
|---|---|---|---|
| sticky | `100` | `--z-sticky: 100` | ✅ |
| dropdown | `200` | `--z-dropdown: 200` | ✅ |
| drawer | `300` | `--z-drawer: 300` | ✅ |
| modal | `400` | `--z-modal: 400` | ✅ |
| toast | `500` | `--z-toast: 500` | ✅ |
| tooltip | `600` | `--z-tooltip: 600` | ✅ |

## index.dc.html — supplemental tokens used on the canvas index

The dark index page uses these (mostly already-known) values; the only **new** asserted values are dark-mode-ish surface hexes that appear ONLY on this marketing index, plus a brand gradient:

- Page bg `#0B0D12` (`--surface-inverted`). Card bg `#14161C` (index-only; not a token — the dark-mode `--surface-subtle` is `#12151C`, close but distinct).
- Brand logo gradient `linear-gradient(135deg,#2F6FED,#244FB0)` = `--accent` → `--accent-pressed`. **No gradient token exists** (none needed; it's a one-off brand mark).
- "Built" badge: fg `#1A7F4B` (`--success`) on `rgba(26,127,75,.16)`; "Queued": `#8A8F98` (`--text-tertiary`) on `rgba(255,255,255,.06)`.
- Muted text on dark: `#8A8F98` (`--text-tertiary`), `#B8BDC6` (index-only highlight, ~ dark `--text-secondary` `#A9AEB8`), `#51555E` (`--text-secondary`) for the smallest footnote.
- Card-link transition: `box-shadow 200ms cubic-bezier(0.2,0,0,1), transform 200ms cubic-bezier(0.2,0,0,1)` = `--dur-std` + `--ease-std`; hover `translateY(-2px)`.

None of these require new tokens. They're index-chrome literals.

---

# GAP ANALYSIS

**Files reviewed:** `frontend/src/styles/tokens.css`, `frontend/src/styles/globals.css`, `frontend/index.html`, `node_modules` (font packages).

## What EXISTS and is CORRECT
- **All color tokens** — every surface/text/border/accent/status hex in §1.1–§1.5 matches `tokens.css` byte-for-byte (24 light-mode color vars). ✅
- **All radius tokens** (§1.8) `4/6/10/16/999` ✅; **all elevation stacks** (§1.9) exact 3-layer match ✅; **all motion durations + easings** (§1.10) exact ✅; **full z-scale** ✅.
- **Font-family string definitions** match the canvas sans stack and `DESIGN_SYSTEM.md`. ✅ (string only — see WRONG below for actual loading)
- `@theme inline` in `globals.css` correctly bridges every token to a Tailwind utility (color, radius, shadow, duration, ease, z, font). The dark-mode `[data-theme]` block is a clean superset (canvas is light-only; not a parity concern).
- `:focus-visible` ring uses `--border-focus` `#2F6FED` ✅ matches `--border-focus` swatch.
- `prefers-reduced-motion` reset present ✅ (canvas motion is "functional, never bouncy").

## What is MISSING
1. **Geist / Geist Mono fonts are not loaded** (CRITICAL). No `<link>` in `index.html`, no `@font-face`/`@import`, no `@fontsource` dep, no local `.woff2`. The canvas's actual typeface never renders off-Apple. Weights **450** (mono) and **550** (body-strong, swatch labels) cannot be supplied by any system fallback. → **Fix per §FONTS** (Fontsource self-host preferred, or Google Fonts `<link>` to match canvas 1:1).
2. **No type-scale tokens.** §1.6 defines 9 named roles (`display/h1/h2/h3/body/body-strong/small/caption/mono`) with exact size/lh/weight/tracking. `tokens.css` defines **zero** typography size/lh/weight vars. The scale currently lives implicitly in Tailwind/components. Recommend adding a typography token group (or a documented `text-*` utility map) so `body-strong`=550, `mono`=450/13/18, `caption`=12/16/0.01em, `display`=-0.02em, `h1`=-0.01em are enforced centrally and don't drift per-component. Without it, the 450/550 weights and the negative tracking on display/h1 are easy to miss.
3. **No spacing tokens.** §1.7 asserts the 4-pt scale `4 8 12 16 24 32 48 64`. Build leans on Tailwind defaults (which cover these). Acceptable, but the "gutters 24 mobile / 32 desktop" rule is not encoded anywhere as a token/container var — risk of inconsistent page gutters across pages. Optional: add `--gutter-mobile:24px; --gutter-desktop:32px` (or a container utility).
4. **No `neutral` status pairing token.** §1.5 mapping row 5 asserts a 5th status family `neutral` (`#8A8F98` / `#F1F3F5`). It exists only as `--text-tertiary` + `--surface-sunken`. StatusBadge must wire its `neutral` variant to those; optionally add `--neutral`/`--neutral-subtle` aliases for symmetry. Low priority.

## What is WRONG
- **Mono stack ordering vs canvas intent (minor).** Canvas mono is literally `'Geist Mono',monospace` (Geist Mono first, always). Build mono is `'SF Mono','Geist Mono',ui-monospace,Menlo,monospace` — on an Apple machine the build would render SF Mono where the canvas renders Geist Mono. This is the documented `DESIGN_SYSTEM.md §2.2` stack, so it's "correct per spec" but produces a different glyph than the canvas on Apple hardware. Once Geist Mono is actually loaded (currently it is not), if exact canvas parity is required, consider dropping `'SF Mono'` to lead with Geist Mono. Same applies to sans (`'SF Pro Text'` leads). **Decision needed:** match the documented OS-first stack, or match the canvas's Geist-first rendering. Default per docs = keep as-is; just ensure Geist is loaded.
- Nothing else is wrong: every color/radius/elevation/motion/z value is an exact match.

## BUILD PLAN (specific edits)
1. **Load fonts (do this first).** Either:
   - `npm i @fontsource-variable/geist @fontsource-variable/geist-mono` and add `@import '@fontsource-variable/geist';` + `@import '@fontsource-variable/geist-mono';` at the top of `frontend/src/styles/globals.css` (after `@import "./tokens.css";`); **or**
   - add the 3 Google-Fonts `<link>`s from §FONTS to `frontend/index.html` `<head>` (matches canvas exactly, weights `400;450;500;550;600;700` + mono `400;450;500`).
   Verify in-browser that `font-weight:450` and `550` actually render (not snapped to 400/500).
2. **(Recommended) Add a typography token layer.** In `tokens.css`, add a documented block for the 9 roles, e.g. `--text-display: 600 32px/38px; --tracking-display:-0.02em;` … through `--text-mono: 450 13px/18px;` — or codify as named Tailwind component utilities (`.text-display`, `.text-body-strong`, `.text-mono`, …) so size/lh/weight/tracking from §1.6 are single-sourced. Enforce `font-variant-numeric: tabular-nums` on numeric contexts (display/mono/caption-with-numbers).
3. **(Optional) Spacing/gutter + neutral aliases.** Add `--gutter-mobile:24px; --gutter-desktop:32px;` and `--neutral: var(--text-tertiary); --neutral-subtle: var(--surface-sunken);` to `:root` for completeness and to make StatusBadge's neutral variant explicit.
4. **No changes needed** to color, radius, elevation, motion, or z tokens — they already match the canvas exactly.

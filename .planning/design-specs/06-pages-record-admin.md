# Design Digest — PAGES: Record, Copilot overlay, Admin

Source of truth: `CLAUDE_DESIGN/Pages.dc.html` (inline React in `<script type="text/x-dc">`).
Covers **§7.1 Audit**, **§8.1 CopilotPanel** (spec from `PAGES.md` — NOT rendered as a standalone artboard in the canvas; reconstructed from the §4.2 chat panel + topbar Copilot button + "Copilot plan" cards), **§9.1 Users & roles**.

Token mapping reference: `frontend/src/styles/tokens.css`. Every color below is given as **raw hex → token**.

## Canvas-wide constants (shared chrome these artboards sit inside)

These wrap every §X.Y screen via `screen(active, body, opts)`:

- **Screen frame**: `1280×720px` default, `background:#fff` (`--surface`), `overflow:hidden`. Sidebar + `{topbar, content}` column.
- **Sidebar** (`sidebar()`): width `212px`, `borderRight:1px solid #ECEEF1` (`--border-subtle`), `background:#F7F8FA` (`--surface-subtle`).
  - Logo row: height `56px`, `padding:0 16px`, `borderBottom:1px solid #ECEEF1`. Logo `26px` gradient `linear-gradient(135deg,#2F6FED,#244FB0)` (`--accent`→`--accent-pressed`), `borderRadius:8px` (`--radius-control`). Brand "Backstage" `14px/600`.
  - Nav groups (`padding:14px 10px`). Group label: `11px`, `#8A8F98` (`--text-tertiary`), `uppercase`, `letterSpacing:0.05em`, `600`, `padding:0 12px`, `marginBottom:5px`.
  - Nav item: height `33px`, `padding:0 12px`, `borderRadius:8px` (`--radius-control`), `gap:11px`, `fontSize:14px`. **Active**: `background:#EEF3FE` (`--accent-muted`), `color:#2F6FED` (`--accent`), `fontWeight:550`. **Idle**: `color:#51555E` (`--text-secondary`), icon `#8A8F98` (`--text-tertiary`), `fontWeight:400`.
  - Groups: Overview (Dashboard) · Pipeline (Requests `24`, Calendar) · Resources (Spaces, Inventory `2`·danger) · Operations (Tasks, Conflicts `1`·danger, Approvals `5`) · **Record (Audit)** · **Settings (Users)**.
  - Count pill: `11px/600`, `Geist Mono`, `borderRadius:999px` (`--radius-pill`), `padding:1px 7px`. Neutral = `#8A8F98` on `#F1F3F5` (`--surface-sunken`); danger = `#C8372D` (`--danger`) on `#FBECEA` (`--danger-subtle`).
- **Topbar** (`topbar(fresh)`): height `56px`, `borderBottom:1px solid #ECEEF1`, `background:#fff`, `padding:0 20px`, `gap:14px`.
  - Search: `maxWidth:380px`, height `34px`, `padding:0 12px`, `borderRadius:8px`, `background:#F7F8FA`, `border:1px solid #ECEEF1`, color `#8A8F98`. Text `13px` "Search or start a request…". `⌘K` kbd: `Geist Mono 11px`, `background:#fff`, `border:1px solid #D7DBE0` (`--border-strong`), `borderRadius:5px`, `padding:1px 6px`.
  - **Freshness pill**: height `30px`, `padding:0 12px`, `borderRadius:999px`. Up to date → `background:#E9F6EF` (`--success-subtle`), `border:1px solid rgba(26,127,75,.2)`, dot `#1A7F4B` (`--success`) `7px` with `animation:pulse 1.8s ease-in-out infinite`, text `#15613A` (darker success, no token — closest `--success`) `12px/600` "Up to date". Stale → `background:#FBF3E0` (`--warning-subtle`), `border:1px solid rgba(154,107,0,.25)`, dot `#9A6B00` (`--warning`) static, text `#7A5500` "Stale".
  - **Copilot button** (topbar): height `34px`, `padding:0 12px`, `borderRadius:8px` (`--radius-control`), `background:#EEF3FE` (`--accent-muted`), `border:1px solid #DCE6FB` (accent-tint border, no exact token — between `--accent-muted` and `--border-focus`), `color:#2F6FED` (`--accent`), `13px/550`, sparkle icon (path `M8 2.5 9.2 6l3.3 .2-2.6 2 1 3.3L8 9.7 5.1 11.5l1-3.3L3.5 6.2 6.8 6 8 2.5Z`, size 14). Label "Copilot". **This is the panel's open trigger.**
  - User cluster: avatar `EH` 30px on `#DCE6FB`, name "Elira H." `13px/600`, role "MANAGER" `11px/600` colored `#9A6B00` (`--warning`).
- **pageHeader(crumb, title, sub, action)** (content header): `padding:24px 32px 18px`, `borderBottom:1px solid #ECEEF1`.
  - Breadcrumb: `12px`, `gap:7px`, items `#8A8F98` (`--text-tertiary`), last item `#51555E` (`--text-secondary`), separator "/" `#C4C8CE`.
  - Title `h1`: `24px/600`, `letterSpacing:-0.01em`, `#0B0D12` (`--text-primary`).
  - Subtitle `p`: `14px`, `#51555E` (`--text-secondary`), `margin:4px 0 0`.
- **btn(variant,...)**: height `36px` (sm `30px`), `padding:0 16px` (sm `0 12px`), `14px/550`, `borderRadius:8px` (`--radius-control`), `gap:7px`.
  - primary: `#2F6FED`/`#fff`. secondary: `#fff`/`#0B0D12`, `border:1px solid #D7DBE0`. ghost: transparent/`#51555E`. danger: `#C8372D`/`#fff`. disabled: `#F1F3F5`/`#B8BDC6` (`--text-disabled`), `border:1px solid #ECEEF1`.
- **avatar(initials,size,color)**: round (`borderRadius:999px`), `color:#51555E`, `fontWeight:600`, `fontSize:size*0.4`, `boxShadow:inset 0 0 0 1px rgba(11,13,18,.06)`. Default bg `#E3E7EC`.
- **badge(fg,sub,label,{noDot})**: `gap:6px`, `background:sub`, `border:1px solid ${fg}26` (fg @ 15% alpha), `borderRadius:999px` (`--radius-pill`), `padding:3px 10px`, `12px/600`, `color:fg`. Dot `6px` round `background:fg` unless `noDot`.
- **skel(w,h)**: `borderRadius:6px` (`--radius-sm`), `background:linear-gradient(90deg,#EEF0F3 25%,#F6F7F9 50%,#EEF0F3 75%)` (`--skeleton-base`/`--skeleton-sheen`), `backgroundSize:400px 100%`, `animation:shimmer 1.4s linear infinite`.
- **Keyframes**: `spin` 700ms linear (spinners), `shimmer` 1.4s linear (skeleton), `pulse` 1.8s ease-in-out (live dots), `blink`.

---

# §7.1 — Audit (`/audit`)
States in canvas: **default · loading · empty · error**. Function `auditBody(state)`. Breadcrumb `['Record','Audit']`.

## §7.1 default
Layout: standard `screen('Audit', …)`. pageHeader: title **"Audit"**, subtitle **"Complete, append-only record"**, action = secondary button **"Filter"** with filter icon (path `M2.5 4h11M5 8h6M7 12h2`, size 13). Content `padding:24px 32px`, inner wrapper `maxWidth:680px`.

**Vertical timeline** — each entry is `display:flex; gap:14px; position:relative; paddingBottom:22px` (last `0`).
- **Connector line**: for all but last entry, `position:absolute; left:13px; top:30px; bottom:0; width:2px; background:#ECEEF1` (`--border-subtle`).
- **Actor avatar**: `28px` round, initials, per-actor bg color (below).
- **Content column** (`flex:1`):
  - Line 1 (`14px/20px line-height`): `<b>` actorName `fontWeight:600` `#0B0D12` (`--text-primary`) · space + action verb `#51555E` (`--text-secondary`) · entity ID `Geist Mono 13px #2F6FED` (`--accent`).
  - Line 2 timestamp: `12px`, `#8A8F98` (`--text-tertiary`), `Geist Mono`, `marginTop:2px`.
  - **Reason quote** (only entry 0): `13px`, `#51555E`, `marginTop:6px`, `background:#F7F8FA` (`--surface-subtle`), `borderLeft:2px solid #D7DBE0` (`--border-strong`), `padding:6px 10px`, `borderRadius:0 6px 6px 0`. Text wrapped in curly quotes `"…"`.
  - **Diff line** (only entry 0): `12px`, `#2F6FED` (`--accent`), `marginTop:6px`, prefixed `▸ `.

Literal mock entries (actor, initials, avatarBg, verb, entityId, timestamp, reason, diff):
1. **Elira Hoxha** `EH` bg `#DCE6FB` — "approved" — `REQ-2026-0142` — `22 Jul 2026 · 09:14:02` — reason "Capacity and budget confirmed with organizer." — diff `status: PROPOSED → APPROVED`.
2. **Copilot** `AI` bg `#EEF3FE` (`--accent-muted`) — "generated plan for" — `REQ-2026-0142` — `22 Jul 2026 · 09:02:55` — (no reason/diff).
3. **Liam Kovaçi** `LK` bg `#E9F6EF` (`--success-subtle`) — "held Blue Hall for" — `REQ-2026-0142` — `22 Jul 2026 · 08:58:11`.
4. **System** `SY` bg `#F1F3F5` (`--surface-sunken`) — "created" — `REQ-2026-0142` — `22 Jul 2026 · 08:55:40`.

## §7.1 loading
pageHeader (`['Record','Audit']`, "Audit", no sub/action). Content `padding:24px 32px`, `maxWidth:680px`. **4 skeleton rows**, each `display:flex; gap:14px; paddingBottom:22px`:
- Avatar placeholder: `28px` round, `background:#EEF0F3` (`--skeleton-base`).
- Column: `gap:8px` → `skel('60%',14)` then `skel('40%',12)`.

## §7.1 empty
pageHeader (no sub/action). Content `padding:24px 32px`. **Empty card**: `border:1px solid #ECEEF1`, `borderRadius:12px` (between `--radius-md` 10 and `--radius-lg` 16 — use `--radius-lg` or a 12px exception), `padding:64px 24px`, `textAlign:center`.
- Icon tile: `44×44`, `borderRadius:11px`, `background:#F1F3F5` (`--surface-sunken`), `color:#8A8F98` (`--text-tertiary`), clock icon (path `M8 4v4l3 1.5M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Z`, size 20), `margin:0 auto 16px`.
- Title `16px/600` **"No activity for this filter"**.
- Body `14px #8A8F98` **"Try a different request or entity type."** (no action button).

## §7.1 error
Same shell. Empty card same dims but icon tile `background:#FBECEA` (`--danger-subtle`), `color:#C8372D` (`--danger`), warning icon (path `M8 5v3.5M8 11v.2`, size 20).
- Title `16px/600` **"Couldn't load the audit log"**.
- Body `14px #8A8F98` **"The connection to ops-core timed out."**, `marginBottom:18px`.
- Action centered: secondary button **"Retry"**.

---

# §8.1 — CopilotPanel (overlay, EVERY page)
**No standalone §8.1 artboard exists in `Pages.dc.html`.** The design intent lives in three rendered places + the `PAGES.md`/`DESIGN_SYSTEM.md` spec. Build the panel by composing these exact visual primitives; states map 1:1 to the PAGES.md state list (idle · user-typing · assistant-thinking · plan-preview · proposed-action-confirm · conflict-heads-up · error).

## Source A — Topbar Copilot toggle (line 69) — the OPEN trigger
Already specced above. Height `34px`, `#EEF3FE` (`--accent-muted`) bg, `#DCE6FB` border, `#2F6FED` (`--accent`) text + sparkle icon, "Copilot".

## Source B — §4.2 intake chat panel (lines 171–176) — the closest realized full panel
This is the canonical CopilotPanel layout. A right-rail: `width:400px; flexShrink:0; borderLeft:1px solid #ECEEF1; background:#F7F9FE` (a near-white accent wash — closest token `--surface-subtle`/`--accent-muted`; treat the copilot surface as `--accent-muted` per DESIGN_SYSTEM §4), `display:flex; flexDirection:column`.

- **Panel header**: `padding:14px 18px`, `borderBottom:1px solid #DCE6FB`, `background:#EEF3FE` (`--accent-muted`), `gap:9px`. Icon tile `22×22`, `borderRadius:6px` (`--radius-sm`), `background:#2F6FED` (`--accent`), white sparkle icon (size 13). Title `14px/600` (canvas copy: "Or describe it to Copilot" — for the standalone panel use i18n `copilot.title` = "Copilot").
- **Message scroll** (`flex:1; padding:18px`):
  - **User bubble** (`assistant`/right): `display:flex; justifyContent:flex-end; marginBottom:12px`. Bubble `maxWidth:80%`, `background:#0B0D12` (`--surface-inverted`/`--text-primary`), `color:#fff`, `borderRadius:12px 12px 4px 12px`, `padding:10px 13px`, `14px/20px`. Copy: "We need to host a 180-person fintech conference on 22 July."
  - **Assistant bubble** (left): `display:flex; justifyContent:flex-start`. Bubble `maxWidth:82%`, `background:#fff` (`--surface`), `border:1px solid #E3E7EC` (≈`--border-subtle`), `borderRadius:12px 12px 12px 4px`, `padding:10px 13px`, `14px/20px`. Copy: "Got it — I've pre-filled the form. Blue Hall fits 180 theater-style. Add requirements or hit create."
- **Composer** (`padding:14px 18px; borderTop:1px solid #DCE6FB`): input shell height `40px`, `padding:0 6px 0 14px`, `borderRadius:10px` (`--radius-md`), `background:#fff`, `border:1px solid #D7DBE0` (`--border-strong`). Placeholder `14px #8A8F98` "Message Copilot…". Send button: `28×28`, `borderRadius:7px`, `background:#2F6FED` (`--accent`), white arrow icon (path `M3 8h9M8 4l4 4-4 4`, size 14).

## Source C — "Copilot plan" card (lines 186, 323) — plan-preview render-into
- Header chip row: icon tile `24×24`, `borderRadius:7px`, `background:#2F6FED` (`--accent`), white sparkle (size 14); label "Copilot plan" `13px/600` `#2F6FED`.
- Plan body card (mobile variant line 323): `background:#F7F9FE`, `border:1px solid #DCE6FB`, `borderRadius:10px` (`--radius-md`), `padding:14px`. Heading "Copilot plan" `12px/600 #2F6FED`, `marginBottom:6px`. Paragraph `14px/21px`: **"Yes — we can host this."** (`<strong>`) " Blue Hall seats 180 and is free 14:00–18:00. Quote " **154,800 ALL** (`<strong>`) ".".

## §8.1 state-by-state build spec (panel = right Drawer, `--accent-muted` surface)
Mount as a right-side `Drawer` (z `--z-drawer` 300, `--elev-drawer`) toggled by the topbar Copilot button. Width `400px` desktop; full-screen sheet on mobile (per DESIGN_SYSTEM §5). Each state:

- **idle**: header + empty message area with a one-line prompt using i18n `copilot.placeholder` "Can we make this happen?" as the composer placeholder. Because `POST /chat` is **not running here**, show the i18n `copilot.unavailable` notice: "The AI copilot is not connected in this build. Use the structured form to plan." Style as a calm `--surface-subtle`/`--accent-muted` inset, `13px #51555E`, no error tint. Composer present but send is a no-op (or routes user to the structured intake form).
- **user-typing**: composer focused — `border` becomes `--accent`/focus ring `--ring-soft`; the dark user bubble (Source B) is the in-progress message.
- **assistant-thinking**: a left-aligned assistant bubble containing a spinner row — reuse the plan-loading pattern (line 227): `16px` spinner `border:2px solid #DCE6FB; borderTopColor:#2F6FED; borderRadius:999px; animation:spin 700ms linear infinite` + text `14px #2F6FED/550` "Copilot is thinking…" (canvas plan copy was "Copilot is building the plan…"). Optionally two shimmer lines `skel('90%',12)`, `skel('70%',12)`.
- **plan-preview**: render the "Copilot plan" card (Source C) inside an assistant bubble — narrative + the feasibility verdict + quote (154,800 ALL).
- **proposed-action-confirm** (`ProposedActionCard`): a card in the message stream titled e.g. "Hold Blue Hall", with a HELD/warning framing (reuse §4.3 mPlan lease card: `border:1px solid rgba(154,107,0,.3)`, header `background:#FBF3E0` (`--warning-subtle`) `#9A6B00` (`--warning`)), and a **primary confirm button** ("Hold Blue Hall") — gated by `requiresApproval`. Secondary "Dismiss".
- **conflict-heads-up** (surfaced when polling `GET /private/conflicts` returns a new conflict): an assistant message styled as a `--danger`-tinted inset. Reuse the dashboard conflict alert palette: `background:#FBECEA` (`--danger-subtle`), `border:1px solid rgba(200,55,45,.28)`, alert-triangle icon `#C8372D` (`--danger`) (path `M8 5v3.5M8 11v.2M8 1.5 1 13.5h14L8 1.5Z`). Title `14px/600 #9E2B23` (darker danger), body `13px #7A2A23` e.g. "Networking Mixer (REQ-0151) clashes with Blue Hall on 22 Jul." Primary danger "See alternatives". **In this build, the heads-up is mock content** — render a static heads-up card, no live subscription required.
- **error**: assistant area shows an error inset — `--danger-subtle` bg, `--danger` text, e.g. "Copilot is unavailable." with a "Retry" secondary. Since no `POST /chat`, default the panel to the idle/unavailable notice rather than a hard error.

**Degradation rule (this build):** `POST /chat` and `POST /plan` are not running. The **structured intake form is the working path**. The CopilotPanel must render its states with **clearly-mock content** and never block: open via topbar toggle, show the `copilot.unavailable` notice in idle, and keep the composer inert (or deep-link to `/requests/new`). No live request should be fired.

**Mount location:** the panel mounts in the **AppShell** (`components/shell/AppShell.tsx`), available on **every page** (overlay), toggled from the topbar Copilot button. It is NOT a route.

---

# §9.1 — Users & roles (`/settings/users`, ADMIN)
States in canvas: **default (ADMIN) · loading · forbidden (403)**. (PAGES.md also lists `submitting`.) Function `usersBody(state)`. Breadcrumb `['Settings','Users']`.

## §9.1 default — ADMIN
pageHeader: title **"Users"**, subtitle **"4 staff accounts"**, action = a flex row (`gap:12px`):
- **ADMIN pill**: `11px/600`, `color:#1A7F4B` (`--success`), `background:#E9F6EF` (`--success-subtle`), `borderRadius:999px` (`--radius-pill`), `padding:4px 10px`, text "ADMIN".
- Primary button **"Add user"** with plus icon (path `M8 3.5v9M3.5 8h9`, size 13).

Content `padding:18px 32px 24px`. Table wrapper: `border:1px solid #ECEEF1` (`--border-subtle`), `borderRadius:10px` (`--radius-md`), `overflow:hidden`.

**Grid columns** (header + rows): `gridTemplateColumns:'1fr 1fr 130px 90px 60px'; gap:12px`.
- **Header row**: `padding:11px 20px`, `background:#F7F8FA` (`--surface-subtle`), `borderTop/Bottom:1px solid #ECEEF1`, `11px`, `#8A8F98` (`--text-tertiary`), `uppercase`, `letterSpacing:0.04em`, `fontWeight:500`. Columns: `Name · Email · Role · Active · ` (5th empty).
- **Data row**: `padding:13px 20px`, `borderBottom:1px solid #ECEEF1`, `alignItems:center`, `14px`.
  - **Name** cell: `fontWeight:500`, `flex; gap:9px` — avatar `26px` round, bg `#E3E7EC`, initials from name split; then full name.
  - **Email** cell: `#51555E` (`--text-secondary`), `Geist Mono 13px`.
  - **Role** cell: a `badge(fg, sub, ROLE, {noDot:true})` — pill, no dot. Color map (raw → token):
    - `MANAGER` fg `#9A6B00` (`--warning`) / sub `#FBF3E0` (`--warning-subtle`).
    - `OPS` fg `#2F6FED` (`--accent`/`--info`) / sub `#EEF3FE` (`--accent-muted`/`--info-subtle`).
    - `ADMIN` fg `#1A7F4B` (`--success`) / sub `#E9F6EF` (`--success-subtle`).
    - `VIEWER` fg `#8A8F98` (`--text-tertiary`) / sub `#F1F3F5` (`--surface-sunken`).
  - **Active** cell: a **toggle switch** — track `36×21`, `borderRadius:999px`, on=`#2F6FED` (`--accent`) / off=`#D7DBE0` (`--border-strong`); knob `17×17` round `#fff`, `boxShadow:0 1px 2px rgba(0,0,0,.2)`, `top:2px`, left `17px` (on) / `2px` (off). Matches existing `ui/Switch.tsx` exactly.
  - **5th** cell: overflow-menu kebab icon `#8A8F98` (vertical dots, path `M8 3.5v.2M8 8v.2M8 12.5v.2`, size 16).

Literal mock rows (name, email, role, roleColor, active):
1. **Elira Hoxha** · `elira.hoxha@pyramid.al` · **MANAGER** (`#9A6B00`) · active **on**.
2. **Liam Kovaçi** · `liam.kovaci@pyramid.al` · **OPS** (`#2F6FED`) · active **on**.
3. **Adriana Marku** · `adriana.marku@pyramid.al` · **ADMIN** (`#1A7F4B`) · active **on**.
4. **Besart Gjoni** · `besart.gjoni@pyramid.al` · **VIEWER** (`#8A8F98`) · active **off**.

## §9.1 loading
pageHeader (`['Settings','Users']`, "Users", **no sub/action**). Same table wrapper + header row. Body = **4 skeleton rows**, each `padding:15px 20px`, `borderBottom:1px solid #ECEEF1`, same grid, 5 × `skel('70%',12)`.

## §9.1 forbidden — 403
pageHeader (`['Settings','Users']`, "Users", **no sub/action**). Content `padding:24px 32px`. **Forbidden card**: `border:1px solid #ECEEF1`, `borderRadius:12px`, `padding:64px 24px`, `textAlign:center`.
- Icon tile: `48×48`, `borderRadius:12px`, `background:#FBF3E0` (`--warning-subtle`), `color:#9A6B00` (`--warning`), **lock icon** (path `M5 7V5a3 3 0 0 1 6 0v2M4 7h8v6H4z`, size 22), `margin:0 auto 16px`.
- Title `17px/600` **"403 — Admins only"**.
- Body `14px #8A8F98`, `maxWidth:340px; margin:0 auto`, `lineHeight:20px`: **"User management is restricted to the ADMIN role. Contact an administrator if you need access."**

## §9.1 submitting (PAGES.md; not in canvas)
Reuse `btn(primary,'Creating…',{spinner})` pattern from §4.2 intake: primary button with inline `14px` spinner (`border:2px solid rgba(255,255,255,.4); borderTopColor:#fff; animation:spin 700ms linear infinite`). The Add-user dialog Save button shows loading.

---

# GAP ANALYSIS

## §7.1 Audit — current: `frontend/src/pages/Audit.tsx` + `components/command/AuditTimeline.tsx`

**EXISTS**
- Page renders PageHeader (title `audit.title`) + filter inputs (request id, entity type) + Card/CardBody wrapping `AuditTimeline`.
- `isLoading` → `<LoadingBlock rows={5} />`; else `<AuditTimeline entries={data ?? []} />`.
- AuditTimeline: `<ol>` of entries; each `<li>` has a left border connector (`border-l border-border-subtle`), a **dot node** (`size-2.5 rounded-pill bg-border-strong`), actor name (`13px/550`), action (mono `12px text-accent`), entityType (`12px text-tertiary`), timestamp (mono, `ml-auto`), and an expandable before/after/reason diff (`ChevronRight` toggle).
- Empty handled inside AuditTimeline: centered `audit.empty` text.
- i18n keys present: `audit.title/actor/action/entity/when/reason/before/after/empty/filterRequest/filterEntity`.

**MISSING vs canvas**
- **Avatar per actor** — canvas uses a `28px` initials avatar with a per-actor bg color (`#DCE6FB`/`#EEF3FE`/`#E9F6EF`/`#F1F3F5`); current uses a tiny `2.5` dot. **Wrong primitive.**
- **Subtitle "Complete, append-only record"** on the header — missing.
- **"Filter" secondary button** action in header — current uses two inline filter `Input`s instead of a button. (Acceptable variation, but canvas shows a single Filter button; keep filters but consider matching.)
- **Empty state** as a designed card with **clock icon + title "No activity for this filter" + body "Try a different request or entity type."** — current shows only a one-line `audit.empty`. The `audit.empty` copy is "No history yet." (en) vs canvas empty copy. Add a proper EmptyState card; add i18n for the filter-specific empty.
- **Error state** entirely missing — Audit.tsx never reads `isError`; canvas has a full error card ("Couldn't load the audit log" / "The connection to ops-core timed out." / Retry). Add ErrorState handling.
- **Inline reason quote + diff line styling**: canvas shows the reason as a `borderLeft:2px solid #D7DBE0` `--surface-subtle` blockquote with curly quotes and a `▸ status: PROPOSED → APPROVED` accent diff line **inline, always visible** for entries that have them. Current hides everything behind a chevron toggle and JSON-dumps before/after. The default-state visual (visible quote + arrow diff) is not matched.
- **Connector geometry**: canvas connector is `left:13px; top:30px` (aligned to a 28px avatar center) `2px` wide; current connector is the `<li>`'s left border offset by `-21px` dot. Re-anchor to avatar center.
- **Loading skeleton shape**: canvas loading = 4 rows of {round avatar placeholder + 2 stacked lines (60%/40%)}; current = 5 full-width `h-10` bars via LoadingBlock. Match the avatar+lines shape.

**WRONG**
- Action verb color: canvas action verb is plain `#51555E` text inside the sentence; current renders `action` as `text-accent` mono chip. Canvas puts the **entity ID** in accent mono, not the action. Current shows `entityType` as the accent-ish element incorrectly. Fix: sentence = `<b>actor</b> verb <mono accent>REQ-ID</mono>`.

**BUILD PLAN (Audit)**
1. `Audit.tsx`: destructure `isError, refetch` from `useAudit`; add `else if (isError) <ErrorState title={t('audit.errorTitle')} onRetry={refetch} retryLabel={t('ui.common.retry')} />`; add empty branch `data.length===0 → <EmptyState title={t('audit.emptyFilter')} />` with clock-style framing.
2. Add header subtitle `t('audit.subtitle')` = "Complete, append-only record".
3. `AuditTimeline.tsx`: replace dot with `Avatar` (28px, initials from `actorName`, per-actor tint — map AI→accent-muted, system→sunken, person→a neutral). Re-anchor connector to `left:13px top:30px`.
4. Render reason as a `--surface-subtle` `border-l-2 border-border-strong` blockquote (always visible when present) and the diff as an accent `▸ before→after` line; keep the expand only for full JSON before/after.
5. Match sentence structure: actor `font-[600]`, verb `text-text-secondary`, entity id `font-mono text-[13px] text-accent`.
6. i18n: add `audit.subtitle`, `audit.errorTitle` ("Couldn't load the audit log"), `audit.errorBody`, `audit.emptyFilter` ("Try a different request or entity type") to **both** `en.json` and `al.json` (keep key counts equal).

## §8.1 CopilotPanel — current: **NONE**

**EXISTS**
- i18n keys only: `copilot.title` ("Copilot"), `copilot.placeholder` ("Can we make this happen?"), `copilot.unavailable` ("The AI copilot is not connected in this build. Use the structured form to plan."), `copilot.send` ("Send").

**MISSING (everything)**
- No `CopilotPanel` component, no `ChatMessage`, no `ProposedActionCard`, no conflict-heads-up, no topbar Copilot toggle, no Drawer mount in AppShell.
- AppShell topbar has search + freshness Badge + LocaleToggle + user/logout — **no Copilot button**. (Freshness pill is a static `Badge tone="info"` "degraded", not the designed up-to-date/stale pill, but that's shell scope.)

**BUILD PLAN (CopilotPanel)**
1. Create `components/command/CopilotPanel.tsx` as a right `Drawer` (need a `Drawer` primitive — not in `components/ui/`; build one on Radix Dialog with right-slide + `--elev-drawer`, z `--z-drawer`). Surface = `--accent-muted` wash; header `--accent-muted` bg with `--accent` icon tile + `copilot.title`.
2. Compose `ChatMessage` bubbles: user = `bg-surface-inverted text-text-inverted` `rounded-[12px_12px_4px_12px]`; assistant = `bg-surface border-border-subtle rounded-[12px_12px_12px_4px]`; both `14px/20px`, `padding:10px 13px`.
3. Composer: `40px` shell, `--border-strong`, `rounded-md`, placeholder `copilot.placeholder`, `28px` accent send button.
4. State machine (local `useState`, **no network**): idle (show `copilot.unavailable` notice + inert composer) · user-typing · assistant-thinking (spinner row) · plan-preview ("Copilot plan" card with mock "Yes — we can host this… 154,800 ALL") · proposed-action-confirm (`ProposedActionCard`, warning-framed, confirm gated) · conflict-heads-up (`--danger-subtle` inset, mock "REQ-0151 clashes with Blue Hall", "See alternatives") · error.
5. Add topbar **Copilot button** in `AppShell.tsx` (`--accent-muted` bg, `--accent` text, sparkle icon) that toggles a Zustand `copilotOpen` store; mount `<CopilotPanel />` in AppShell so it overlays **every** route.
6. **Degrade gracefully**: never call `POST /chat` or `POST /plan`; idle defaults to the `copilot.unavailable` notice; all richer states render mock content; the structured form (`/requests/new`) remains the working path. Optionally deep-link the composer's "send" to `/requests/new`.
7. i18n: add `copilot.thinking`, `copilot.planTitle`, `copilot.proposedConfirm`, `copilot.conflictHeadsUp`, `copilot.error` to both locales.

## §9.1 Users — current: `frontend/src/pages/Users.tsx`

**EXISTS**
- 403 forbidden handled: `if (isError && error instanceof APIError && error.status===403) return <ErrorState title={t('users.forbidden')} />`.
- PageHeader (title `users.title` = "Staff") + "Add staff" dialog (`UserPlus` icon) with name/email/password/role fields, Cancel/Save, Save `loading={create.isPending}` and disabled until valid (email, name, password≥8). **Submitting handled** via Save `loading`.
- Loading → `<LoadingBlock />`; empty → `<EmptyState title={t('users.empty')} />`.
- Table: `Name · Email · Role · Active` headers; rows = name (`font-[550]`), email (mono `12px`), role as an inline editable `<Select>`, active as a **plain `<input type=checkbox>`**.
- i18n: `users.title/name/email/role/active/create/empty/forbidden`.

**MISSING vs canvas**
- **Subtitle "4 staff accounts"** + **ADMIN pill** in header — missing.
- **Name-cell avatar** (`26px` initials) — missing.
- **Role rendered as a colored badge** (no-dot pill, per-role color map) — current renders role as an **editable Select** for every row, which is a different (more functional) UX than the canvas static colored badge. Canvas default is a read-only colored badge; inline editing is an extra. Decide: keep editable Select but style toward the badge palette, OR show badge + edit via menu. At minimum the role colors must match the map (MANAGER warning, OPS accent, ADMIN success, VIEWER neutral).
- **Active as a `Switch`** — current uses a bare `<input type=checkbox>`; canvas uses the `36×21` accent toggle. Swap to `ui/Switch.tsx`.
- **Kebab overflow menu** (5th column) — missing.
- **403 card styling** — canvas is a full centered card with `48px` lock-icon tile (`--warning-subtle`/`--warning`), `17px/600` "403 — Admins only", and a `340px` explanatory body. Current uses generic `ErrorState` (danger-tinted, `14px`, no lock icon, no detailed copy). **Wrong tone (danger vs warning) and missing lock icon + detail copy.**
- **Add-user copy**: canvas action label is "Add user"; current i18n `users.create` = "Add staff". Header label mismatch (minor; align wording).
- **Title**: canvas page title is "Users"; current `users.title` = "Staff". Mismatch — canvas/PAGES route is `/settings/users` titled "Users". Align (likely keep "Users"/"Staff" decision intentional, but DESIGN canvas says "Users").

**WRONG**
- Active control: `<input type=checkbox>` → must be the designed `Switch` (accent track, sliding knob).
- Forbidden uses `ErrorState` (danger) → must be a **warning**-toned lock card per canvas, not danger.
- Table grid: current uses the generic `Table` component (`px-4 py-3` rows); canvas uses a CSS-grid table with explicit columns `1fr 1fr 130px 90px 60px` and `13px 20px` row padding + a `60px` kebab column. The existing `Table` is close enough but lacks the avatar in Name and the kebab column.

**BUILD PLAN (Users)**
1. Header: add subtitle `t('users.count', {n})` ("{n} staff accounts") and an inline **ADMIN pill** (`success` tinted) next to the Add-user button. Confirm label "Add user".
2. Name cell: prepend a `26px` `Avatar` with initials (`bg #E3E7EC`).
3. Role cell: render a colored no-dot badge using the role→color map (MANAGER `--warning`, OPS `--accent`, ADMIN `--success`, VIEWER neutral). Keep editing behind the kebab or a click, not a row-wide Select, to match the static-badge canvas default.
4. Active cell: replace `<input type=checkbox>` with `<Switch checked={u.isActive} onCheckedChange={…}>` (already exists, exact dims match canvas).
5. Add a `60px` kebab column with a `DropdownMenu` (vertical dots icon) for edit/deactivate.
6. **Forbidden**: replace the generic `ErrorState` with a dedicated warning card — `48px` lock-icon tile (`--warning-subtle`/`--warning`), title `t('users.forbiddenTitle')` ("403 — Admins only"), body `t('users.forbiddenBody')`. Match `64px 24px` padding centered card.
7. i18n: add `users.count`, `users.forbiddenTitle`, `users.forbiddenBody`; align `users.title` → "Users" and `users.create` → "Add user" in both `en.json` + `al.json` (keep counts equal).

---

## Token / font notes
- Canvas fonts: `'Geist'` (sans) and `'Geist Mono'` (mono). Tokens use `--font-sans` (`'SF Pro Text','Geist',…`) and `--font-mono` (`'SF Mono','Geist Mono',…`) — Geist is the design family; SF is the runtime-preferred fallback. IDs/timestamps/quantities are `--font-mono` with `tabular-nums`.
- A few canvas hexes have **no exact token** and need mapping decisions: `#DCE6FB` (accent-tint border on Copilot button — closest `--accent-muted`/`--border-focus`), `#F7F9FE` (copilot surface wash — map to `--accent-muted`), `#15613A`/`#7A5500`/`#9E2B23`/`#7A2A23` (darker status text for pills/quotes — these are deliberate AA-contrast darkenings of `--success`/`--warning`/`--danger`; either add `--success-text`/`--warning-text`/`--danger-text` tokens or accept the base status token).
- `borderRadius:11px`/`12px` icon tiles & cards sit between `--radius-md` (10) and `--radius-lg` (16) — the canvas uses 11/12 freely; treat as a small documented exception or round to `--radius-md`.
- `#E3E7EC` (default avatar bg) ≈ `--border-subtle`/`--border-strong` range — no exact token; use a neutral avatar bg.

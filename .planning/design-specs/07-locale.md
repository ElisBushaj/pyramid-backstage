# §L — Albanian Locale (Shqip) — Design Digest & Gap Analysis

**Source canvas:** `/home/roboti/Documents/pyramid-backstage/CLAUDE_DESIGN/Locale.dc.html`
**Current impl:** `frontend/src/i18n/en.json`, `frontend/src/i18n/al.json` (resolver: `frontend/src/i18n/useT.ts`)
**Token map:** `frontend/src/styles/tokens.css`

> Canvas thesis (verbatim, §L header): *"Albanian copy runs ~25–30% longer than English, so labels, buttons and chips must flex without truncation. This sheet gives the build a 1:1 string map, side-by-side overflow stress tests, and full screens rendered in Shqip."*
> Build rule it asserts: *"the build keys · proper nouns localized (Blue Hall → Salla Blu) · backend enums stay constant."* Enums (`SPACE_DOUBLE_BOOKED`, role codes, status codes) are NOT translated as identifiers — only their **display labels** are. Proper nouns ARE localized (Blue Hall → Salla Blu, Orange Hall → Salla Portokalli, Foyer → Foajeja).

---

## Canvas chrome (the sheet itself, not the product)

- Page bg `#DBDEE3`; container `max-width:1240px`, padding `56px 48px 96px`.
- Header: mono tag `§L` 13px `#8A8F98` (`--text-tertiary`) tracking `0.04em`; `h1` 24/30 weight 600 tracking `-0.01em` `#0B0D12` (`--text-primary`); sub 14/21 `#51555E` (`--text-secondary`) max-width 640px; back link `#2F6FED` (`--accent`) 13px.
- Frame helper: header row mono `§X.Y` 12px `#8A8F98`, `h2` 19/26 weight 600, optional sub 13px `#8A8F98`. Card: `background:#fff` (`--surface`), `border-radius:14px` (≈`--radius-lg` 16, canvas uses 14), shadow `0 1px 2px rgba(11,13,18,.04), 0 0 0 1px rgba(11,13,18,.06)` (= `--elev-raised` exactly), padding `28px`.
- Font stack on body: `'SF Pro Text','Geist',-apple-system,system-ui,sans-serif` (= `--font-sans`). Mono blocks use `'Geist Mono',monospace` (= `--font-mono`).

---

## §L.1 — String map (EN → Shqip) — THE GLOSSARY

Frame: `§L.1 "String map — EN → Shqip"`, sub *"the build keys · proper nouns localized (Blue Hall → Salla Blu) · backend enums stay constant"*.

**Glossary table layout (`glossary()` helper):**
- Group label: mono 11px `#8A8F98` UPPERCASE tracking `0.04em`, padding `18px 0 8px`.
- Table: `border:1px solid #ECEEF1` (`--border-subtle`), `border-radius:10px` (`--radius-md`), `overflow:hidden`.
- Header row: 2-col grid `1fr 1fr` gap 12px, padding `9px 16px`, bg `#F7F8FA` (`--surface-subtle`), bottom border `#ECEEF1`, text 11px `#8A8F98` weight 600 UPPERCASE tracking `0.04em`. Columns literally "English" / "Shqip".
- Data rows: 2-col grid, padding `10px 16px`, top border `#F1F3F5` (`--surface-sunken`) from row 2; EN cell `#51555E` (`--text-secondary`) 14px; AL cell weight 500 (`--text-primary` default).

### Group: Navigation (`nav.*`)
| English | Shqip | i18n key |
|---|---|---|
| Overview | Përmbledhje | `nav.overview` |
| Dashboard | Paneli | `nav.dashboard` |
| Pipeline | Procesi | `nav.pipeline` |
| Requests | Kërkesat | `nav.requests` |
| Calendar | Kalendari | `nav.calendar` |
| Resources | Burimet | `nav.resources` |
| Spaces | Hapësirat | `nav.spaces` |
| Inventory | Inventari | `nav.inventory` |
| Operations | Operacionet | `nav.operations` |
| Tasks | Detyrat | `nav.tasks` |
| Conflicts | Konfliktet | `nav.conflicts` |
| Approvals | Miratimet | `nav.approvals` |
| Record | Regjistri | `nav.record` |
| Audit | Auditimi | `nav.audit` |
| Settings | Cilësimet | `nav.settings` |
| Users & roles | Përdoruesit & rolet | `nav.users` (current AL = "Stafi"/"Staff") |

> Note: canvas EN label is **"Users & roles" → "Përdoruesit & rolet"**; the build chose **"Staff" / "Stafi"** for `nav.users`. The AL **sidebar render** in §L.3 uses **"Përdoruesit"** (see `alSidebar` group "Cilësimet"). So the canvas itself is inconsistent (glossary says "Përdoruesit & rolet", rendered nav says "Përdoruesit", build ships "Stafi"). Decision needed; current build value is acceptable but does NOT match either canvas string.

### Group: Status labels (rendered as UPPERCASE chips)
| English | Shqip (canvas) | enum / key |
|---|---|---|
| DRAFT | SKICË | `status.DRAFT` |
| PROPOSED | PROPOZUAR | `status.PROPOSED` |
| APPROVED | MIRATUAR | `status.APPROVED` |
| SCHEDULED | PROGRAMUAR | `status.SCHEDULED` |
| COMPLETED | PËRFUNDUAR | `status.COMPLETED` |
| REJECTED | REFUZUAR | `status.REJECTED` |
| HELD | MBAJTUR | `status.HELD` |
| CONFIRMED | KONFIRMUAR | `status.CONFIRMED` |
| RELEASED | LIRUAR | `status.RELEASED` |
| TODO | PËR T'U BËRË | `status.TODO` |
| IN PROGRESS | NË PROCES | `status.IN_PROGRESS` |
| DONE | KRYER | `status.DONE` |
| BLOCKED | BLLOKUAR | `status.BLOCKED` |
| OVERDUE | ME VONESË | *(no key — MISSING)* |
| CONFLICT | KONFLIKT | *(no key — MISSING)* |
| LOW STOCK | STOK I ULËT | `inventory.lowStock` (current AL = "Stok i ulët") |
| OUT OF STOCK | PA STOK | *(no key — MISSING)* |
| AVAILABLE | I LIRË | `spaces.available`/`inventory.available` (current AL = "Në dispozicion") |
| RECOMMENDED | REKOMANDUAR | *(no key — MISSING)* |
| REQUIRES APPROVAL | KËRKON MIRATIM | *(no key — MISSING)* |

> **Casing:** the glossary lists AL status forms in caps (`SKICË`, `MBAJTUR`, …). The product `StatusBadge` applies `text-transform:uppercase` at render, and the i18n stores title-case (`"Skicë"`, `"E mbajtur"`). This means the **stem** must match: canvas `MBAJTUR` ⇒ stem `MBAJTUR`; current AL `"E mbajtur"` uppercases to `E MBAJTUR` (extra article). The canvas deliberately drops the article in chip form. See gap analysis — status stems differ.

### Group: Roles  ← **NO i18n KEYS EXIST FOR THESE**
| English | Shqip (canvas) | backend enum |
|---|---|---|
| MANAGER | MENAXHER | `MANAGER` |
| ADMIN | ADMINISTRATOR | `ADMIN` |
| OPS | OPERACIONE | `OPS` |
| VIEWER | SHIKUES | `VIEWER` |

> The AL topbar render (`alTopbar`) shows the user role badge **"MENAXHER"** in `#9A6B00` (`--warning`). There is **no `roles.*` block** in either `en.json` or `al.json`. This is a hard MISSING set (canvas asserts all four).

### Group: Actions & buttons
| English | Shqip | i18n key |
|---|---|---|
| New request | Kërkesë e re | `requests.new` ✓ |
| Generate plan | Gjenero planin | *(no key — MISSING)* |
| Approve plan | Mirato planin | `plan.approve` (current AL = "Mirato" — missing "planin") |
| Reject | Refuzo | `plan.reject` ✓ |
| See alternatives | Shih alternativat | `conflict.seeAlternatives` ✓ |
| Adjust request | Rregullo kërkesën | `conflict.adjust` / `requests.adjust` ✓ |
| Re-plan | Riplanifiko | *(no key — MISSING)* |
| Confirm hold | Konfirmo mbajtjen | *(no key — MISSING)* |
| Release hold | Liro mbajtjen | *(no key — MISSING)* |
| Cancel | Anulo | `ui.common.cancel` ✓ |
| Retry | Provo përsëri | `ui.common.retry` (current AL = "Riprovo" — variant, acceptable) |
| Export | Eksporto | *(no key — MISSING)* |
| Search or start a request… | Kërko ose nis një kërkesë… | `shell.searchPlaceholder` ✓ |
| Sign in | Identifikohu | `auth.signIn` (current AL = "Hyr" — MISMATCH) |
| Add user | Shto përdorues | `users.create` (current AL = "Shto staf" — variant) |

### Group: Plan / quote
| English | Shqip | i18n key |
|---|---|---|
| attendees | pjesëmarrës | `requests.attendees` (current AL = "Pjesëmarrës", capital — render-layer) |
| capacity for requested layout | kapaciteti për planin e kërkuar | *(no key — MISSING)* |
| Reserved assets | Asetet e rezervuara | *(no key — MISSING)* |
| Lease expires in | Rezervimi skadon për | `plan.leaseEnds` (current AL = "Mbajtja mbaron" — MISMATCH) |
| Setup | Montimi | `tasks.setup` (current AL = "Përgatitja" — MISMATCH) |
| Teardown | Çmontimi | `tasks.teardown` ✓ |
| Quote | Oferta | `plan.quote` / `quote.*` ✓ |
| Net | Neto | `quote.net` ✓ |
| VAT (20%) | TVSH (20%) | `quote.vat` ✓ |
| Total | Totali | `quote.total` ✓ |
| per day | në ditë | *(no key — MISSING; `spaces.dayRate`="Tarifa ditore")* |
| Standard chair | Karrige standarde | *(no key — domain data, not i18n; OK)* |
| Wireless microphone | Mikrofon pa tel | *(no key — domain data; OK)* |
| Stage deck | Skenë | *(no key — domain data; OK)* |

### Group: System & states
| English | Shqip | i18n key |
|---|---|---|
| NATS connected | NATS i lidhur | `live.connectedNats` ✓ |
| NATS degraded | NATS i dobësuar | `live.degradedNats` (current AL = "NATS i kufizuar" — MISMATCH: canvas="i dobësuar") |
| Events this week | Evente këtë javë | `dashboard.eventsThisWeek` (current AL = "Eventet këtë javë" — variant) |
| Spaces in use | Hapësira në përdorim | `dashboard.spacesInUse` ✓ |
| Low-stock assets | Asete me stok të ulët | `dashboard.lowStock` ✓ |
| Pending approvals | Miratime në pritje | `dashboard.pendingApprovals` ✓ |
| No conflicts right now | Asnjë konflikt për momentin | `conflict.none` (current AL = "Pa konflikte — gjithçka në rregull." — variant) |
| Couldn't load requests | Kërkesat nuk u ngarkuan | *(no key — MISSING; error state copy)* |
| No requests yet | Ende asnjë kërkesë | `requests.empty` (current AL = "Asnjë kërkesë nuk përputhet…" — variant) |
| 403 — Admins only | 403 — Vetëm administratorët | `users.forbidden` (current AL = "Vetëm admin." — variant) |
| Read-only for your role | Vetëm-lexim për rolin tuaj | *(no key — MISSING)* |

---

## §L.2 — Overflow stress tests

Frame `§L.2 "Overflow stress tests"`, bg `#F7F8FA` (`--surface-subtle`), sub *"EN vs AL side-by-side · the spots most at risk of truncation hold without clipping"*.

`pair()` row: 3-col grid `120px 1fr 1fr`, gap 18px, padding `16px 0`, top border `#ECEEF1`. Label mono 11px `#8A8F98` UPPERCASE. "EN" tag 10px `#B8BDC6` (`--text-disabled`) weight 600 tracking `0.04em`; "AL" tag 10px `#2F6FED` (`--accent`) weight 600.

The seven stress pairs (EN | AL):
1. **Buttons** — primary "See alternatives" | "Shih alternativat"; secondary "Adjust request" | "Rregullo kërkesën". Buttons: `whiteSpace:nowrap`, h36, padding `0 16px`, radius 8px, font 14/550. AL "Shih alternativat" is ~30% wider — must not clip → buttons size to content, never fixed-width.
2. **Status chips** — `REQUIRES APPROVAL`|`KËRKON MIRATIM` (warning `#9A6B00`/`#FBF3E0`), `IN PROGRESS`|`NË PROCES` (neutral `#8A8F98`/`#F1F3F5`), `OUT OF STOCK`|`PA STOK` (danger `#C8372D`/`#FBECEA`). Chips: `whiteSpace:nowrap`, pill radius 999px, padding `3px 10px`, 12px/600, border `${fg}26` (15% alpha), `noDot:true` variant here.
3. **NATS pill** — "NATS connected"|"NATS i lidhur". Pill: h30, padding `0 12px`, radius 999px, bg `#E9F6EF` (`--success-subtle`), border `rgba(26,127,75,.2)`, dot `#1A7F4B` (`--success`) 7px, text 12/600 `#15613A` (darker success, not a token — note).
4. **KPI cards** — "Low-stock assets"|"Asete me stok të ulët" (width fixed **190px**, value `#C8372D` alert), "Pending approvals"|"Miratime në pritje". Card: 190px, border `#ECEEF1`, radius 10px, padding 14px; label 13px `#51555E` `min-height:34px` line-height 17px (**2-line clamp built in** — this is how AL overflow is absorbed); value 26px/600 mono. **KEY FLEX MECHANISM: KPI label reserves 2 lines (34px) so the longer AL string wraps instead of pushing the number.**
5. **Nav rail** — `[Dashboard, Requests·24, Conflicts·1(danger), Approvals·5]` | `[Paneli, Kërkesat·24, Konfliktet·1(danger), Miratimet·5]`. Rail width fixed **180px**; item label `overflow:hidden; textOverflow:ellipsis; whiteSpace:nowrap` — **ellipsis fallback** if AL overflows; count badge pinned right with `marginLeft:auto`. Active item bg `#EEF3FE` (`--accent-muted`), text `#2F6FED`.
6. **Segmented** — `Day/Week/Month` | `Ditë/Javë/Muaj`. Track bg `#F1F3F5` (`--surface-sunken`), radius 8px, pad 3px; segments padding `6px 14px`, 13/550, `whiteSpace:nowrap`; active seg bg `#fff` shadow `0 1px 2px rgba(11,13,18,.08)`.
7. **Lease countdown** — "Lease expires in"+`12:04` | "Rezervimi skadon për"+`12:04`. Container `inline-flex`, bg `#FBF3E0` (`--warning-subtle`), radius 8px, padding `8px 12px`; label 12/600 `#9A6B00`; time mono 600 `#9A6B00`. AL label is ~2× the EN label width — `inline-flex` grows to fit.

**Overflow lessons the build must honor:**
- Buttons & chips: `width:auto` + `white-space:nowrap` + content padding. Never fixed pixel widths.
- KPI tile label: reserve **2 lines** (`min-height:34px`, `line-height:17px`) so AL wraps without shoving the number.
- Nav rail: fixed-width rail ⇒ label gets `text-overflow:ellipsis` as the safety net (AL nav words are short enough to fit at 180–232px, but the guard stays).
- Lease/NATS pills: `inline-flex`, intrinsic width — they simply get wider in AL.

---

## §L.3 — Full screens in Shqip

Frame `§L.3 "Full screens in Shqip"`, sub *"whole layout flexes with the longer copy — login · dashboard · plan · conflict"*. Four boards rendered at full fidelity in Albanian; horizontal-scroll strip, gap 32px. Each board: label 12/550 `#51555E`, card radius 4px shadow `0 1px 3px rgba(0,0,0,.1)`.

### Shared AL shell chrome
- **Sidebar (`alSidebar`)** width **232px**, bg `#F7F8FA`, right border `#ECEEF1`. Brand row h56: logo 26px gradient `linear-gradient(135deg,#2F6FED,#244FB0)` (accent→accent-pressed) + "Backstage" 14/600. Groups (AL): **Përmbledhje** [Paneli] · **Procesi** [Kërkesat ·24, Kalendari] · **Burimet** [Hapësirat, Inventari ·2 danger] · **Operacionet** [Detyrat, Konfliktet ·1 danger, Miratimet ·5] · **Regjistri** [Auditimi] · **Cilësimet** [Përdoruesit]. Group label 11px `#8A8F98` UPPERCASE tracking `0.05em` 600. Item h33, radius 8px; active bg `#EEF3FE` text `#2F6FED` weight 550; inactive text `#51555E` weight 400; icon 16px; count badge mono 11/600, danger variant bg `#FBECEA` text `#C8372D` else bg `#F1F3F5` text `#8A8F98`.
- **Topbar (`alTopbar`)** h56, bg `#fff`, bottom border `#ECEEF1`. Search field: max-width 400px, h34, bg `#F7F8FA`, border `#ECEEF1`, radius 8px, placeholder **"Kërko ose nis një kërkesë…"** 13px `#8A8F98`, `⌘K` kbd mono 11px. NATS pill **"NATS i lidhur"** (success, dot animates `pulse 1.8s`). Copilot button **"Kopiloti"** bg `#EEF3FE` border `#DCE6FB` text `#2F6FED` 13/550. User: avatar "EH" 30px bg `#DCE6FB`, name "Elira H." 13/600, role **"MENAXHER"** 11px `#9A6B00` (warning) 600.
- Screen frame `alScreen`: 1280px wide, default h720 (plan h820).
- `pulse` keyframe: `0%,100%{opacity:1} 50%{opacity:.4}` — used on NATS dot and lease countdown.

### Board 1 — Login · §1.1 (`alLogin`)
- Panel 440×560, bg `#F7F8FA`; inner card 360px wide → `#fff` radius 14px shadow `--elev-raised`, padding 24px.
- Logo 44px; title **"Pyramid Backstage"** 20/600; sub **"Hyrje për operacionet"** 13px `#8A8F98`.
- Field label 13/550; field box h40, border `#D7DBE0` (`--border-strong`), radius 8px, 14px.
  - Field 1 "Email-i i punës" → value `elira.hoxha@pyramid.al`.
  - Field 2 "Fjalëkalimi" → placeholder `••••••••` (`#8A8F98`).
- Submit button **"Identifikohu"** full-width h40 bg `#2F6FED` `#fff` 14/600.
- Link **"Harruat fjalëkalimin?"** 13px `#2F6FED` centered.
- Footer **"Vetëm për stafin · qasja regjistrohet"** 12px `#8A8F98` mono.
- **Locale strings used:** title="Pyramid Backstage", subtitle→"Hyrje për operacionet" (i18n `auth.subtitle` current="Hyrje për operacionet" ✓), email label→"Email-i i punës" (`auth.email` current="Email i punës" — hyphen variant), signIn→"Identifikohu" (`auth.signIn` current="Hyr" — MISMATCH), forgot→"Harruat fjalëkalimin?" (`auth.forgot` current="Keni harruar fjalëkalimin?" — variant), footerNote→"Vetëm për stafin · qasja regjistrohet" (`auth.footerNote` current="Vetëm për stafin · qasja regjistrohet" ✓).

### Board 2 — Dashboard · §3.1 (`alDashboard`)
- Greeting **"Mirëmëngjes, Elira"** 24/600; sub **"E martë, 22 korrik 2026 · 4 hapësira në përdorim"** 14px `#51555E`.
- 4 KPI tiles (grid `repeat(4,1fr)` gap 14): 
  - "Evente këtë javë" = **12**, trend ▲3 success, sub "krahasuar me javën e kaluar".
  - "Hapësira në përdorim" = **4 / 6**, sub "tani".
  - "Asete me stok të ulët" = **2** (alert `#C8372D`), sub "mikrofon, skenë".
  - "Miratime në pritje" = **5**, trend ▼2 danger, sub "në pritje të menaxherit".
  - Tile value 28px/600 mono tracking `-0.02em`; label min-height 34px (2-line flex).
- **Conflict banner**: bg `#FBECEA`, border `rgba(200,55,45,.28)`, radius 10px, pad `14px 16px`; warn icon 18px `#C8372D`; title **"1 konflikt aktiv"** 14/600 `#9E2B23`; body **"Mbrëmja e rrjetëzimit (REQ-0151) përplaset me Sallën Blu më 22 korrik."** 13px `#7A2A23`; danger sm button **"Zgjidhe"**.
- Section heading **"Orari i drejtpërdrejt — sot"** 13/600 `#51555E` + live pill **"drejtpërdrejt"** 11px `#1A7F4B` (pulsing dot).
- Schedule strip rows: **"Salla Blu"** (bar "Konferenca FinTech · 180" success), **"Salla Portokalli"** (bar "Lançim produkti" info/accent), **"Foajeja"** (bars "Galaja (mbajtur)" warning + "⚠ Mbrëmja" danger). Strip bars radius 5px, 11/600.
- Bar color sets: conf `#E9F6EF`/`#1A7F4B`/`#15613A`; sch `#EEF3FE`/`#2F6FED`/`#244FB0`; held `#FBF3E0`/`#9A6B00`/`#7A5500`; cf `#FBECEA`/`#C8372D`/`#9E2B23`.
- **Proper-noun localization confirmed:** Blue Hall→**Salla Blu**, Orange Hall→**Salla Portokalli**, Foyer→**Foajeja**.

### Board 3 — OperationalPlanView · §4.3 (`alPlan`), screen h820
- Page header crumb **Procesi / REQ-2026-0142**; title **"Konferenca FinTech për Startup-e"** 24/600; sub **"180 pjesëmarrës · Konferencë · 22 korrik 2026"** 14px `#51555E`; badge **"PROPOZUAR"** (warning); actions **"Mirato planin"** (primary) + **"Refuzo"** (secondary).
- **Copilot narrative** card: bg `#F7F9FE` border `#DCE6FB` radius 12px pad `18px 20px`; header chip 24px accent + spark icon + **"Plani i Kopilotit"** 13/600 `#2F6FED`. Body 15/23: *"**Po — mund ta organizojmë këtë.** Salla Blu strehon 180 veta në stil teatri dhe është e lirë 14:00–18:00 më 22 korrik. Kam rezervuar skenën, 180 karrige dhe 2 mikrofona pa tel, dhe kam hartuar një ofertë prej **154.800 ALL** (përfshirë TVSH 20%). Detyrat e montimit dhe çmontimit janë caktuar."*
- **SpaceCard**: title **"Salla Blu"** 16/600, sub **"Kati kryesor"** 13px `#8A8F98`; status **"E lirë"** success dot; big number **180** 30px mono, unit **"teatër"**; caption **"kapaciteti për planin e kërkuar"**; feature chips **["Skenë","AV hibride","Pa pengesa"]** bg `#F1F3F5` pill.
- **ReservationCard**: header bg `#FBF3E0` (warning), **"Rezervimi skadon për"** + countdown **"12:04"** (pulsing); body title **"Rezervimi"**, window **"22 korrik · 14:00–18:00"** mono, badge **"MBAJTUR"** (warning). Asset list label **"Asetet e rezervuara"**: `["Karrige standarde ×180","Mikrofon pa tel ×2","Skenë (6×4m) ×1"]`.
- **QuoteTable** title **"Oferta"**; line items (label / qty / amount):
  - "Salla Blu — tarifa e hapësirës" ×1 → 80.000
  - "Karrige standarde" ×180 → 21.600
  - "Mikrofon pa tel" ×2 → 7.000
  - "Skenë (6×4m)" ×1 → 12.000
  - "Ekipi i montimit dhe çmontimit" ×6 → 8.400
  - Totals: **Neto 129.000**, **TVSH (20%) 25.800 ALL**, **Totali 154.800 ALL** (total 19px/700 mono, "ALL" 12px `#8A8F98`).
- **Locale-relevant mismatches:** "Mirato planin" vs `plan.approve`="Mirato"; "Plani i Kopilotit" (narrative header) has no key (current `plan.narrative`="Përmbledhja e planit"); "Rezervimi skadon për" vs `plan.leaseEnds`="Mbajtja mbaron"; "Asetet e rezervuara", "kapaciteti për planin e kërkuar", "Kati kryesor", "teatër" — no keys.

### Board 4 — Conflicts · §6.2 (`alConflict`)
- Page header crumb **Operacionet / Konfliktet**; title **"Konfliktet"**; sub **"1 konflikt aktiv"**.
- ConflictBanner: bg `#FBECEA` border `rgba(200,55,45,.28)` radius 12px pad 20px; icon tile 26px `#fff` inset-border danger; title **"Salla Blu është rezervuar dyfish"** 16/600; **enum code chip "SPACE_DOUBLE_BOOKED"** mono 11/600 `#C8372D` on `#fff` (enum stays constant — NOT translated).
- Body **"Salla Blu është konfirmuar tashmë për Konferencën FinTech gjatë kësaj periudhe. Dy evente nuk mund të zënë të njëjtën hapësirë."** 14/21 `#7A2A23`.
- Meta: **"Periudha përplasëse"** → "22 korrik 2026 · 14:00–18:00" mono; **"Kërkesat në konflikt"** → chips `REQ-0142`, `REQ-0151`.
- Actions: primary **"Shih alternativat"** (chevron icon right) + secondary **"Rregullo kërkesën"**.
- **Locale strings:** "Salla Blu është rezervuar dyfish" maps to `conflict.SPACE_DOUBLE_BOOKED` (current AL="Hapësira e rezervuar dyfish" — canvas substitutes the concrete space name in the title; the generic enum label is "Hapësira e rezervuar dyfish" ✓ as a template). "Periudha përplasëse" and "Kërkesat në konflikt" — no keys (current `conflict.window`="Dritarja", no "conflicting requests" label).

---

## ====================== GAP ANALYSIS ======================

> **IMPORTANT — files changed mid-session.** `en.json` and `al.json` were both edited at ~11:08–11:09 today and are now at **full key parity (EN 184 / AL 184, zero missing either direction)**. The `nav.approvals`, `nav.collapse`, `shell.*`, `auth.forgot`, `auth.footerNote`, `live.connectedNats`, `live.degradedNats` keys that were previously AL-only-missing are **now present in AL**. The parity defect is RESOLVED on disk. Verify with the command in "How to re-verify" below before acting.

### (1) Key parity — PASS
- `flat(en).length === flat(al).length === 184`. No key in EN absent from AL; none in AL absent from EN. **No action required for parity.**
- Resolver `useT.ts` falls back EN→key, so any future AL gap degrades to English silently (DEV warns). Parity is enforced by convention, not by a test — **recommend adding a vitest that asserts flattened-key-set equality** of `en.json`/`al.json` so this can't regress (the files demonstrably drifted within one session).

### (2) MISSING keys the canvas shows but neither file defines (NEW keys to add — both locales)
These strings appear in the canvas (glossary or rendered screens) and have **no i18n key at all**. Add to BOTH `en.json` and `al.json` (keeping parity):

| Proposed key | EN | AL (from canvas) |
|---|---|---|
| `roles.MANAGER` | Manager | MENAXHER |
| `roles.ADMIN` | Admin | ADMINISTRATOR |
| `roles.OPS` | Ops | OPERACIONE |
| `roles.VIEWER` | Viewer | SHIKUES |
| `status.OVERDUE` | Overdue | ME VONESË |
| `status.CONFLICT` | Conflict | KONFLIKT |
| `inventory.outOfStock` | Out of stock | PA STOK |
| `inventory.recommended` | Recommended | REKOMANDUAR |
| `status.REQUIRES_APPROVAL` | Requires approval | KËRKON MIRATIM |
| `plan.generate` | Generate plan | Gjenero planin |
| `plan.replan` | Re-plan | Riplanifiko |
| `reservation.confirmHold` | Confirm hold | Konfirmo mbajtjen |
| `reservation.releaseHold` | Release hold | Liro mbajtjen |
| `reservation.reservedAssets` | Reserved assets | Asetet e rezervuara |
| `ui.common.export` | Export | Eksporto |
| `plan.copilotPlan` | Copilot plan | Plani i Kopilotit |
| `space.capacityForLayout` | capacity for requested layout | kapaciteti për planin e kërkuar |
| `space.perDay` | per day | në ditë |
| `conflict.window` (have it) — add `conflict.collidingWindow` | Colliding window | Periudha përplasëse |
| `conflict.conflictingRequests` | Conflicting requests | Kërkesat në konflikt |
| `requests.loadError` | Couldn't load requests | Kërkesat nuk u ngarkuan |
| `requests.emptyShort` | No requests yet | Ende asnjë kërkesë |
| `error.forbiddenAdmins` | 403 — Admins only | 403 — Vetëm administratorët |
| `error.readOnlyRole` | Read-only for your role | Vetëm-lexim për rolin tuaj |
| `conflict.noneShort` | No conflicts right now | Asnjë konflikt për momentin |

> The **roles block** is the single highest-value gap — the role badge in the AppShell topbar ("MENAXHER") cannot be localized without it, and PAGES §9.1 lists role as a column.

### (3) WRONG values — current AL differs from the canvas glossary (translation drift to reconcile)
Decide whether canvas or current build wins per row; flagged where canvas is clearly the intended ops vocabulary:

| Key | Current AL | Canvas AL | Verdict |
|---|---|---|---|
| `auth.signIn` | "Hyr" | **"Identifikohu"** | Canvas. Login button + glossary both say Identifikohu. (`auth.title` may stay "Hyr".) |
| `plan.approve` | "Mirato" | **"Mirato planin"** | Canvas (the primary plan action reads "Mirato planin"). Keep "Mirato" only if a bare-verb context exists. |
| `plan.leaseEnds` | "Mbajtja mbaron" | **"Rezervimi skadon për"** | Canvas. Used on ReservationCard header + lease stress test. |
| `plan.narrative` | "Përmbledhja e planit" | **"Plani i Kopilotit"** | Canvas narrative header = "Plani i Kopilotit"; "Përmbledhja e planit" can remain as a separate section label, but the copilot card header needs the new `plan.copilotPlan`. |
| `tasks.setup` | "Përgatitja" | **"Montimi"** | Canvas. Narrative + quote line use "montim". Reconcile to "Montimi". |
| `live.degradedNats` | "NATS i kufizuar" | **"NATS i dobësuar"** | Canvas glossary says "i dobësuar". Minor — pick one and lock it. |
| `nav.users` | "Stafi" | "Përdoruesit & rolet" (glossary) / "Përdoruesit" (rendered nav) | Canvas is internally inconsistent; either keep "Stafi" or switch to "Përdoruesit". Document the decision. |

Render-layer (NOT translation bugs — caused by `text-transform:uppercase` + article style; leave i18n title-case, the badge uppercases):
- `status.*` chip forms: canvas drops the article ("MBAJTUR" not "E MBAJTUR"). Current AL stores "E mbajtur" → uppercases to "E MBAJTUR". **This is a genuine difference**: the canvas status chip vocabulary is article-less. Recommend storing the article-less stems used as chips (`status.HELD`="E mbajtur" is fine for sentence use, but the chip wants "MBAJTUR"). Cleanest fix: status labels are short — store the canvas forms (Skicë/Propozuar/Miratuar/Programuar/Përfunduar/Refuzuar/Mbajtur/Konfirmuar/Liruar/Për t'u bërë/Në proces/Kryer/Bllokuar) and let the badge uppercase. NOTE `SCHEDULED`: canvas="PROGRAMUAR" vs current "E planifikuar" — lexical change, and `IN_PROGRESS`: canvas="NË PROCES" vs current "Në vazhdim" — lexical change. These two are real word choices, not just articles.
- `requests.attendees` "Pjesëmarrës" vs canvas lowercase "pjesëmarrës" — render context (inline unit vs label). Keep title-case for labels.

### (4) Overflow / stress — components that MUST flex (build checklist)
From §L.2, the spots most at risk and the mechanism each needs:
1. **Buttons** (`Button` primitive) — `width:auto`, `white-space:nowrap`, content padding `0 16px`. AL "Shih alternativat"/"Rregullo kërkesën" ≈ +30% width. NEVER fixed-width primary/secondary buttons.
2. **Status chips** (`StatusBadge`) — pill, `white-space:nowrap`, padding `3px 10px`. "KËRKON MIRATIM" is the longest. Must not wrap or clip.
3. **KPI tiles** (`KPIStat`) — label `min-height:34px; line-height:17px` (**reserve 2 lines**) so "Asete me stok të ulët" / "Miratime në pritje" wrap above the number instead of pushing it. Fixed tile width 190px in stress test; in dashboard `repeat(4,1fr)`.
4. **Nav items** (`AppShell` sidebar) — fixed rail (180px stress / 232px shell); label `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`; count badge `margin-left:auto`. AL nav labels fit, but keep the ellipsis guard.
5. **Lease countdown / NATS pill** — `inline-flex` intrinsic width; "Rezervimi skadon për" ≈ 2× "Lease expires in". Containers grow, never truncate.
6. **Segmented control** — segments `white-space:nowrap`, intrinsic width; "Ditë/Javë/Muaj" fits but track must size to content.
7. **Plan narrative / conflict body** — long AL prose (the copilot paragraph, conflict detail) — these are flow text in fixed-width cards; line-height 21–23px, wraps naturally. Ensure card padding holds and no `nowrap`.
8. **Page header title + action row** — `flex-wrap:wrap` on the title/action container (canvas `alPageHeader` uses `flexWrap:'wrap'`) so "Konferenca FinTech për Startup-e" + "Mirato planin"/"Refuzo" reflow on narrow widths.

General rule (DESIGN_SYSTEM §6 i18n): **Albanian runs ~20–30% longer; design buttons/labels/chips to flex without truncation.** No fixed-width text containers; reserve 2 lines on metric labels; ellipsis only in the fixed-width nav rail.

---

## How to re-verify (run before editing)
```
cd frontend && node -e 'const fs=require("fs");
const f=p=>{const o=JSON.parse(fs.readFileSync(p,"utf8"));const r={};(function w(x,pre){for(const k in x){const kk=pre?pre+"."+k:k;x[k]&&typeof x[k]=="object"?w(x[k],kk):r[kk]=x[k]}})(o,"");return r};
const e=f("src/i18n/en.json"),a=f("src/i18n/al.json");
console.log("EN",Object.keys(e).length,"AL",Object.keys(a).length);
console.log("EN-only:",Object.keys(e).filter(k=>!(k in a)));
console.log("AL-only:",Object.keys(a).filter(k=>!(k in e)));'
```
Expected today: `EN 184 AL 184`, both arrays empty.

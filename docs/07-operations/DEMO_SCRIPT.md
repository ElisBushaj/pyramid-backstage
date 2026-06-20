# Demo Script — "what success looks like"

> The demo that maps **1:1** to the vision's "what success looks like" ([`docs/00-strategy/VISION.md`](../00-strategy/VISION.md)). Six beats. Each beat names the **pages** it drives ([`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md)) and the **endpoints** it hits ([`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md), AI surface in [`docs/04-api/AI_CONTRACT.md`](../04-api/AI_CONTRACT.md)). Bring-up is in [`RUNBOOK.md`](./RUNBOOK.md); run the seed first so the data (halls + transitional spaces, realistic inventory, staff users, a demo **partner**, and a **planted conflict**) is in place.

## Setup (before the room)

1. `docker compose up` (from [`infrastructure/`](../../infrastructure/)) — brings up `ops-core`, the `ai-orchestrator`, and the frontend — and `pnpm db:seed` in `ops-core`. See [`RUNBOOK.md`](./RUNBOOK.md) § Bring-up and § AI orchestrator.
2. Three browser sessions ready: one logged in as **OPS** (does the planning), one as **MANAGER** (approves), one as the demo **PARTNER** (files via the portal). Showing the role gate live is part of the story.
3. Confirm the dashboard (`/`) is connected (the live-status pill reads connected; if demoing the degrade path, note it polls) and the copilot is live (the panel shows the AI is reachable; if not, it runs **canned** — the locked fallback, so this never blocks you). See [`RUNBOOK.md`](./RUNBOOK.md) § AI degrade-to-canned.
4. Have the messy request line ready to type verbatim, and a **printed/encoded `assetId` QR** for the scanner beat ([`RUNBOOK.md`](./RUNBOOK.md) § Scanner demo prep).

## Beat 1 — "Yes, we can make this happen"

**Do:** On `/requests/new`, type the messy request to the **copilot** (`CopilotPanel`, now live):

> *"Startup conference, 180 people, late next month, needs a stage and mics."*

**Watch the copilot return a real `OperationalPlan`** — and walk the operational-plan view:

- A **matched space** (Blue Hall — seats 180 in theater, has a stage).
- A **quote** with line items and **VAT** — *"134,000 ALL incl. 20% VAT"* — the total **server-computed**, consistent with the lines.
- **Reserved assets** (a stage unit + 2 microphones + 180 chairs) and the **remaining inventory** after the hold.
- **No conflict** — a calm, green plan.
- A **setup/teardown task list** (set theater seating, sound check, …) with due times.

**Say:** *"One messy sentence in — a complete, costed, conflict-checked plan out. The AI understood it; the record made it true. Every number in that sentence came from ops-core — the AI never invents a total."*

| | |
|---|---|
| **Pages** | §4.2 `/requests/new` (intake — chat) → §4.3 `/requests/:id` (OperationalPlanView: SpaceCard + QuoteTable + ReservationCard + TaskBoard + **FloorMap**, feasible state) · §8.1 CopilotPanel (`plan-preview`) |
| **Endpoints** | AI `POST /chat` → `POST /plan` (the deterministic LangGraph DAG) → internally `POST /requests` → `GET /spaces?minCapacity&layout&start&end` → `GET /assets?type&quantity&start&end` → `POST /reservations` (`HELD`) → `POST /quotes` → `POST /requests/:id/tasks` → `GET /requests/:id` (aggregate). The AI authenticates to ops-core with the **service token + forwarded actor** ([F17](../06-features/F17-ai-auth/SPEC.md)) so the hold/quote/tasks are audited to the real OPS user. |
| **Proves** | NL → `OperationalPlan` ([AI_CONTRACT](../04-api/AI_CONTRACT.md)), space matching, atomic hold, **server-computed VAT** ([ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md)), remaining inventory (sum-of-holds), task generation, narrative-numbers-from-ops-core |

## Beat 2 — The FloorMap lights up

**Do:** Stay on `/requests/:id`. Point at the **FloorMap** beside the plan: the radial schematic of the Pyramid with **floor 0** showing.

**Watch the chosen space and its bundle light up:**

- **Blue Hall** glows as the **`main`** wedge (sectors 1–3) — the one chosen room, in the accent colour.
- Its **conference bundle** lights `bundle` — the entrance/atrium **registration** space, any green-room box — the secondary rooms the same plan reserves.
- Affected **circulation** (the access corridors the booking touches) tints `circulation`.

**Say:** *"'Can we make this happen?' just became a picture, not a paragraph — the room, the rooms around it, the way in and out. This is the building, live."*

| | |
|---|---|
| **Pages** | §4.3 `/requests/:id` FloorMap embed (`<FloorMap floor={0} spaces={[…]} />`, lit from the `/plan` result via the adapter) · §3.1 `/` Dashboard FloorMap tile (building-wide roll-up, for the close) |
| **Endpoints** | None new — the FloorMap is **pure/presentational**, fed the same `POST /plan` result from Beat 1 through the `/plan → spaces[]` adapter ([FLOOR_MAP.md](../05-frontend/FLOOR_MAP.md) §3) |
| **Proves** | the spatial digital twin ([ADR-0014](../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md)), `main`/`bundle`/`circulation` derivation from a deterministic plan, the v1 radial renderer that draws from the catalog alone (degrades with the AI down — [FLOOR_MAP.md](../05-frontend/FLOOR_MAP.md) §5) |

## Beat 3 — The collision, caught and explained

**Do:** Submit a **second** request that collides with the first — same hall, an overlapping window (or back-to-back inside the buffer). This is the **planted conflict** the seed sets up, or a fresh one typed live.

**Watch the conflict surface** — the copilot responds **unprompted** with the plain-language explanation and an alternative, and the FloorMap repaints:

> *"Heads up — this clashes with the FinTech conference in Blue Hall that week. They don't overlap exactly, but there isn't enough turnaround time. Orange Hall seats 180 in theater and is free — want me to hold it instead?"*

- The copilot enters **`conflict-heads-up`** — `plan.conflicts` + `alternatives` from the `409`-carrying plan.
- The **FloorMap** flips Blue Hall to **`conflict`** (`danger`) and shows **Orange Hall** (sectors 4–6) as the free alternative.
- **Re-plan** on the alternative window loops back to **`plan-preview`** — a fresh, feasible `OperationalPlan` on Orange Hall.

**Say:** *"It didn't double-book the room and hope someone noticed. The record refused the hold, handed back exactly why, and the AI turned that into a plain-language alternative — before anyone asked. One click and we've re-planned."*

| | |
|---|---|
| **Pages** | §8.1 CopilotPanel (**`conflict-heads-up`** → re-plan → `plan-preview`) · §4.3 `/requests/:id` FloorMap (`conflict` + alternative) · §6.2 `/conflicts` (the conflict + alternatives) |
| **Endpoints** | AI `POST /plan` → ops-core `POST /reservations` → **`409 { conflicts }`** (the deterministic branch) → the plan returns `feasible:false` + `alternatives` · NATS **`conflict.detected`** drives the unprompted heads-up · **Re-plan** re-calls `POST /plan` with the chosen alternative window |
| **Proves** | the conflict engine (buffer-aware `SETUP_WINDOW_OVERLAP` / `SPACE_DOUBLE_BOOKED`, [ADR-0009](../08-decisions/0009-conflict-window-includes-buffers.md)), the `409`-carries-the-explanation contract ([ERROR_CONTRACT](../04-api/ERROR_CONTRACT.md)), the plan's `feasible:false` + `alternatives` shape ([AI_CONTRACT](../04-api/AI_CONTRACT.md)), the propose → conflict → re-plan loop, AI output staying grounded in the record |

## Beat 4 — Approve it (as a MANAGER), live to the dashboard

**Do:** Back on the **first** request (`/requests/:id`), switch to the **MANAGER** session and **approve**. First, in the OPS session, show the approve button **disabled with a tooltip** — *VIEWER/OPS can't approve* — then approve as MANAGER. Then switch to the **dashboard** (`/`).

**Watch the request go `SCHEDULED`** and the **dashboard update live**: held reservations flip to **CONFIRMED**, the **task list goes live**, an **audit entry** is written with the manager's name, and on the dashboard the pending-approvals count drops and the schedule strip shows the newly `SCHEDULED` event — **no refresh** (NATS `request.approved`).

**Say:** *"Approving is gated to a manager — the record enforces it, not the UI. The moment it's approved, the holds are committed, the task list is live, the decision is on the record — who approved it, when, what changed — and the dashboard knew before I could blink."*

| | |
|---|---|
| **Pages** | §6.3 Approvals in §4.3 `/requests/:id` (role-gated; VIEWER/OPS see disabled + tooltip → forbidden; MANAGER → submitting → success) · §3.1 `/` Dashboard (live flip) · §7.1 `/audit` (the new entry) |
| **Endpoints** | **`POST /requests/:id/approve`** (MANAGER+) → reservations `CONFIRMED`, request `SCHEDULED`, `AuditEntry` written, **`request.approved`** emitted · a VIEWER/OPS attempt → **`403 forbidden`** · NATS `request.approved` drives the live dashboard (or polling fallback) · `GET /audit?requestId` |
| **Proves** | RBAC (approvals MANAGER+, [ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md)), guarded lifecycle transition, **audit-with-actor** in the same transaction ([docs/02-domain/AUDIT.md](../02-domain/AUDIT.md)), the live signal ([ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md)) |

## Beat 5 — The partner files it themselves (no email)

**Do:** Switch to the **PARTNER** session and open `/portal`. As an external organiser, **submit a request** — type a brief to the partner-side intake copilot (or fill the scoped Intake form). Then switch to the **MANAGER** session and open the **Pending Approvals** queue; the partner's `PROPOSED` request is there with an AI recommendation; **approve** it.

**Watch the partner's status move in-app:** the request lands `PROPOSED`, the partner sees only *their own* event, and the moment the manager approves it flips to `APPROVED`/`SCHEDULED` — **in the portal, never by email**.

**Say:** *"That's the partner who used to email a spreadsheet and wait for a phone call. Now they file it themselves, see only their own event, and watch it get approved — no inbox in the loop at all."*

| | |
|---|---|
| **Pages** | §4.x `/portal/new` (partner intake, scoped — reuses the copilot wiring) · §4.x `/portal` my-requests status timeline (row-scoped) · §6.x **Pending Approvals** queue (MANAGER+, with the AI-recommendation slot) |
| **Endpoints** | `POST /private/requests` (now reachable by **PARTNER** — creates a `PROPOSED` request owned by them) · `GET /private/requests` / `:id` **row-scoped** to `createdById` for PARTNER (a cross-row read → **`404`**, never `403`) · `POST /private/requests/:id/approve` (F10, MANAGER+) from the queue |
| **Proves** | the `PARTNER` role below `VIEWER` + per-user row-scoping ([ADR-0010](../08-decisions/0010-partner-role-and-approval-chain.md), [PARTNER_PORTAL.md](../02-domain/PARTNER_PORTAL.md)), single-step approval reusing F10 unchanged, the partner portal as the front door that replaces email |

## Beat 6 — Where is it? Scan a mic, watch it move

**Do:** Open the **Scanner** page (mobile-first) in the OPS session. Scan (or decode) the **printed `assetId` QR** for a microphone — pick **CHECK_OUT**, a quantity, and a destination (e.g. *Blue Hall*) — and submit. Then look at the **"Where is it?"** dashboard widget and the asset's **movement timeline**.

**Watch the live location update:** the scan records an `AssetMovement`, `Asset.location` flips to the destination, the "Where is it?" widget shows the mic now at Blue Hall, and the timeline gains a row (action, quantity, from→to, who scanned, when).

**Say:** *"On event day, 'where is the mic?' used to mean walking the building. Now it's a scan — the location is live, the history is on the record, and the dashboard answers 'where is everything right now' at a glance."*

| | |
|---|---|
| **Pages** | §x Scanner page (camera → decode `assetId` → check-out/in/relocate form) · §3.1 `/` "Where is it?" widget (live rollup) · §x AssetDetail movement timeline + the per-asset QR |
| **Endpoints** | **`POST /private/assets/:id/scan`** (OPS+, idempotent, over-checkout-guarded) → records the `AssetMovement`, updates the live `Asset.location`, writes `asset.scan` audit + `asset.moved` outbox in **one transaction** · `GET /private/assets/:id/movements` (the timeline) · `GET /private/assets` (live `currentLocation` + `checkedOutQuantity`) · NATS `asset.moved` drives the live widget |
| **Proves** | aggregate-with-movement tracking ([ADR-0011](../08-decisions/0011-qr-nfc-asset-tracking.md), [ASSET_TRACKING.md](../02-domain/ASSET_TRACKING.md)), the movement ledger making location live + historical, the over-checkout guard, audit + outbox in one transaction, idempotent scan |

## The close

> *"No refresh, no second spreadsheet, no phone call to logistics. One screen that knows what's true, updates as it happens, shows you the building, lets partners file their own events, and tracks every chair and mic to where it actually is."*
>
> **"This replaces the emails, the spreadsheets, and the phone calls."**

(For the close, leave the **dashboard** (`/`) up — the FloorMap tile lit with what's live in the building, the schedule strip, the conflict resolved, the "Where is it?" widget current. If running the degrade path: it refreshes on poll — note the core loop is identical.)

## The thread through all six beats

| Beat | The line | The proof underneath |
|---|---|---|
| 1 | "Yes, here's how." | NL → `OperationalPlan`: match + atomic hold + server VAT + tasks, numbers from ops-core |
| 2 | "Here's the building." | the FloorMap digital twin lit from the plan (`main`/`bundle`/`circulation`) |
| 3 | "Not as-is — here's the alternative." | buffer-aware conflict engine + `409`-carries-why + live heads-up + re-plan |
| 4 | "Approved — on the record, on the dashboard." | RBAC gate + confirmed reservations + audit-with-actor + live NATS flip |
| 5 | "The partner files it — no email." | `PARTNER` role + row-scoping + single-step approval queue |
| 6 | "And we know where everything is." | the movement ledger: live location + history + audited scan |
| ⟶ | "This replaces the emails, the spreadsheets, and the phone calls." | the live command center, one source of truth |

## If something goes sideways

- **AI down / not reachable:** the demo still works — the copilot runs **canned** (the locked degrade-to-canned fallback) and the FloorMap renders from the catalog alone (v1, no AI dependency). Say *"the reasoning layer is offline; the system doesn't need it to be on"* and carry on. See [`RUNBOOK.md`](./RUNBOOK.md) § AI degrade-to-canned and [AI_CONTRACT.md](../04-api/AI_CONTRACT.md) § Degrade-to-canned. For Beat 1, the canned copilot still produces the deterministic plan from ops-core; for Beats 2/6, the FloorMap/widget read ops-core aggregate data directly.
- **NATS down / not connected:** the demo still works — the loop is REST-only and the dashboard polls ([ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md)). Say *"the live layer is degraded; the system doesn't care"* and carry on. See [`RUNBOOK.md`](./RUNBOOK.md) § NATS down. (In this mode Beats 4/6 land on poll, not instantly.)
- **Stale demo data** (a prior run left holds, scans, or partner requests): reset the seed ([`RUNBOOK.md`](./RUNBOOK.md) § reset demo data) before the room.
- **The planted conflict doesn't fire:** confirm the second request's window actually overlaps the seeded one's **effective** window (buffers included).
- **The scanner camera is unavailable:** the Scanner page degrades to manual `assetId` entry — type the id from the QR label ([`RUNBOOK.md`](./RUNBOOK.md) § Scanner demo prep).

## Cross-references

- **The vision this maps to:** [`docs/00-strategy/VISION.md`](../00-strategy/VISION.md).
- **Pages × states × endpoints:** [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md). **The contract:** [`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md); **the AI surface:** [`docs/04-api/AI_CONTRACT.md`](../04-api/AI_CONTRACT.md). **The FloorMap:** [`docs/05-frontend/FLOOR_MAP.md`](../05-frontend/FLOOR_MAP.md).
- **Bring-up & ops** (incl. AI orchestrator, partner seed, scanner prep): [`RUNBOOK.md`](./RUNBOOK.md).
</content>
</invoke>

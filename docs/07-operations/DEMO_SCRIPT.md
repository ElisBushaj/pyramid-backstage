# Demo Script — "what success looks like"

> The demo that maps **1:1** to the vision's "what success looks like" ([`docs/00-strategy/VISION.md`](../00-strategy/VISION.md)). Four beats. Each beat names the **pages** it drives ([`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md)) and the **endpoints** it hits ([`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md)). Bring-up is in [`RUNBOOK.md`](./RUNBOOK.md); run the seed first so the data (4 halls, realistic inventory, staff users, a **planted conflict**) is in place.

## Setup (before the room)

1. `docker compose up` (from [`infrastructure/`](../../infrastructure/)) and `pnpm db:seed` in `ops-core` — see [`RUNBOOK.md`](./RUNBOOK.md).
2. Two browser sessions ready: one logged in as **OPS** (does the planning), one as **MANAGER** (approves). Showing the role gate live is part of the story.
3. Confirm the dashboard (`/`) is connected (the live-status pill reads connected; if demoing the degrade path, note it polls).
4. Have the messy request line ready to type verbatim.

## Beat 1 — "Yes, we can make this happen"

**Do:** On `/requests/new`, type the messy request to the copilot:

> *"Startup conference, 180 people, late next month, needs a stage and mics."*

**Watch the AI return a feasible plan** — and walk the operational-plan view:

- A **matched space** (Blue Hall — seats 180 in theater, has a stage).
- A **quote** with line items and **VAT** — *"134,000 ALL incl. 20% VAT"* — the total **server-computed**, consistent with the lines.
- **Reserved assets** (a stage unit + 2 microphones + 180 chairs) and the **remaining inventory** after the hold.
- **No conflict** — a calm, green plan.
- A **setup/teardown task list** (set theater seating, sound check, …) with due times.

**Say:** *"One messy sentence in — a complete, costed, conflict-checked plan out. The AI understood it; the record made it true."*

| | |
|---|---|
| **Pages** | §4.2 `/requests/new` (intake — chat) → §4.3 `/requests/:id` (OperationalPlanView: SpaceCard + QuoteTable + ReservationCard + TaskBoard, feasible state) · §8.1 CopilotPanel (plan-preview) |
| **Endpoints** | AI `POST /chat` → `POST /requests` → `GET /spaces?minCapacity&layout&start&end` → `GET /assets?type&quantity&start&end` → `POST /reservations` (`HELD`) → `POST /quotes` → `POST /requests/:id/tasks` → `GET /requests/:id` (aggregate) |
| **Proves** | space matching, atomic hold, **server-computed VAT** ([ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md)), remaining inventory (sum-of-holds), task generation |

## Beat 2 — The collision, caught and explained

**Do:** Submit a **second** request that collides with the first — same hall, an overlapping window (or back-to-back inside the buffer). This is the **planted conflict** the seed sets up, or a fresh one typed live.

**Watch `conflict.detected` fire** and the AI respond **unprompted** in the copilot:

> *"Heads up — this clashes with the FinTech conference in Blue Hall that week. They don't overlap exactly, but there isn't enough turnaround time. Orange Hall seats 180 in theater and is free — want me to hold it instead?"*

**Say:** *"It didn't double-book the room and hope someone noticed. The record refused the hold, handed back exactly why, and the AI turned that into a plain-language alternative — before anyone asked."*

| | |
|---|---|
| **Pages** | §8.1 CopilotPanel (**conflict-heads-up**, unprompted) · §6.2 `/conflicts` (the conflict + alternatives) · §4.3 `/requests/:id` (not-feasible → alternatives state) |
| **Endpoints** | AI `POST /chat` → `POST /reservations` → **`409 { conflicts }`** (the deterministic branch) · NATS **`conflict.detected`** drives the unprompted heads-up · `GET /conflicts?spaceId&start&end` for the alternatives |
| **Proves** | the conflict engine (buffer-aware `SETUP_WINDOW_OVERLAP` / `SPACE_DOUBLE_BOOKED`, [ADR-0009](../08-decisions/0009-conflict-window-includes-buffers.md)), the `409`-carries-the-explanation contract ([ERROR_CONTRACT](../04-api/ERROR_CONTRACT.md)), the live signal, AI output staying grounded in the record |

## Beat 3 — Approve it (as a MANAGER)

**Do:** Back on the **first** request (`/requests/:id`), switch to the **MANAGER** session and **approve**. First, in the OPS session, show the approve button **disabled with a tooltip** — *VIEWER/OPS can't approve* — then approve as MANAGER.

**Watch the request go `SCHEDULED`:** held reservations flip to **CONFIRMED**, the **task list goes live**, and an **audit entry** is written with the manager's name.

**Say:** *"Approving is gated to a manager — the record enforces it, not the UI. The moment it's approved, the holds are committed, the task list is live, and the decision is on the record: who approved it, when, and what changed."*

| | |
|---|---|
| **Pages** | §6.3 Approvals in §4.3 `/requests/:id` (role-gated; VIEWER/OPS see disabled + tooltip → forbidden; MANAGER → submitting → success) · §7.1 `/audit` (the new entry) |
| **Endpoints** | **`POST /requests/:id/approve`** (MANAGER+) → reservations `CONFIRMED`, request `SCHEDULED`, `AuditEntry` written, **`request.approved`** emitted · a VIEWER/OPS attempt → **`403 forbidden`** · `GET /audit?requestId` |
| **Proves** | RBAC (approvals MANAGER+, [ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md)), guarded lifecycle transition, **audit-with-actor** in the same transaction ([docs/02-domain/AUDIT.md](../02-domain/AUDIT.md)) |

## Beat 4 — The live dashboard, and the close

**Do:** Switch to the **dashboard** (`/`). Point at it updating **live** as the approval lands — pending-approvals count drops, the schedule strip shows the newly `SCHEDULED` event, the inventory meters reflect the confirmed hold, the conflict alert from Beat 2 sits resolved/visible. (If running the degrade path: it refreshes on poll — note the core loop is identical.)

**Close:**

> *"No refresh, no second spreadsheet, no phone call to logistics. One screen that knows what's true, updates as it happens, and proves who decided what."*
>
> **"This replaces the emails, the spreadsheets, and the phone calls."**

| | |
|---|---|
| **Pages** | §3.1 `/` Dashboard (KPIs + live schedule strip + conflict alerts + recent activity) · §2.1 AppShell (live-status pill: connected / degraded) |
| **Endpoints** | `GET /private/requests?status=`, `GET /private/spaces?start&end`, `GET /private/assets?start&end`, `GET /private/conflicts` · NATS `inventory.low` / `conflict.detected` / `request.approved` (or polling fallback) |
| **Proves** | the live command center ([ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md)), the whole loop tying back to one source of truth |

## The thread through all four beats

| Beat | The line | The proof underneath |
|---|---|---|
| 1 | "Yes, here's how." | match + atomic hold + server VAT + tasks |
| 2 | "Not as-is — here's the alternative." | buffer-aware conflict engine + `409`-carries-why + live heads-up |
| 3 | "Approved — and on the record." | RBAC gate + confirmed reservations + audit-with-actor |
| 4 | "This replaces the emails, the spreadsheets, and the phone calls." | the live dashboard, one source of truth |

## If something goes sideways

- **NATS down / not connected:** the demo still works — the loop is REST-only and the dashboard polls ([ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md)). Say *"the live layer is degraded; the system doesn't care"* and carry on. See [`RUNBOOK.md`](./RUNBOOK.md) § NATS down.
- **Stale demo data** (a prior run left holds): reset the seed ([`RUNBOOK.md`](./RUNBOOK.md) § reset demo data) before the room.
- **The planted conflict doesn't fire:** confirm the second request's window actually overlaps the seeded one's **effective** window (buffers included).

## Cross-references

- **The vision this maps to:** [`docs/00-strategy/VISION.md`](../00-strategy/VISION.md).
- **Pages × states × endpoints:** [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md). **The contract:** [`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md).
- **Bring-up & ops:** [`RUNBOOK.md`](./RUNBOOK.md).

# Design ↔ Backend Alignment Audit

Run **2026-06-18**, before frontend implementation, to confirm the Claude Design export in `CLAUDE_DESIGN/` and the backend contract (`ops-core/openapi.yaml`) describe the same system. Alignment is strong **by construction** — the design was generated from `docs/05-frontend/PAGES.md`, which is derived from the contract. This audit checked it at field/action level.

## Verdict: ✅ aligned (3 minor additive gaps, now closed)

| Dimension | Result |
|---|---|
| **Pages** | 15/15 present (every `PAGES.md` §) — Login, Dashboard, Requests, Intake, OperationalPlan, Calendar, Spaces, Inventory, Tasks, Conflicts, Approvals, Audit, Users |
| **Enums** | Exact match — request `DRAFT…REJECTED`, reservation `HELD/CONFIRMED/RELEASED`, task `TODO…BLOCKED`, the 3 conflict types, roles `ADMIN/MANAGER/OPS/VIEWER`. No foreign values. |
| **Money** | Integer Lek, `ALL`, VAT/TVSH shown (`134,000 ALL`). EN `,` vs AL `.` grouping is correct locale behavior. |
| **Reservations** | Design surfaces the HELD **lease countdown** (`expiresAt`) — matches the contract's lease model. |
| **Conflicts** | `ConflictBanner` renders type + detail + window + `conflictingRequestIds` + a requested/available meter — matches `Conflict` + the `409 {conflicts}` shape. |
| **Quotes** | `QuoteTable` shows NET / VAT 20% / TOTAL — matches server-computed `Quote`. |
| **RBAC** | Approvals show MANAGER default + **VIEWER 403**; Space/Asset edits gated **OPS+** — matches the role model. |
| **Intake form** | Organizer · Work email · Attendees · Event type · Preferred dates · Layout · Catering · Requirements → map 1:1 to `EventRequestInput`. |
| **Dashboard KPIs** | Events this week · Spaces in use (4/6) · Low-stock · Pending approvals → all computable from the contract. |
| **Copilot** | `Message Copilot…` + ProposedActionCard + unprompted heads-up → `POST /chat` + `conflict.detected`. |

## Gaps found → resolution

| # | Design affordance | Gap | Resolution |
|---|---|---|---|
| 1 | "Adjust request" / Edit (§4.3) | No `PATCH /requests/:id` | **Added** to contract (DRAFT-only) → task **F04-T06** |
| 2 | "Search requests…" (§4.1) | `GET /requests` filtered by status only | **Added** `q` param → task **F04-T07** |
| 3 | Dashboard KPI tiles + trends (§3.1) | No stats endpoint (would be 4 client counts) | **Added** `GET /dashboard/stats` → task **F13-T05** |
| 4 | "Export" button | No backend endpoint | **Client-side** (CSV/print from loaded data) — no contract change |
| 5 | "Duplicate" request | — | **Client-side** prefill of `POST /requests` — no contract change |
| 6 | Money display (`154,800` / `154.800` / compact `3.3L`) | Locale + compact formatting | **Build note**: format via `lib/money.ts` from integer minor units; not a contract issue |

All contract changes were **additive** (the contract stays lock-compatible). Re-validated: `openapi.yaml` parses (24 paths, 46 schemas).

## Build note
Ensure the intake flow captures `title` (required by `EventRequestInput`) — the AI-chat path derives it from the message; the structured form must include an "Event name/title" field.

**Conclusion:** the design and backend are reconciled. Safe to implement.

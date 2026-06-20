---
id: F15
name: Partner Portal & Approval Chain
phase: Core
depends_on: [F01, F04, F10, F14]
status: not_started
last_updated: 2026-06-20
---

# F15 — Partner Portal & Approval Chain

## Summary

A `PARTNER` role plus an external partner portal that replaces email. Partners submit event requests and watch their own status; staff approve from an admin queue — reusing the F10 `MANAGER+` approve/reject as the single approval step. Partner reads are row-scoped by `EventRequest.createdById`, so a partner sees only what they created and a cross-tenant read leaks nothing (404, not 403). This is the brief's headline "remove fragmented email/phone coordination": one intake surface, one status view, one approval queue — no inbox.

`PARTNER` ranks **below** `VIEWER` on the existing ladder, so it grants nothing on the staff tool surface; the only thing it unlocks is the partner-scoped intake + own-request reads. Everything else (approval, conflict, planning) stays staff-side, exactly as today.

## Scope

### In scope
- `PARTNER` added to the `Role` enum + the rank ladder (below `VIEWER`), across Prisma, `openapi.yaml`, `mock-ops-core`, the backend `Actor` type, and the frontend auth types (additive enum widening).
- Partner row-scoping (security-critical): `requestsService.list` + `getAggregate` filter by `createdById === actor.id` when `actor.role === 'PARTNER'`; a cross-row read → `404`.
- `POST /private/requests` usable by `PARTNER` (creates a `PROPOSED` request owned by the partner).
- Seed: a demo `PARTNER` user + 1–2 partner-created `PROPOSED` requests.
- FE partner portal: a `/portal/*` route group behind a `RequireRole('PARTNER')` shell — submit-request flow (reuses the Intake form, scoped) + a my-requests status-timeline page.
- FE admin **Pending Approvals** queue: lists `PROPOSED` requests, approve/reject via the F10 endpoints, with an AI-recommendation slot (filled by F18).
- i18n EN/AL parity + tests (the row-scoping matrix, the approval-queue actions).

### Out of scope
- The approve/reject **mechanics** — F10 owns them; F15 only widens who can submit and adds the queue UI that calls them. Approval stays single-step `MANAGER+` (no new multi-step chain).
- Partner self-service signup / email verification / password reset — partners are admin-provisioned, same as staff (per F01 out-of-scope).
- Multi-tenant org modelling — scoping is per-user (`createdById`), not per-org; an org abstraction is additive later.
- The AI recommendation content in the queue slot — F18 fills it; F15 only renders the slot.
- A separate partner contract surface — partners use the existing `/private/requests` endpoints under their session; no new public tier.

## Acceptance criteria

- `Role` gains `PARTNER` everywhere it is declared (Prisma enum, `openapi.yaml` `Role`, `mock-ops-core`, the backend `Actor` type, the frontend auth types), ranked **below** `VIEWER` so the ladder is `PARTNER < VIEWER < OPS < MANAGER < ADMIN`; the widening is additive and breaks no existing role check (per ADR `docs/08-decisions/0010-partner-role-and-approval-chain.md`).
- A `PARTNER` may `POST /private/requests` — the request is created at `PROPOSED` with `createdById = req.actor.id`, audited `request.create`, exactly as a staff create.
- `requestsService.list` and `getAggregate` filter by `createdById === actor.id` when `actor.role === 'PARTNER'`; a `PARTNER` reading a request they did not create → `404 not_found` (never `403`, to avoid leaking existence); a `VIEWER`/`OPS`/`MANAGER`/`ADMIN` keeps seeing all requests unfiltered.
- A `PARTNER` is below `VIEWER`, so every staff-only gate (`requireRole('VIEWER')` and up, approvals, conflicts, admin) returns `403` for them — the only thing they can reach is `/private/requests` (create + own reads) and `/private/auth/me`.
- The FE `/portal/*` group mounts behind a `RequireRole('PARTNER')` shell; a non-partner hitting `/portal/*` is redirected to the staff Command Center, and a partner hitting a staff route is redirected to `/portal`.
- The admin **Pending Approvals** queue lists `PROPOSED` requests (newest first), and approve/reject buttons call the F10 `POST /private/requests/:id/approve|reject` endpoints, surfacing the `409 conflict` (expired-hold) and `422` (missing reason) outcomes inline; the AI-recommendation slot renders a placeholder until F18 supplies it.
- EN/AL locale files keep key-count parity; the row-scoping matrix and queue actions are covered by tests.

## Data model

No new models. Adds `PARTNER` to the existing `Role` enum (Prisma migration, additive). Reuses `EventRequest.createdById` (already nullable, already set to `req.actor.id` on create) as the scoping key — F15 adds the **filter**, not the column. No change to `EventRequest` shape, lifecycle, or the `RequestAggregate`. See `docs/03-data/SCHEMA.md` and `docs/02-domain/PARTNER_PORTAL.md`.

## API surface

No new endpoints. F15 widens who may call existing ones and adds a read filter:
- `POST /private/requests` — now reachable by `PARTNER`; creates a `PROPOSED` request owned by the caller.
- `GET /private/requests` / `GET /private/requests/:id` — row-scoped to `createdById` for `PARTNER`; unchanged for staff.
- `POST /private/requests/:id/approve` / `:id/reject` — unchanged (F10, `MANAGER+`); the admin queue UI calls these.

## UI surfaces

- **Partner portal** (`/portal/*`, `RequireRole('PARTNER')` shell): submit-request flow (the Intake form, scoped to the partner) + a my-requests status-timeline page reading the scoped list.
- **Pending Approvals queue** (staff, `MANAGER+`): the list of `PROPOSED` requests with approve/reject actions and the F18 AI-recommendation slot.

## Notes

- Why a sub-`VIEWER` role + per-user `createdById` scoping (and 404-not-403 on cross reads): ADR [docs/08-decisions/0010-partner-role-and-approval-chain.md](../../08-decisions/0010-partner-role-and-approval-chain.md).
- Portal flows, the scoping model, and the "remove email" rationale: [docs/02-domain/PARTNER_PORTAL.md](../../02-domain/PARTNER_PORTAL.md).
- Single-step approval reused as-is — the approve/reject contract and `409`/`422` outcomes: [docs/06-features/F10-approvals/SPEC.md](../F10-approvals/SPEC.md) and `docs/02-domain/REQUESTS.md`.
- Request shape, lifecycle, and the aggregate the portal renders: [docs/02-domain/REQUESTS.md](../../02-domain/REQUESTS.md).
- The role ladder and auth tiers `PARTNER` slots under: [docs/04-api/CONTRACT.md](../../04-api/CONTRACT.md); `req.actor` as the audit + scoping identity: [docs/02-domain/AUDIT.md](../../02-domain/AUDIT.md).
- The AI-recommendation slot in the queue is filled by [docs/06-features/F18-ai-wiring/SPEC.md](../F18-ai-wiring/SPEC.md).

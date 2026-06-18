---
id: F10
name: Approvals & Workflow
phase: Core
depends_on: [F04, F06, F09]
status: not_started
last_updated: 2026-06-18
---

# F10 — Approvals & Workflow

## Summary

The human-in-the-loop gate that commits a proposed plan. A `MANAGER+` approves a request — confirming its held reservations, advancing the request lifecycle, writing audit, and emitting `request.approved` — or rejects it with a required reason, releasing the held reservations. This is where "the AI proposes, ops-core authorizes" becomes concrete: approval is the only path that turns a `HELD` plan into a committed `CONFIRMED` one, and it is guarded so a stale (expired) hold cannot be silently confirmed.

## Scope

### In scope
- `POST /private/requests/:id/approve` (MANAGER+): confirm held reservations → audit → emit; `409` if a hold expired.
- `POST /private/requests/:id/reject` (MANAGER+): reason required → release reservations → audit.
- The role gates (MANAGER+) wired so VIEWER/OPS get `403`.
- Approval/reject tests with audit + outbox assertions.

### Out of scope
- The reservation confirm/release mechanics themselves — F06 (approve/reject *call* them).
- The request transition guard — F04 (approve/reject drive it; they don't reimplement it).
- AI-side approval UX (`requiresApproval`, `proposedActions`) — Alvin's lane (A00); ops-core is the authorizer.

## Acceptance criteria

- `POST /private/requests/:id/approve` requires `MANAGER+` (`requireRole('MANAGER')`); VIEWER and OPS get `403`. It confirms the request's `HELD` reservations (via the F06 confirm path), advances the request status per the lifecycle (`PROPOSED → APPROVED`, guarded by F04), writes an `AuditEntry` (`request.approve`), and emits `request.approved` via the outbox — all in one transaction.
- If a held reservation expired before approval, approve returns `409 conflict` with the offending `Conflict[]` (re-detected) so the AI can re-plan, rather than confirming a stale hold (per `openapi.yaml` note + `docs/02-domain/RESERVATIONS.md`).
- An approve on a request not in an approvable state → `409 invalid_transition` with `from`/`to`.
- `POST /private/requests/:id/reject` requires `MANAGER+`, requires a `reason` (3–500 chars, `422` if missing/short), releases the request's reservations (via the F06 release path), advances status to `REJECTED`, and writes an `AuditEntry` (`request.reject`) carrying the `reason`.
- Both require `Idempotency-Key`; a replay returns the original outcome; an unknown id → `404`.
- Responses use the `ServiceResponse<EventRequest>` envelope (the `RequestEnvelope`).

## Data model

No new models. Reads/transitions `EventRequest` (status, `rejectionReason`) and `Reservation` (HELD → CONFIRMED / RELEASED), and writes `AuditEntry` + `OutboxEvent`. All within the existing F04/F06/F09/F11 models.

## API surface

- `POST /private/requests/:id/approve` — approve a request (MANAGER+) → confirm held reservations → audit → emit → `EventRequest`.
- `POST /private/requests/:id/reject` — reject a request with a reason (MANAGER+) → release reservations → audit → `EventRequest`.

## UI surfaces

None — backend.

## Notes

- Approval confirms holds and emits `request.approved`; expired-hold-on-approve → `409`: `openapi.yaml` (approvals), `docs/02-domain/RESERVATIONS.md`.
- "AI proposes, ops-core authorizes" + human approval gates commits: `docs/02-domain/AI_ORCHESTRATION.md`.
- Role ladder (MANAGER+): `docs/04-api/CONTRACT.md`. Audit on approve/reject (reason required on reject): `docs/02-domain/AUDIT.md`.

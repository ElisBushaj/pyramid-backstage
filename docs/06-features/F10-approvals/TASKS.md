---
id: F10
name: Approvals & Workflow
last_updated: 2026-06-19
---

# F10 — Tasks

### F10-T01 — POST /requests/:id/approve (MANAGER+): confirm held reservations → audit → emit; 409 if a hold expired
- Status: done
- Depends on: F06-T04, F09-T02
- Estimate: 0.75d
- Acceptance:
  - `POST /private/requests/:id/approve` is gated by `requireRole('MANAGER')`; it confirms the request's `HELD` reservation(s) through the F06 confirm path, advances the request via the F04 transition guard (`PROPOSED → APPROVED`), and writes a `request.approve` `AuditEntry` + `request.approved` `OutboxEvent` — all inside one transaction.
  - If any held reservation expired before approval, the endpoint returns `APIError` `409 conflict` with the re-detected `Conflict[]` (per the `openapi.yaml` approvals note + `docs/02-domain/RESERVATIONS.md`) — it does NOT confirm a stale hold and leaves state unchanged.
  - An approve on a request not in an approvable state → `409 invalid_transition` with `from`/`to`.
  - Requires `Idempotency-Key`; a replay returns the original outcome (no double-confirm); an unknown id → `404`. Returns `ServiceResponse<EventRequest>`.
  - tsc clean; vitest passing; conforms to `docs/04-api/CORE_PATTERNS.md`.

### F10-T02 — POST /requests/:id/reject (MANAGER+): reason required → release reservations → audit
- Status: done
- Depends on: F06-T04, F09-T02
- Estimate: 0.5d
- Acceptance:
  - `POST /private/requests/:id/reject` is gated by `requireRole('MANAGER')`; it requires a `reason` (string, 3–500 chars per `openapi.yaml`) — missing/short → `422 validation`.
  - It releases the request's reservations (via the F06 release path), advances the request to `REJECTED` (F04 transition guard), and writes a `request.reject` `AuditEntry` carrying the `reason` (per `docs/02-domain/AUDIT.md`, reason required on rejects) — all in one transaction.
  - `rejectionReason` is persisted on the `EventRequest`; the response is `ServiceResponse<EventRequest>`.
  - Requires `Idempotency-Key`; replay returns the original outcome; an unknown id → `404`; rejecting a request not in a rejectable state → `409 invalid_transition`.
  - tsc clean; vitest passing.

### F10-T03 — role gates (MANAGER+) wired + VIEWER gets 403
- Status: done
- Depends on: F01-T05
- Estimate: 0.25d
- Acceptance:
  - Both `/approve` and `/reject` mount `requireRole('MANAGER')` so ADMIN + MANAGER pass and OPS + VIEWER receive `403 forbidden` (per `docs/04-api/CONTRACT.md` "Auth tiers").
  - The gate runs after `requireAuth`, so an unauthenticated caller gets `401`, not `403`.
  - Test asserts the full matrix: VIEWER → 403, OPS → 403, MANAGER → allowed, ADMIN → allowed, anonymous → 401, on both endpoints.
  - tsc clean.

### F10-T04 — approval/reject tests + audit + outbox assertions
- Status: done
- Depends on: F10-T01, F10-T02
- Estimate: 0.5d
- Acceptance:
  - Integration test (real Postgres): approve a request with a valid `HELD` reservation → reservation becomes `CONFIRMED`, request `APPROVED`, a `request.approve` audit row + a `request.approved` outbox row exist.
  - Expired-hold test: with a hold past `expiresAt`, approve returns `409 conflict` with the `Conflict[]` and leaves the request/reservation unchanged.
  - Reject test: reject with a reason → reservations `RELEASED`, request `REJECTED`, `rejectionReason` persisted, a `request.reject` audit row carrying the reason exists; reject without a reason → `422`.
  - Role-gate assertions from F10-T03 are exercised; idempotent-replay assertions confirm no double effect.
  - tsc clean; runs in CI.

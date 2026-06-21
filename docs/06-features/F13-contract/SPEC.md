---
id: F13
name: Contract Finalize + Type-Sharing + E2E
phase: Integration
depends_on: [F05, F06, F07, F08, F10, F11, F12]
status: not_started
last_updated: 2026-06-18
---

# F13 — Contract Finalize + Type-Sharing + E2E

## Summary

The capstone that proves the whole system holds together as one contract-true product. It emits the backend DTOs from `openapi.yaml`, hand-mirrors the consumed surface to the frontend, re-runs the contract test against those types, and drives the full happy path end to end — intake → match → hold → quote → tasks → approve — plus the conflict→alternatives branch off the planted seed conflict. Finally it verifies the four demo beats run green, so the live demo is reproducible.

This feature ships no new domain behaviour; it closes the loop on type-sharing and integration confidence.

## Scope

### In scope
- Emit `ops-core/src/types/api/*` from `openapi.yaml` and hand-mirror the consumed surface to `frontend/src/api/types/*`.
- A contract test asserting the `openapi.yaml` examples validate against the TS types.
- A single end-to-end integration test covering the full flow + the conflict→alternatives path.
- A demo-script verification that the four demo beats run green.

### Out of scope
- New endpoints or models — the contract is locked (additive-only); F13 does not change shapes.
- AI orchestration — Alvin's lane (A00); F13 verifies the ops-core tool surface the AI consumes, not the AI itself.
- The Python schema mirror (`ai-orchestrator/app/schemas.py`) — A00-T03 owns it (F13 keeps the contract test that would catch its drift on the TS side).

## Acceptance criteria

- `ops-core/src/types/api/*.ts` is emitted/maintained from `openapi.yaml` (one file per area), and `frontend/src/api/types/*.ts` hand-mirrors only the consumed surface, per `docs/04-api/TYPE_SHARING.md`; both compile.
- The contract test passes: every `example` in `openapi.yaml` validates against the corresponding TS type, and enum casing (`UPPER_SNAKE`) matches on both the backend and frontend mirrors — drift fails CI.
- The e2e integration test (real Postgres) runs the full flow against the seeded dataset: create request → match space (`GET /spaces`) → hold (`POST /reservations`) → quote (`POST /quotes`) → tasks (`POST /requests/:id/tasks`) → approve (`POST /requests/:id/approve`), asserting each step's contract shape and the final `RequestAggregate`.
- The same test exercises the conflict path: a hold that hits the planted seed conflict returns `409 conflict` with `Conflict[]`, and an alternative window/space succeeds — proving the conflict→alternatives story end to end (per `docs/02-domain/CONFLICTS.md`).
- A demo-script verification runs the four demo beats and asserts they complete green (the demo is reproducible from `npm`/seed + the e2e harness).

## Data model

No new models. Exercises the full set across F02–F11 against the F12 seed.

## API surface

None new — F13 exercises the existing `openapi.yaml` surface end to end and finalizes the type mirrors around it.

## UI surfaces

None — backend.

## Notes

- Type-sharing rules + the contract test as the drift guard: `docs/04-api/TYPE_SHARING.md`, `docs/04-api/CONTRACT.md`.
- The end-to-end flow mirrors the operational-plan assembly the AI narrates: `docs/02-domain/AI_ORCHESTRATION.md` (`OperationalPlan`).
- The conflict→alternatives path keys off the F12-T04 planted conflict: `docs/02-domain/CONFLICTS.md`.

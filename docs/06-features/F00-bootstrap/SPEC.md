---
id: F00
name: Bootstrap & Contract
phase: Foundation
depends_on: []
status: not_started
last_updated: 2026-06-18
---

# F00 — Bootstrap & Contract

## Summary

The ops-core chassis every other feature stands on: the TypeScript/Express 5 app, the cross-cutting conventions from `docs/04-api/CORE_PATTERNS.md` (controlled responses, `APIError`, `ServiceResponse<T>`, `ValidationHelpers`, i18n), the Prisma schema + initial migration, and the locked `openapi.yaml` contract with a test that proves the wire shapes stay true. After F00, feature work lands behaviour — never re-litigates wiring, error shapes, or the envelope.

This is infrastructure, not product surface. No business endpoint ships here beyond `/health` and `/ready`; the first domain endpoints land in F02 onward sitting on top of this chassis.

## Scope

### In scope
- Repo scaffold: `ops-core/package.json`, `tsconfig.json`, Vitest config, lint/format, npm scripts.
- `config/vars.ts` (fail-fast env validation), `config/prisma.ts`, `config/logger.ts`, the Express app with `helmet` + `cors` + `cookie-parser`.
- The error layer: `errors/index.ts` (`APIError` factories per `docs/04-api/ERROR_CONTRACT.md`), `controllers/_core.ts` (`@controlledResponse`), the `ServiceResponse<T>` / `PaginatedServiceResponse<T>` envelope.
- Validation: `ValidationHelpers` + `express-validator` wiring and the automatic `422 validation` mapping.
- i18n: `locales/al.json` + `locales/en.json`, `translate()`, locale middleware, CI key-parity check.
- Prisma schema for **all** models + enums (per `docs/03-data/SCHEMA.md`) and the initial migration.
- Locking `openapi.yaml`, the contract test (example payloads validate against `src/types/api/*`), and the optional `gen:types` script.
- `/health` + `/ready`, `Dockerfile.dev`, docker-compose smoke, green CI on a fresh clone.

### Out of scope
- Any domain logic (spaces/assets/requests/reservations/quotes/tasks/conflicts) — those are F02–F10.
- Auth/session/RBAC behaviour — F01 (this feature only ships the `User`/`Session` *models* via the all-models schema in T06).
- NATS connectivity and the outbox relay — F11 (the `OutboxEvent` model ships here in T06; nothing publishes yet).
- Frontend — out of this repo's 3-day ops-core scope.

## Acceptance criteria

- `npm install && npm run build` (tsc) is clean from a fresh clone; `npm test` (Vitest) passes.
- `config/vars.ts` throws on boot if a required env var is missing (fail-fast), with the offending key named.
- A throwaway controller using `@controlledResponse` returns the `ServiceResponse<T>` envelope `{ status, message, messageKey, data }`; a thrown `APIError` renders the matching error-contract body.
- An invalid request body produces a `422 validation` body with `fields: { <field>: <messageKey> }` automatically.
- `locales/al.json` and `locales/en.json` have identical key sets; CI fails on drift.
- `npx prisma migrate deploy` applies the initial migration cleanly to an empty Postgres 17 DB; every model in `docs/03-data/SCHEMA.md` exists.
- The contract test passes: every example in `openapi.yaml` validates against the generated `src/types/api/*` types.
- `GET /health` → 200; `GET /ready` → 200 when DB reachable, 503 otherwise. `docker compose up` brings the stack to a ready state.

## Data model

All models, defined once here in `ops-core/prisma/schema.prisma` (T06), per `docs/03-data/SCHEMA.md`: `User`, `Session`, `Space`, `Asset`, `EventRequest`, `Reservation`, `ReservationAsset`, `Quote`, `Task`, `AuditEntry`, `OutboxEvent`, `IdempotencyKey`. Enums are `UPPER_SNAKE` and mirror `openapi.yaml` (`Layout`, `SpaceKind`, `AssetType`, `AssetStatus`, `EventType`, `RequestStatus`, `ReservationStatus`, `QuoteStatus`, `TaskPhase`, `TaskStatus`, `LineItemKind`, `ConflictType`, `Role`). Indexes per the SCHEMA "Indexes that matter" block. Later features add migrations; they do not redefine models.

## API surface

- `GET /health` — liveness probe (no auth).
- `GET /ready` — readiness probe; 200 when DB (and NATS, once F11 wires it) reachable, else 503 (no auth).

The full domain endpoint surface is defined in `openapi.yaml` and implemented by F01–F10. F00 only locks the contract and ships the health/readiness probes.

## UI surfaces

None — backend.

## Notes

- `openapi.yaml` is law (`docs/04-api/CONTRACT.md`): locked at Hour 0, additive-only after, `UPPER_SNAKE` enums, RFC-3339 UTC `Z` timestamps, integer minor units for money.
- Conventions: `docs/04-api/CORE_PATTERNS.md` (controllers, errors, validation, envelopes). Error shapes: `docs/04-api/ERROR_CONTRACT.md`.
- Type-sharing posture: `docs/04-api/TYPE_SHARING.md` — DTOs in `src/types/api/<area>.ts`, hand-mirrored downstream; `gen:types` is an aid, the YAML stays source of truth.
- Money/time discipline (ADR-0004 / the time + money utils) is established here so F05/F07 can rely on `utils/time.ts` and `utils/money.ts`.

---
id: F00
name: Bootstrap & Contract
last_updated: 2026-06-19
---

# F00 — Tasks

### F00-T01 — Repo scaffold + package.json + tsconfig + vitest config
- Status: done
- Depends on: none
- Estimate: 0.5d
- Acceptance:
  - `ops-core/package.json` pins Node 20+, Express 5, Prisma 7, TypeScript, Vitest; declares scripts `build` (tsc), `dev`, `test`, `lint`.
  - `ops-core/tsconfig.json` is strict (`strict: true`, `noUncheckedIndexedAccess`); `npm run build` emits with zero errors from a fresh clone.
  - Vitest config discovers `*.test.ts` next to implementation files and `src/__tests__/*` per `docs/04-api/CORE_PATTERNS.md`; `npm test` runs green (a trivial smoke test counts).
  - Folder skeleton matches the existing layout (`src/config`, `src/controllers`, `src/errors`, `src/middlewares`, `src/modules/<area>`, `src/routes/v1`, `src/services`, `src/types/api`, `src/utils`, `src/locales`).
  - `.gitignore` excludes `node_modules`, `dist`, `.env`.

### F00-T02 — config/vars (fail-fast) + prisma + logger + express app + helmet/cors/cookie-parser
- Status: done
- Depends on: F00-T01
- Estimate: 0.5d
- Acceptance:
  - `src/config/vars.ts` validates required env (`DATABASE_URL`, `SESSION_SECRET`, `PORT`; `OPS_CORE_URL` not needed here) and **throws on boot** naming the first missing/invalid key — never starts misconfigured.
  - `src/config/prisma.ts` exports a singleton `PrismaClient`; `src/config/logger.ts` exports a structured logger (no `console.log` on request paths).
  - The Express 5 app registers `helmet`, `cors` (credentials-aware), and `cookie-parser`; JSON body parsing is enabled.
  - App boots and binds `PORT`; a missing required var aborts startup with a clear message (covered by a unit test on `vars.ts`).
  - tsc clean; conforms to `docs/04-api/CORE_PATTERNS.md`.

### F00-T03 — errors (APIError factories) + controllers/_core (@controlledResponse) + ServiceResponse envelope
- Status: done
- Depends on: F00-T02
- Estimate: 0.5d
- Acceptance:
  - `src/errors/index.ts` exports `APIError` plus factories for every error-contract row in `docs/04-api/ERROR_CONTRACT.md`: `unauthorized` (401), `forbidden` (403), `notFound` (404), `conflict` (409, carries `conflicts: Conflict[]`), `invalidTransition` (409, carries `from`/`to`), `idempotencyKeyMismatch` (409), `validation` (422, carries `fields`), `rateLimited` (429), `internal` (500). Every factory takes a `messageKey`.
  - `src/types/*` defines `ServiceResponse<T>` `{ status, message, messageKey, data }` and `PaginatedServiceResponse<T>` matching the `ServiceEnvelope` schema in `openapi.yaml`.
  - `src/controllers/_core.ts` exports `@controlledResponse(type)` which serializes the envelope, sets status, and maps a thrown `APIError` to its exact error body. Controllers never call `res.status().json()` directly.
  - Unit tests: a handler returning a `ServiceResponse` yields the envelope; a handler throwing each `APIError` factory yields the matching error-contract body with the right HTTP status and machine `error` string.
  - tsc clean; vitest passing.

### F00-T04 — ValidationHelpers + express-validator wiring + 422 mapping
- Status: done
- Depends on: F00-T03
- Estimate: 0.5d
- Acceptance:
  - `src/utils/validation.utils.ts` exposes `ValidationHelpers` built on `express-validator` (no Zod, per `docs/04-api/CORE_PATTERNS.md`); covers the common rules the contract needs (required, string length, integer min/max, email, enum membership, ISO date-time, array minItems).
  - A shared validation-result middleware turns failed validators into the `422 validation` body automatically: `{ status: 422, error: "validation", messageKey: "validation.failed", fields: { <field>: <messageKey> } }` per `docs/04-api/ERROR_CONTRACT.md`.
  - Each field error maps to a registered `messageKey` (e.g. `validation.required`), not a raw express-validator string.
  - Unit test: a route with a failing validator returns the exact 422 body shape with `fields` keyed by field name.
  - tsc clean; vitest passing.

### F00-T05 — i18n al/en + translate() + locale middleware + CI key-parity check
- Status: done
- Depends on: F00-T03
- Estimate: 0.25d
- Acceptance:
  - `src/locales/al.json` and `src/locales/en.json` exist with the bootstrap keys (`validation.*`, error-contract keys, health/system keys); a single `MESSAGE_KEYS` registry is the source list.
  - `src/utils/i18n.ts` exposes `translate(key, locale, params?)` returning the localized string with `{param}` interpolation; an unknown key resolves to the key itself (and logs a dev warning).
  - `src/middlewares/locale.middleware.ts` resolves the active locale from `Accept-Language` (default `en`) and makes it available to `@controlledResponse` so `message` is localized while `messageKey` stays stable.
  - A CI check (script + test) asserts `al.json` and `en.json` have identical key sets; the build/test fails on drift.
  - tsc clean; vitest passing.

### F00-T06 — Prisma schema (all models+enums) + initial migration
- Status: done
- Depends on: F00-T02
- Estimate: 0.5d
- Acceptance:
  - `ops-core/prisma/schema.prisma` defines every model in `docs/03-data/SCHEMA.md`: `User`, `Session`, `Space`, `Asset`, `EventRequest`, `Reservation`, `ReservationAsset`, `Quote`, `Task`, `AuditEntry`, `IdempotencyKey`.
  - Every enum mirrors `openapi.yaml` exactly (`UPPER_SNAKE`): `Layout`, `SpaceKind`, `AssetType`, `AssetStatus`, `EventType`, `RequestStatus`, `ReservationStatus`, `QuoteStatus`, `TaskPhase`, `TaskStatus`, `LineItemKind`, `ConflictType`, `Role`.
  - Money columns are `Int` `*Minor` (no `Float`/`Decimal`); all `DateTime` are UTC; `Reservation` stores `dateRange` plus `effectiveStart`/`effectiveEnd`, `expiresAt`.
  - The indexes from the SCHEMA "Indexes that matter" block are present: `Reservation [spaceId,status,effectiveStart,effectiveEnd]` and `[status,effectiveStart,effectiveEnd]`; `ReservationAsset [assetId]`; `AuditEntry [requestId,at]` + `[entityType,entityId]`; `EventRequest [status,createdAt]`.
  - An initial migration (`<timestamp>_init`) applies cleanly to an empty Postgres 17 DB via `prisma migrate deploy`; `prisma generate` produces a client tsc accepts.

### F00-T07 — Lock openapi.yaml + contract test (examples validate vs types/api) + gen:types script
- Status: done
- Depends on: F00-T03
- Estimate: 0.5d
- Acceptance:
  - `ops-core/openapi.yaml` is treated as locked (additive-only) per `docs/04-api/CONTRACT.md`; a header note records the lock.
  - `src/types/api/*.ts` defines the DTOs the backend implements, one file per area (`spaces.ts`, `assets.ts`, `requests.ts`, `reservations.ts`, `quotes.ts`, `tasks.ts`, `conflicts.ts`, `audit.ts`, `auth.ts`) per `docs/04-api/TYPE_SHARING.md`.
  - A contract test (`src/__tests__`) loads every `example` in `openapi.yaml` and asserts it validates against the corresponding `src/types/api` type (and that enum casing matches); the test fails on any drift.
  - `npm run gen:types` emits `src/types/api/*` from `openapi.yaml`; emitted files are committed and reviewed (the YAML stays source of truth, not the generator output).
  - tsc clean; the contract test passes.

### F00-T08 — /health + /ready + Dockerfile.dev + docker-compose smoke + CI green on fresh clone
- Status: done
- Depends on: F00-T02
- Estimate: 0.5d
- Acceptance:
  - `GET /health` returns 200 (liveness, no auth) matching `openapi.yaml`.
  - `GET /ready` returns 200 when the DB is reachable and 503 when it is not (readiness, no auth).
  - `ops-core/Dockerfile.dev` builds the service; `infrastructure/docker-compose` brings up Postgres + ops-core and reaches a ready state (`/ready` → 200).
  - CI runs `install → build → migrate → test` green on a fresh clone with no manual steps.
  - tsc clean; vitest passing.

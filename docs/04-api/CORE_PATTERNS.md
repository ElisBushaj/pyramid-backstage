# ops-core — Core Patterns (non-negotiable)

The backend has deliberate conventions. Conform; don't fork. If a pattern is wrong, raise a question — don't bypass it. (Mirrors the marketplace `EXISTING_PATTERNS` discipline.)

## Controllers
- **Every controller method uses `@controlledResponse(type)`** from `controllers/_core.ts`. It serializes the `ServiceResponse<T>` envelope, sets the status, and maps thrown `APIError`s to the error contract. Never hand-roll `res.status().json()`.
- Controllers are thin: validate `req`, pull `req.actor`, call the service, return the service result. No business logic in controllers.

## Errors
- **Every error from a request path throws `APIError`** with a `messageKey`. Never `throw new Error(...)` on a request path.
- `APIError({ status, messageKey, messageParams?, ... })`. The 409/422 variants carry their structured fields (`conflicts`, `from`/`to`, `fields`).

## Validation
- **Every input is validated with `express-validator` + `ValidationHelpers`** (`utils/validation.utils.ts`). No Zod, no class-validator. Validation failures become the `422 validation` body automatically.

## Services & responses
- **Every service returns `ServiceResponse<T>`**; lists return `PaginatedServiceResponse<T>`.
- Services own all business logic and all DB access (via `config/prisma`).

## Money & time
- Money lives in `*Minor` integer fields; arithmetic goes through `utils/money.ts`. **No floats touch money.**
- All date math goes through `utils/time.ts` (UTC-canonical, buffer padding, overlap test). Never hand-roll interval overlap.

## Auth & actor
- `requireAuth` populates `req.actor` (`{ id, name, role }`). `requireRole('MANAGER')` / `requirePermission(...)` gate beyond the tier.
- **`req.actor` is the audit actor.** Every mutation writes an `AuditEntry` with the real staff identity — never anonymous.

## Idempotency
- The `withIdempotency` middleware (Redis-backed, 24h TTL) wraps every mutating route. Replays return the original response; a body mismatch under the same key → `409 idempotency_key_mismatch`. See [ADR-0005](../08-decisions/0005-idempotency-keys.md).

## Reservations are transactional
- Holds/confirms run inside a **serializable** Prisma transaction with row locking (`SELECT … FOR UPDATE`) or a conditional `UPDATE … WHERE available ≥ qty`. The availability check and the decrement are never two separate statements. See [docs/02-domain/RESERVATIONS.md](../02-domain/RESERVATIONS.md).

## Routes
- Mount under `/api/v1/{public,private,admin}`. Pick the tier by access level. Register feature routers in `routes/v1/<tier>/index.ts`.

## i18n
- Every user-facing string is a `messageKey` present in **both** `locales/al.json` and `locales/en.json`. Key counts must match across locales (CI checks parity).

## Tests
- Vitest, `*.test.ts` next to the implementation. Unit tests stub Prisma (`vi.hoisted`). Integration tests (`src/__tests__`) run against real Postgres in CI. The availability/conflict engine additionally has **property tests**.

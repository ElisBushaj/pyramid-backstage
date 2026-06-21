# Architecture — Existing Patterns (pointer)

> **The canonical patterns live in [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md). Conform to them.** This page is a short pointer + the condensed non-negotiables list so you don't have to leave the architecture folder to be reminded what's forbidden. It does not restate the detail — when in doubt, the `CORE_PATTERNS.md` version wins.

`ops-core` has deliberate conventions. **Always conform; never fork.** If a pattern seems wrong, raise a question — don't bypass it.

## The non-negotiables (condensed)

- **Controlled responses.** Every controller method uses `@controlledResponse(type)` from `controllers/_core.ts`. **Never hand-roll `res.status().json()`** or an error shape.
- **`APIError` only.** Every error from a request path throws `APIError` with a `messageKey`. **Never `throw new Error(...)`** on a request path.
- **Validation via `ValidationHelpers` + `express-validator`.** No Zod, no class-validator. Failures become the `422 validation { fields }` body.
- **`ServiceResponse<T>` everywhere.** Services own all business logic + all DB access (via `config/prisma`) and return `ServiceResponse<T>`; lists return `PaginatedServiceResponse<T>`.
- **Money + time through the utils.** Money is integer minor units via `utils/money.ts` — **no floats touch money**. Overlap/buffers via `utils/time.ts` — **no hand-rolled interval math**.
- **Auth + actor.** `requireAuth` populates `req.actor`; `requireRole`/`requirePermission` gate beyond the tier. **`req.actor` is the audit actor.**
- **Audit in one transaction.** Every mutation writes an `AuditEntry` (with `req.actor`) in the **same transaction** as the state change. **Never anonymous.**
- **Reservations are serializable.** The availability check and the inventory decrement run in **one serializable transaction with row locks** — never two separate statements.
- **Idempotency on mutations.** Every mutating route wears `withIdempotency` (Redis, 24h TTL). Replays return the original; a body mismatch → `409`. ([ADR-0005](../08-decisions/0005-idempotency-keys.md))
- **Route tiers.** Mount under `/api/v1/{public,private,admin}`; pick the tier by access level; register routers in `routes/v1/<tier>/index.ts`.
- **i18n parity.** Every user-facing string is a `messageKey` present in **both** `locales/al.json` and `en.json`; **key counts must match** (CI gate).
- **Tests next to code.** Vitest `*.test.ts`; unit tests stub Prisma, integration tests use **real Postgres**; the availability/conflict engine has **property tests**.

## Forbidden (from `CLAUDE.md`)

`throw new Error` on a request path · hand-rolled JSON responses · floats on money · hand-rolled interval overlap · anonymous mutations · dual-writing events · separating the availability check from the reservation write · renumbering task IDs · editing closed ADRs · hand-editing `STATUS.md` outside the regen protocol · silent assumptions · building `A00` (Alvin's lane) · non-additive changes to `openapi.yaml` without a sync + new ADR.

## Where the detail lives

| Concern | Canonical doc |
|---|---|
| Controllers / errors / validation / services / money / time / auth / idempotency / events / routes / i18n / tests | [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md) |
| The wire (shapes, enums, envelopes) | [`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md) + [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml) |
| The error contract (status → `error` → fields) | [`docs/04-api/ERROR_CONTRACT.md`](../04-api/ERROR_CONTRACT.md) |
| The module file pattern + engines | [`MODULES.md`](./MODULES.md) |
| The per-task workflow + DoD | [`docs/00-strategy/EXECUTION_PLAYBOOK.md`](../00-strategy/EXECUTION_PLAYBOOK.md) |
| Domain rules (conflicts, reservations, quotes, audit) | [`docs/02-domain/`](../02-domain/) |

---
id: F01
name: Auth & RBAC
last_updated: 2026-06-21
---

# F01 — Tasks

### F01-T01 — User + Session models + migration
- Status: done
- Depends on: F00-T06
- Estimate: 0.25d
- Acceptance:
  - `User` and `Session` exist in `ops-core/prisma/schema.prisma` per `docs/03-data/SCHEMA.md`: `User { email @unique, passwordHash, name, role: Role, isActive, createdAt }`, `Session { userId, tokenHash, expiresAt }` with the `userId` FK and an index on `Session.expiresAt` for reaping.
  - If F00-T06 already shipped these models complete, this task is a no-op verification (no duplicate migration); otherwise a follow-up migration fills the gap and applies cleanly via `prisma migrate deploy`.
  - `prisma generate` produces a client tsc accepts; the `Role` enum matches `openapi.yaml` (`ADMIN | MANAGER | OPS | VIEWER`).

### F01-T02 — argon2id hashing + create-admin script
- Status: done
- Depends on: F01-T01
- Estimate: 0.25d
- Acceptance:
  - A password helper hashes with **argon2id** and verifies; hashes are never logged and never stored in plaintext.
  - `src/scripts/create-admin.ts` (run via an npm script) creates an `ADMIN` `User` from CLI/env input (email, name, password), hashing the password; re-running with an existing email fails clearly rather than duplicating.
  - The script refuses to run against `NODE_ENV=production` without an explicit confirmation flag.
  - Unit test: hash→verify round-trips true; a wrong password verifies false; the stored value is not the plaintext.
  - tsc clean; conforms to `docs/04-api/CORE_PATTERNS.md`.

### F01-T03 — login/logout + httpOnly signed cookie session + server-side session store
- Status: done
- Depends on: F01-T02
- Estimate: 0.75d
- Acceptance:
  - `POST /public/auth/login` (no auth, per `openapi.yaml`) validates email+password via `ValidationHelpers`, verifies the argon2id hash, creates a `Session` row (random token, `tokenHash` stored, `expiresAt = now + TTL`), and sets `pb_session` as an httpOnly, signed, `SameSite` cookie; returns the `UserEnvelope`.
  - A wrong email/password throws `APIError` `401 unauthorized` (`auth.login.invalid`) — never `throw new Error`, never a 500, no user-enumeration difference between unknown-email and wrong-password.
  - `POST /private/auth/logout` deletes the server-side `Session` and clears the cookie; returns 200.
  - The session store is server-side (DB `Session` table); the cookie carries only an opaque signed token, never the role or user fields.
  - Vitest integration test (real Postgres) covers login-happy → cookie set → logout → session gone.

### F01-T04 — requireAuth middleware + req.actor + GET /auth/me
- Status: done
- Depends on: F01-T03
- Estimate: 0.5d
- Acceptance:
  - `src/middlewares/auth.middleware.ts` `requireAuth` reads the signed `pb_session` cookie, loads the non-expired `Session` + `User`, and sets `req.actor = { id, name, role }`; missing/expired/invalid → `APIError` `401 unauthorized`.
  - All `/private/*` and `/admin/*` routers mount `requireAuth`; `/public/*` does not.
  - `GET /private/auth/me` returns the `UserEnvelope` for `req.actor`'s user (200) or `401` when unauthenticated.
  - An expired session is treated as no session (`401`), and the lapsed row is cleaned (reaper or on-read) so it cannot be reused.
  - Test: authed request populates `req.actor`; unauthed/expired request → `401`.

### F01-T05 — requireRole/requirePermission (ADMIN/MANAGER/OPS/VIEWER)
- Status: done
- Depends on: F01-T04
- Estimate: 0.5d
- Acceptance:
  - `requireRole(min: Role)` enforces the total ladder `ADMIN > MANAGER > OPS > VIEWER`: an actor at or above `min` passes, below → `APIError` `403 forbidden` (`auth.forbidden`).
  - `requirePermission(...)` (or equivalent) expresses the contract's per-route gates so callers read declaratively (approvals MANAGER+, inventory writes OPS+, user management ADMIN), per `docs/04-api/CONTRACT.md` "Auth tiers".
  - The gate runs after `requireAuth` (so `403` only ever follows a valid session; no session is still `401`).
  - Unit test matrix: for each gate, every role above the floor passes and every role below returns `403`.
  - tsc clean; vitest passing.

### F01-T06 — CSRF protection + login rate-limit
- Status: done
- Depends on: F01-T03
- Estimate: 0.5d
- Acceptance:
  - Cookie-authenticated mutating routes require a CSRF token (double-submit or synchronizer pattern); a missing/invalid token is rejected before the handler runs. Safe methods (GET/HEAD) and `POST /public/auth/login` are exempt as appropriate.
  - `POST /public/auth/login` is rate-limited per identifier (IP and/or email); exceeding the threshold returns `APIError` `429 rate_limited` (`auth.rate_limited`) per `docs/04-api/ERROR_CONTRACT.md`.
  - The limiter does not lock out a correct login indefinitely (window-based reset) and does not leak which accounts exist.
  - Test: N+1 rapid failed logins return `429`; a request without a CSRF token to a mutation is rejected.

### F01-T07 — Admin users CRUD (/admin/users, ADMIN only)
- Status: done
- Depends on: F01-T05
- Estimate: 0.5d
- Acceptance:
  - `GET /admin/users` (ADMIN) returns `ServiceResponse<User[]>`; `POST /admin/users` (ADMIN) creates a staff user from `UserInput` (argon2id-hashes the password, validates unique email + valid `Role`); `PATCH /admin/users/:id` (ADMIN) updates `role` / `isActive`.
  - All three are gated by `requireRole('ADMIN')`; a non-ADMIN authed actor gets `403`, an unauthed caller `401`.
  - Validation rejects duplicate email (`422 validation` with the field keyed) and unknown role values; an unknown `:id` on PATCH → `404 not_found`.
  - Each create/patch writes an `AuditEntry` via the F09 writer (actor = the ADMIN) — deferred-safe: if F09 is not yet merged, the write is wired but the assertion lands once F09-T02 is done.
  - tsc clean; vitest passing; conforms to `docs/04-api/CORE_PATTERNS.md`.

### F01-T08 — Auth tests (login happy/unhappy, role gates, session expiry)
- Status: done
- Depends on: F01-T05, F01-T06
- Estimate: 0.5d
- Acceptance:
  - Integration test (real Postgres) covers: login happy path (cookie set, `me` returns the user), login unhappy (wrong password → `401`, no enumeration), logout invalidates the session.
  - Role-gate tests assert each `requireRole`/`requirePermission` floor returns `403` below it and passes at/above it (drive via a representative protected route).
  - Session-expiry test: a session past `expiresAt` is rejected as `401` and cannot be reused after logout.
  - Rate-limit + CSRF behaviours from F01-T06 are asserted here or alongside.
  - All tests run in CI; tsc clean.

### F01-T09 — paginate GET /admin/users (okList page/pageSize) (ADR-0017)
- Status: done
- Depends on: F01-T03
- Estimate: 0.5d
- Acceptance:
  - `users.service.list` returns `okList` with `take`/`skip` + total; `validators` accept bounded `page`/`pageSize` (default 20, max 100); `controller` parses+passes.
  - `openapi.yaml` documents `page`/`pageSize` on `GET /admin/users` pointing at `ListEnvelope`.
  - Integration test (real Postgres): staff list paginates with correct meta; admin-only gate unchanged. tsc + vitest green.

### F01-T10 — Login + Users admin hardening
- Status: not_started
- Depends on: F13-T07
- Estimate: 0.75d
- Acceptance:
  - Login: error copy distinguishes 401 (invalid) vs 429 (rate-limited) vs 5xx/network (generic); banner clears on input edit; dead “Forgot password” removed; an authenticated visitor is redirected (PARTNER→/portal, else /).
  - Users: PARTNER added to the role Select (no silent demote); staff count excludes PARTNER; role badge localized via `t('roles.*')`; Active toggle disabled in-flight + `onError`; `useUpdateUser` idempotency:true; `useUsers` gated `enabled: can(me.role,'manageUsers')`; pager via getList.

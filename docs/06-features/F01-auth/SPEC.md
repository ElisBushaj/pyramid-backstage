---
id: F01
name: Auth & RBAC
phase: Foundation
depends_on: [F00]
status: not_started
last_updated: 2026-06-18
---

# F01 — Auth & RBAC

## Summary

Staff authentication and role-based access control for ops-core. Session auth (argon2id password hash + httpOnly signed cookie + server-side session store), `requireAuth` populating `req.actor`, and `requireRole`/`requirePermission` gates for the four roles `ADMIN | MANAGER | OPS | VIEWER`. This exists because the audit ledger is worthless without a real decider: every mutation downstream records `req.actor`, so auth is a hard dependency of F09 and every mutating feature.

The whole tool surface mounts under the `private` tier (VIEWER+); finer gates (approvals MANAGER+, inventory writes OPS+, user management ADMIN) are enforced per-route. Auth is `ops-core`-native (not SuperTokens) per the locked stack in `CLAUDE.md`.

## Scope

### In scope
- `User` + `Session` usage (models exist from F00-T06); password hashing with argon2id; a `create-admin` script.
- `POST /public/auth/login` (sets the cookie), `POST /private/auth/logout`, `GET /private/auth/me`.
- `requireAuth` middleware that resolves the session and sets `req.actor = { id, name, role }`.
- `requireRole(role)` / `requirePermission(...)` enforcing the `ADMIN > MANAGER > OPS > VIEWER` ladder.
- CSRF protection on cookie-authenticated mutations and a login rate-limit (`429 rate_limited`).
- Admin staff CRUD: `GET/POST /admin/users`, `PATCH /admin/users/:id` (ADMIN only).

### Out of scope
- Self-service signup, email verification, password reset (staff accounts are admin-provisioned; not in the contract).
- AuditEntry *writing* — F09 owns the writer; F01 only makes `req.actor` available for it.
- Frontend auth pages — outside this repo's ops-core scope.
- OAuth / SSO — additive later, not in `openapi.yaml`.

## Acceptance criteria

- A seeded admin can `POST /public/auth/login` with email+password and receive a `pb_session` httpOnly signed cookie; the body is the `UserEnvelope`.
- `GET /private/auth/me` returns the current `User` (200) or `401 unauthorized` with no/invalid session.
- `POST /private/auth/logout` destroys the server-side session; subsequent `me` is `401`.
- Passwords are stored as argon2id hashes only (never plaintext, never reversible); a wrong password yields `401`, never a 500.
- `requireRole('MANAGER')` lets ADMIN+MANAGER through and returns `403 forbidden` for OPS/VIEWER; the ladder is total.
- Mutations require a valid CSRF token; a missing/invalid token is rejected. Repeated failed logins trip the rate-limit → `429 rate_limited`.
- `/admin/users` is reachable only by ADMIN (others get `403`); create/patch enforce unique email and valid `Role`.

## Data model

`User { id, email (unique), passwordHash, name, role: Role, isActive, createdAt }` and `Session { id, userId, tokenHash, expiresAt }` (defined in F00-T06 per `docs/03-data/SCHEMA.md`). No new models; F01 adds no migration beyond what F00 shipped unless a field gap surfaces — log via the ambiguity protocol if so.

## API surface

- `POST /public/auth/login` — staff login; sets httpOnly session cookie → `UserEnvelope`.
- `POST /private/auth/logout` — destroy the current session.
- `GET /private/auth/me` — current staff identity → `UserEnvelope`.
- `GET /admin/users` — list staff (ADMIN) → `User[]`.
- `POST /admin/users` — create staff (ADMIN) → `User`.
- `PATCH /admin/users/:id` — update role / active flag (ADMIN) → `User`.

## UI surfaces

None — backend.

## Notes

- Auth tiers and the role ladder: `docs/04-api/CONTRACT.md` ("Auth tiers") and `docs/01-architecture/SECURITY.md`.
- `req.actor` is the audit actor for every downstream mutation: `docs/02-domain/AUDIT.md`, `docs/04-api/CORE_PATTERNS.md`.
- Error shapes (`401/403/429`): `docs/04-api/ERROR_CONTRACT.md`.

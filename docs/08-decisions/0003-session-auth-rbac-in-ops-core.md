# ADR-0003: Session auth + RBAC owned by ops-core

- **Status**: Accepted
- **Date**: 2026-06-18
- **Resolves**: R-01

## Context

The brief asks for "a complete record of decisions, changes, and approvals." A decision log without a **decider** is worthless — `AuditEntry.actorId` must be a real, authenticated staff member, never anonymous. That makes authentication a hard dependency of the audit ledger (F09) and of every mutating feature, not an optional add-on. The chosen hardening for this build is **production-shaped + full auth/RBAC**.

This is an **internal staff tool** for a venue ops team: a handful of named users, four role levels, no public signup, no social login, no consumer-grade account recovery flows. The question is where auth lives and how heavy it should be.

Auth is itself **state** — users, password hashes, sessions, roles. By the same logic as [ADR-0001](./0001-two-services-one-contract.md) (the record owns state; the brain reasons), it belongs in `ops-core`, not in a separate identity service the AI would have to integrate with.

## Decision

**Session auth and RBAC are `ops-core`-native.**

- **Credentials**: email + password. Passwords hashed with **argon2id** via `@node-rs/argon2`.
- **Sessions**: server-side session store, delivered as an **httpOnly, signed cookie** (`pb_session`). Not a JWT in localStorage — httpOnly defeats XSS token theft, server-side store allows instant revocation. CSRF protection on cookie-authenticated mutations; a login rate-limit returns `429 rate_limited`.
- **Roles**: `ADMIN > MANAGER > OPS > VIEWER` (a strict ladder).
  - **VIEWER** — read the whole tool surface.
  - **OPS** — VIEWER + inventory/space writes, create requests, hold/confirm reservations, persist tasks.
  - **MANAGER** — OPS + **approve / reject** requests.
  - **ADMIN** — MANAGER + staff/user management.
- **Enforcement**: routes mount under `/api/v1/{public,private,admin}`; `requireAuth` populates `req.actor = { id, name, role }`; `requireRole` / `requirePermission` gate beyond the tier. **Approvals require MANAGER+; inventory writes require OPS+; user management is ADMIN.**
- **`ai-orchestrator` forwards staff identity** — it never holds its own credentials. The acting staff member is always the real human; the AI is a tool that human drives.

See F01 (`docs/06-features/F01-auth`), [docs/01-architecture/SECURITY.md](../01-architecture/SECURITY.md), and [docs/04-api/CONTRACT.md](../04-api/CONTRACT.md) § Auth tiers.

## Consequences

- **Every audit entry has a real actor.** `req.actor` is the audit actor on every mutation — the decision log is trustworthy by construction. This is *why* auth is in scope.
- **Lighter than a managed identity provider.** No fourth container, no external dependency, no webhook wiring — faster to make flawless in three days for a closed set of staff accounts. Justified precisely because it is an internal tool, not a public marketplace.
- **Instant revocation; XSS-resistant.** Server-side sessions can be killed immediately; httpOnly cookies aren't readable by injected scripts.
- **Staff are admin-provisioned.** No self-service signup, email verification, or password reset in the contract — out of scope for the build (a `create-admin` script seeds the first ADMIN).
- **The AI inherits the caller's permissions.** A VIEWER chatting with the copilot cannot approve via the AI any more than via the UI — `ops-core` enforces the gate regardless of how the call arrives.

## Alternatives considered

- **SuperTokens (the marketplace's provider).** Rejected here: a fourth container and an external integration surface for a tool with four roles and no public signup. The marketplace needed consumer auth (verification, reset, social); a staff tool does not. Self-hosting the minimal version is faster to perfect in the time box.
- **JWT in localStorage.** Rejected: readable by XSS, no clean server-side revocation. httpOnly signed cookies + a server session store are strictly safer for a tool that authorizes inventory and money changes.
- **Auth in a separate `ops-core`-adjacent service.** Rejected: auth is state, and splitting it from the record it protects buys nothing — the record already owns the users and writes the audit. One fewer hop, one fewer service.
- **No RBAC (single staff role).** Rejected: approvals (committing reservations + money) must be gated to MANAGER+; "anyone can approve" is not an operational posture a venue will accept.

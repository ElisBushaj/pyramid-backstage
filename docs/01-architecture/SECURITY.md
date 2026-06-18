# Architecture — Security

> The security model for Pyramid Backstage. The auth/RBAC decision is [ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md); idempotency is [ADR-0005](../08-decisions/0005-idempotency-keys.md); the feature is [`F01`](../06-features/F01-auth/). This page is how they compose into a posture.

## Posture

This is an **internal staff tool** with **full auth/RBAC** as the chosen hardening. The threat model is not anonymous internet abuse; it is: an unauthenticated actor, a staff member acting beyond their role, a retry/double-submit corrupting state, and — uniquely — **the AI proposing something it shouldn't**. The model below addresses each.

## Authentication

Session auth, `ops-core`-native ([ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md)):

- **Credentials:** email + password; passwords hashed with **argon2id** (`@node-rs/argon2`). Staff are **admin-provisioned** — no public signup, no self-service reset in the contract.
- **Sessions:** a **server-side session store**, delivered as an **httpOnly, signed cookie** (`pb_session`). httpOnly defeats XSS token theft; a server-side store allows **instant revocation** (kill the session row). Not a JWT in localStorage.
- **CSRF:** cookie-authenticated mutations carry CSRF protection (the cookie is sent automatically by the browser, so the unsafe verbs need a second factor the attacker's site can't forge).
- **Brute force:** login is **rate-limited** → `429 rate_limited` ([docs/04-api/ERROR_CONTRACT.md](../04-api/ERROR_CONTRACT.md)).

`requireAuth` resolves the session and attaches **`req.actor = { id, name, role }`** — the identity every downstream decision and audit entry uses.

## Authorization (RBAC)

The ladder `ADMIN > MANAGER > OPS > VIEWER`, enforced by route **tier** plus per-route `requireRole`/`requirePermission`.

**Tiers** (`/api/v1/{public,private,admin}` — [docs/04-api/CONTRACT.md](../04-api/CONTRACT.md) § Auth tiers):
- `public` — unauthenticated (`/auth/login`, health).
- `private` — any authenticated staff (VIEWER+). The whole tool surface.
- `admin` — `ADMIN` only (staff/user management).

**Permission matrix** (who can do what):

| Action | VIEWER | OPS | MANAGER | ADMIN |
|---|:--:|:--:|:--:|:--:|
| View spaces / assets / requests / quotes / tasks / conflicts / audit | ✅ | ✅ | ✅ | ✅ |
| Create / edit **spaces**, **assets** (inventory writes) | ❌ | ✅ | ✅ | ✅ |
| Create **requests**, **hold/confirm reservations**, generate **quotes**, persist **tasks** | ❌ | ✅ | ✅ | ✅ |
| **Approve / reject** a request (commits reservations + money) | ❌ | ❌ | ✅ | ✅ |
| Manage **staff users** (create/edit/role/active) | ❌ | ❌ | ❌ | ✅ |

A `private`-tier call from a role that lacks the finer permission returns **`403 forbidden`** (the UI renders the action disabled with a tooltip; the server enforces regardless of the UI). The two load-bearing gates: **approvals require MANAGER+**, **inventory writes require OPS+**.

## The AI trust boundary — AI output is untrusted input

The single security-relevant consequence of the two-service split ([ADR-0001](../08-decisions/0001-two-services-one-contract.md)): **`ai-orchestrator` is a client, and its output is untrusted.**

- The AI **proposes** (`proposedActions`); `ops-core` **authorizes**. Every proposed mutation is **re-validated server-side** against the same validators, role gates, and the authoritative conflict check that a human call would face. A hallucinated total is recomputed (server-computed money, [ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md)); an impossible hold aborts the transaction (`409`).
- **Narrative numbers are injected** from `ops-core` responses, never free-generated — the record is the source of truth even inside the AI's prose ([docs/02-domain/AI_ORCHESTRATION.md](../02-domain/AI_ORCHESTRATION.md)).
- **The AI inherits the caller's permissions.** It forwards the staff identity; it holds no credentials of its own. A VIEWER cannot approve *via* the copilot any more than via the UI — `ops-core` enforces the gate regardless of how the call arrives. **Human approval (`requiresApproval`) gates anything that commits.**

## State-integrity defenses

Security here also means *the data can't be corrupted*, which the correctness machinery enforces:

- **Idempotency** — every mutation requires an `Idempotency-Key`; replays return the original, a body-mismatch → `409`. A retry or double-submit can't double-hold or double-charge ([ADR-0005](../08-decisions/0005-idempotency-keys.md)). The middleware degrades **closed** if Redis is down (rejects rather than risks a duplicate side effect).
- **Serializable reservation transaction** — the availability check and the decrement are one atomic, row-locked step; two concurrent holds for the same scarce inventory can't both win ([docs/02-domain/RESERVATIONS.md](../02-domain/RESERVATIONS.md)).
- **Guarded state transitions** — an illegal lifecycle move (approve a `REJECTED` request, confirm a `RELEASED` hold) → `409 invalid_transition { from, to }`, not silent corruption.

## Audit with actor — accountability as a security property

Every mutation writes an **`AuditEntry`** with the **real `req.actor`** (id + name), the action, the before/after diff, and a reason where required (rejects) — in the **same transaction** as the change ([docs/02-domain/AUDIT.md](../02-domain/AUDIT.md)). The ledger is append-only; it is the answer to *"who did this, and when?"*. This is *why* auth is in scope: a decision log without a decider is worthless. `GET /audit?requestId` reconstructs an entity's full history.

## Input validation

Every input is validated with `express-validator` + `ValidationHelpers` before it reaches a service; failures become the structured `422 validation { fields }` body ([docs/04-api/CORE_PATTERNS.md](../04-api/CORE_PATTERNS.md)). Enums are pinned `UPPER_SNAKE`; timestamps are RFC-3339-`Z`. The validated shape is the only thing the AI's natural-language intake is allowed to become.

## Secrets

Configuration (DB credentials, `SESSION_SECRET`, `ANTHROPIC_API_KEY`) is supplied via **environment variables**, never committed. The compose defaults (`SESSION_SECRET=dev-session-secret-change-me`, etc.) are **local-dev only** and **must be rotated** for any real deployment — flagged in [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) and the auth-audit item of [`ROADMAP.md`](../00-strategy/ROADMAP.md) Phase 4.

## Production-hardening backlog (not in the 3-day build)

Tracked in [`ROADMAP.md`](../00-strategy/ROADMAP.md) Phase 4: rotate secrets off dev defaults, session-store hardening + idle/absolute timeouts, a real `create-admin` provisioning flow, account lockout beyond the rate-limit, a full security audit, and the GDPR/DSAR posture for organizer PII ([Q-04](../09-questions/OPEN.md)).

## Cross-references

- **The auth decision:** [ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md). **Idempotency:** [ADR-0005](../08-decisions/0005-idempotency-keys.md).
- **The feature:** [`F01`](../06-features/F01-auth/). **Error contract:** [`docs/04-api/ERROR_CONTRACT.md`](../04-api/ERROR_CONTRACT.md). **Audit:** [`docs/02-domain/AUDIT.md`](../02-domain/AUDIT.md).
- **The AI boundary:** [ADR-0001](../08-decisions/0001-two-services-one-contract.md), [`docs/02-domain/AI_ORCHESTRATION.md`](../02-domain/AI_ORCHESTRATION.md).

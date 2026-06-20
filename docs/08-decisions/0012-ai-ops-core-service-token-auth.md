# ADR-0012: AI → ops-core auth is a service token plus a forwarded acting-user

- **Status**: Accepted
- **Date**: 2026-06-20

## Context

The reasoning layer is going live against the record. The copilot (`POST /chat`) and the planner (`POST /plan`) call back into `ops-core` to read spaces, check conflicts, hold reservations, and submit requests on behalf of the staff member or partner driving the conversation ([docs/04-api/AI_CONTRACT.md](../04-api/AI_CONTRACT.md)). [ADR-0003](./0003-session-auth-rbac-in-ops-core.md) already states the principle: *the AI forwards staff identity; it never holds its own credentials; the acting human is always the real actor.* But ops-core has no mechanism for that yet — `requireAuth` resolves a `pb_session` cookie into `req.actor` and nothing else. There is a `writeSystemAudit(actorId=null)` path, used **only** by the HELD-expiry reaper, but a null actor breaks both audit attribution and the partner row-scoping of [ADR-0010](./0010-partner-role-and-approval-chain.md).

The AI is a **trusted backend service**, not a browser, so it should not be carrying a user's session cookie. But every mutation it triggers must still attribute to the real human, and a partner-driven conversation must stay row-scoped to that partner. We need machine-to-machine authentication **and** human attribution on the same request.

## Decision

**ops-core authenticates the AI by a shared service token, then derives the audit actor and the authorization scope from forwarded acting-user headers — with a forwarded-role ceiling.**

- **The service token authenticates the *caller*.** The AI presents `OPS_CORE_SERVICE_TOKEN` (a shared secret, the only new coupling beyond `OPS_CORE_URL`). A request bearing a valid token is recognized as the AI service — distinct from a cookie session and distinct from the reaper's null-actor path.
- **The forwarded acting-user is the *actor*.** The AI forwards `X-Acting-User-Id` and `X-Acting-User-Role`, captured from the live session of the human who is driving the conversation. ops-core builds `req.actor` from these, so `AuditEntry.actorId` is the real human and partner reads still filter on `createdById` ([ADR-0010](./0010-partner-role-and-approval-chain.md)). The audit ledger cannot tell whether a hold came through the UI or the copilot — by design, both attribute to the same person.
- **A forwarded-role ceiling.** ops-core clamps the trusted forwarded role to a configurable maximum (default **MANAGER**). A forwarded `ADMIN` is rejected or downgraded. The AI service can therefore never be coerced into self-granting admin (staff/user management), even if its prompt is compromised — the most dangerous tier is unreachable through the AI path. Staff-tier and partner-tier actions still flow; only the admin ceiling is held.
- **Distinct from the reaper.** `writeSystemAudit(null)` stays the *only* legitimately-anonymous writer (an automated system event with no human behind it). AI-initiated writes are never anonymous — they always carry a forwarded human.

## Consequences

- **Audit stays trustworthy.** Every AI-triggered mutation has a real `actorId`, so the decision log of [ADR-0003](./0003-session-auth-rbac-in-ops-core.md) holds whether the action came from a click or a chat.
- **Partner scoping survives the AI hop.** A partner using the copilot is still row-scoped to their own requests, because the forwarded `X-Acting-User-Id` flows into the same `createdById` filter.
- **Blast radius is bounded.** A compromised AI service can act up to MANAGER on behalf of a forwarded user but cannot reach ADMIN — the role ceiling caps the worst case below user/staff management.
- **One new secret to operate.** `OPS_CORE_SERVICE_TOKEN` must be provisioned, rotated, and kept out of logs. Accepted as the cost of machine-to-machine auth; it is a single shared secret, not a key-management system.
- **ops-core trusts the AI to forward honestly.** The forwarded headers are believed *because* the service token authenticated the caller as our own AI. This trust is exactly why the role ceiling exists — it caps how much damage a breach of that trust can do.

## Alternatives considered

- **The AI shares a staff session cookie.** Rejected: a backend service juggling httpOnly browser cookies is fragile (CSRF model, signing, expiry) and muddies attribution — and [ADR-0003](./0003-session-auth-rbac-in-ops-core.md) already says the AI holds no credentials. A service token is the right primitive for machine-to-machine.
- **The AI acts purely as a null system actor (reaper-style).** Rejected: a null actor destroys audit attribution and makes partner row-scoping impossible — every AI write would be unattributable and unscoped. The forwarded acting-user exists precisely to avoid this.
- **Forward the caller's raw session token for ops-core to re-resolve.** Rejected: it couples the AI to ops-core's session format and token handling, and leaks a live credential across a service boundary. Forwarding a *claim* (id + role) under a trusted service token is looser coupling and a smaller secret surface.
- **No role ceiling — trust the forwarded role verbatim.** Rejected: it makes a prompt-injected or compromised AI a path to self-granted ADMIN. The ceiling costs one config value and removes the most dangerous failure mode.

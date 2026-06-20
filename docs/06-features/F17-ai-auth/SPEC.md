---
id: F17
name: AI ↔ ops-core Service-Token Auth
phase: Integration
depends_on: [F01]
status: not_started
last_updated: 2026-06-20
---

# F17 — AI ↔ ops-core Service-Token Auth

## Summary

The `ai-orchestrator` holds no domain state, so every AI write lands in ops-core — but ops-core only knows the session cookie. This adds the missing seam: the AI authenticates as a **system actor** with a static service token (`Authorization: Bearer <OPS_CORE_SERVICE_TOKEN>`) and forwards the acting staff user (`X-Acting-User-Id` / `X-Acting-User-Role`) so audit attribution and partner row-scoping stay correct — a mutation the AI runs on a manager's behalf records *that manager*, not "system" and not "AI". A **forwarded-role ceiling** (default `MANAGER`) means a compromised AI cannot forward `ADMIN` and self-grant the admin surface: the token is an authentication seam, never a privilege escalation. Small, but it unblocks every AI write-path (F18) — without it the planner/copilot can read nothing under a real identity and write nothing at all.

Additive to the contract: a `serviceToken` security scheme plus the two `X-Acting-User-*` header parameters. No session change, no new endpoints.

## Scope

### In scope
- `OPS_CORE_SERVICE_TOKEN` added to ops-core config/env (`.env.example`) — the shared secret the AI presents.
- A **service-token branch** in `requireAuth`: when `Authorization: Bearer <token>` matches `OPS_CORE_SERVICE_TOKEN`, read `X-Acting-User-Id` + `X-Acting-User-Role`, validate the user id against the `User` table (must exist + be active), and populate `req.actor` with the **real** forwarded identity; otherwise fall back unchanged to the existing `pb_session` cookie path.
- A **forwarded-role ceiling** (`OPS_CORE_SERVICE_TOKEN_ROLE_CEILING`, default `MANAGER`): a forwarded role above the ceiling is rejected (`403`); the actor's role never exceeds the ceiling. Downstream `requireRole` gates still apply on top.
- Audit attribution: AI-driven mutations write the `AuditEntry` with the forwarded real `actorId`/name — distinct from the reaper's `writeSystemAudit(null)`.
- Contract: `openapi.yaml` `securitySchemes.serviceToken` (http bearer) + `X-Acting-User-Id` / `X-Acting-User-Role` header parameters, documented and additive; `mock-ops-core` accepts the token (no-op) for seam parity.
- Tests: the full service-token matrix (valid token + valid actor, invalid/absent token, role above ceiling, missing/unknown actor headers).

### Out of scope
- The AI endpoints themselves (`POST /chat`, `POST /plan`) and the wiring that *uses* this seam — F18 and `docs/04-api/AI_CONTRACT.md`; F17 only makes the AI's calls authenticate as a real actor.
- The `PARTNER` row-scoping logic — F15 owns the filter; F17 only guarantees the forwarded actor (which may be a partner-created request's owner read by a staff actor) carries the correct `req.actor.id`/`role` for that filter to key on.
- Token rotation, per-tenant tokens, mTLS, or an OAuth client-credentials grant — a single static shared secret is sufficient for the demo; richer schemes are additive later (per ADR `0012`).
- Rate-limiting / quota on the service-token path — out of scope here; the existing limiter still applies.
- The reaper's `writeSystemAudit(null)` path — unchanged; the service token is explicitly **not** anonymous-system, it carries a forwarded human.

## Acceptance criteria

- With `Authorization: Bearer <OPS_CORE_SERVICE_TOKEN>` and valid `X-Acting-User-Id` + `X-Acting-User-Role` headers, `requireAuth` resolves `req.actor` to the **forwarded** active user (`{ id, name, role }`) and the request proceeds exactly as if that staff user were logged in — no session cookie required.
- A request with no `Authorization: Bearer` (or a bearer that does not match the configured token) falls through to the existing `pb_session` cookie path with **no behaviour change**; an absent/invalid session there still yields `401` (the service-token branch never weakens the cookie path).
- A correct token but an `X-Acting-User-Id` that is unknown or inactive in the `User` table → `401 unauthorized` (never a silent "system" actor, never a `500`); a correct token with **no** acting-user headers → `401` (the seam demands an identity to attribute).
- The forwarded role is clamped to (or rejected at) the configured ceiling: a forwarded `ADMIN` (above the default `MANAGER` ceiling) is rejected `403 forbidden` — a compromised AI **cannot** forward `ADMIN` and reach the admin surface; the resulting `req.actor.role` is never higher than the ceiling.
- Downstream `requireRole`/`requirePermission` gates run unchanged on top of the forwarded actor: e.g. an AI forwarding an `OPS` user still gets `403` on a `MANAGER+` approve, exactly as that user would.
- An AI-driven mutation writes its `AuditEntry` with the forwarded real `actorId` + name (distinct from `writeSystemAudit(actorId=null)`), so the ledger shows the human the AI acted for — preserving the `req.actor`-as-decider invariant of `docs/02-domain/AUDIT.md`.
- `openapi.yaml` gains `securitySchemes.serviceToken` and the `X-Acting-User-*` header parameters, additively (no existing operation's security is removed); `mock-ops-core` accepts the token as a no-op so the seam is exercised in parallel dev.

## Data model

No new models, no migration. Reads the existing `User` table to validate the forwarded `X-Acting-User-Id` (must exist + `isActive`). `req.actor` (`{ id, name, role }`, the `Actor` type) is the only state populated — the same shape the cookie path produces — so every downstream audit/scoping consumer is unchanged. See `docs/03-data/SCHEMA.md` and `docs/01-architecture/SECURITY.md`.

## API surface

No new endpoints. F17 adds an authentication mechanism the existing `/private` (and, via F18, the AI) endpoints accept:
- `securitySchemes.serviceToken` — `http`/`bearer`; the AI presents `Authorization: Bearer <OPS_CORE_SERVICE_TOKEN>`.
- `X-Acting-User-Id` (header) — the staff user the AI is acting for; validated against `User`.
- `X-Acting-User-Role` (header) — the forwarded role, clamped to the `OPS_CORE_SERVICE_TOKEN_ROLE_CEILING`.

## UI surfaces

None — backend / contract.

## Notes

- Why a static service token + forwarded actor (with a role ceiling) rather than impersonation cookies or per-call login, and why a compromised AI cannot escalate: ADR [docs/08-decisions/0012-ai-ops-core-service-token-auth.md](../../08-decisions/0012-ai-ops-core-service-token-auth.md).
- The seam lives in `requireAuth` alongside the cookie path (`ops-core/src/middlewares/auth.middleware.ts`, `ops-core/src/modules/auth/session.ts`); the role ladder it clamps against: [docs/04-api/CONTRACT.md](../../04-api/CONTRACT.md) ("Auth tiers") and [docs/01-architecture/SECURITY.md](../../01-architecture/SECURITY.md).
- `req.actor` is the audit decider and the row-scoping key — forwarding the real human keeps both correct: [docs/02-domain/AUDIT.md](../../02-domain/AUDIT.md); the `PARTNER` filter that keys on it: [docs/06-features/F15-partner-portal/SPEC.md](../F15-partner-portal/SPEC.md).
- The AI endpoints and wiring that consume this seam: [docs/04-api/AI_CONTRACT.md](../../04-api/AI_CONTRACT.md) and [docs/06-features/F18-ai-wiring/SPEC.md](../F18-ai-wiring/SPEC.md).
- Error shapes (`401`/`403`): [docs/04-api/ERROR_CONTRACT.md](../../04-api/ERROR_CONTRACT.md). Session auth this extends, not replaces: ADR [docs/08-decisions/0003-session-auth-rbac-in-ops-core.md](../../08-decisions/0003-session-auth-rbac-in-ops-core.md).

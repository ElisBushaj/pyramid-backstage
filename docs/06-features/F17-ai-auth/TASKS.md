---
id: F17
name: AI ↔ ops-core Service-Token Auth
last_updated: 2026-06-20
---

# F17 — Tasks

### F17-T01 — service-token config + .env.example
- Status: not_started
- Depends on: —
- Estimate: 0.25d
- Acceptance:
  - The ADR [docs/08-decisions/0012-ai-ops-core-service-token-auth.md](../../08-decisions/0012-ai-ops-core-service-token-auth.md) is authored (by the ADR agent) and is the rationale this feature implements.
  - `OPS_CORE_SERVICE_TOKEN` and `OPS_CORE_SERVICE_TOKEN_ROLE_CEILING` (default `MANAGER`) are read through the existing ops-core config/env module (same pattern as the other secrets), not via raw `process.env` at call sites.
  - Both vars are documented in `ops-core/.env.example` (with a clear "shared secret the AI presents" comment and a generated-token placeholder, never a real secret); the ceiling defaults to `MANAGER` when unset.
  - An empty/unset `OPS_CORE_SERVICE_TOKEN` disables the service-token branch entirely (no bearer ever matches an empty token), so a misconfigured deploy fails closed to the session-only path — never open.
  - tsc clean; conforms to `docs/04-api/CORE_PATTERNS.md`.

### F17-T02 — service-token branch in requireAuth (validate forwarded actor)
- Status: not_started
- Depends on: F17-T01
- Estimate: 0.5d
- Acceptance:
  - In `ops-core/src/middlewares/auth.middleware.ts`, `requireAuth` gains a branch: when `Authorization: Bearer <token>` is present and matches `OPS_CORE_SERVICE_TOKEN` (constant-time compare, not `===` on the raw string), it reads `X-Acting-User-Id` + `X-Acting-User-Role`, looks the user up in the `User` table, and on success sets `req.actor = { id, name, role }` from the **real** forwarded user.
  - When the `Authorization` header is absent, or its bearer does not match the configured token, the branch is skipped and the existing `pb_session` cookie path (`resolveActor` / `SESSION_COOKIE`) runs **unchanged** — an absent/invalid session there still returns `401` exactly as today.
  - A matching token but an unknown or inactive (`isActive === false`) `X-Acting-User-Id`, or **missing** acting-user headers, throws `APIError.unauthorized()` (`401`) — never a silent system/anonymous actor, never `throw new Error`, never a `500`.
  - The forwarded `X-Acting-User-Role` is validated to be a member of the `Role` enum; an unparseable/unknown role → `401`.
  - tsc clean; vitest passing; conforms to `docs/04-api/CORE_PATTERNS.md`.

### F17-T03 — forwarded-role ceiling (clamp/reject above ceiling)
- Status: not_started
- Depends on: F17-T02
- Estimate: 0.25d
- Acceptance:
  - The forwarded role is enforced against `OPS_CORE_SERVICE_TOKEN_ROLE_CEILING` (default `MANAGER`) using the same `RANK` ladder as `requireRole` (`PARTNER < VIEWER < OPS < MANAGER < ADMIN`); a forwarded role whose rank exceeds the ceiling is **rejected** `403 forbidden` (not silently downgraded into a higher-than-allowed actor).
  - The resulting `req.actor.role` is never higher than the ceiling — a forwarded `ADMIN` over the default `MANAGER` ceiling cannot reach `/admin/*`; a compromised AI cannot self-grant `ADMIN`.
  - The ceiling is independent of and **below** the downstream `requireRole`/`requirePermission` gates: a forwarded `OPS` actor still receives `403` on a `MANAGER+` approve, identical to that user logging in directly — the ceiling caps, it never grants.
  - tsc clean; vitest passing.

### F17-T04 — audit attribution for AI-driven mutations
- Status: not_started
- Depends on: F17-T02
- Estimate: 0.25d
- Acceptance:
  - A mutation made over the service-token path writes its `AuditEntry` with the forwarded real `actorId` + name (the populated `req.actor`), through the existing F09 audit writer in the same transaction — never anonymous.
  - This is distinct from the reaper's `writeSystemAudit(actorId=null)`: an AI-driven action is attributed to the human it acted for, not to "system" (per `docs/02-domain/AUDIT.md`).
  - Test asserts an end-to-end AI-style mutation (service token + forwarded MANAGER) produces an `AuditEntry` whose `actorId` equals the forwarded user's id, and an `OutboxEvent` in the same transaction.
  - tsc clean; vitest passing; conforms to `docs/04-api/CORE_PATTERNS.md`.

### F17-T05 — contract: securityScheme + X-Acting-User-* headers + mock parity
- Status: not_started
- Depends on: F17-T02
- Estimate: 0.25d
- Acceptance:
  - `ops-core/openapi.yaml` gains `components.securitySchemes.serviceToken` (`type: http`, `scheme: bearer`) and the `X-Acting-User-Id` + `X-Acting-User-Role` header parameters, documented (purpose, that the role is clamped to a ceiling) — strictly **additive**, removing no existing operation's `security` (per `docs/04-api/CONTRACT.md` and ADR `0012`).
  - `docs/04-api/AI_CONTRACT.md` references this scheme as the auth the AI presents on every ops-core call.
  - `mock-ops-core` accepts `Authorization: Bearer <OPS_CORE_SERVICE_TOKEN>` + the `X-Acting-User-*` headers as a no-op (resolves a forwarded actor without a session) so the seam has parity for parallel dev.
  - The contract test / type-mirror checks still pass; the change is additive-only.
  - tsc clean.

### F17-T06 — tests: the service-token matrix
- Status: not_started
- Depends on: F17-T02, F17-T03, F17-T04
- Estimate: 0.5d
- Acceptance:
  - Integration test (real Postgres, in `auth.middleware.test.ts` or a sibling): valid token + valid active forwarded actor → request proceeds with `req.actor` = the forwarded user; the matrix below is asserted on a `/private` endpoint.
  - Invalid bearer / absent `Authorization` → the session-cookie path is used: a valid session → ok, no session → `401` (the service-token branch never weakens the cookie path).
  - Forwarded role above the ceiling (e.g. `ADMIN` over the `MANAGER` default) → `403`; a forwarded role at/below the ceiling that is nonetheless below a route's `requireRole` floor → `403` from the downstream gate.
  - Missing acting-user headers (token but no `X-Acting-User-Id`) → `401`; unknown or inactive `X-Acting-User-Id` → `401`; a forwarded role not in the `Role` enum → `401`.
  - Audit assertion from F17-T04 (forwarded real `actorId` on the written `AuditEntry`) is exercised.
  - tsc clean; vitest passing; runs in CI.

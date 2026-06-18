# ADR-0008: Hand-mirrored API types, no codegen mandate

- **Status**: Accepted
- **Date**: 2026-06-18

## Context

Three codebases consume the contract: `ops-core` (TypeScript) produces it, the `frontend` (TypeScript) consumes it, and `ai-orchestrator` (Python) consumes it as a tool surface. The contract — [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml) — is the single source of truth ([ADR-0001](./0001-two-services-one-contract.md), [docs/04-api/CONTRACT.md](../04-api/CONTRACT.md)). The question is how each side gets typed payload shapes that match it.

A heavyweight codegen pipeline (run a generator over `openapi.yaml`, emit TS + Pydantic, wire it into each build) is one option. It guarantees mechanical alignment but adds a build dependency, a generated-code review burden, and friction across two language ecosystems — for a contract that is small, additive-only, and frozen at Hour 0.

## Decision

**Hand-mirror the DTOs into each codebase; catch drift with a contract test + review. No codegen mandate.**

- **`ops-core`**: backend DTOs live in `ops-core/src/types/api/<area>.ts`.
- **`frontend`**: hand-mirrored in `frontend/src/api/types/<area>.ts`.
- **`ai-orchestrator`**: mirrored in `ai-orchestrator/app/schemas.py` (Pydantic).
- The mirrors are kept aligned by **PR review** and a **contract test** that validates payloads against `openapi.yaml`. The schema's discipline (UPPER_SNAKE enums, RFC-3339 `Z` timestamps, `*Minor` integer money) makes mirrors mechanical to write and review.
- Codegen is **permitted but not required** — a team may generate types locally as a convenience, but the committed mirrors and the contract test are the gate, not a generator in CI.

See [docs/04-api/TYPE_SHARING.md](../04-api/TYPE_SHARING.md) and `CLAUDE.md` § Type sharing.

## Consequences

- **No build-time codegen dependency** spanning two language ecosystems. Each side stays idiomatic (TS interfaces; Pydantic models) without a generator's output shape leaking in.
- **Drift is caught two ways**: the contract test fails if a payload diverges from `openapi.yaml`, and review catches a mirror that lags an additive change. Because changes are additive-only, a lagging mirror is forward-compatible (missing-an-added-field, not broken).
- **The contract stays the law.** Hand-mirroring reinforces that `openapi.yaml` wins disputes — if code and contract disagree, the code is wrong and the mirror is fixed.
- **Cost**: a small, deliberate manual step when the contract grows. Accepted — the contract is frozen at Hour 0 and only grows additively, so this is rare.
- **Risk if review lapses**: a silently stale mirror. Mitigated by the contract test being a required check, not optional.

## Alternatives considered

- **Mandatory codegen in CI** (openapi-typescript + datamodel-code-generator). Rejected as a mandate: a heavyweight pipeline across TS + Python for a small additive contract; the generated code is noisier to review than the hand-written mirrors, and it couples three builds to a generator version.
- **A shared types package.** Rejected by [ADR-0001](./0001-two-services-one-contract.md) — that's a code-level coupling the contract-only boundary exists to prevent, and TS and Python don't share a type system cheaply.
- **Trust the contract, type nothing (use `any` / `dict`).** Rejected: loses the compile-time safety that makes the frontend and `ops-core` refactors safe and catches enum/casing drift early.

# CLAUDE.md — Operating Guide

Read this **first** at the start of every session. This is the contract you operate under on this project. It is what lets an AI agent execute the backlog task-by-task and resume across context resets with zero state loss.

## What this project is

**Pyramid Backstage** turns an event *request* into an event-ready *operational plan* for the Pyramid of Tirana — replacing the email / Excel / phone-call chaos behind every event. It answers, instantly, "can we make this happen?" and "what's next?".

Two services, one shared contract:

- **`ops-core`** (Elis · Node 20 · Express 5 · Prisma 7 · Postgres 17 · TypeScript · NATS) — the **deterministic system of record**. Spaces, assets, requests, reservations, quotes, tasks, conflicts, audit, auth. No AI. **This is what the 3-day build ships in full.**
- **`ai-orchestrator`** (Alvin · Python · FastAPI · LangGraph · Claude · ChromaDB · Redis) — the **reasoning layer**. Holds no domain state. **Scaffold + stateful mock + reference backlog only** in this repo; Alvin implements the AI logic.

The two talk **only** over `ops-core/openapi.yaml`. Neither imports the other's code. The only coupling is one env var: `OPS_CORE_URL`.

- **Strategy**: `docs/00-strategy/{VISION,MASTER_PLAN,ROADMAP}.md`
- **The contract (law)**: `ops-core/openapi.yaml` + `docs/04-api/CONTRACT.md`
- **Glossary**: `docs/00-strategy/GLOSSARY.md`

## Tech stack (locked)

- **ops-core**: Node 20+, Express 5, Prisma 7, Postgres 17, TypeScript, Vitest. Session auth (argon2id + httpOnly cookie) + RBAC live here.
- **ai-orchestrator**: Python 3.12, FastAPI, LangGraph, ChromaDB, Redis. (Scaffold only here.)
- **frontend**: Vite + React 19 SPA. **No SSR.** React Router 7, Tailwind 4, Radix, Zustand, TanStack Query, CVA, lucide.
- **Events**: NATS (JetStream) via a transactional outbox. Degradable — core loop works over REST alone.
- **Infra**: docker-compose (Postgres, NATS, Redis, ChromaDB, the three apps). Independent packages, no monorepo workspaces.

Locked decisions live in `docs/08-decisions/` (ADRs). Don't second-guess them — supersede via a new ADR.

## Session start protocol

1. Read `STATUS.md`.
2. Pick the next eligible task (rules below).
3. Read that task's `SPEC.md` and `TASKS.md` in full.
4. Skim `docs/09-questions/OPEN.md` for blockers in scope.
5. Mark the chosen task `Status: in_progress`, bump `last_updated`.
6. Implement (Research → Build → Test → Finalize — see `docs/00-strategy/EXECUTION_PLAYBOOK.md`).
7. Mark `Status: done`, bump `last_updated`.
8. Regenerate `STATUS.md` (see "Status regeneration").
9. Commit with the task ID in the subject.

## Picking the next task

A task is **eligible** when:
- `Status: not_started`
- All `Depends on:` tasks are `done`
- No blocking question in `docs/09-questions/OPEN.md` cites this feature

Tie-break order: lower phase first → earlier feature ID → earlier task ID.

If nothing is eligible, surface the blockers and ask the user.

**Lane rule:** tasks under `docs/06-features/A00-ai-orchestrator/` are **Alvin's lane** (the Python AI service). The ops-core agent loop treats them as ineligible — they're a reference backlog, not 3-day-build work.

## Conform to existing patterns

ops-core has deliberate conventions. Always conform. Canonical reference: `docs/04-api/CORE_PATTERNS.md`. Non-negotiables:

- **Every controller method** uses `@controlledResponse(type)` from `controllers/_core.ts`. Never hand-roll status codes or error shapes.
- **Every error from a request path throws `APIError`** with a `messageKey`. Never `throw new Error(...)`.
- **Every i18n string** is registered in `MESSAGE_KEYS` and added to **both** `locales/al.json` and `en.json`. Key counts must match.
- **Every validation** uses `ValidationHelpers` + `express-validator`. No Zod.
- **Every service response** matches `ServiceResponse<T>`; paginated lists use `PaginatedServiceResponse<T>`.
- **Routes mount under** `/api/v1/{public,private,admin}`. Pick the tier that matches access; add `requireRole` for finer gates.
- **Every mutation writes an `AuditEntry`** with `req.actor` and an `OutboxEvent` in the **same transaction**. Never anonymous, never a dual-write.
- **Reservations** decrement inventory inside a **serializable transaction with row locks**. The availability check and the write are never separate statements.
- **Money** is integer minor units via `utils/money.ts`. **Time/overlap/buffers** via `utils/time.ts`. No floats on money; no hand-rolled interval math.
- **Tests** use Vitest (`*.test.ts` next to implementation). The availability/conflict engine has property tests. Integration tests use real Postgres (no DB mocks).

## Type sharing

No code sharing. `ops-core/openapi.yaml` is the source of truth. Backend DTOs in `ops-core/src/types/api/<area>.ts`; frontend hand-mirrors in `frontend/src/api/types/<area>.ts`; the AI mirrors in `ai-orchestrator/app/schemas.py`. PR review + a contract test enforce alignment. See `docs/04-api/TYPE_SHARING.md`.

## Ambiguity protocol

If a SPEC lacks a detail you need:
1. Log the question to `docs/09-questions/OPEN.md` under the feature.
2. Log the assumed default to `.planning/ASSUMPTIONS.md` with a one-line rationale.
3. Implement against the assumption.
4. Flag in the commit body: `[assumption: <what>]`.

Do not silently choose a default.

## Status regeneration

`STATUS.md` is a generated dashboard, not a source of truth. After every task status change, regenerate it:

1. Grep all `docs/06-features/*/TASKS.md` for `^- Status:` lines and the preceding `### F##-T##` heading.
2. Tally counts: `not_started`, `in_progress`, `blocked`, `done` — globally and per feature.
3. List every `in_progress` and `blocked` task by ID + title.
4. Compute eligible-next: `not_started` tasks whose `Depends on:` are all `done` and which have no blocking question (exclude `A00`).
5. Surface the top 3 eligible-next (lower phase → earlier feature → earlier task).
6. Bump `Last regenerated:`.

Do not hand-edit `STATUS.md` outside this protocol.

## Commit conventions

Format: `<type>(F##-T##): <subject>` where type ∈ {`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`}.

Examples:
- `feat(F05-T03): asset availability = total − Σ overlapping holds`
- `fix(F06-T02): serialize reservation hold to kill TOCTOU race`
- `docs(F00): lock openapi contract`

One commit per task by default. Body explains *why* if not obvious.

## Forbidden

- Renumbering existing task IDs. They're stable forever. Append at the next ID.
- Editing closed ADRs. Supersede with a new ADR referencing the old.
- Hand-editing `STATUS.md` outside the regeneration protocol.
- Silent assumptions. Always log to `OPEN.md` + `ASSUMPTIONS.md`.
- Code comments that explain *what*. Comments are for *why*.
- Backwards-compat shims when nothing depends on them.
- `throw new Error` on a request path, hand-rolled JSON responses, floats on money, hand-rolled interval overlap.
- Changing `ops-core/openapi.yaml` non-additively without a sync + new ADR.
- Building `A00` (ai-orchestrator) logic — that's Alvin's lane; scaffold + mock only.

## Repo layout

```
/
├── CLAUDE.md  README.md  STATUS.md
├── ops-core/            # Elis — Express API + the contract (openapi.yaml)
├── ai-orchestrator/     # Alvin — FastAPI (scaffold + reference specs only)
├── mock-ops-core/       # Stateful mock for parallel dev
├── frontend/            # Command Center — Vite SPA (chassis; pages built from CLAUDE_DESIGN)
├── CLAUDE_DESIGN/        # (later) Claude Design export → frontend built to match
├── infrastructure/      # docker-compose + db init
├── docs/                # 00-strategy … 10-qa (see below)
└── .planning/           # ASSUMPTIONS.md, SESSION_LOG.md (agent scratch)
```

`docs/`: `00-strategy` (why) · `01-architecture` (how, high level) · `02-domain` (how, per area) · `03-data` (schema) · `04-api` (the contract) · `05-frontend` (design system + pages → Claude Design) · `06-features` (SPEC + TASKS — the work) · `07-operations` · `08-decisions` (ADRs) · `09-questions` · `10-qa`.

## Bootstrap state

The repo skeleton, the contract, the docs, and the feature backlog are written. The 3-day build executes `docs/06-features/F00..F13` in dependency order. The frontend is built once the Claude Design export lands in `CLAUDE_DESIGN/`. `A00` is Alvin's reference backlog, not 3-day-build scope.

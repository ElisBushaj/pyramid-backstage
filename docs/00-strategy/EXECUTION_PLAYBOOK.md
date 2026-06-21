---
id: EXECUTION_PLAYBOOK
created: 2026-06-18
last_updated: 2026-06-18
status: active
owners: [elis]
---

# Execution Playbook — how a task ships in ops-core

> Read this when you're about to start work, mid-session, or coordinating a parallel round. This is the operational manual for the four-stage workflow the [`MASTER_PLAN.md`](./MASTER_PLAN.md) assumes. It does not replace [`CLAUDE.md`](../../CLAUDE.md) — it makes its conventions concrete. The canonical patterns live in [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md); conform to them.

## 0. Cheat sheet (from `CLAUDE.md`)

```
SESSION START
  └─ Read CLAUDE.md (always — the 'Forbidden' list is critical)
  └─ Read STATUS.md → pick the next eligible task
  └─ Read the task's SPEC.md + TASKS.md in full
  └─ Skim docs/09-questions/OPEN.md for blockers in scope
  └─ Read MASTER_PLAN.md if it's been a while (orient on the phase)

PER-TASK
  ┌─ RESEARCH  → SPEC + TASKS + CORE_PATTERNS + the adjacent module + the domain doc
  ├─ BUILD     → mark in_progress, conform to patterns, log assumptions
  ├─ TEST      → the DoD checklist (§3)
  └─ FINALIZE  → mark done, regenerate STATUS.md, commit `<type>(F##-T##): <subject>`

PARALLEL ROUND (Claude as orchestrator)
  └─ Pre-stage shared registries (MESSAGE_KEYS, locale JSONs, route mounts) — one commit
  └─ Spawn 2–5 disjoint sub-agents on disjoint module dirs
  └─ Reconcile assumptions + verify locale parity, then commit the batch
```

## 1. Session start protocol (in order)

1. **Read `CLAUDE.md`.** Non-negotiable.
2. **Read `STATUS.md`.** The generated snapshot of where the program is.
3. **Pick the next eligible task** (`CLAUDE.md` rules): status `not_started`, all `Depends on:` `done`, no blocking question cites the feature, **not `A00`**. Tie-break: lower phase → earlier feature ID → earlier task ID. Prefer the task that unblocks the most downstream work, and prefer a module-internal task over a schema-touching one (so the schema stays serial).
4. **Read the task's full `SPEC.md` + `TASKS.md` acceptance criteria.** Don't skim — they're the contract.
5. **Skim `docs/09-questions/OPEN.md`** for any blocker touching the target feature.
6. **Mark the task `Status: in_progress`**, bump `last_updated`.

## 2. The four stages

### Stage 1 — Research (read before you write)

| Task class | Required reading |
|---|---|
| Any | The feature's `SPEC.md` + the `TASKS.md` entry + [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md) |
| A module (spaces/assets/requests/…) | The matching `docs/02-domain/<AREA>.md`; an **adjacent already-built module** for the controller/service/routes/validators/test shape |
| The engine (`F05`) | [`docs/02-domain/CONFLICTS.md`](../02-domain/CONFLICTS.md) + [ADR-0009](../08-decisions/0009-conflict-window-includes-buffers.md); `utils/time.ts` |
| Reservations (`F06`) | [`docs/02-domain/RESERVATIONS.md`](../02-domain/RESERVATIONS.md) — the serializable-transaction + lease rules |
| Quotes (`F07`) | [`docs/02-domain/QUOTES.md`](../02-domain/QUOTES.md) + [ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md); `utils/money.ts` |
| Auth (`F01`) | [ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md) + [`docs/01-architecture/SECURITY.md`](../01-architecture/SECURITY.md) |
| Anything touching the wire | [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml) is law; the code is wrong if they disagree |

Research is **bounded**: ~15–30 min for a typical task. Beyond that you're either redesigning the architecture (raise it as a question) or procrastinating.

### Stage 2 — Build

**Order of operations:**

1. Write the test scaffolding first if you can articulate the behavior. The engine (`F05`) is **property-tested** — write the invariant, not just examples.
2. **Conform to patterns** ([`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md)):
   - Every controller method uses **`@controlledResponse(type)`** — never hand-roll `res.status().json()`.
   - Every request-path error **throws `APIError`** with a `messageKey` — never `throw new Error(...)`.
   - Every input is validated with **`express-validator` + `ValidationHelpers`** — no Zod.
   - Every service returns **`ServiceResponse<T>`** (lists: `PaginatedServiceResponse<T>`).
   - Routes mount under `/api/v1/{public,private,admin}` — pick the tier; add `requireRole` for finer gates.
   - Money → `utils/money.ts` (integer minor units, no floats). Time/overlap/buffers → `utils/time.ts` (no hand-rolled interval math).
   - **Every mutation writes an `AuditEntry` (with `req.actor`) in the same transaction as the state change.** Never anonymous.
   - Reservations decrement inventory inside a **serializable transaction with row locks** — the availability check and the write are never separate statements.
3. **Pre-register `MESSAGE_KEYS`** and add the leaf to **both** `locales/al.json` and `en.json` (counts must match).
4. **Log every ambiguous default** immediately to [`.planning/ASSUMPTIONS.md`](../../.planning/ASSUMPTIONS.md) with the date + a one-line rationale, and the corresponding question to [`docs/09-questions/OPEN.md`](../09-questions/OPEN.md). Flag it in the commit body: `[assumption: <what>]`. **Never silently choose a default.**
5. **No backwards-compat shims** for code nothing depends on. **No comments that explain *what*** — only *why*, when non-obvious. **Never `git stash`** in an agent brief.

### Stage 3 — Test (Definition of Done)

A task is `done` when:

- [ ] **`pnpm tsc --noEmit` clean.**
- [ ] **`pnpm test --run` clean.** New tests (`*.test.ts`) live next to the implementation. Unit tests stub Prisma (`vi.hoisted`); integration tests (`src/__tests__`) run against real Postgres (no DB mocks). **The engine (`F05`) has property tests.**
- [ ] **Conforms to [`CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md)** — controlled responses, `APIError`, `ServiceResponse`, route tier + role gate, validation via `ValidationHelpers`.
- [ ] **If the task is a mutation: it writes an `AuditEntry` with `req.actor` in the same transaction as the state change.** This is verifiable in the test.
- [ ] **Idempotency**: a mutating route carries `withIdempotency`; a replay returns the original, a body-mismatch → `409` ([ADR-0005](../08-decisions/0005-idempotency-keys.md)).
- [ ] **Locale parity**: the new `messageKey`s are in both `al.json` and `en.json`; key counts match.
- [ ] **Contract honored**: the payload matches [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml); the DTO is declared in `src/types/api/<area>.ts`.
- [ ] **If schema-touching**: a migration is generated, named, and applies cleanly to a fresh DB.

Anything beyond this (a full e2e flow, a property-test expansion) is its own task.

### Stage 4 — Finalize

1. **Mark `Status: done`**, bump `last_updated` in the task's `TASKS.md`.
2. **Regenerate `STATUS.md`** per the protocol below — never hand-edit it.
3. **Commit.** `<type>(F##-T##): <subject>`, `type ∈ {feat, fix, chore, docs, refactor, test, perf}`. Body explains *why* if not obvious; include `[assumption: …]` if one was made.
4. **In a parallel round**, batch the commits and reconcile [`.planning/ASSUMPTIONS.md`](../../.planning/ASSUMPTIONS.md) (multiple agents may have appended — dedupe, verify chronology).

## 3. Status regeneration (the protocol — do not hand-edit `STATUS.md`)

`STATUS.md` is a generated dashboard, not a source of truth. After every status change:

1. Grep all `docs/06-features/*/TASKS.md` for `^- Status:` lines and the preceding `### F##-T##` heading.
2. Tally `not_started` / `in_progress` / `blocked` / `done`, globally and per feature.
3. List every `in_progress` and `blocked` task by ID + title.
4. Compute eligible-next: `not_started` tasks whose `Depends on:` are all `done`, with no blocking question (**exclude `A00`**).
5. Surface the top 3 eligible-next (lower phase → earlier feature → earlier task).
6. Bump `Last regenerated:`.

## 4. The module file pattern

Each ops-core feature module follows one shape (see any built module under `src/modules/<feature>/`):

```
src/modules/<feature>/
├── controller.ts   # thin: validate req, pull req.actor, call service, return — @controlledResponse on every method
├── service.ts      # all business logic + all DB access (via config/prisma); returns ServiceResponse<T>
├── routes.ts       # mounts under the right tier; requireAuth + requireRole + withIdempotency on mutations
├── validators.ts   # express-validator chains via ValidationHelpers
└── *.test.ts       # Vitest, next to the implementation
```

Cross-module **engines** live under `src/services/` (`availability/`, `conflict/`, `pricing/`, `reservation/`). See [`docs/01-architecture/MODULES.md`](../01-architecture/MODULES.md).

## 5. Pre-staging shared registries (the orchestrator pattern)

Three things are write-contended across modules. Before spawning parallel sub-agents, pre-stage them in **one** orchestrator commit:

1. **`src/types/message-keys.ts`** (`MESSAGE_KEYS`) — append the new namespace(s), alphabetical.
2. **`src/locales/al.json` and `en.json`** — add the leaves; both files must have identical key sets.
3. **`src/routes/v1/{public,private,admin}/index.ts`** — add the `.use("/<feature>", <feature>Routes)` mount for each new module.

Plus the hard serial one: **`prisma/schema.prisma`** — only one task at a time. Sequence schema work as Round 0 before module work. Sub-agents start from the pre-staging commit and may **not** touch these files.

## 6. Foot-guns to avoid

- **Don't hand-edit `STATUS.md`** outside the regen protocol — it's generated.
- **Don't `throw new Error`** on a request path — throw `APIError` with a `messageKey`.
- **Don't hand-roll** status codes, JSON error shapes, interval overlap, or money arithmetic — use `@controlledResponse`, `APIError`, `utils/time.ts`, `utils/money.ts`.
- **Don't drop locale parity** — a key in one locale file but not the other fails CI.
- **Don't separate the availability check from the reservation write** — they share one serializable transaction with row locks, or you've reintroduced the TOCTOU race.
- **Don't renumber task IDs** or **edit a closed ADR** — append the next ID / supersede with a new ADR.
- **Don't silently assume** — log to `OPEN.md` + `ASSUMPTIONS.md`, flag in the commit.

## Cross-references

- **Conventions:** [`CLAUDE.md`](../../CLAUDE.md). **The plan:** [`MASTER_PLAN.md`](./MASTER_PLAN.md). **Patterns:** [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md).
- **Module map:** [`docs/01-architecture/MODULES.md`](../01-architecture/MODULES.md). **Terms:** [`GLOSSARY.md`](./GLOSSARY.md).

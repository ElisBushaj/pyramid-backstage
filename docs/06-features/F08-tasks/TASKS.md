---
id: F08
name: Tasks
last_updated: 2026-06-19
---

# F08 — Tasks

### F08-T01 — Task model + migration
- Status: done
- Depends on: F00-T06
- Estimate: 0.25d
- Acceptance:
  - `Task` exists in `ops-core/prisma/schema.prisma` per `docs/03-data/SCHEMA.md`: `id, requestId, title, phase: TaskPhase, owner?, assigneeId?, dueOffsetHours? (Int), dueAt? (DateTime), status: TaskStatus`.
  - `TaskPhase` (`SETUP|TEARDOWN`) and `TaskStatus` (`TODO|IN_PROGRESS|DONE|BLOCKED`) enums match `openapi.yaml`; the `requestId` FK is present.
  - If F00-T06 already shipped the model complete this is a verification no-op; otherwise a gap-fill migration applies cleanly via `prisma migrate deploy`.

### F08-T02 — POST/GET /requests/:id/tasks + dueAt computed from reserved window
- Status: done
- Depends on: F08-T01, F06-T01
- Estimate: 0.5d
- Acceptance:
  - `POST /private/requests/:id/tasks` validates `{ tasks: TaskInput[] }` (each `{ title, phase ∈ TaskPhase, owner?, assigneeId?, dueOffsetHours? }`) via `ValidationHelpers`; an unknown request id → `404`.
  - ops-core computes each `dueAt` from the request's reservation window per `docs/02-domain/TASKS.md`: SETUP = event `start + dueOffsetHours` (offset negative → before doors); TEARDOWN = event `end + dueOffsetHours` (offset positive → after close); `dueAt` is absolute RFC-3339 UTC. When no reservation exists yet, `dueAt` is left null (documented), `dueOffsetHours` is retained.
  - `GET /private/requests/:id/tasks` returns `ServiceResponse<Task[]>`, renderable grouped by `phase` + `owner`.
  - Persisting writes a `task.create` (or `request.tasks.persist`) `AuditEntry` with `req.actor` in the same transaction.
  - Controllers use `@controlledResponse`; tsc clean; vitest passing.

### F08-T03 — assignment + status PATCH + audit
- Status: done
- Depends on: F08-T02
- Estimate: 0.5d
- Acceptance:
  - A `PATCH` route updates a task's `assigneeId` and/or `status` (`TODO|IN_PROGRESS|DONE|BLOCKED`), validated; an unknown task id → `404`.
  - Every assignment or status change writes a `task.update` `AuditEntry` (before/after) with `req.actor` in the same transaction (per `docs/02-domain/AUDIT.md`).
  - Status changes are accepted in any order the board needs (no rigid state machine required beyond the enum), but the change is always audited.
  - Returns `ServiceResponse<Task>`; tsc clean; vitest passing.

### F08-T04 — tasks tests
- Status: done
- Depends on: F08-T02
- Estimate: 0.25d
- Acceptance:
  - Unit test asserts `dueAt` computation: a SETUP task with `dueOffsetHours: -4` resolves to 4h before the reserved start; a TEARDOWN task with `+2` to 2h after the reserved end.
  - Integration tests cover: persist a task list (with `dueAt` computed) → fetch it grouped; PATCH assignment + status → `task.update` audit row written; `404` on unknown request/task id; `422` on invalid `TaskInput`.
  - tsc clean; runs in CI.

---
id: F08
name: Tasks
phase: Core
depends_on: [F04]
status: not_started
last_updated: 2026-06-18
---

# F08 — Tasks

## Summary

The operational checklist that turns an approved event into executed work: setup and teardown items grouped by phase and owner into lanes (the TaskBoard). The AI reasons out the list from event context + RAG templates, then **persists it through ops-core** (`POST /requests/:id/tasks`) so state stays single-sourced — the AI never holds task state. ops-core computes each task's absolute `dueAt` from the reserved window and supports assignment + status updates, all audited.

## Scope

### In scope
- The `Task` model (from F00-T06) + any migration gap-fill.
- `POST /private/requests/:id/tasks` (persist a task list) and `GET /private/requests/:id/tasks`, with `dueAt` computed from the reserved window.
- Assignment to a staff member + status `PATCH`, audited.
- Tests.

### Out of scope
- AI generation of the task list — Alvin's lane (A00); ops-core only persists the validated `TaskInput[]` and computes defaults.
- The reservation that supplies the window — F06 (`dueAt` is computed from it).
- A TaskBoard UI — outside ops-core scope.

## Acceptance criteria

- `POST /private/requests/:id/tasks` accepts `{ tasks: TaskInput[] }` (each `{ title, phase ∈ TaskPhase, owner?, assigneeId?, dueOffsetHours? }`), validated; an unknown request id → `404`.
- ops-core computes `dueAt` from the reservation's window per `docs/02-domain/TASKS.md`: SETUP offsets are negative from the event **start** (`-4` = 4h before doors), TEARDOWN offsets are positive from the event **end** (`+2` = 2h after close); `dueAt` is absolute RFC-3339 UTC.
- `GET /private/requests/:id/tasks` returns the request's `Task[]` (envelope), grouped-renderable by `phase` + `owner`.
- A task may be assigned to a staff member and have its `status` updated (`TODO|IN_PROGRESS|DONE|BLOCKED`) via PATCH; every assignment/status change writes an `AuditEntry` (`task.update`, before/after) with `req.actor`.
- Persisting a task list writes audit; responses use the `ServiceResponse<T>` envelope; enums are `UPPER_SNAKE`.

## Data model

`Task { id, requestId, title, phase: TaskPhase, owner?, assigneeId?, dueOffsetHours? (Int), dueAt? (DateTime), status: TaskStatus }` per `docs/03-data/SCHEMA.md` and the `Task` schema in `openapi.yaml`.

## API surface

- `GET /private/requests/:id/tasks` — tasks for a request → `Task[]`.
- `POST /private/requests/:id/tasks` — persist a setup/teardown task list (AI-generated, human-owned) → `Task[]`.

(Assignment + status updates land via a `PATCH` route added in F08-T03.)

## UI surfaces

None — backend.

## Notes

- Task shape, timing (`dueOffsetHours` semantics), AI-generates-ops-core-persists, coordination by phase/owner: `docs/02-domain/TASKS.md`.
- `dueAt` is computed from the F06 reservation window; audit on assignment/status: `docs/02-domain/AUDIT.md`.
- Envelope/validation conventions: `docs/04-api/CORE_PATTERNS.md`.

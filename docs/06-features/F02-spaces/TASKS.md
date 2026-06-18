---
id: F02
name: Spaces
last_updated: 2026-06-18
---

# F02 — Tasks

### F02-T01 — Space model + migration (capacities JSON, buffers)
- Status: not_started
- Depends on: F00-T06
- Estimate: 0.25d
- Acceptance:
  - `Space` exists in `ops-core/prisma/schema.prisma` with all `openapi.yaml` `Space` fields: `id, name, floor, kind: SpaceKind, capacities (Json), features (String[]), dayRateMinor (Int), currency, setupBufferMinutes (Int, default 120), teardownBufferMinutes (Int, default 120), status`.
  - `capacities` is JSON (layout→int); `dayRateMinor` is `Int` (no float); buffers are `Int` minutes per `docs/02-domain/SPACES.md`.
  - If F00-T06 already shipped the model complete this is a verification no-op; otherwise a gap-fill migration applies cleanly via `prisma migrate deploy`.

### F02-T02 — Spaces service + CRUD (OPS+) + validators + audit
- Status: not_started
- Depends on: F02-T01, F01-T05
- Estimate: 0.5d
- Acceptance:
  - `src/modules/spaces` exposes a service returning `ServiceResponse<Space>` for create/update; controllers use `@controlledResponse`.
  - `POST /private/spaces` and `PATCH /private/spaces/:id` are gated by `requireRole('OPS')` (ADMIN/MANAGER/OPS pass, VIEWER → `403`).
  - `SpaceInput` is validated with `ValidationHelpers`: `capacities` keys are valid `Layout` enum values with positive integer counts, `dayRateMinor ≥ 0`, buffers `≥ 0`; failures → `422 validation` with fields keyed.
  - Create and update each write an `AuditEntry` via the F09 writer in the same transaction: `space.create` / `space.update` with before/after snapshots and `req.actor`.
  - `PATCH` on a missing id → `404 not_found`; tsc clean; vitest passing.

### F02-T03 — GET /spaces match+filter (capacities[layout] ≥ minCapacity)
- Status: not_started
- Depends on: F02-T02
- Estimate: 0.5d
- Acceptance:
  - `GET /private/spaces` accepts `minCapacity`, `layout`, `start`, `end` (validated; `start`/`end` ISO date-time, `minCapacity ≥ 1`).
  - With `layout` + `minCapacity`, returns only spaces where `capacities[layout] ≥ minCapacity` — capacity is read for the requested layout per `docs/02-domain/SPACES.md`; a space lacking that layout is excluded.
  - Without `layout`, `minCapacity` matches against the space's maximum supported-layout capacity (documented); without `minCapacity`, all spaces are returned (optionally `status: ACTIVE` only).
  - Returns `ServiceResponse<SpaceWithAvailability[]>`; when `start`/`end` are absent, `available` is omitted from each item.
  - Test: a 180-seat THEATER query returns only spaces seating ≥180 in theater and excludes banquet-only smaller rooms.

### F02-T04 — availability annotation on GET /spaces when start&end supplied
- Status: not_started
- Depends on: F02-T03, F05-T02
- Estimate: 0.25d
- Acceptance:
  - When `start` & `end` are supplied to `GET /private/spaces`, each returned space carries `available: boolean` from the F05 space availability service (`services/availability`), computed buffer-aware (window padded by the space's setup/teardown buffers before overlap), per `docs/02-domain/CONFLICTS.md`.
  - The annotation reflects only `HELD|CONFIRMED` reservations whose effective window overlaps the padded query window; a back-to-back booking inside the buffer marks the space unavailable.
  - The matching filter (T03) and the availability annotation compose (filter first, then annotate the survivors).
  - Test: a space with a confirmed reservation in the window reports `available: false`; the same space queried for a free window reports `available: true`.

### F02-T05 — Spaces unit + route tests
- Status: not_started
- Depends on: F02-T03
- Estimate: 0.25d
- Acceptance:
  - Unit tests cover the matching rule (`capacities[layout] ≥ minCapacity`, layout-absent fallback, exclusion of unsupported layouts).
  - Route/integration tests cover: OPS+ create/update success + VIEWER `403`; `422` on invalid `SpaceInput`; `404` on PATCH of a missing id; the `AuditEntry` is written on create/update.
  - The availability-annotation behaviour (T04) is asserted with seeded reservations.
  - tsc clean; runs in CI.

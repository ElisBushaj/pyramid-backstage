---
id: F02
name: Spaces
phase: Domain
depends_on: [F00, F01]
status: not_started
last_updated: 2026-06-18
---

# F02 — Spaces

## Summary

Bookable rooms and areas of the Pyramid: the four main halls (Blue, Orange, Green, Yellow) on floors 0 / −1 and the transitional areas events spill into. A space carries a layout→capacity map, free-form feature tags, a day rate, and per-space setup/teardown buffers that feed the conflict engine. This feature ships the `Space` CRUD (OPS+, audited) and the matching read (`GET /spaces`) that the AI uses as its "match space" tool — including the buffer-aware availability annotation when a window is supplied.

## Scope

### In scope
- The `Space` model (from F00-T06) + any migration gap-fill (capacities JSON, buffers).
- Spaces service + CRUD: `POST /private/spaces`, `PATCH /private/spaces/:id` (OPS+), validated and audited.
- `GET /private/spaces` matching on `capacities[layout] ≥ minCapacity` and filtering by `layout`.
- The `available` annotation on each matched space when `start` & `end` are supplied (buffer-aware), via the F05 space availability service.
- Unit + route tests.

### Out of scope
- The availability/conflict *engine* itself — F05 (this feature consumes `services/availability` for the annotation; it does not implement overlap math).
- `GET /private/spaces/:id/availability` — that endpoint is F05-T05 (single-space deep check).
- Reservations against a space — F06.
- Seed data — F12.

## Acceptance criteria

- `POST /private/spaces` and `PATCH /private/spaces/:id` require OPS+ (`requireRole('OPS')`); VIEWER gets `403`. Both validate `SpaceInput` via `ValidationHelpers` and write an `AuditEntry` (`space.create` / `space.update`, before/after) in-transaction.
- `capacities` is stored as a JSON layout→int map; a space need not support every `Layout`. `dayRateMinor` is an integer; `setupBufferMinutes`/`teardownBufferMinutes` persist per `docs/02-domain/SPACES.md`.
- `GET /private/spaces?minCapacity&layout` returns only spaces whose `capacities[layout] ≥ minCapacity` (capacity is read for the *requested* layout, per `docs/02-domain/SPACES.md`); without `layout`, `minCapacity` matches against the max supported layout (documented behaviour).
- When `start` & `end` are supplied, each returned space carries `available: boolean` computed buffer-aware (the window padded by the space's buffers before overlap), matching `SpaceWithAvailability` in `openapi.yaml`; when they are absent, `available` is omitted.
- `PATCH` on an unknown `:id` → `404 not_found`; an invalid `capacities`/rate/buffer → `422 validation`.
- Responses use the `ServiceResponse<T>` envelope; enums are `UPPER_SNAKE`.

## Data model

`Space { id, name, floor (0|−1), kind: SpaceKind, capacities (JSON layout→int), features (string[]), dayRateMinor (Int), currency, setupBufferMinutes, teardownBufferMinutes, status }` per `docs/03-data/SCHEMA.md` and the `Space` schema in `openapi.yaml`.

## API surface

- `GET /private/spaces?minCapacity&layout&start&end` — match + filter spaces, with windowed availability → `SpaceWithAvailability[]`.
- `POST /private/spaces` — create a space (OPS+) → `Space`.
- `PATCH /private/spaces/:id` — update a space (OPS+) → `Space`.

(`GET /private/spaces/:id/availability` is implemented in F05-T05.)

## UI surfaces

None — backend.

## Notes

- Space inventory, capacity-by-layout matching, buffers: `docs/02-domain/SPACES.md`.
- Buffer-aware availability math is owned by `docs/02-domain/CONFLICTS.md` / F05; F02 only annotates.
- Audit + envelope + validation conventions: `docs/04-api/CORE_PATTERNS.md`.

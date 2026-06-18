---
id: F03
name: Assets / Inventory
phase: Domain
depends_on: [F00, F01]
status: not_started
last_updated: 2026-06-18
---

# F03 — Assets / Inventory

## Summary

Operational equipment tracked at the aggregate level: chairs, tables, microphones, screens, projectors, stage units, lighting. Each asset line is a count (`totalQuantity`) with a type, location, and status. This feature ships the `Asset` CRUD (OPS+, audited) with the guard that you cannot lower `totalQuantity` below what is currently held, and the windowed availability read (`GET /assets`) that computes `availableQuantity = totalQuantity − Σ overlapping holds` — the AI's "check inventory" tool.

## Scope

### In scope
- The `Asset` model (from F00-T06) + any migration gap-fill.
- Assets service + CRUD: `POST /private/assets`, `PATCH /private/assets/:id` (OPS+), validated and audited, with the lower-below-holds guard (`422`).
- `GET /private/assets` returning each asset with windowed `availableQuantity` via the F05 asset availability service.
- Tests.

### Out of scope
- The availability/conflict engine internals — F05 (this feature consumes `services/availability`; the grouped-sum query lives there).
- Holding assets / decrementing inventory — F06 (reservations).
- Per-unit / QR-NFC tagging and a movement ledger — explicitly future per `docs/02-domain/ASSETS.md`.
- Seed data — F12.

## Acceptance criteria

- `POST /private/assets` and `PATCH /private/assets/:id` require OPS+; VIEWER gets `403`. Both validate `AssetInput` and write an `AuditEntry` (`asset.create` / `asset.update`, before/after) in-transaction.
- Lowering `totalQuantity` below the current Σ of overlapping/active holds is rejected with `422 validation` (per `docs/02-domain/ASSETS.md`); a raise or a lower that still covers holds succeeds.
- `GET /private/assets?type&quantity&start&end` returns each asset with `availableQuantity = totalQuantity − Σ(quantity of overlapping HELD|CONFIRMED holds)` for the window, matching `AssetWithAvailability` in `openapi.yaml`.
- `MAINTENANCE` and `RETIRED` assets report `availableQuantity: 0` regardless of holds (per `docs/02-domain/ASSETS.md`).
- The `type` filter restricts results to that `AssetType`; the optional `quantity` filter may be used to flag lines that can/can't satisfy the ask (documented), but availability is always the computed number, never "is total ≥ quantity".
- Responses use the `ServiceResponse<T>` envelope; enums are `UPPER_SNAKE`.

## Data model

`Asset { id, name, type: AssetType, totalQuantity (Int), location, status: AssetStatus }` per `docs/03-data/SCHEMA.md` and the `Asset` schema in `openapi.yaml`. Holds live in `ReservationAsset` (owned by F06); availability is computed by joining through it (F05).

## API surface

- `GET /private/assets?type&quantity&start&end` — inventory availability for a window → `AssetWithAvailability[]`.
- `POST /private/assets` — create an asset (OPS+) → `Asset`.
- `PATCH /private/assets/:id` — update an asset (OPS+) → `Asset`.

## UI surfaces

None — backend.

## Notes

- Asset shape, aggregate tracking, maintenance/retired → 0 availability, lower-below-holds rejection: `docs/02-domain/ASSETS.md`.
- The windowed availability formula (Σ overlapping holds, single grouped query): `docs/02-domain/CONFLICTS.md` / `docs/03-data/SCHEMA.md` ("Asset availability (windowed)").
- Audit + envelope + validation conventions: `docs/04-api/CORE_PATTERNS.md`.

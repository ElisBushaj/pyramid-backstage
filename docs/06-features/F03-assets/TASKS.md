---
id: F03
name: Assets / Inventory
last_updated: 2026-06-19
---

# F03 — Tasks

### F03-T01 — Asset model + migration
- Status: done
- Depends on: F00-T06
- Estimate: 0.25d
- Acceptance:
  - `Asset` exists in `ops-core/prisma/schema.prisma` with the `openapi.yaml` `Asset` fields: `id, name, type: AssetType, totalQuantity (Int), location, status: AssetStatus`.
  - `AssetType` and `AssetStatus` enums match `openapi.yaml` exactly (`SEATING|TABLE|MICROPHONE|SCREEN|PROJECTOR|STAGE_UNIT|LIGHTING|OTHER`; `ACTIVE|MAINTENANCE|RETIRED`).
  - If F00-T06 already shipped the model complete this is a verification no-op; otherwise a gap-fill migration applies cleanly via `prisma migrate deploy`.

### F03-T02 — Assets CRUD (OPS+) + lower-qty-below-holds guard (422)
- Status: done
- Depends on: F03-T01, F01-T05
- Estimate: 0.5d
- Acceptance:
  - `src/modules/assets` exposes a service returning `ServiceResponse<Asset>`; controllers use `@controlledResponse`.
  - `POST /private/assets` and `PATCH /private/assets/:id` are gated by `requireRole('OPS')` (VIEWER → `403`); `AssetInput` validated via `ValidationHelpers` (`type` ∈ `AssetType`, `totalQuantity ≥ 0`, `status` ∈ `AssetStatus`).
  - Lowering `totalQuantity` below the current Σ of active `ReservationAsset` holds (HELD|CONFIRMED) is rejected with `422 validation` (`asset.update.below_holds`) per `docs/02-domain/ASSETS.md`; a lower that still covers holds, or a raise, succeeds.
  - Create/update each write an `AuditEntry` (`asset.create`/`asset.update`, before/after, `req.actor`) in the same transaction.
  - `PATCH` on a missing id → `404`; tsc clean; vitest passing.

### F03-T03 — GET /assets windowed availableQuantity (total − Σ overlapping holds)
- Status: done
- Depends on: F03-T02, F05-T03
- Estimate: 0.5d
- Acceptance:
  - `GET /private/assets` accepts `type`, `quantity`, `start`, `end` (validated; ISO date-times, `quantity ≥ 1`) and returns `ServiceResponse<AssetWithAvailability[]>`.
  - `availableQuantity = totalQuantity − Σ(ReservationAsset.quantity)` over holds whose parent reservation is `HELD|CONFIRMED` and whose effective window overlaps `[start,end]`, via the F05 asset availability service (single grouped query, never a per-row loop, never "is total ≥ quantity") per `docs/02-domain/CONFLICTS.md`.
  - `MAINTENANCE`/`RETIRED` assets report `availableQuantity: 0` per `docs/02-domain/ASSETS.md`.
  - The `type` filter restricts results to that `AssetType`; with no window supplied, `availableQuantity` equals `totalQuantity` for ACTIVE lines.
  - Test: with 310 of 400 chairs held in a window, the chair line reports `availableQuantity: 90`; a retired line reports `0`.

### F03-T04 — Assets tests
- Status: done
- Depends on: F03-T03
- Estimate: 0.25d
- Acceptance:
  - Unit tests cover the lower-below-holds guard (rejects below Σ holds, allows at/above) and the maintenance/retired → 0 rule.
  - Route/integration tests cover: OPS+ create/update + VIEWER `403`; `422` on invalid `AssetInput` and on lowering below holds; `404` on PATCH of a missing id; the `AuditEntry` is written.
  - The windowed `availableQuantity` computation is asserted with seeded overlapping holds (including a non-overlapping hold that must NOT reduce availability).
  - tsc clean; runs in CI.

---
id: F16
name: QR/NFC Asset Tracking
phase: Core
depends_on: [F03, F09]
status: not_started
last_updated: 2026-06-20
---

# F16 — QR/NFC Asset Tracking

## Summary

Today `Asset.location` is a static string nobody updates — the moment 400 chairs leave the store they are "somewhere", and on event day "where is it?" is answered by walking the building. This feature makes location **live and historical**: a QR/NFC tag encodes the `assetId`, a scan posts a `CHECK_OUT | CHECK_IN | RELOCATE` movement, and ops-core records it as an `AssetMovement` ledger row, updates the live `Asset.location`, and writes audit — all in one transaction. The result is a "where is everything right now" rollup, a per-asset movement timeline, and a mobile scanner an ops runner uses on the floor. Tracking stays **aggregate-with-movement** — a movement carries a `quantity`, not a per-unit serial; we never mint a row per physical chair ([docs/08-decisions/0011-qr-nfc-asset-tracking.md](../../08-decisions/0011-qr-nfc-asset-tracking.md)). Visually striking and fully parallel — it touches no existing reservation or availability path.

## Scope

### In scope
- The `AssetMovement` model + a Prisma migration: `id`, `assetId`, `action` (`AssetMovementAction`), `quantity`, `fromLocation?`, `toLocation`, `reservationId?`, `actorId?`, `note?`, `at`; index `[assetId, at]`; a `movements` relation on `Asset`.
- `POST /private/assets/:id/scan` (OPS+): one transaction → record the movement, update `Asset.location`, write an `asset.scan` `AuditEntry`; guard over-checkout; require `Idempotency-Key`.
- `GET /private/assets/:id/movements` — the paginated history.
- A live-location rollup on `GET /private/assets` (`currentLocation` + `checkedOutQuantity`).
- The `openapi.yaml` additive schemas + ops-core/frontend type mirrors + the mock-ops-core parity handlers.
- FE: a QR-encode util + a per-asset QR on `AssetDetail`; a mobile-first Scanner page; a "Where is it?" dashboard widget + a per-asset movement timeline; EN/AL i18n.
- Tests: scan happy path, over-checkout guard, audit assertions, movements history, idempotent replay.

### Out of scope
- Per-unit / serialized identity (one row per physical chair, unique tag per unit) — explicitly rejected for aggregate-with-movement ([docs/08-decisions/0011-qr-nfc-asset-tracking.md](../../08-decisions/0011-qr-nfc-asset-tracking.md)).
- Changing the **availability/conflict** math — F05 still computes `availableQuantity` from `ReservationAsset` holds; a movement is an operational fact, not a hold, and does not decrement bookable inventory ([docs/02-domain/CONFLICTS.md](../../02-domain/CONFLICTS.md)).
- The reservation hold/confirm/release transitions — F06; a scan may *reference* a `reservationId` but never drives a reservation transition.
- Real NFC radio integration / native app — the demo encodes/decodes a QR; NFC is the same `assetId` payload over a different reader ([docs/02-domain/ASSET_TRACKING.md](../../02-domain/ASSET_TRACKING.md)).

## Acceptance criteria

- The `AssetMovement` Prisma model exists with `action: AssetMovementAction` (`CHECK_OUT | CHECK_IN | RELOCATE`, `UPPER_SNAKE`), `quantity: Int`, `fromLocation: String?`, `toLocation: String`, `reservationId: String?`, `actorId: String?`, `note: String?`, `at: DateTime`, an index `[assetId, at]`, and a `movements AssetMovement[]` relation on `Asset` — all additive; no existing `Asset` column moves. `prisma generate` and `tsc` are clean.
- `POST /private/assets/:id/scan` requires OPS+ (`requireRole('OPS')`); VIEWER and PARTNER get `403`. In **one** `prisma.$transaction` it inserts the `AssetMovement`, sets `Asset.location = toLocation`, and writes an `asset.scan` `AuditEntry` (with `before`/`after` location) — never anonymous (`actorId` from `req.actor`).
- The over-checkout guard: a `CHECK_OUT` whose `quantity` exceeds the currently-available-to-check-out count (`totalQuantity − Σ open checked-out quantity`) is rejected `422 validation` (per [docs/02-domain/ASSET_TRACKING.md](../../02-domain/ASSET_TRACKING.md)); a `CHECK_IN` whose `quantity` exceeds the open checked-out count is likewise rejected. `RELOCATE` moves a checked-out quantity between locations and does not change the net checked-out count.
- The scan body is validated with `ValidationHelpers` + `express-validator` (no Zod): `action` ∈ the enum, `quantity` a positive integer ≤ `totalQuantity`, `toLocation` a non-empty string, `reservationId`/`note` optional and bounded — malformed → `422 validation`. An unknown asset id → `404 not_found`.
- `POST /private/assets/:id/scan` requires `Idempotency-Key` (UUID v4); a replay returns the **original** movement (no duplicate ledger row, no double location flip); a body mismatch under the same key → `409 idempotency_key_mismatch` (per [docs/04-api/CORE_PATTERNS.md](../../04-api/CORE_PATTERNS.md), [ADR-0005](../../08-decisions/0005-idempotency-keys.md)).
- `GET /private/assets/:id/movements?page&pageSize` (VIEWER+) returns the ledger newest-first as `PaginatedServiceResponse<AssetMovement>`, served off the `[assetId, at]` index; an unknown asset id → `404`; an asset with no movements → an empty page, not a `404`.
- `GET /private/assets` additionally carries a live-location rollup per asset — `currentLocation` (the live `Asset.location`) and `checkedOutQuantity` (`Σ` open checked-out quantity) — computed without breaking the existing windowed `availableQuantity` annotation (F03/F05).
- Every response uses the `ServiceResponse<T>` / `PaginatedServiceResponse<T>` envelope; new strings are registered in `MESSAGE_KEYS` and present in **both** `locales/al.json` and `en.json` with key-count parity.

## Data model

`AssetMovement` is a new append-only ledger row written on every scan; the `Asset` model is unchanged except for the back-relation. Per [docs/03-data/SCHEMA.md](../../03-data/SCHEMA.md), [docs/02-domain/ASSET_TRACKING.md](../../02-domain/ASSET_TRACKING.md), and [docs/08-decisions/0011-qr-nfc-asset-tracking.md](../../08-decisions/0011-qr-nfc-asset-tracking.md):

```
AssetMovement {
  id            String              @id @default(uuid())
  assetId       String
  asset         Asset               @relation(fields: [assetId], references: [id])
  action        AssetMovementAction
  quantity      Int
  fromLocation  String?
  toLocation    String
  reservationId String?
  actorId       String?
  note          String?
  at            DateTime            @default(now())
  @@index([assetId, at])
}

enum AssetMovementAction { CHECK_OUT  CHECK_IN  RELOCATE }
```

- `quantity` makes this **aggregate-with-movement**: a single row moves N units, never one row per physical unit.
- `fromLocation`/`toLocation` are the live location before/after; `Asset.location` is the projection of the latest movement's `toLocation`.
- `reservationId` is an optional operational link (this checkout served that event) — never a hold; the F05/F06 booking math ignores movements.
- `actorId` is the scanning ops member (from `req.actor`); `note` is a free-text floor remark.

No change to `Reservation`/`ReservationAsset` or the availability engine.

## API surface

- `POST /private/assets/:id/scan` — record a `CHECK_OUT | CHECK_IN | RELOCATE` movement (OPS+, idempotent, over-checkout-guarded) → `AssetMovement` (and the asset's new live location).
- `GET /private/assets/:id/movements?page&pageSize` — the asset's movement history, newest-first → `AssetMovement[]` (paginated).
- `GET /private/assets` — unchanged signature; each asset additionally carries `currentLocation` + `checkedOutQuantity` alongside the existing windowed `availableQuantity`.

## UI surfaces

- **Per-asset QR** — `AssetDetail` renders a QR encoding the `assetId` (a small `qr-encode` util), printable/labelable.
- **Scanner page** — a mobile-first page: open the camera, decode a QR → resolve the `assetId` → a check-in / check-out / relocate form that posts `/scan`. Degrades to manual asset-id entry where the camera is unavailable.
- **"Where is it?" dashboard widget** — a live rollup of each asset's `currentLocation` + `checkedOutQuantity`, answering "where is everything right now" at a glance.
- **Movement timeline** — a per-asset chronological history (action, quantity, from→to, actor, time) read from `/movements`.
- All copy in EN + AL.

## Notes

- Aggregate-with-movement (a `quantity` per movement, not per-unit serials), QR encodes the `assetId`, NFC is the same payload over a different reader, the over-checkout guard, and why movements are not holds: [docs/08-decisions/0011-qr-nfc-asset-tracking.md](../../08-decisions/0011-qr-nfc-asset-tracking.md) and [docs/02-domain/ASSET_TRACKING.md](../../02-domain/ASSET_TRACKING.md).
- The aggregate-tracking base this extends, and the "per-unit / QR-NFC tagging and a movement ledger are a clean future extension" note this fulfils: [docs/02-domain/ASSETS.md](../../02-domain/ASSETS.md), [docs/06-features/F03-assets/SPEC.md](../F03-assets/SPEC.md).
- A scan is a mutation → audit in the same transaction as the state change, never anonymous: [docs/02-domain/AUDIT.md](../../02-domain/AUDIT.md), [docs/06-features/F09-audit/SPEC.md](../F09-audit/SPEC.md).
- Idempotency on the scan mutation: [ADR-0005](../../08-decisions/0005-idempotency-keys.md), [docs/04-api/CORE_PATTERNS.md](../../04-api/CORE_PATTERNS.md).
- Contract/DTO/mirror alignment is enforced by the F13 contract test: [docs/04-api/TYPE_SHARING.md](../../04-api/TYPE_SHARING.md), [docs/06-features/F13-contract/SPEC.md](../F13-contract/SPEC.md).

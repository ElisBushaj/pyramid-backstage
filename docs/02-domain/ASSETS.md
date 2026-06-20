# Domain — Assets / Inventory

Operational equipment: chairs, tables, microphones, screens, projectors, stage units, lighting.

## Shape
- `type` (`SEATING`, `TABLE`, `MICROPHONE`, `SCREEN`, `PROJECTOR`, `STAGE_UNIT`, `LIGHTING`, `OTHER`), `name`, `totalQuantity`, `location`, `status` (`ACTIVE | MAINTENANCE | RETIRED`).
- Inventory is tracked at the **aggregate** level (a count per asset line), not per physical unit. This grain is unchanged.
- `location` is now **live + historical**: QR/NFC scanning moves stock between locations and a movement ledger records every move — now in scope (aggregate-with-movement, not per-unit serial identity). See [ASSET_TRACKING.md](./ASSET_TRACKING.md).

## Availability (windowed)
`GET /assets?type&quantity&start&end` returns each asset with `availableQuantity = totalQuantity − Σ overlapping holds` for the window (see [CONFLICTS.md](./CONFLICTS.md)). `MAINTENANCE`/`RETIRED` assets report `availableQuantity: 0`.

## Reservation
Assets are held as part of a `Reservation` (`ReservationAsset { assetId, quantity }`). Decrement is atomic inside the reservation transaction — see [RESERVATIONS.md](./RESERVATIONS.md).

## Writes
Create/update is `OPS+`, audited. Lowering `totalQuantity` below current holds is rejected (`422`).

# Domain — Assets / Inventory

Operational equipment: chairs, tables, microphones, screens, projectors, stage units, lighting.

## Shape
- `type` (`SEATING`, `TABLE`, `MICROPHONE`, `SCREEN`, `PROJECTOR`, `STAGE_UNIT`, `LIGHTING`, `OTHER`), `name`, `totalQuantity`, `location`, `status` (`ACTIVE | MAINTENANCE | RETIRED`).
- Inventory is tracked at the **aggregate** level (a count per asset line), not per physical unit. Per-unit / QR-NFC tagging and a movement ledger are a clean future extension (`location` is already a first-class field) — out of scope for the 3-day build, noted in [docs/09-questions/OPEN.md](../09-questions/OPEN.md).

## Availability (windowed)
`GET /assets?type&quantity&start&end` returns each asset with `availableQuantity = totalQuantity − Σ overlapping holds` for the window (see [CONFLICTS.md](./CONFLICTS.md)). `MAINTENANCE`/`RETIRED` assets report `availableQuantity: 0`.

## Reservation
Assets are held as part of a `Reservation` (`ReservationAsset { assetId, quantity }`). Decrement is atomic inside the reservation transaction — see [RESERVATIONS.md](./RESERVATIONS.md).

## Writes
Create/update is `OPS+`, audited. Lowering `totalQuantity` below current holds is rejected (`422`).

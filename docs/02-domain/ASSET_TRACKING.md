# Domain — Asset Tracking (the movement ledger)

Where is everything, right now? Today `Asset.location` is a static string set at create-time and never moved. This adds the missing half: a **movement ledger** that makes `location` *live*, and a scan that updates it in one audited transaction. The aggregate-count model from [ASSETS.md](./ASSETS.md) is otherwise untouched.

## Aggregate, not per-unit
We track **counts that move between locations**, not serialized physical units. A QR/NFC tag encodes an `assetId` (an asset *line*, e.g. "standard chairs"), never a unit serial. A scan says "*N of this line moved here*", not "*this exact chair moved here*". This is the right grain for the demo — staff move chairs by the stack, not the seat — and it dodges a per-unit identity model that the 3-day build doesn't need. Locked in [ADR-0011](../08-decisions/0011-qr-nfc-asset-tracking.md).

## Shape
`AssetMovement` — one row per scan, append-only:
- `type` (`CHECK_OUT | CHECK_IN | RELOCATE`).
- `quantity` — integer, how many units of the line moved (≥ 1).
- `fromLocation` / `toLocation` — strings; `from` is the asset's live location at scan time, `to` is the destination. `CHECK_OUT` has a `to`; `CHECK_IN` returns to a home/store location; `RELOCATE` is store-to-store.
- `reservationId?` — links the movement to the event it serves, so a request's plan can show "where are its 180 chairs now".
- `actorId?` — who scanned (resolved from `req.actor`); null only for system moves.
- `at` — RFC-3339 UTC `Z`.

The ledger is never mutated or deleted; a mistaken move is corrected by a compensating movement, not an edit.

## Scan semantics
`POST /private/assets/:id/scan { type, quantity, toLocation, reservationId? }` (`OPS+`). In **one transaction**:

1. Read the asset row; `fromLocation = asset.location`.
2. **Over-checkout guard** — a `CHECK_OUT` may not move more than is currently *at* `fromLocation` and free in the window. Violations → `422 asset_overallocated` (same error family the [conflict engine](./CONFLICTS.md) raises), never a silent negative.
3. Insert the `AssetMovement`.
4. Update the live `Asset.location` to `toLocation` (the asset's "current centre of mass" — see below).
5. Write the `AuditEntry` (actor = scanner) — same transaction as the movement insert and the location update.

Idempotent on `Idempotency-Key`: a double-tap of the scanner returns the original movement, never a phantom second move.

### Live location with split stock
A line can be in two places at once (200 chairs out at Blue Hall, 200 still in store). `Asset.location` holds the **dominant** current location for the at-a-glance view; the authoritative per-location breakdown is derived by folding the ledger. The "where is it" rollup reads the ledger, not just the denormalised string.

## The "where is everything right now" rollup
`GET /private/assets/:id/movements` returns the ledger (newest-first, paginated) — the audit trail for one line. The dashboard widget folds movements into a current per-location distribution: for each location, `Σ inbound − Σ outbound`. This answers the operational question the email/Excel world couldn't: *the gala needs 180 chairs at 18:00 and 140 of them are still down in the Lower Gallery from this morning.*

## Reads & writes
- Scan + movement create: `OPS+`, audited, idempotent.
- Ledger read: `OPS+`.
- The AI reasons over this read-only (asset-location reasoning, see [AI_ORCHESTRATION.md](./AI_ORCHESTRATION.md)); it proposes moves, ops-core authorises and writes them.

See [F16 SPEC](../06-features/F16-asset-tracking/SPEC.md) for the endpoint contract, the scanner UI, and the dashboard widget.

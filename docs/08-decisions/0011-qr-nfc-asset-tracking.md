# ADR-0011: QR/NFC asset tracking is aggregate-with-movement, not per-unit identity

- **Status**: Accepted
- **Date**: 2026-06-20

## Context

The brief wants to know **where the gear is**: 400 chairs, 12 microphones, the staging units — which of them are in Blue Hall right now, which are in storage, which walked off. Today `Asset` ([docs/02-domain/ASSETS.md](../02-domain/ASSETS.md)) is a SKU with a `totalQuantity` and a single static `location` string; there is no history of where a count moved or who moved it. QR/NFC scanning is the obvious capture mechanism — a phone scans a tag, the system records the move.

The modelling fork is identity. Either every individual chair becomes a tracked entity with its own tag and lifecycle, or the asset stays an aggregate count whose location changes are journalled. The brief asks for **counts and locations**, not the provenance of chair #318. The availability engine ([ADR-0009](./0009-conflict-window-includes-buffers.md)) already reasons in quantities, never in unit identities.

## Decision

**Track assets as aggregate counts with a movement ledger; the QR tag encodes the `assetId` (the SKU), and a scan records an `AssetMovement` while updating the live `Asset.location` in one transaction.**

- **The tag is the SKU.** A QR/NFC tag encodes `assetId` — the chair-stack's type, not a serial number. Scanning identifies *which kind of asset*, and the operator supplies the count and the move type. See [docs/02-domain/ASSET_TRACKING.md](../02-domain/ASSET_TRACKING.md).
- **A scan is a movement, not a PATCH.** `POST /private/assets/:id/scan` records an `AssetMovement { type: CHECK_OUT | CHECK_IN | RELOCATE, quantity, fromLocation?, toLocation }` **and** updates `Asset.location` to the destination, in a single transaction — together with the mandatory `AuditEntry` and an `asset.moved` `OutboxEvent`, per the every-mutation-is-audited rule of [CORE_PATTERNS](../04-api/CORE_PATTERNS.md).
- **The ledger is the history.** `GET /private/assets/:id/movements` returns the append-only movement log. `Asset.location` is a denormalized "where is it now" derived from the latest movement; the ledger is the source of truth for *how it got there*.
- **Aggregate, not serialized.** Movements carry a `quantity`. Splitting a stack — 200 chairs to Blue Hall, 200 to storage — is two movements off the same `assetId`, not 400 unit records. Availability math is untouched: it still sums quantities.

## Consequences

- **"Where is my gear" is answerable.** The dashboard widget reads `Asset.location` for the live snapshot; the per-asset ledger explains the trail. Both come from one write path, so they can never disagree.
- **History and audit are preserved.** Because every move is an `AuditEntry` + an outbox event in the same transaction, a misplaced count is traceable to who scanned it and when — the audit posture of [ADR-0003](./0003-session-auth-rbac-in-ops-core.md) extends to physical movement.
- **Model stays small.** One new table (`AssetMovement`) and one nullable denormalized column trend; no per-unit entity explosion. Buildable and testable inside the time box.
- **Partial-quantity tracking has a known limit.** Aggregate location means an asset split across two rooms shows only its *latest* destination in `Asset.location`; the true split lives in the ledger. Accepted: the brief asks for counts + a current location, not a live per-room balance. A per-location balance is a future enhancement, not a demo blocker.

## Alternatives considered

- **Per-unit `AssetUnit` identity (one row per chair, serialized tags).** Rejected: it multiplies the data model and the scanning workload by `totalQuantity`, and the brief asks for *counts and location*, not the biography of an individual chair. The reservation/availability engine reasons in quantities; per-unit identity buys nothing it consumes.
- **Mutating `location` via a plain `PATCH /assets/:id` with no ledger.** Rejected: it overwrites the only evidence of where the gear was, losing the history and the audit trail the brief explicitly wants ("a complete record of changes"). A scan must journal, not just overwrite.
- **A movement journal with no denormalized `Asset.location`.** Rejected: every "where is it now" read would aggregate the full ledger. The denormalized current location, written in the same transaction, keeps the hot read O(1) without risking divergence.

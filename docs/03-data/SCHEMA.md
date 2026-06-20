# Data Schema

Postgres 17 via Prisma 7. Source of truth for the **shape** is `ops-core/openapi.yaml`; this page is the **persistence** view (models, money/time storage, indexes that make the engines correct + fast). Full model defs live in `ops-core/prisma/schema.prisma`.

## Models (overview)

| Model | Purpose | Key fields |
|-------|---------|-----------|
| `User` | Staff identity | `email` (unique), `passwordHash`, `role`, `isActive` |
| `Session` | Server-side sessions | `userId`, `tokenHash`, `expiresAt` |
| `Space` | Bookable room / area | `capacities` (JSON: layout→int), `dayRateMinor`, `setupBufferMinutes`, `teardownBufferMinutes`; + catalog fields `slug`, `category`, `zone`, `isCirculation`, `adjacent`, `map`, `ceilingCm` (see below) |
| `Asset` | Inventory line | `type`, `totalQuantity`, `location` (live; updated by scans), `status` |
| `AssetMovement` | Asset scan ledger | `assetId`, `action`, `quantity`, `fromLocation`/`toLocation`, `reservationId`, `actorId`, `at` |
| `EventRequest` | The inquiry | `status`, `preferredDates` (JSON `[{start,end}]`), `requirements` (JSON) |
| `Reservation` | Held/confirmed booking | `spaceId`, `dateRange`, `effectiveStart/End`, `status`, `expiresAt` |
| `ReservationAsset` | Per-asset hold (join) | `reservationId`, `assetId`, `quantity` |
| `Quote` | Priced proposal | `lineItems` (JSON), `netMinor`, `vatMinor`, `totalMinor`, `version`, `expiresAt` |
| `Task` | Setup/teardown item | `phase`, `owner`, `assigneeId`, `dueOffsetHours`, `dueAt`, `status` |
| `AuditEntry` | Append-only ledger | `actorId`, `action`, `entityType`, `entityId`, `before`/`after` (JSON), `reason`, `at` |
| `OutboxEvent` | Transactional event outbox | `subject`, `payload` (JSON), `publishedAt` |
| `IdempotencyKey` | Replay cache | `key`, `requestHash`, `response` (JSON), `expiresAt` |

## Space catalog extension fields
The 19-space venue catalog lives in [spaces.catalog.json](./spaces.catalog.json) — the single shared source feeding the ops-core seed, the AI's venue facts, and the floor-map UI. Rows 1-6 are **byte-authoritative** against `seed.ts` (same UUIDs, capacities, rates, buffers); rows 7-19 are estimated demo attributes.

These fields are promoted from the catalog onto `Space` **additively** — all nullable, then backfilled from the catalog so existing reservation/availability logic is untouched. See [0013-space-catalog-extension-fields.md](../08-decisions/0013-space-catalog-extension-fields.md).

| Field | Type | Notes |
|-------|------|-------|
| `slug` | `String` (unique) | Stable handle; the graph/bundle/map key. |
| `category` | `String` | `HALL\|BOX\|CORRIDOR\|ATRIUM\|ENTRANCE\|TERRACE\|TRANSITIONAL`. Finer than `kind`. |
| `zone` | `String` | Floor/quadrant tag (e.g. `F0-N`, `F-1-core`). |
| `isCirculation` | `Boolean` | `true` = booking it limits access/egress for `adjacent` spaces. |
| `adjacent` | `String[]` | Slugs that physically touch this space — the adjacency graph for AI bundles + circulation reasoning. |
| `map` | `Json` | `{floor, ring, sectorFrom?, sectorTo?}` for the radial floor map; circulation/center spaces carry no `sectorFrom`/`sectorTo`. |
| `ceilingCm` | `Int?` | Clear height; null where unsurveyed. |

## AssetMovement (scan ledger)
Asset tracking is **aggregate-with-movement**, not per-unit serialized identity: a QR encodes `assetId`, a scan records a movement row and updates `Asset.location` live. See [ASSET_TRACKING.md](../02-domain/ASSET_TRACKING.md) and [0011-qr-nfc-asset-tracking.md](../08-decisions/0011-qr-nfc-asset-tracking.md).

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` (cuid/uuid) | PK. |
| `assetId` | FK → `Asset` | The line scanned. |
| `action` | `AssetMovementAction` | `CHECK_OUT\|CHECK_IN\|RELOCATE`. |
| `quantity` | `Int` | Units moved. |
| `fromLocation` | `String?` | Prior location (null on first check-out). |
| `toLocation` | `String` | New location; written back to `Asset.location`. |
| `reservationId` | FK → `Reservation` (`?`) | Set when the move serves a booking. |
| `actorId` | FK → `User` (`?`) | Who scanned; null for system moves. |
| `note` | `String?` | Free-text. |
| `at` | `DateTime` | When scanned (UTC). |

```prisma
@@index([assetId, at])   // movement history per asset, newest-first
```

## Role enum
`PARTNER` is added **below** `VIEWER` (rank `PARTNER < VIEWER < OPS < MANAGER < ADMIN`) — an external requester with row-scoped intake. See [0010-partner-role-and-approval-chain.md](../08-decisions/0010-partner-role-and-approval-chain.md).

## Money
- All amounts are `Int` (or `BigInt` if a value could exceed 2³¹) in `*Minor` columns. `ALL` minor-unit factor is 1.
- **No `Float`/`Decimal` for money.** Derived totals (`netMinor`, `vatMinor`, `totalMinor`) are computed and stored, never trusted from the client.

## Time & buffers (the correctness core)
- All `DateTime` columns are UTC. The DB session runs `PGTZ=UTC`.
- A reservation stores both the **event window** (`dateRange`) and the **effective occupancy** (`effectiveStart = start − space.setupBufferMinutes`, `effectiveEnd = end + space.teardownBufferMinutes`). Overlap is always tested against the **effective** window so back-to-back events can't collide during setup/teardown. See [CONFLICTS.md](../02-domain/CONFLICTS.md).

## Indexes that matter
```prisma
// Reservation — the hot path for availability queries
@@index([spaceId, status, effectiveStart, effectiveEnd])   // space overlap
@@index([status, effectiveStart, effectiveEnd])             // global window scan for assets
// ReservationAsset
@@index([assetId])                                          // sum overlapping holds per asset
// AuditEntry
@@index([requestId, at])
@@index([entityType, entityId])
// OutboxEvent
@@index([publishedAt])                                      // relay polls unpublished
// EventRequest
@@index([status, createdAt])
```

## Asset availability (windowed)
`availableQuantity(asset, [start,end]) = asset.totalQuantity − Σ quantity` over every `ReservationAsset` whose parent `Reservation` is `HELD|CONFIRMED` and whose **effective** window overlaps `[start,end]`. Computed in a single grouped query; never "is total ≥ qty".

## Migrations
Prisma migrations, named `<timestamp>_<change>` (e.g. `20260618_init`, `20260618_add_outbox`). `prisma migrate dev` locally, `prisma migrate deploy` in CI/prod. One in-flight schema change at a time (migrations are serial).

# Data Schema

Postgres 17 via Prisma 7. Source of truth for the **shape** is `ops-core/openapi.yaml`; this page is the **persistence** view (models, money/time storage, indexes that make the engines correct + fast). Full model defs live in `ops-core/prisma/schema.prisma`.

## Models (overview)

| Model | Purpose | Key fields |
|-------|---------|-----------|
| `User` | Staff identity | `email` (unique), `passwordHash`, `role`, `isActive` |
| `Session` | Server-side sessions | `userId`, `tokenHash`, `expiresAt` |
| `Space` | Bookable room / area | `capacities` (JSON: layout→int), `dayRateMinor`, `setupBufferMinutes`, `teardownBufferMinutes` |
| `Asset` | Inventory line | `type`, `totalQuantity`, `location`, `status` |
| `EventRequest` | The inquiry | `status`, `preferredDates` (JSON `[{start,end}]`), `requirements` (JSON) |
| `Reservation` | Held/confirmed booking | `spaceId`, `dateRange`, `effectiveStart/End`, `status`, `expiresAt` |
| `ReservationAsset` | Per-asset hold (join) | `reservationId`, `assetId`, `quantity` |
| `Quote` | Priced proposal | `lineItems` (JSON), `netMinor`, `vatMinor`, `totalMinor`, `version`, `expiresAt` |
| `Task` | Setup/teardown item | `phase`, `owner`, `assigneeId`, `dueOffsetHours`, `dueAt`, `status` |
| `AuditEntry` | Append-only ledger | `actorId`, `action`, `entityType`, `entityId`, `before`/`after` (JSON), `reason`, `at` |
| `OutboxEvent` | Transactional event outbox | `subject`, `payload` (JSON), `publishedAt` |
| `IdempotencyKey` | Replay cache | `key`, `requestHash`, `response` (JSON), `expiresAt` |

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

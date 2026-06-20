---
id: F16
name: QR/NFC Asset Tracking
last_updated: 2026-06-20
---

# F16 — Tasks

### F16-T01 — AssetMovement model + migration + AssetMovementAction enum
- Status: done
- Depends on: F03-T01
- Estimate: 0.5d
- Acceptance:
  - A Prisma migration adds the `AssetMovement` model — `id String @id @default(uuid())`, `assetId String`, `action AssetMovementAction`, `quantity Int`, `fromLocation String?`, `toLocation String`, `reservationId String?`, `actorId String?`, `note String?`, `at DateTime @default(now())` — plus the `enum AssetMovementAction { CHECK_OUT CHECK_IN RELOCATE }` (`UPPER_SNAKE`), per `docs/08-decisions/0011-qr-nfc-asset-tracking.md` and `docs/03-data/SCHEMA.md`.
  - An `@@index([assetId, at])` backs the newest-first history read; a `movements AssetMovement[]` back-relation is added to `Asset` and a `relation(fields: [assetId], references: [id])` from `AssetMovement`.
  - The change is **additive only**: no existing `Asset` column (`location` included) is renamed, dropped, or retyped; existing rows and the F12 seed are untouched.
  - `prisma generate` regenerates the client; tsc clean.

### F16-T02 — POST /private/assets/:id/scan (OPS+): one tx → movement + live location + audit + outbox; over-checkout guard
- Status: done
- Depends on: F16-T01, F09-T02
- Estimate: 0.75d
- Acceptance:
  - `POST /private/assets/:id/scan` is gated by `requireRole('OPS')` (OPS+); VIEWER and PARTNER get `403`, anonymous gets `401`. The controller uses `@controlledResponse` and the service returns `ServiceResponse<AssetMovement>` (per `docs/04-api/CORE_PATTERNS.md`).
  - In **one** `prisma.$transaction` it inserts the `AssetMovement` row, sets `Asset.location = toLocation`, and writes an `asset.scan` `AuditEntry` (with `before`/`after` location + `actorId` from `req.actor`) and an `asset.moved` `OutboxEvent` — never a dual-write, never anonymous (per `docs/02-domain/AUDIT.md`).
  - Over-checkout guard: a `CHECK_OUT` whose `quantity` exceeds `totalQuantity − Σ open checked-out quantity` → `APIError` `422 validation`; a `CHECK_IN` whose `quantity` exceeds the open checked-out count → `422 validation`; `RELOCATE` moves checked-out units between locations without changing the net checked-out count (per `docs/02-domain/ASSET_TRACKING.md`).
  - `action` outside the enum, `quantity` non-positive or `> totalQuantity`, an empty `toLocation`, or an over-long `note` → `422 validation`; an unknown asset id → `404 not_found`. All errors `throw APIError` with a `messageKey` (never `throw new Error`), and every new key exists in both `locales/al.json` and `en.json` with key-count parity.
  - Requires `Idempotency-Key` (UUID v4); a replay returns the original `AssetMovement` (no duplicate ledger row, no second location flip); a body mismatch under the same key → `409 idempotency_key_mismatch` (per `ADR-0005`).
  - tsc clean; vitest passing; conforms to `docs/04-api/CORE_PATTERNS.md`.

### F16-T03 — GET /private/assets/:id/movements (paginated) + live-location rollup on GET /private/assets
- Status: done
- Depends on: F16-T01
- Estimate: 0.5d
- Acceptance:
  - `GET /private/assets/:id/movements?page&pageSize` (VIEWER+) returns the ledger **newest-first** as `PaginatedServiceResponse<AssetMovement>`, served off the `[assetId, at]` index (no full-table scan, no per-row JS sort); an unknown asset id → `404 not_found`; an asset with no movements → an empty page (not a `404`).
  - `GET /private/assets` additionally annotates each asset with `currentLocation` (the live `Asset.location`) and `checkedOutQuantity` (`Σ` open checked-out quantity), computed in a single grouped query alongside — and without regressing — the existing windowed `availableQuantity` (F03/F05).
  - Pagination uses the standard params/envelope; both reads use `@controlledResponse`.
  - tsc clean; vitest passing; conforms to `docs/04-api/CORE_PATTERNS.md`.

### F16-T04 — contract: openapi.yaml AssetMovement + scan + movements; type mirrors; mock-ops-core handlers
- Status: done
- Depends on: F16-T02, F16-T03
- Estimate: 0.5d
- Acceptance:
  - `openapi.yaml` gains, **additively** (per `docs/04-api/CONTRACT.md`): an `AssetMovement` schema, an `AssetScanInput` request body, the `POST /private/assets/{id}/scan` operation (`AssetMovement` response, `403`/`404`/`409`/`422`), and the `GET /private/assets/{id}/movements` operation (paginated `AssetMovement[]`); the `AssetWithAvailability` schema gains optional `currentLocation` + `checkedOutQuantity`. `AssetMovementAction` is an `UPPER_SNAKE` enum; `at` is RFC-3339 UTC `Z`.
  - The ops-core DTO (`src/types/api/assets.ts`) and the frontend mirror (`frontend/src/api/types/assets.ts`) hand-mirror the new shapes so the F13 contract test (DTO ↔ openapi) stays green (per `docs/04-api/TYPE_SHARING.md`, `ADR-0008`).
  - `mock-ops-core` adds stateful `scan` + `movements` handlers (and the `GET /assets` rollup fields) returning the same shapes, so the frontend can develop against the mock with parity.
  - tsc clean; the F13 contract test passes.

### F16-T05 — FE: QR-encode util + per-asset QR on AssetDetail; mobile-first Scanner page
- Status: done
- Depends on: F16-T04
- Estimate: 0.75d
- Acceptance:
  - A small `qr-encode` util renders a QR encoding the `assetId`; `AssetDetail` shows a printable/labelable per-asset QR.
  - A mobile-first **Scanner** page opens the camera, decodes a QR → resolves the `assetId` → a check-in / check-out / relocate form that posts `/private/assets/:id/scan` via `src/api/hooks.ts` (TanStack Query), sending an `Idempotency-Key` (UUID v4) and surfacing the `422` over-checkout error inline. It degrades to manual asset-id entry where the camera is unavailable.
  - On success the query cache for the asset, its movements, and the "Where is it?" widget invalidate so the live location updates without a reload.
  - Conforms to the frontend stack (Vite/React 19, React Router 7, Tailwind 4, Radix, Zustand, CVA, lucide); no SSR; build green.

### F16-T06 — FE: "Where is it?" dashboard widget + per-asset movement timeline; EN/AL i18n
- Status: done
- Depends on: F16-T04
- Estimate: 0.5d
- Acceptance:
  - A dashboard **"Where is it?"** widget lists each asset's `currentLocation` + `checkedOutQuantity` from `GET /private/assets`, answering "where is everything right now" at a glance and refreshing on scan-driven cache invalidation.
  - A per-asset **movement timeline** renders `/movements` newest-first (action, quantity, `from→to`, actor, RFC-3339 time), paginated, with the `CHECK_OUT | CHECK_IN | RELOCATE` actions visually distinguished.
  - All copy is in EN + AL (frontend i18n parity); no hard-coded English strings.
  - Build green.

### F16-T07 — tests: scan happy path, over-checkout guard, audit+outbox, movements history, idempotent replay
- Status: done
- Depends on: F16-T02, F16-T03
- Estimate: 0.5d
- Acceptance:
  - Integration test (real Postgres, no DB mocks): a `CHECK_OUT` scan inserts one `AssetMovement`, flips `Asset.location` to `toLocation`, and creates exactly one `asset.scan` `AuditEntry` (with before/after location) + one `asset.moved` `OutboxEvent` in the same transaction.
  - Over-checkout test: a `CHECK_OUT` exceeding `totalQuantity − Σ open checked-out` → `422`, and the asset/ledger are left unchanged; a `CHECK_IN` exceeding the open checked-out count → `422`; a `RELOCATE` leaves the net checked-out count unchanged.
  - Movements-history test: `GET /private/assets/:id/movements` returns rows newest-first and paginates; an asset with no movements → an empty page; the `GET /private/assets` rollup reports the right `currentLocation` + `checkedOutQuantity`.
  - Idempotent-replay test: replaying the same `Idempotency-Key` returns the original `AssetMovement` with no second ledger row and no second location flip; the role matrix (OPS+/MANAGER/ADMIN allowed; VIEWER/PARTNER → 403; anonymous → 401) is asserted.
  - tsc clean; runs in CI.

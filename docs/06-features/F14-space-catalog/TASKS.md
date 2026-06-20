---
id: F14
name: Space Catalog Expansion
last_updated: 2026-06-20
---

# F14 — Tasks

### F14-T01 — additive Space extension fields + Prisma migration
- Status: done
- Depends on: F02-T01
- Estimate: 0.5d
- Acceptance:
  - The `Space` Prisma model gains `slug String? @unique`, `category String?`, `zone String?`, `isCirculation Boolean?`, `adjacent String[] @default([])`, `map Json?`, and `ceilingCm Int?` — every field additive and nullable; no existing column (`id`, `name`, `floor`, `kind`, `capacities`, `features`, `dayRateMinor`, `currency`, `setupBufferMinutes`, `teardownBufferMinutes`, `status`) is renamed, dropped, or retyped (per [docs/03-data/SCHEMA.md](../../03-data/SCHEMA.md) and [docs/08-decisions/0013-space-catalog-extension-fields.md](../../08-decisions/0013-space-catalog-extension-fields.md)).
  - A Prisma migration creates the columns and the `slug` unique index, then **backfills the existing 6 rows** (`50000000-0000-4000-8000-000000000001..6`) from [docs/03-data/spaces.catalog.json](../../03-data/spaces.catalog.json) so their `slug`/`category`/`zone`/`isCirculation`/`adjacent`/`map` match the catalog exactly; no other column or value on those rows changes.
  - The backfill is idempotent (re-running the migration path or seed converges to the same state) and leaves rows without a catalog ceiling height (`ceilingCm`) as `NULL`.
  - `category` values are `UPPER_SNAKE` ∈ `HALL | BOX | CORRIDOR | ATRIUM | ENTRANCE | TERRACE | TRANSITIONAL`; `map` is `{ floor, ring, sectorFrom?, sectorTo? }` with the sector range omitted for circulation/`ring: center` spaces.
  - `prisma generate` clean; tsc clean; conforms to [docs/04-api/CORE_PATTERNS.md](../../04-api/CORE_PATTERNS.md).

### F14-T02 — seed rewrite reads spaces.catalog.json (all 19 spaces, F12 fixture preserved)
- Status: done
- Depends on: F14-T01, F12-T04
- Estimate: 0.5d
- Acceptance:
  - `src/scripts/seed.ts` reads [docs/03-data/spaces.catalog.json](../../03-data/spaces.catalog.json) and seeds all 19 spaces, mapping every catalog field (including the F14 extension fields) onto the `Space` rows.
  - Rows 1–6 keep their **EXACT** existing UUIDs, `capacities`, `dayRateMinor`, `currency`, `setupBufferMinutes`, `teardownBufferMinutes`, and `kind` (the F12 authoritative values) — the seed must not drift any authoritative value when it adopts the catalog as its source; rows 7–19 are added with the catalog's attributes.
  - The F12 planted Blue-hall conflict, the 6 asset lines, the 4 per-role staff users, and the 2–3 demo events still seed deterministically, and the planted collision still yields a real `409 conflict` via `detectConflicts`/`POST /reservations` (per [docs/06-features/F12-seed/SPEC.md](../F12-seed/SPEC.md) and [docs/02-domain/CONFLICTS.md](../../02-domain/CONFLICTS.md)).
  - The seed/reset stays deterministic (stable ids/values) and refuses to run when `NODE_ENV=production`; the new rows load through the real space service/validators where feasible, not raw inserts that bypass invariants.
  - tsc clean; the seed-determinism assertions pass.

### F14-T03 — extend the Space contract + DTO + FE mirror
- Status: done
- Depends on: F14-T01
- Estimate: 0.5d
- Acceptance:
  - The `openapi.yaml` `Space` (and `SpaceInput`/`SpaceWithAvailability`) schema gains the new fields as **optional** (`slug`, `category`, `zone`, `isCirculation`, `adjacent`, `map`, `ceilingCm`) — additive-only, no required-field or breaking change (per [docs/04-api/CONTRACT.md](../../04-api/CONTRACT.md)); `category` is an `UPPER_SNAKE` enum, `map` is the `{ floor, ring, sectorFrom?, sectorTo? }` object.
  - `ops-core/src/types/api/spaces.ts` and `frontend/src/api/types/spaces.ts` hand-mirror the new optional fields identically (per [docs/04-api/TYPE_SHARING.md](../../04-api/TYPE_SHARING.md)).
  - `spaceToDto` maps every new field, returning it when present and omitting it when null; the create/update validators (`ValidationHelpers` + `express-validator`, no Zod) accept the new fields as optional and reject malformed values with `422 validation` — `category` outside the enum, a non-array `adjacent`, a non-integer `ceilingCm`, a duplicate `slug` (`409`/`422` per the conflict shape).
  - Any new `MESSAGE_KEYS` for the validators are registered and present in **both** `locales/al.json` and `locales/en.json` with matching key counts.
  - tsc clean; vitest passing; conforms to [docs/04-api/CORE_PATTERNS.md](../../04-api/CORE_PATTERNS.md).

### F14-T04 — bundleTemplates + circulationRules as a frontend constant
- Status: done
- Depends on: F14-T03
- Estimate: 0.25d
- Acceptance:
  - `frontend/src/lib/venue-catalog.ts` exports `bundleTemplates` (conference / exhibition / gala roles → `category`/`layout` per the catalog) and `circulationRules` (the access-warning + step-free routing rules), typed and sourced from [docs/03-data/spaces.catalog.json](../../03-data/spaces.catalog.json), with a header comment documenting them as **static reference data** (Alvin loads the same JSON into `venue_facts`).
  - The constant carries **no** ops-core route and adds **no** contract endpoint — the frontend-constant choice is the locked decision (per [docs/08-decisions/0013-space-catalog-extension-fields.md](../../08-decisions/0013-space-catalog-extension-fields.md)); it is consumed by the F19 FloorMap / bundle hints, not fetched.
  - The bundle `category` references and the `when`/`eventType` keys match the catalog and the `Space.category` enum, so a bundle role resolves against real seeded spaces.
  - tsc clean (frontend build green).

### F14-T05 — verification: contract test + e2e + seed determinism + locale parity
- Status: done
- Depends on: F14-T02, F14-T03, F14-T04
- Estimate: 0.25d
- Acceptance:
  - The F13 contract test (DTO ↔ `openapi.yaml`) is green with the extended `Space` schema — the ops-core DTO, the `openapi.yaml` schema, and the frontend mirror are aligned (per [docs/06-features/F13-contract/SPEC.md](../F13-contract/SPEC.md)).
  - The F13 e2e and the seed-determinism assertions still pass against the 19-space seed: a fresh seed/reset reproduces the same 19 spaces and the same planted Blue-hall conflict deterministically.
  - `locales/al.json` ↔ `locales/en.json` key-count parity holds (the enforced check passes) for any keys F14 added.
  - A read of `GET /private/spaces` returns the 19 spaces with their extension fields populated (and `null`s omitted) — a quick smoke assertion covers the new fields surfacing end-to-end.
  - tsc clean; runs in CI.

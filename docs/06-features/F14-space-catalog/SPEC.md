---
id: F14
name: Space Catalog Expansion
phase: Foundation
depends_on: [F02, F12]
status: not_started
last_updated: 2026-06-20
---

# F14 — Space Catalog Expansion

## Summary

The Pyramid is more than four boxes. This feature brings the 19-space catalog ([docs/03-data/spaces.catalog.json](../../03-data/spaces.catalog.json)) into ops-core as the single source of truth — adding the catalog-extension fields (`slug`, `category`, `zone`, `isCirculation`, `adjacent`, `map`, `ceilingCm`) to the `Space` model **additively**, seeding all 19 spaces (the 6 currently-seeded rows preserved byte-for-byte, the 13 new transitional/box/terrace rows added), and surfacing the venue's bundle templates and circulation rules as **frontend reference data**. This is the foundation the FloorMap (F19) renders from and the AI bundle reasoning (Alvin) loads into `venue_facts`. It is demo-critical and the lowest-risk task in the expansion: every change is additive, nullable, and backfilled — no existing column, value, or UUID moves.

## Scope

### In scope
- Additive `Space` extension fields + a Prisma migration: nullable `slug` (unique), `category`, `zone`, `isCirculation`, `adjacent` (`String[]`), `map` (JSON), `ceilingCm` (`Int?`), with the existing 6 rows backfilled from the catalog.
- A seed rewrite that reads [docs/03-data/spaces.catalog.json](../../03-data/spaces.catalog.json) and seeds all 19 spaces deterministically — rows 1–6 keeping their EXACT UUIDs / capacities / `dayRateMinor` / buffers, rows 7–19 added, the F12 planted Blue-hall conflict and the rest of the F12 fixture untouched.
- The `Space` contract schema (`openapi.yaml`), the ops-core DTO, and the frontend mirror extended with the new **optional** fields; `spaceToDto` and the create/update validators updated.
- `bundleTemplates` + `circulationRules` shipped as a frontend constant ([frontend/src/lib/venue-catalog.ts](../../../frontend/src/lib/venue-catalog.ts)) sourced from the same catalog JSON, documented as static reference data — **no new contract endpoint**.
- Verification: the contract test (DTO ↔ openapi), the F13 e2e, seed determinism, and locale key-count parity all stay green.

### Out of scope
- The FloorMap UI that renders `map`/`category`/`isCirculation` — F19 (this feature only lands the fields it reads; see [docs/05-frontend/FLOOR_MAP.md](../../05-frontend/FLOOR_MAP.md)).
- The AI bundle planner that consumes `bundleTemplates`/`adjacent` — Alvin's lane (A00); ops-core only exposes the catalog data, it does not reason over bundles.
- Promoting `bundleTemplates`/`circulationRules` to a contract endpoint — locked as a frontend constant (per [docs/08-decisions/0013-space-catalog-extension-fields.md](../../08-decisions/0013-space-catalog-extension-fields.md)).
- Per-space reservations / availability behaviour against the new spaces — unchanged from F05/F06; the new rows are ordinary `Space` rows the existing engine already handles.

## Acceptance criteria

- The `Space` Prisma model gains `slug String? @unique`, `category String?`, `zone String?`, `isCirculation Boolean?`, `adjacent String[]`, `map Json?`, and `ceilingCm Int?` — all additive and nullable (`adjacent` defaults `[]`); no existing column is renamed, dropped, or retyped. `prisma generate` and `tsc` are clean.
- The migration backfills the existing 6 spaces (`...-000000000001..6`) from the catalog so their `slug`/`category`/`zone`/`isCirculation`/`adjacent`/`map` match [docs/03-data/spaces.catalog.json](../../03-data/spaces.catalog.json) exactly, and no other column or value on those rows changes.
- Running the seed against an empty/reset DB creates all 19 spaces: rows 1–6 with their EXACT existing UUIDs, capacities, `dayRateMinor`, `currency`, and buffers (the F12 authoritative values), plus rows 7–19 with the catalog's attributes. The F12 planted Blue-hall conflict, the 6 asset lines, the 4 per-role staff users, and the demo events still seed deterministically and still produce the real `409 conflict`.
- The `openapi.yaml` `Space` schema carries the new fields as **optional** (additive-only, per [docs/04-api/CONTRACT.md](../../04-api/CONTRACT.md)); `category` and `kind` enums are `UPPER_SNAKE`; `map` has `sectorFrom`/`sectorTo` only on non-circulation/non-center spaces (circulation and `ring: center` spaces omit them, per the catalog).
- `spaceToDto` maps every new field; `GET /private/spaces` and `GET /private/spaces/:id` return them when present and omit them when null. The create/update validators (`ValidationHelpers` + `express-validator`, no Zod) accept the new fields as optional and reject malformed values (`422 validation`) — e.g. a `category` outside the enum, a non-array `adjacent`, a non-integer `ceilingCm`.
- The frontend type mirror ([frontend/src/api/types/spaces.ts](../../../frontend/src/api/types/spaces.ts)) hand-mirrors the new optional fields so the contract test (F13) passes DTO ↔ openapi alignment.
- `bundleTemplates` + `circulationRules` are exposed as a typed frontend constant in [frontend/src/lib/venue-catalog.ts](../../../frontend/src/lib/venue-catalog.ts), sourced from the catalog JSON and documented as static reference data; no new ops-core route is added.
- The contract test, the F13 e2e, the seed-determinism assertions, and `locales/al.json` ↔ `en.json` key-count parity all stay green; any new `MESSAGE_KEYS` (e.g. validation messages for the new fields) exist in both locales.

## Data model

`Space` gains seven additive, nullable catalog-extension fields on top of the F02 model (`id`, `name`, `floor`, `kind`, `capacities`, `features[]`, `dayRateMinor`, `currency`, `setupBufferMinutes`, `teardownBufferMinutes`, `status`):

- `slug` — `String? @unique`, stable human key (e.g. `blue_hall`), the join key for `adjacent`, bundles, and the FloorMap.
- `category` — `String?`, `UPPER_SNAKE` ∈ `HALL | BOX | CORRIDOR | ATRIUM | ENTRANCE | TERRACE | TRANSITIONAL`.
- `zone` — `String?`, schematic grouping (e.g. `F0-N`, `F-1-core`).
- `isCirculation` — `Boolean?`, true when booking the space limits access/egress for its neighbours.
- `adjacent` — `String[]` (default `[]`), slugs of physically touching spaces (the circulation/bundle graph).
- `map` — `Json?`, schematic radial placement `{ floor, ring, sectorFrom?, sectorTo? }` (circulation/center spaces omit the sector range).
- `ceilingCm` — `Int?`, clear ceiling height where known (BOX/terrace spaces).

No new model; no change to `Reservation`/`ReservationAsset`. See [docs/03-data/SCHEMA.md](../../03-data/SCHEMA.md), [docs/02-domain/SPACES.md](../../02-domain/SPACES.md), and [docs/08-decisions/0013-space-catalog-extension-fields.md](../../08-decisions/0013-space-catalog-extension-fields.md).

## API surface

No new endpoints. The existing space reads/writes carry the new optional fields:

- `GET /private/spaces` — each space additionally carries `slug`/`category`/`zone`/`isCirculation`/`adjacent`/`map`/`ceilingCm` when present.
- `GET /private/spaces/:id` — same, single space.
- `POST /private/spaces` / `PATCH /private/spaces/:id` (OPS+) — accept the new fields as optional in `SpaceInput`.

`bundleTemplates` + `circulationRules` are **not** an endpoint — they ship as a frontend constant (per the locked decision).

## UI surfaces

No new page. The new `Space` fields and the `venue-catalog.ts` constant are the data substrate the F19 FloorMap ([docs/05-frontend/FLOOR_MAP.md](../../05-frontend/FLOOR_MAP.md)) and the AI bundle hints render from.

## Notes

- The catalog is the single shared source for three consumers — ops-core seed (this feature), the AI `venue_facts`/RAG (Alvin), and the FloorMap (F19): [docs/03-data/spaces.catalog.json](../../03-data/spaces.catalog.json).
- Rows 1–6 are authoritative and match `seed.ts` exactly; rows 7–19 are reasonable demo estimates (capacities/rates/buffers/adjacency are not surveyed) — preserve the distinction, do not "correct" the authoritative rows. See the catalog `$meta.caveats`.
- Additive-only contract discipline and the frontend-constant choice for bundles/circulation: [docs/08-decisions/0013-space-catalog-extension-fields.md](../../08-decisions/0013-space-catalog-extension-fields.md).
- Space inventory, capacity-by-layout, buffers (the F02 base this extends): [docs/02-domain/SPACES.md](../../02-domain/SPACES.md). Seed determinism + the planted conflict this must not disturb: [docs/06-features/F12-seed/SPEC.md](../F12-seed/SPEC.md).
- Contract/DTO/mirror alignment is enforced by the F13 contract test: [docs/04-api/TYPE_SHARING.md](../../04-api/TYPE_SHARING.md), [docs/06-features/F13-contract/SPEC.md](../F13-contract/SPEC.md).

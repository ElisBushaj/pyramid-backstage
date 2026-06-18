---
id: F07
name: Quotes
last_updated: 2026-06-19
---

# F07 — Tasks

### F07-T01 — Quote model + migration
- Status: done
- Depends on: F00-T06
- Estimate: 0.25d
- Acceptance:
  - `Quote` exists in `ops-core/prisma/schema.prisma` per `docs/03-data/SCHEMA.md`: `id, requestId, currency, lineItems (Json), netMinor (Int), vatRate (Float), vatMinor (Int), totalMinor (Int), status: QuoteStatus, version (Int), expiresAt (DateTime), createdAt`.
  - All money columns are `Int` `*Minor` (no `Float`/`Decimal` for money); `QuoteStatus` enum matches `openapi.yaml` (`DRAFT|SENT|ACCEPTED|EXPIRED`).
  - If F00-T06 already shipped the model complete this is a verification no-op; otherwise a gap-fill migration applies cleanly via `prisma migrate deploy`.

### F07-T02 — pricing engine (day-rate + assets + 20% VAT; server-computed total; integer minor units)
- Status: done
- Depends on: F07-T01, F02-T01, F03-T01
- Estimate: 0.5d
- Acceptance:
  - `src/services/pricing` builds line items from a request + reservation per `docs/02-domain/QUOTES.md`: SPACE = `dayRateMinor × days` (days = ceil of the reserved window in the venue day boundary); ASSET = each `ReservationAsset` × its rate (0 if not chargeable); SERVICE = passed-in `extraLineItems`.
  - Each line: `subtotalMinor = qty × unitPriceMinor`. Aggregate: `netMinor = Σ subtotalMinor`, `vatMinor = round(netMinor × 0.20)` (round half-up), `totalMinor = netMinor + vatMinor` — all via `utils/money.ts` on integers, no floats (per `docs/04-api/CORE_PATTERNS.md`, ADR-0004).
  - The engine never reads a client-supplied total; `vatRate` is `0.20`.
  - Unit tests cover the worked example (e.g. net 111,667 → vat 22,333 → total 134,000) and rounding-boundary cases.
  - tsc clean; vitest passing.

### F07-T03 — POST /quotes + validators
- Status: done
- Depends on: F07-T02
- Estimate: 0.5d
- Acceptance:
  - `POST /private/quotes` validates `{ requestId (required), reservationId?, extraLineItems? }` via `ValidationHelpers`: each `extraLineItem` is `{ label, qty ≥ 1, unitPriceMinor ≥ 0 }`; unknown `requestId`/`reservationId` → `404`.
  - Builds the quote via the pricing engine and persists it, returning `ServiceResponse<Quote>` (201) exactly matching the `Quote` schema (`lineItems`, `netMinor`, `vatRate`, `vatMinor`, `totalMinor`, `status: DRAFT`, `version`, `expiresAt`).
  - Writes a `quote.generate` `AuditEntry` (and the relevant `OutboxEvent` if applicable) in the same transaction with `req.actor`.
  - Controller uses `@controlledResponse`; tsc clean; vitest passing.

### F07-T04 — versioning + expiry
- Status: done
- Depends on: F07-T03
- Estimate: 0.25d
- Acceptance:
  - Regenerating a quote for the same request after a scope/pricing change produces `version + 1`; the prior version is retained (in the audit trail and/or as a superseded row) per `docs/02-domain/QUOTES.md`.
  - Each quote sets `expiresAt`; status transitions `DRAFT → SENT → ACCEPTED | EXPIRED` are guarded — an illegal move → `409 invalid_transition` with `from`/`to`.
  - An expired quote reports `status: EXPIRED` (via transition or check-on-read) and cannot be `ACCEPTED`.
  - Test: regenerate bumps the version and keeps the old one discoverable; an expired quote rejects acceptance.

### F07-T05 — quote tests (VAT math, total recompute ignores client total)
- Status: done
- Depends on: F07-T03
- Estimate: 0.25d
- Acceptance:
  - Test asserts the VAT math end-to-end through the endpoint (net → 20% vat → total) for at least the worked example and a rounding-boundary case.
  - Test plants a bogus `total`/`totalMinor` in the request body and asserts it is ignored — the response `totalMinor` is the server recomputation (`net + vat`), never the client value (per `docs/02-domain/QUOTES.md`).
  - Test asserts no float ever appears in a money field of the response (all `*Minor` are integers).
  - Integration test against real Postgres covers create-quote happy path + the `quote.generate` audit row.
  - tsc clean; runs in CI.

---
id: F07
name: Quotes
phase: Core
depends_on: [F04, F06]
status: not_started
last_updated: 2026-06-18
---

# F07 — Quotes

## Summary

A quote turns a request + its reservation into a priced, human-readable proposal. Money is the one place a rounding or trust bug becomes a legal/financial problem, so the rules are strict: every amount is integer minor units, all arithmetic goes through `utils/money.ts`, and `totalMinor` is **server-computed** (`net + vat`) — the client may submit line items but never a total. This feature ships the pricing engine (day-rate + assets + 20% VAT), the `POST /quotes` endpoint, versioning + expiry, and the money-math tests.

## Scope

### In scope
- The `Quote` model (from F00-T06) + any migration gap-fill.
- The pricing engine: SPACE line (`dayRateMinor × days`), ASSET lines (from the reserved assets), SERVICE lines (passed-in `extraLineItems`), then `net = Σ subtotals`, `vat = round(net × 0.20)`, `total = net + vat`.
- `POST /private/quotes` from `{ requestId, reservationId?, extraLineItems? }`, validated.
- Versioning (regenerate → version+1, old version stays in audit) and expiry (`status: DRAFT → SENT → ACCEPTED | EXPIRED`).
- Tests: VAT math, total recompute ignores any client-sent total.

### Out of scope
- The reservation that supplies the priced window/assets — F06.
- Sending the quote / acceptance UX — outside ops-core scope (status transitions exist; delivery does not).
- A configurable rate card per asset beyond what the contract needs — assets price from their rate (0 if not chargeable); a richer rate card is additive.

## Acceptance criteria

- `POST /private/quotes` builds line items per `docs/02-domain/QUOTES.md`: SPACE = `dayRateMinor × days` (days = ceil of the reserved window in the venue day boundary); ASSET = each reserved asset × its rate (0 if not chargeable); SERVICE = the supplied `extraLineItems`.
- `netMinor = Σ subtotalMinor`, `vatMinor = round(netMinor × 0.20)` (round half-up), `totalMinor = netMinor + vatMinor`; all via `utils/money.ts` on integers — no floats ever (per `docs/04-api/CORE_PATTERNS.md`, ADR-0004).
- `totalMinor` is always recomputed server-side; if a client submits a `total` it is ignored (a test asserts a planted bogus client total never reaches the response).
- The response is the `Quote` schema in `openapi.yaml` (`lineItems`, `netMinor`, `vatRate: 0.20`, `vatMinor`, `totalMinor`, `status`, `version`, `expiresAt`), wrapped in the envelope; currency is `ALL`.
- Regenerating after a scope/pricing change produces `version + 1`; the prior version remains in the audit trail (`quote.generate` writes an `AuditEntry`).
- A quote carries `expiresAt`; status moves `DRAFT → SENT → ACCEPTED | EXPIRED` (illegal moves → `409 invalid_transition`); an unknown `requestId`/`reservationId` → `404`.

## Data model

`Quote { id, requestId, currency, lineItems (JSON LineItem[]), netMinor (Int), vatRate (Float, 0.20), vatMinor (Int), totalMinor (Int), status: QuoteStatus, version (Int), expiresAt, createdAt }` per `docs/03-data/SCHEMA.md` and the `Quote` schema in `openapi.yaml`. Derived totals are computed and stored, never trusted from the client.

## API surface

- `POST /private/quotes` — generate a quote from a request/reservation (total server-computed) → `Quote`.

## UI surfaces

None — backend.

## Notes

- Composition, the exact money math, versioning/expiry, currency: `docs/02-domain/QUOTES.md`.
- Integer-minor-units + VAT decision: ADR-0004. Money utility + no-floats rule: `docs/04-api/CORE_PATTERNS.md`.
- Audit on generate: `docs/02-domain/AUDIT.md`.

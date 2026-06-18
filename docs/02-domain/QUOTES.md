# Domain — Quotes (money correctness)

A quote turns a request + its reservation into a priced, human-readable proposal. Money is the one place a rounding or trust bug becomes a legal/financial problem, so the rules are strict.

## Composition
`POST /quotes { requestId, reservationId?, extraLineItems? }` builds line items:
- **SPACE**: `dayRateMinor × days` (days = ceil of the reserved window in the venue's day boundary).
- **ASSET**: each reserved asset priced from its rate card (0 if not chargeable) × quantity.
- **SERVICE**: optional `extraLineItems` (catering, cleaning, extra staff) passed in.

## The math (server-computed, never client-trusted)
```
subtotalMinor = qty × unitPriceMinor          # per line
netMinor      = Σ subtotalMinor
vatMinor      = round(netMinor × vatRate)      # vatRate = 0.20 (Albania), round half-up
totalMinor    = netMinor + vatMinor
```
The client may submit line items but **never a total** — `totalMinor` is always recomputed. (Closes the PDF's example inconsistency where `total` didn't equal the shown line items.) All arithmetic via `utils/money.ts` on integers; no floats. ([ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md))

## Versioning & expiry
- A quote carries `version` and `expiresAt`. Regenerating after a pricing/scope change produces `version + 1`; the old version stays in the audit trail.
- Status: `DRAFT → SENT → ACCEPTED | EXPIRED`.

## Currency & i18n
Single currency `ALL` (Albanian Lek). Amounts are formatted for display in the frontend (`lib/money.ts`) with locale-aware grouping; the wire stays integer minor units. i18n-ready so a future EUR is additive.

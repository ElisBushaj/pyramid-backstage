# ADR-0004: Money as integer minor units, server-computed VAT

- **Status**: Accepted
- **Date**: 2026-06-18
- **Resolves**: R-03

## Context

Quotes carry money, and money is the one place a rounding error or a trust bug becomes a legal/financial problem. Two hazards in particular:

1. **Floats.** `0.1 + 0.2 !== 0.3`. Any float arithmetic on currency eventually produces a total that's a fraction of a unit off — unacceptable on an invoice.
2. **Client-supplied totals.** If the client sends `totalMinor`, a bug or a tampered request can make the displayed total disagree with the sum of its line items. The original PDF sketch had exactly this inconsistency — a `total` that didn't equal the shown lines.

The currency is **Albanian Lek (`ALL`)**, which has no subunit in practical use, and the standard Albanian VAT rate is **20%**.

## Decision

**All money is integer minor units; `Quote.totalMinor` is server-computed; clients never send totals.**

- Every monetary value lives in a `*Minor` integer field. For `ALL` the minor-unit factor is **1** (1 Lek = 1 minor unit) — but the integer discipline holds regardless: **no float ever touches money.** All arithmetic goes through `utils/money.ts`.
- The quote math is fixed and server-side ([docs/02-domain/QUOTES.md](../02-domain/QUOTES.md)):
  ```
  subtotalMinor = qty × unitPriceMinor          # per line
  netMinor      = Σ subtotalMinor
  vatRate       = 0.20                            # Albania standard VAT
  vatMinor      = round(netMinor × vatRate)       # round half-up, integer result
  totalMinor    = netMinor + vatMinor
  ```
- The client **may submit line items** (e.g. SERVICE lines for catering or cleaning) but **never a total**. If a `totalMinor` is sent, it is ignored and recomputed. `Quote.totalMinor` in [`openapi.yaml`](../../ops-core/openapi.yaml) is documented as `SERVER-COMPUTED`.
- `currency` is a single-value enum (`ALL`) on the wire; display formatting (locale grouping) is a frontend concern (`lib/money.ts`). The store and the wire stay integer minor units.

## Consequences

- **Totals are always internally consistent.** `total = net + vat` by construction; the displayed total cannot disagree with the line items because the server derives it from them.
- **No rounding drift.** Integer arithmetic with a single explicit `round` step at VAT is exact and auditable.
- **VAT is one knob.** `vatRate = 0.20` is the Albanian default (logged as an assumption, flagged as Q-03 for the real rate card). A future change is a single constant; `vatRate` is carried on the `Quote` so historical quotes keep their rate.
- **i18n-ready, EUR-additive.** A second currency is an additive change (a new enum value + a factor); nothing about the integer-minor discipline has to change.
- **Quotes version, not mutate.** Regenerating after a scope change produces `version + 1`; the prior version stays in the audit trail, so the server-computed total is reproducible.

## Alternatives considered

- **Floating-point money (`number` in Lek).** Rejected outright: float currency arithmetic is wrong eventually, and "eventually" is on an invoice.
- **Decimal/BigDecimal type.** Overkill for a zero-subunit currency; integer minor units are simpler, faster, and exact here. The `*Minor` discipline already generalizes to subunit currencies.
- **Client-computed totals (trust the client).** Rejected: the line-items-vs-total inconsistency is exactly the bug this closes. The server owns the math.
- **Storing VAT as a derived display value only (not persisted).** Rejected: `vatMinor` and `vatRate` are persisted on the `Quote` so a quote is fully reproducible and auditable without re-deriving it against a possibly-changed rate.

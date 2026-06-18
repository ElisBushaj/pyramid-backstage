import { computeTotals, lineItem, type LineItem } from "../../utils/money";
import { billableDays } from "../../utils/time";

export interface PricingInput {
  space?: { name: string; dayRateMinor: number } | null;
  reservation?: { start: Date; end: Date; assets: Array<{ assetId: string; quantity: number }> } | null;
  /** assetId → { name, unitPriceMinor }. Assets default to 0 (free) per Q-03. */
  assetRates?: Map<string, { name: string; unitPriceMinor: number }>;
  extraLineItems?: Array<{ label: string; qty: number; unitPriceMinor: number }>;
  vatRate: number;
}

export interface PricedQuote {
  lineItems: LineItem[];
  netMinor: number;
  vatRate: number;
  vatMinor: number;
  totalMinor: number;
}

/**
 * Build line items + server-computed totals (QUOTES.md, ADR-0004):
 *   SPACE  = dayRateMinor × billable days
 *   ASSET  = quantity × unit rate (0 unless a rate card sets one)
 *   SERVICE = passed-in extraLineItems
 * net = Σ subtotals; vat = round(net × vatRate); total = net + vat. Integer
 * minor units throughout — no floats, and the client never supplies a total.
 */
export function priceQuote(input: PricingInput): PricedQuote {
  const items: LineItem[] = [];

  if (input.space && input.reservation) {
    const days = billableDays(input.reservation.start, input.reservation.end);
    items.push(lineItem(`${input.space.name} (${days} day${days > 1 ? "s" : ""})`, "SPACE", days, input.space.dayRateMinor));
  }

  if (input.reservation) {
    for (const a of input.reservation.assets) {
      const rate = input.assetRates?.get(a.assetId);
      items.push(lineItem(rate?.name ?? "Asset", "ASSET", a.quantity, rate?.unitPriceMinor ?? 0));
    }
  }

  for (const e of input.extraLineItems ?? []) {
    items.push(lineItem(e.label, "SERVICE", e.qty, e.unitPriceMinor));
  }

  const totals = computeTotals(items, input.vatRate);
  return { lineItems: items, vatRate: input.vatRate, ...totals };
}

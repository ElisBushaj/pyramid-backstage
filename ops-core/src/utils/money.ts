/**
 * Money is integer minor units. ALL (Albanian Lek) has no subunit in practice
 * (factor 1), but the integer discipline holds regardless — no floats ever.
 */

export const VAT_RATE_DEFAULT = 0.2;

export interface LineItem {
  label: string;
  kind: "SPACE" | "ASSET" | "SERVICE";
  qty: number;
  unitPriceMinor: number;
  subtotalMinor: number;
}

export function lineItem(
  label: string,
  kind: LineItem["kind"],
  qty: number,
  unitPriceMinor: number,
): LineItem {
  return { label, kind, qty, unitPriceMinor, subtotalMinor: qty * unitPriceMinor };
}

/** Round half-up to a whole minor unit. */
export function roundMinor(n: number): number {
  return Math.round(n);
}

/** Server-computed totals: net = Σ subtotals, vat = round(net*rate), total = net+vat. */
export function computeTotals(
  items: LineItem[],
  vatRate = VAT_RATE_DEFAULT,
): { netMinor: number; vatMinor: number; totalMinor: number } {
  const netMinor = items.reduce((s, i) => s + i.subtotalMinor, 0);
  const vatMinor = roundMinor(netMinor * vatRate);
  return { netMinor, vatMinor, totalMinor: netMinor + vatMinor };
}

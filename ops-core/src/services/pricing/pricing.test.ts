import { describe, it, expect } from "vitest";
import { priceQuote } from "./index";

const d = (s: string) => new Date(s);

describe("pricing engine — server-computed VAT (F07-T02)", () => {
  it("computes the worked example: net 111,667 → vat 22,333 → total 134,000", () => {
    const priced = priceQuote({
      space: { name: "Blue Hall", dayRateMinor: 80000 },
      reservation: { start: d("2026-07-22T09:00:00Z"), end: d("2026-07-22T18:00:00Z"), assets: [] },
      extraLineItems: [{ label: "Catering", qty: 1, unitPriceMinor: 31667 }],
      vatRate: 0.2,
    });
    expect(priced.netMinor).toBe(111667);
    expect(priced.vatMinor).toBe(22333); // round(111667 * 0.2) = round(22333.4)
    expect(priced.totalMinor).toBe(134000);
    expect(priced.lineItems[0]).toMatchObject({ kind: "SPACE", qty: 1, unitPriceMinor: 80000, subtotalMinor: 80000 });
  });

  it("bills multi-day windows by ceil days and keeps all money integer", () => {
    const priced = priceQuote({
      space: { name: "Green Hall", dayRateMinor: 55000 },
      reservation: { start: d("2026-07-22T09:00:00Z"), end: d("2026-07-24T12:00:00Z"), assets: [] }, // ~2.1 days → 3
      vatRate: 0.2,
    });
    expect(priced.lineItems[0]!.qty).toBe(3);
    expect(priced.netMinor).toBe(165000);
    expect(priced.vatMinor).toBe(33000);
    expect(priced.totalMinor).toBe(198000);
    for (const li of priced.lineItems) expect(Number.isInteger(li.subtotalMinor)).toBe(true);
  });

  it("rounds VAT half-up at a boundary", () => {
    // net 10 → vat round(2.0)=2 ; net 15 → round(3.0)=3 ; net 13 → round(2.6)=3
    const p = priceQuote({ extraLineItems: [{ label: "x", qty: 1, unitPriceMinor: 13 }], vatRate: 0.2 });
    expect(p.netMinor).toBe(13);
    expect(p.vatMinor).toBe(3);
    expect(p.totalMinor).toBe(16);
  });

  it("prices reserved assets at 0 by default (free unless a rate card sets one)", () => {
    const priced = priceQuote({
      space: { name: "Hall", dayRateMinor: 50000 },
      reservation: { start: d("2026-07-22T09:00:00Z"), end: d("2026-07-22T18:00:00Z"), assets: [{ assetId: "a1", quantity: 200 }] },
      assetRates: new Map([["a1", { name: "Standard chair", unitPriceMinor: 0 }]]),
      vatRate: 0.2,
    });
    const assetLine = priced.lineItems.find((l) => l.kind === "ASSET");
    expect(assetLine).toMatchObject({ qty: 200, unitPriceMinor: 0, subtotalMinor: 0 });
    expect(priced.netMinor).toBe(50000);
  });
});

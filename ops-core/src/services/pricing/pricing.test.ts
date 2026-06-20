import { describe, it, expect } from "vitest";
import { priceQuote } from "./index";
import type { LineItem } from "../../utils/money";

const d = (s: string) => new Date(s);
const DAY = 86_400_000;

/** Every money field on the priced quote (totals + every line subtotal) must be an integer. */
function assertAllIntegerMoney(priced: { netMinor: number; vatMinor: number; totalMinor: number; lineItems: LineItem[] }) {
  expect(Number.isInteger(priced.netMinor)).toBe(true);
  expect(Number.isInteger(priced.vatMinor)).toBe(true);
  expect(Number.isInteger(priced.totalMinor)).toBe(true);
  for (const li of priced.lineItems) {
    expect(Number.isInteger(li.qty)).toBe(true);
    expect(Number.isInteger(li.unitPriceMinor)).toBe(true);
    expect(Number.isInteger(li.subtotalMinor)).toBe(true);
  }
}

describe("pricing engine — worked example & totals (F07-T02)", () => {
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
    expect(priced.vatRate).toBe(0.2);
    expect(priced.lineItems[0]).toMatchObject({ kind: "SPACE", qty: 1, unitPriceMinor: 80000, subtotalMinor: 80000 });
    assertAllIntegerMoney(priced);
  });

  it("net = Σ subtotals; total = net + vat (identity holds across a mixed quote)", () => {
    const priced = priceQuote({
      space: { name: "Hall", dayRateMinor: 70000 },
      reservation: {
        start: d("2026-07-22T00:00:00Z"),
        end: d("2026-07-24T12:00:00Z"), // 2.5 days → 3
        assets: [{ assetId: "mic", quantity: 4 }],
      },
      assetRates: new Map([["mic", { name: "Microphone", unitPriceMinor: 1500 }]]),
      extraLineItems: [
        { label: "Catering", qty: 100, unitPriceMinor: 800 },
        { label: "Cleaning", qty: 1, unitPriceMinor: 12345 },
      ],
      vatRate: 0.2,
    });
    const sumOfSubtotals = priced.lineItems.reduce((s, l) => s + l.subtotalMinor, 0);
    expect(priced.netMinor).toBe(sumOfSubtotals);
    expect(priced.totalMinor).toBe(priced.netMinor + priced.vatMinor);
    // 3*70000 + 4*1500 + 100*800 + 12345 = 210000+6000+80000+12345 = 308345
    expect(priced.netMinor).toBe(308345);
    expect(priced.vatMinor).toBe(Math.round(308345 * 0.2)); // round(61669) = 61669
    assertAllIntegerMoney(priced);
  });

  it("empty quote (no space, no reservation, no extras) → net 0, vat 0, total 0, no lines", () => {
    const priced = priceQuote({ vatRate: 0.2 });
    expect(priced.lineItems).toEqual([]);
    expect(priced).toMatchObject({ netMinor: 0, vatMinor: 0, totalMinor: 0, vatRate: 0.2 });
    assertAllIntegerMoney(priced);
  });
});

describe("pricing engine — SPACE line = dayRateMinor × billableDays (F07-T02)", () => {
  it("sub-day window bills exactly 1 day (min 1)", () => {
    const p = priceQuote({
      space: { name: "H", dayRateMinor: 50000 },
      reservation: { start: d("2026-07-22T09:00:00Z"), end: d("2026-07-22T18:00:00Z"), assets: [] }, // 9h
      vatRate: 0.2,
    });
    expect(p.lineItems[0]).toMatchObject({ kind: "SPACE", qty: 1, subtotalMinor: 50000 });
  });

  it("exactly 24h bills 1 day; 24h + 1ms tips into 2 days (ceil boundary)", () => {
    const exact = priceQuote({
      space: { name: "H", dayRateMinor: 50000 },
      reservation: { start: d("2026-07-22T00:00:00.000Z"), end: d("2026-07-23T00:00:00.000Z"), assets: [] },
      vatRate: 0.2,
    });
    expect(exact.lineItems[0]!.qty).toBe(1);

    const overByOneMs = priceQuote({
      space: { name: "H", dayRateMinor: 50000 },
      reservation: { start: d("2026-07-22T00:00:00.000Z"), end: new Date(d("2026-07-23T00:00:00.000Z").getTime() + 1), assets: [] },
      vatRate: 0.2,
    });
    expect(overByOneMs.lineItems[0]!.qty).toBe(2);
  });

  it("exactly 48h bills 2 days (boundary not 3)", () => {
    const p = priceQuote({
      space: { name: "H", dayRateMinor: 50000 },
      reservation: { start: d("2026-07-22T00:00:00.000Z"), end: new Date(d("2026-07-22T00:00:00.000Z").getTime() + 2 * DAY), assets: [] },
      vatRate: 0.2,
    });
    expect(p.lineItems[0]!.qty).toBe(2);
  });

  it("multi-day partial window ceils up (2.1 days → 3)", () => {
    const p = priceQuote({
      space: { name: "Green Hall", dayRateMinor: 55000 },
      reservation: { start: d("2026-07-22T09:00:00Z"), end: d("2026-07-24T12:00:00Z"), assets: [] }, // ~2.1 days
      vatRate: 0.2,
    });
    expect(p.lineItems[0]!.qty).toBe(3);
    expect(p.netMinor).toBe(165000);
  });

  it("zero-length window (start == end) still bills the 1-day minimum", () => {
    const p = priceQuote({
      space: { name: "H", dayRateMinor: 50000 },
      reservation: { start: d("2026-07-22T09:00:00Z"), end: d("2026-07-22T09:00:00Z"), assets: [] },
      vatRate: 0.2,
    });
    expect(p.lineItems[0]!.qty).toBe(1);
  });

  it("pluralizes the SPACE label by day count", () => {
    const one = priceQuote({ space: { name: "Blue", dayRateMinor: 1 }, reservation: { start: d("2026-07-22T00:00:00Z"), end: d("2026-07-22T06:00:00Z"), assets: [] }, vatRate: 0.2 });
    const many = priceQuote({ space: { name: "Blue", dayRateMinor: 1 }, reservation: { start: d("2026-07-22T00:00:00Z"), end: d("2026-07-25T00:00:00Z"), assets: [] }, vatRate: 0.2 });
    expect(one.lineItems[0]!.label).toContain("1 day");
    expect(one.lineItems[0]!.label).not.toContain("days");
    expect(many.lineItems[0]!.label).toContain("3 days");
  });

  it("no SPACE line when there is no reservation (even if a space is supplied)", () => {
    const p = priceQuote({ space: { name: "H", dayRateMinor: 50000 }, vatRate: 0.2 });
    expect(p.lineItems.find((l) => l.kind === "SPACE")).toBeUndefined();
    expect(p.netMinor).toBe(0);
  });

  it("no SPACE line when there is no space (reservation only)", () => {
    const p = priceQuote({
      reservation: { start: d("2026-07-22T00:00:00Z"), end: d("2026-07-23T00:00:00Z"), assets: [] },
      vatRate: 0.2,
    });
    expect(p.lineItems.find((l) => l.kind === "SPACE")).toBeUndefined();
    expect(p.netMinor).toBe(0);
  });
});

describe("pricing engine — ASSET lines = qty × unitRate, default free Q-03 (F07-T02)", () => {
  it("prices reserved assets at 0 by default (free unless a rate card sets one)", () => {
    const priced = priceQuote({
      space: { name: "Hall", dayRateMinor: 50000 },
      reservation: { start: d("2026-07-22T09:00:00Z"), end: d("2026-07-22T18:00:00Z"), assets: [{ assetId: "a1", quantity: 200 }] },
      assetRates: new Map([["a1", { name: "Standard chair", unitPriceMinor: 0 }]]),
      vatRate: 0.2,
    });
    const assetLine = priced.lineItems.find((l) => l.kind === "ASSET");
    expect(assetLine).toMatchObject({ qty: 200, unitPriceMinor: 0, subtotalMinor: 0, label: "Standard chair" });
    expect(priced.netMinor).toBe(50000);
  });

  it("an asset with NO rate-card entry falls back to qty × 0 and a default label", () => {
    const priced = priceQuote({
      reservation: { start: d("2026-07-22T09:00:00Z"), end: d("2026-07-22T18:00:00Z"), assets: [{ assetId: "ghost", quantity: 9 }] },
      vatRate: 0.2,
    });
    const line = priced.lineItems.find((l) => l.kind === "ASSET")!;
    expect(line).toMatchObject({ qty: 9, unitPriceMinor: 0, subtotalMinor: 0, label: "Asset" });
    expect(priced.netMinor).toBe(0);
  });

  it("charges a chargeable asset at qty × its rate", () => {
    const priced = priceQuote({
      reservation: { start: d("2026-07-22T09:00:00Z"), end: d("2026-07-22T18:00:00Z"), assets: [{ assetId: "proj", quantity: 3 }] },
      assetRates: new Map([["proj", { name: "Projector", unitPriceMinor: 4500 }]]),
      vatRate: 0.2,
    });
    const line = priced.lineItems.find((l) => l.kind === "ASSET")!;
    expect(line).toMatchObject({ qty: 3, unitPriceMinor: 4500, subtotalMinor: 13500 });
    expect(priced.netMinor).toBe(13500);
  });

  it("emits one ASSET line per reserved asset, preserving order", () => {
    const priced = priceQuote({
      reservation: {
        start: d("2026-07-22T09:00:00Z"),
        end: d("2026-07-22T18:00:00Z"),
        assets: [
          { assetId: "a", quantity: 2 },
          { assetId: "b", quantity: 5 },
        ],
      },
      assetRates: new Map([
        ["a", { name: "Mic", unitPriceMinor: 1000 }],
        ["b", { name: "Light", unitPriceMinor: 200 }],
      ]),
      vatRate: 0.2,
    });
    const assetLines = priced.lineItems.filter((l) => l.kind === "ASSET");
    expect(assetLines).toHaveLength(2);
    expect(assetLines[0]).toMatchObject({ label: "Mic", subtotalMinor: 2000 });
    expect(assetLines[1]).toMatchObject({ label: "Light", subtotalMinor: 1000 });
    expect(priced.netMinor).toBe(3000);
  });
});

describe("pricing engine — SERVICE lines from extraLineItems (F07-T02)", () => {
  it("appends each extra line item as a SERVICE line and folds it into net", () => {
    const priced = priceQuote({
      extraLineItems: [
        { label: "Catering", qty: 50, unitPriceMinor: 600 },
        { label: "Extra staff", qty: 3, unitPriceMinor: 9000 },
      ],
      vatRate: 0.2,
    });
    const svc = priced.lineItems.filter((l) => l.kind === "SERVICE");
    expect(svc).toHaveLength(2);
    expect(svc[0]).toMatchObject({ label: "Catering", qty: 50, unitPriceMinor: 600, subtotalMinor: 30000 });
    expect(svc[1]).toMatchObject({ label: "Extra staff", subtotalMinor: 27000 });
    expect(priced.netMinor).toBe(57000);
  });

  it("treats undefined / empty extraLineItems as no SERVICE lines", () => {
    expect(priceQuote({ vatRate: 0.2 }).lineItems.filter((l) => l.kind === "SERVICE")).toHaveLength(0);
    expect(priceQuote({ extraLineItems: [], vatRate: 0.2 }).lineItems.filter((l) => l.kind === "SERVICE")).toHaveLength(0);
  });
});

describe("pricing engine — VAT rounding & no-float discipline (F07-T02/T05)", () => {
  it("rounds VAT (net 13 → round(2.6) = 3)", () => {
    const p = priceQuote({ extraLineItems: [{ label: "x", qty: 1, unitPriceMinor: 13 }], vatRate: 0.2 });
    expect(p.netMinor).toBe(13);
    expect(p.vatMinor).toBe(3);
    expect(p.totalMinor).toBe(16);
    assertAllIntegerMoney(p);
  });

  it("rounds VAT down when the fraction is below .5 (net 12 → round(2.4) = 2)", () => {
    const p = priceQuote({ extraLineItems: [{ label: "x", qty: 1, unitPriceMinor: 12 }], vatRate: 0.2 });
    expect(p.vatMinor).toBe(2);
    expect(p.totalMinor).toBe(14);
  });

  it("rounds an exact .5 VAT boundary HALF-UP (rate 0.5: net 1 → 0.5 → 1, net 3 → 1.5 → 2)", () => {
    // 0.2 can never produce an exact .5 fraction on an integer net, so we prove
    // the half-up rule through the rate the engine threads through unchanged.
    const half1 = priceQuote({ extraLineItems: [{ label: "x", qty: 1, unitPriceMinor: 1 }], vatRate: 0.5 });
    expect(half1.vatMinor).toBe(1); // round(0.5) → 1
    expect(half1.totalMinor).toBe(2);

    const half3 = priceQuote({ extraLineItems: [{ label: "x", qty: 1, unitPriceMinor: 3 }], vatRate: 0.5 });
    expect(half3.vatMinor).toBe(2); // round(1.5) → 2
    expect(half3.totalMinor).toBe(5);
  });

  it("keeps every money field integer even when VAT has a long IEEE-754 tail (net 17 → 3.4000…04 → 3)", () => {
    const p = priceQuote({ extraLineItems: [{ label: "x", qty: 1, unitPriceMinor: 17 }], vatRate: 0.2 });
    expect(p.vatMinor).toBe(3);
    assertAllIntegerMoney(p);
  });

  it("handles a large net without losing integer precision (1,000,003 → vat 200,001)", () => {
    const p = priceQuote({ extraLineItems: [{ label: "x", qty: 1, unitPriceMinor: 1_000_003 }], vatRate: 0.2 });
    expect(p.netMinor).toBe(1_000_003);
    expect(p.vatMinor).toBe(200_001); // round(200000.6)
    expect(p.totalMinor).toBe(1_200_004);
    assertAllIntegerMoney(p);
  });

  it("echoes the supplied vatRate on the priced quote (rate is threaded, not hard-coded)", () => {
    expect(priceQuote({ vatRate: 0.2 }).vatRate).toBe(0.2);
    expect(priceQuote({ vatRate: 0 }).vatRate).toBe(0);
    const zeroRate = priceQuote({ extraLineItems: [{ label: "x", qty: 1, unitPriceMinor: 999 }], vatRate: 0 });
    expect(zeroRate.vatMinor).toBe(0);
    expect(zeroRate.totalMinor).toBe(999);
  });
});

describe("pricing engine — full composition SPACE + ASSET + SERVICE (F07-T02)", () => {
  it("emits lines in SPACE → ASSET → SERVICE order and sums them all", () => {
    const priced = priceQuote({
      space: { name: "Blue Hall", dayRateMinor: 80000 },
      reservation: {
        start: d("2026-07-22T09:00:00Z"),
        end: d("2026-07-23T18:00:00Z"), // ~1.4 days → 2
        assets: [{ assetId: "proj", quantity: 1 }],
      },
      assetRates: new Map([["proj", { name: "Projector", unitPriceMinor: 4500 }]]),
      extraLineItems: [{ label: "Catering", qty: 1, unitPriceMinor: 31667 }],
      vatRate: 0.2,
    });
    expect(priced.lineItems.map((l) => l.kind)).toEqual(["SPACE", "ASSET", "SERVICE"]);
    // 2*80000 + 1*4500 + 31667 = 160000 + 4500 + 31667 = 196167
    expect(priced.netMinor).toBe(196167);
    expect(priced.vatMinor).toBe(Math.round(196167 * 0.2)); // round(39233.4) = 39233
    expect(priced.totalMinor).toBe(196167 + 39233);
    assertAllIntegerMoney(priced);
  });
});

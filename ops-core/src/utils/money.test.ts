import { describe, it, expect } from "vitest";
import { roundMinor, computeTotals, lineItem, VAT_RATE_DEFAULT, type LineItem } from "./money";

/**
 * Money invariants (CORE_PATTERNS §"Money & time"): everything is integer minor
 * units, arithmetic only through these helpers, no float ever surfaces. These
 * tests pin half-up rounding, the net/vat/total relationship, and the line-item
 * subtotal so a refactor can't silently introduce a fractional Lek.
 */

const isInteger = (n: number) => Number.isInteger(n);

describe("VAT_RATE_DEFAULT", () => {
  it("is the locked 20% default", () => {
    expect(VAT_RATE_DEFAULT).toBe(0.2);
  });
});

describe("roundMinor (Math.round, ties toward +∞)", () => {
  it("leaves a whole number unchanged", () => {
    expect(roundMinor(100)).toBe(100);
    expect(roundMinor(0)).toBe(0);
  });

  it("rounds a .5 tie up toward +∞ (half-up)", () => {
    expect(roundMinor(0.5)).toBe(1);
    expect(roundMinor(2.5)).toBe(3);
    expect(roundMinor(99.5)).toBe(100);
  });

  it("rounds below .5 down and above .5 up", () => {
    expect(roundMinor(2.49)).toBe(2);
    expect(roundMinor(2.5001)).toBe(3);
    expect(roundMinor(2.99)).toBe(3);
  });

  it("always returns an integer", () => {
    for (const n of [0.1, 1.4999, 1234.50001, 7.5, 19999.999]) {
      expect(isInteger(roundMinor(n))).toBe(true);
    }
  });
});

describe("lineItem factory", () => {
  it("computes subtotalMinor = qty × unitPriceMinor", () => {
    const li = lineItem("Blue Hall", "SPACE", 2, 80_000);
    expect(li).toEqual({ label: "Blue Hall", kind: "SPACE", qty: 2, unitPriceMinor: 80_000, subtotalMinor: 160_000 });
  });

  it("handles qty 0 → zero subtotal and qty 1 → passthrough", () => {
    expect(lineItem("x", "SERVICE", 0, 5000).subtotalMinor).toBe(0);
    expect(lineItem("x", "ASSET", 1, 5000).subtotalMinor).toBe(5000);
  });

  it("preserves the kind discriminant for each variant", () => {
    expect(lineItem("a", "SPACE", 1, 1).kind).toBe("SPACE");
    expect(lineItem("a", "ASSET", 1, 1).kind).toBe("ASSET");
    expect(lineItem("a", "SERVICE", 1, 1).kind).toBe("SERVICE");
  });

  it("keeps an integer subtotal for integer inputs", () => {
    expect(isInteger(lineItem("a", "ASSET", 37, 1299).subtotalMinor)).toBe(true);
  });
});

describe("computeTotals", () => {
  it("net = Σ subtotals, vat = round(net×rate), total = net+vat at the default rate", () => {
    const items: LineItem[] = [
      lineItem("Hall", "SPACE", 1, 80_000),
      lineItem("Chairs", "ASSET", 100, 200),
    ];
    // net = 80_000 + 20_000 = 100_000; vat = 0.2*100_000 = 20_000; total = 120_000
    expect(computeTotals(items)).toEqual({ netMinor: 100_000, vatMinor: 20_000, totalMinor: 120_000 });
  });

  it("empty items → all zeros", () => {
    expect(computeTotals([])).toEqual({ netMinor: 0, vatMinor: 0, totalMinor: 0 });
  });

  it("rounds the VAT half-up when net×rate is fractional", () => {
    // net 12345, rate 0.2 → 2469.0 (exact). Pick a net where ×0.2 has a .5 tie:
    // net = 2997 → 599.4 → 599 (down). net = 3 → 0.6 → 1 (up). net = 2 → 0.4 → 0 (down).
    expect(computeTotals([lineItem("a", "SERVICE", 1, 2997)]).vatMinor).toBe(599);
    expect(computeTotals([lineItem("a", "SERVICE", 1, 3)]).vatMinor).toBe(1);
    expect(computeTotals([lineItem("a", "SERVICE", 1, 2)]).vatMinor).toBe(0);
  });

  it("hits a genuine .5 VAT tie and rounds up (half-up)", () => {
    // net such that net*rate ends in .5: rate 0.5, net 3 → 1.5 → 2
    expect(computeTotals([lineItem("a", "SERVICE", 1, 3)], 0.5).vatMinor).toBe(2);
  });

  it("honours a custom VAT rate", () => {
    const items = [lineItem("a", "SPACE", 1, 100_000)];
    expect(computeTotals(items, 0.1)).toEqual({ netMinor: 100_000, vatMinor: 10_000, totalMinor: 110_000 });
  });

  it("a zero VAT rate yields vat 0 and total == net", () => {
    const items = [lineItem("a", "SPACE", 1, 100_000)];
    expect(computeTotals(items, 0)).toEqual({ netMinor: 100_000, vatMinor: 0, totalMinor: 100_000 });
  });

  it("produces only integers (no float leaks) for arbitrary integer inputs", () => {
    const items = [
      lineItem("a", "SPACE", 3, 79_999),
      lineItem("b", "ASSET", 17, 1_333),
      lineItem("c", "SERVICE", 1, 49_999),
    ];
    const t = computeTotals(items);
    expect(isInteger(t.netMinor)).toBe(true);
    expect(isInteger(t.vatMinor)).toBe(true);
    expect(isInteger(t.totalMinor)).toBe(true);
    expect(t.totalMinor).toBe(t.netMinor + t.vatMinor);
  });

  it("net is the exact sum of the line subtotals", () => {
    const items = [
      lineItem("a", "SPACE", 2, 40_000),
      lineItem("b", "ASSET", 5, 1_000),
      lineItem("c", "SERVICE", 1, 9_500),
    ];
    expect(computeTotals(items).netMinor).toBe(80_000 + 5_000 + 9_500);
  });
});

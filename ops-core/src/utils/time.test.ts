import { describe, it, expect } from "vitest";
import { overlaps, effectiveWindow, billableDays, isValidRange, toIso } from "./time";

const d = (s: string) => new Date(s);

/**
 * Time invariants (CORE_PATTERNS §"Money & time"): half-open overlap, buffer
 * padding, ceil-based billing. This is the math that prevents double-bookings,
 * so every boundary (touching, 1ms, containment) is pinned.
 */

describe("overlaps (half-open [start,end))", () => {
  it("touching windows do NOT overlap (A ends exactly when B starts)", () => {
    expect(
      overlaps({ start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T14:00:00Z") },
               { start: d("2026-07-22T14:00:00Z"), end: d("2026-07-22T18:00:00Z") }),
    ).toBe(false);
  });

  it("touching the OTHER way round (B ends exactly when A starts) → false", () => {
    expect(
      overlaps({ start: d("2026-07-22T14:00:00Z"), end: d("2026-07-22T18:00:00Z") },
               { start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T14:00:00Z") }),
    ).toBe(false);
  });

  it("a 1ms overlap counts as overlapping", () => {
    expect(
      overlaps({ start: d("2026-07-22T10:00:00.000Z"), end: d("2026-07-22T14:00:00.001Z") },
               { start: d("2026-07-22T14:00:00.000Z"), end: d("2026-07-22T18:00:00.000Z") }),
    ).toBe(true);
  });

  it("genuinely overlapping windows overlap", () => {
    expect(
      overlaps({ start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T15:00:00Z") },
               { start: d("2026-07-22T14:00:00Z"), end: d("2026-07-22T18:00:00Z") }),
    ).toBe(true);
  });

  it("full containment (B inside A) overlaps", () => {
    expect(
      overlaps({ start: d("2026-07-22T08:00:00Z"), end: d("2026-07-22T20:00:00Z") },
               { start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T12:00:00Z") }),
    ).toBe(true);
  });

  it("full containment (A inside B) overlaps — symmetric", () => {
    expect(
      overlaps({ start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T12:00:00Z") },
               { start: d("2026-07-22T08:00:00Z"), end: d("2026-07-22T20:00:00Z") }),
    ).toBe(true);
  });

  it("identical windows overlap", () => {
    const w = { start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T14:00:00Z") };
    expect(overlaps(w, { ...w })).toBe(true);
  });

  it("disjoint windows (a gap between them) do not overlap", () => {
    expect(
      overlaps({ start: d("2026-07-22T08:00:00Z"), end: d("2026-07-22T10:00:00Z") },
               { start: d("2026-07-22T12:00:00Z"), end: d("2026-07-22T14:00:00Z") }),
    ).toBe(false);
  });

  it("is symmetric for an overlapping pair", () => {
    const a = { start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T15:00:00Z") };
    const b = { start: d("2026-07-22T14:00:00Z"), end: d("2026-07-22T18:00:00Z") };
    expect(overlaps(a, b)).toBe(overlaps(b, a));
  });
});

describe("effectiveWindow (pads by setup/teardown minutes)", () => {
  it("subtracts setup from start and adds teardown to end", () => {
    const w = effectiveWindow(d("2026-07-22T10:00:00Z"), d("2026-07-22T14:00:00Z"), 240, 120);
    expect(toIso(w.start)).toBe("2026-07-22T06:00:00.000Z"); // -4h
    expect(toIso(w.end)).toBe("2026-07-22T16:00:00.000Z"); // +2h
  });

  it("zero buffers leave the window unchanged", () => {
    const start = d("2026-07-22T10:00:00Z");
    const end = d("2026-07-22T14:00:00Z");
    const w = effectiveWindow(start, end, 0, 0);
    expect(w.start.getTime()).toBe(start.getTime());
    expect(w.end.getTime()).toBe(end.getTime());
  });

  it("does not mutate the input Date objects", () => {
    const start = d("2026-07-22T10:00:00Z");
    const end = d("2026-07-22T14:00:00Z");
    effectiveWindow(start, end, 240, 120);
    expect(toIso(start)).toBe("2026-07-22T10:00:00.000Z");
    expect(toIso(end)).toBe("2026-07-22T14:00:00.000Z");
  });

  it("turns two back-to-back events into a conflict once buffers apply", () => {
    // A 10–14, B 14–18: no raw overlap, but A's 2h teardown + B's 2h setup collide.
    const a = effectiveWindow(d("2026-07-22T10:00:00Z"), d("2026-07-22T14:00:00Z"), 120, 120);
    const b = effectiveWindow(d("2026-07-22T14:00:00Z"), d("2026-07-22T18:00:00Z"), 120, 120);
    expect(overlaps(a, b)).toBe(true);
  });

  it("converts minutes to ms correctly (1 minute = 60_000 ms)", () => {
    const w = effectiveWindow(d("2026-07-22T10:00:00Z"), d("2026-07-22T10:30:00Z"), 1, 1);
    expect(toIso(w.start)).toBe("2026-07-22T09:59:00.000Z");
    expect(toIso(w.end)).toBe("2026-07-22T10:31:00.000Z");
  });
});

describe("billableDays (ceil, minimum 1)", () => {
  it("a single-day window bills 1 day", () => {
    expect(billableDays(d("2026-07-22T09:00:00Z"), d("2026-07-22T18:00:00Z"))).toBe(1);
  });

  it("exactly 24h bills 1 day", () => {
    expect(billableDays(d("2026-07-22T00:00:00Z"), d("2026-07-23T00:00:00Z"))).toBe(1);
  });

  it("24h + 1ms rolls into a 2nd day (ceil)", () => {
    expect(billableDays(d("2026-07-22T00:00:00.000Z"), d("2026-07-23T00:00:00.001Z"))).toBe(2);
  });

  it("48h bills 2 days; 48h + 1ms bills 3 (ceil boundary)", () => {
    expect(billableDays(d("2026-07-22T00:00:00Z"), d("2026-07-24T00:00:00Z"))).toBe(2);
    expect(billableDays(d("2026-07-22T00:00:00.000Z"), d("2026-07-24T00:00:00.001Z"))).toBe(3);
  });

  it("clamps to a minimum of 1 for a zero-length window", () => {
    expect(billableDays(d("2026-07-22T10:00:00Z"), d("2026-07-22T10:00:00Z"))).toBe(1);
  });

  it("clamps to 1 even for a negative (end before start) window", () => {
    expect(billableDays(d("2026-07-22T18:00:00Z"), d("2026-07-22T09:00:00Z"))).toBe(1);
  });
});

describe("isValidRange (start strictly before end)", () => {
  it("true when start < end", () => {
    expect(isValidRange(d("2026-07-22T09:00:00Z"), d("2026-07-22T18:00:00Z"))).toBe(true);
  });

  it("false when start == end (zero-length is not a valid range)", () => {
    expect(isValidRange(d("2026-07-22T09:00:00Z"), d("2026-07-22T09:00:00Z"))).toBe(false);
  });

  it("false when start > end", () => {
    expect(isValidRange(d("2026-07-22T18:00:00Z"), d("2026-07-22T09:00:00Z"))).toBe(false);
  });

  it("true for a 1ms-positive range (strict boundary)", () => {
    expect(isValidRange(d("2026-07-22T09:00:00.000Z"), d("2026-07-22T09:00:00.001Z"))).toBe(true);
  });
});

describe("toIso", () => {
  it("renders a Date as a UTC ISO-8601 string with millis", () => {
    expect(toIso(d("2026-07-22T09:00:00Z"))).toBe("2026-07-22T09:00:00.000Z");
  });

  it("normalises a non-UTC offset to Z (UTC-canonical)", () => {
    expect(toIso(new Date("2026-07-22T11:00:00+02:00"))).toBe("2026-07-22T09:00:00.000Z");
  });
});

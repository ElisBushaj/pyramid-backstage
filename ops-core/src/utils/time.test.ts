import { describe, it, expect } from "vitest";
import { overlaps, effectiveWindow, billableDays } from "./time";

const d = (s: string) => new Date(s);

describe("overlaps (half-open)", () => {
  it("touching windows do NOT overlap", () => {
    expect(
      overlaps({ start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T14:00:00Z") },
               { start: d("2026-07-22T14:00:00Z"), end: d("2026-07-22T18:00:00Z") }),
    ).toBe(false);
  });
  it("genuinely overlapping windows do overlap", () => {
    expect(
      overlaps({ start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T15:00:00Z") },
               { start: d("2026-07-22T14:00:00Z"), end: d("2026-07-22T18:00:00Z") }),
    ).toBe(true);
  });
});

describe("effectiveWindow (buffers turn near-misses into conflicts)", () => {
  it("two back-to-back events collide once setup/teardown buffers are applied", () => {
    // Event A 10–14, Event B 14–18. No raw overlap. But with 2h teardown on A and
    // 2h setup on B, the effective windows overlap → SETUP_WINDOW_OVERLAP.
    const a = effectiveWindow(d("2026-07-22T10:00:00Z"), d("2026-07-22T14:00:00Z"), 120, 120);
    const b = effectiveWindow(d("2026-07-22T14:00:00Z"), d("2026-07-22T18:00:00Z"), 120, 120);
    expect(overlaps(a, b)).toBe(true);
  });
});

describe("billableDays", () => {
  it("a single-day window bills 1 day", () => {
    expect(billableDays(d("2026-07-22T09:00:00Z"), d("2026-07-22T18:00:00Z"))).toBe(1);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation } from "./helpers/fixtures";
import { detectConflicts } from "../services/conflict";
import { assetAvailability } from "../services/availability";
import { overlaps, effectiveWindow } from "../utils/time";

// Deterministic PRNG so any failure is reproducible from its seed.
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const BASE = Date.UTC(2026, 6, 1);
const HOUR = 3_600_000;
const at = (h: number) => new Date(BASE + h * HOUR);

beforeEach(resetDb);

describe("F05-T06 property: the space engine never lets a double-book through", () => {
  it.each([1, 2, 3, 4])("seed %i — accepted reservations never have overlapping effective windows", async (seed) => {
    const rng = mulberry32(seed * 7919);
    const setup = [0, 60, 240][seed % 3]!;
    const teardown = [0, 30, 120][seed % 3]!;
    const space = await seedSpace({ setupBufferMinutes: setup, teardownBufferMinutes: teardown });
    const accepted: Array<{ start: Date; end: Date }> = [];

    for (let i = 0; i < 25; i++) {
      const startH = Math.floor(rng() * 240);
      const durH = 1 + Math.floor(rng() * 8);
      const start = at(startH);
      const end = at(startH + durH);
      const conflicts = await detectConflicts({ spaceId: space.id, start, end });
      if (conflicts.length === 0) {
        const req = await seedRequest();
        await seedReservation({ space, requestId: req.id, start, end, status: "CONFIRMED" });
        accepted.push({ start, end });
      }
    }
    for (let i = 0; i < accepted.length; i++) {
      for (let j = i + 1; j < accepted.length; j++) {
        const a = effectiveWindow(accepted[i]!.start, accepted[i]!.end, setup, teardown);
        const b = effectiveWindow(accepted[j]!.start, accepted[j]!.end, setup, teardown);
        expect(overlaps(a, b), `accepted #${i} and #${j} effective windows overlap`).toBe(false);
      }
    }
    expect(accepted.length).toBeGreaterThan(0);
  });
});

describe("F05-T06 property: detectConflicts matches the pure half-open overlap oracle", () => {
  it.each([5, 6, 7])("seed %i — flags SPACE_DOUBLE_BOOKED iff the windows truly overlap (incl. touching)", async (seed) => {
    const rng = mulberry32(seed * 104729);
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    const rs = 50 + Math.floor(rng() * 20);
    const rd = 1 + Math.floor(rng() * 6);
    const R = { start: at(rs), end: at(rs + rd) };
    await seedReservation({ space, requestId: req.id, start: R.start, end: R.end, status: "CONFIRMED" });

    for (let i = 0; i < 30; i++) {
      const cs = 40 + Math.floor(rng() * 40);
      const cd = 1 + Math.floor(rng() * 6);
      const C = { start: at(cs), end: at(cs + cd) };
      const expected = overlaps(C, R);
      const conflicts = await detectConflicts({ spaceId: space.id, start: C.start, end: C.end });
      expect(
        conflicts.some((c) => c.type === "SPACE_DOUBLE_BOOKED"),
        `C=[${cs},${cs + cd}) R=[${rs},${rs + rd})`,
      ).toBe(expected);
    }
  });
});

describe("F05-T06 property: asset allocation never exceeds totalQuantity", () => {
  it.each([8, 9])("seed %i — accepting only conflict-free holds keeps Σ overlapping ≤ total", async (seed) => {
    const rng = mulberry32(seed * 1_299_709);
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const TOTAL = 100;
    const chairs = await seedAsset({ totalQuantity: TOTAL });

    for (let i = 0; i < 30; i++) {
      const cs = Math.floor(rng() * 200);
      const cd = 1 + Math.floor(rng() * 6);
      const start = at(cs);
      const end = at(cs + cd);
      const qty = 1 + Math.floor(rng() * 40);
      // no spaceId → only the asset constraint is checked
      const conflicts = await detectConflicts({ start, end, requestedAssets: [{ assetId: chairs.id, quantity: qty }] });
      if (conflicts.length === 0) {
        const req = await seedRequest();
        await seedReservation({ space, requestId: req.id, start, end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: qty }] });
      }
    }
    for (let i = 0; i < 25; i++) {
      const cs = Math.floor(rng() * 200);
      const cd = 1 + Math.floor(rng() * 6);
      const avail = await assetAvailability([{ id: chairs.id, totalQuantity: TOTAL, status: "ACTIVE" }], at(cs), at(cs + cd));
      const a = avail.get(chairs.id)!;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(TOTAL);
    }
  });
});

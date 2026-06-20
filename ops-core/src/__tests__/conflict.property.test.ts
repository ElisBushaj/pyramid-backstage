import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation } from "./helpers/fixtures";
import { detectConflicts } from "../services/conflict";
import { assetAvailability } from "../services/availability";
import { overlaps, effectiveWindow } from "../utils/time";

// Property tests: drive the real engine through many random reservation sets and
// assert the two invariants that "must never happen" — no double-booked space,
// no over-allocated asset — plus the engine agreeing with a pure half-open
// overlap oracle. Deterministic PRNG so any failure reproduces from its seed.

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

const SPACE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const ORACLE_SEEDS = [11, 12, 13, 14, 15, 16];
const ASSET_SEEDS = [21, 22, 23, 24, 25, 26];
const COMBINED_SEEDS = [31, 32, 33, 34];

describe("F05-T06 property: the space engine never lets a double-book through", () => {
  it.each(SPACE_SEEDS)("seed %i — accepted reservations never have overlapping effective windows", async (seed) => {
    const rng = mulberry32(seed * 7919);
    const setup = [0, 30, 60, 240][seed % 4]!;
    const teardown = [0, 15, 30, 120][seed % 4]!;
    const space = await seedSpace({ setupBufferMinutes: setup, teardownBufferMinutes: teardown });
    const accepted: Array<{ start: Date; end: Date }> = [];
    let liveAccepted = 0;

    for (let i = 0; i < 40; i++) {
      const startH = Math.floor(rng() * 240);
      const durH = 1 + Math.floor(rng() * 8);
      const start = at(startH);
      const end = at(startH + durH);
      const conflicts = await detectConflicts({ spaceId: space.id, start, end });
      if (conflicts.length === 0) {
        const req = await seedRequest();
        // mix CONFIRMED with live + lapsed HELD: lapsed must never block later accepts
        const roll = rng();
        const status = roll < 0.6 ? "CONFIRMED" : "HELD";
        const expiresAt = status === "HELD" ? (roll < 0.8 ? new Date(Date.now() + 600_000) : new Date(Date.now() - 1_000)) : null;
        await seedReservation({ space, requestId: req.id, start, end, status, expiresAt });
        // Only live holds form the "must not overlap" set the engine guards.
        if (status === "CONFIRMED" || (expiresAt && expiresAt.getTime() > Date.now())) {
          accepted.push({ start, end });
          liveAccepted++;
        }
      }
    }
    for (let i = 0; i < accepted.length; i++) {
      for (let j = i + 1; j < accepted.length; j++) {
        const a = effectiveWindow(accepted[i]!.start, accepted[i]!.end, setup, teardown);
        const b = effectiveWindow(accepted[j]!.start, accepted[j]!.end, setup, teardown);
        expect(overlaps(a, b), `accepted #${i} and #${j} effective windows overlap (seed ${seed})`).toBe(false);
      }
    }
    expect(liveAccepted).toBeGreaterThan(0);
  });
});

describe("F05-T06 property: detectConflicts matches the pure half-open overlap oracle", () => {
  it.each(ORACLE_SEEDS)("seed %i — flags SPACE_DOUBLE_BOOKED iff windows truly overlap (incl. touching)", async (seed) => {
    const rng = mulberry32(seed * 104729);
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    const rs = 50 + Math.floor(rng() * 20);
    const rd = 1 + Math.floor(rng() * 6);
    const R = { start: at(rs), end: at(rs + rd) };
    await seedReservation({ space, requestId: req.id, start: R.start, end: R.end, status: "CONFIRMED" });

    for (let i = 0; i < 60; i++) {
      const cs = 40 + Math.floor(rng() * 40);
      const cd = 1 + Math.floor(rng() * 6);
      const C = { start: at(cs), end: at(cs + cd) };
      const expected = overlaps(C, R);
      const conflicts = await detectConflicts({ spaceId: space.id, start: C.start, end: C.end });
      expect(
        conflicts.some((c) => c.type === "SPACE_DOUBLE_BOOKED"),
        `C=[${cs},${cs + cd}) R=[${rs},${rs + rd}) seed ${seed}`,
      ).toBe(expected);
    }
  });

  it.each(ORACLE_SEEDS)("seed %i — buffered space: SPACE_DOUBLE_BOOKED ⇔ event overlap; SETUP_WINDOW_OVERLAP ⇔ buffer-only overlap", async (seed) => {
    const rng = mulberry32(seed * 1_000_003);
    const setup = 60 + Math.floor(rng() * 180);
    const teardown = 30 + Math.floor(rng() * 90);
    const space = await seedSpace({ setupBufferMinutes: setup, teardownBufferMinutes: teardown });
    const req = await seedRequest();
    const rs = 80 + Math.floor(rng() * 20);
    const rd = 1 + Math.floor(rng() * 6);
    const R = { start: at(rs), end: at(rs + rd) };
    const Reff = effectiveWindow(R.start, R.end, setup, teardown);
    await seedReservation({ space, requestId: req.id, start: R.start, end: R.end, status: "CONFIRMED" });

    for (let i = 0; i < 60; i++) {
      const cs = 50 + Math.floor(rng() * 80);
      const cd = 1 + Math.floor(rng() * 6);
      const C = { start: at(cs), end: at(cs + cd) };
      const Ceff = effectiveWindow(C.start, C.end, setup, teardown);
      const eventOverlap = overlaps(C, R);
      const effOverlap = overlaps(Ceff, Reff);
      const conflicts = await detectConflicts({ spaceId: space.id, start: C.start, end: C.end });
      const tag = `C=[${cs},${cs + cd}) R=[${rs},${rs + rd}) buf=${setup}/${teardown} seed ${seed}`;
      if (eventOverlap) {
        expect(conflicts.map((c) => c.type), `expected DOUBLE: ${tag}`).toEqual(["SPACE_DOUBLE_BOOKED"]);
      } else if (effOverlap) {
        expect(conflicts.map((c) => c.type), `expected SETUP: ${tag}`).toEqual(["SETUP_WINDOW_OVERLAP"]);
      } else {
        expect(conflicts, `expected NONE: ${tag}`).toEqual([]);
      }
    }
  });
});

describe("F05-T06 property: asset allocation never exceeds totalQuantity", () => {
  it.each(ASSET_SEEDS)("seed %i — accepting only conflict-free holds keeps Σ overlapping ≤ total, and availability is exact", async (seed) => {
    const rng = mulberry32(seed * 1_299_709);
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const TOTAL = 100;
    const chairs = await seedAsset({ totalQuantity: TOTAL });
    const accepted: Array<{ start: Date; end: Date; qty: number }> = [];

    for (let i = 0; i < 45; i++) {
      const cs = Math.floor(rng() * 200);
      const cd = 1 + Math.floor(rng() * 6);
      const start = at(cs);
      const end = at(cs + cd);
      const qty = 1 + Math.floor(rng() * 40);
      // no spaceId → only the asset constraint is checked
      const conflicts = await detectConflicts({ start, end, requestedAssets: [{ assetId: chairs.id, quantity: qty }] });
      if (conflicts.length === 0) {
        const req = await seedRequest();
        const live = rng() < 0.7;
        await seedReservation({
          space, requestId: req.id, start, end,
          status: live ? "CONFIRMED" : "HELD",
          expiresAt: live ? null : new Date(Date.now() + 600_000),
          assets: [{ assetId: chairs.id, quantity: qty }],
        });
        accepted.push({ start, end, qty });
      }
    }
    // Engine-vs-oracle agreement: for every probe window, the engine's available
    // == TOTAL − Σ(holds whose window overlaps the probe). This is the exact set
    // the grouped SQL must sum, so it catches under- AND over-counting. (Note: this
    // windowed Σ is NOT itself bounded by TOTAL — a wide probe can span two holds
    // that don't co-occur; the over-allocation bound is the instant sweep below.)
    for (let i = 0; i < 35; i++) {
      const cs = Math.floor(rng() * 200);
      const cd = 1 + Math.floor(rng() * 6);
      const probe = { start: at(cs), end: at(cs + cd) };
      const windowedDemand = accepted
        .filter((h) => overlaps({ start: h.start, end: h.end }, probe))
        .reduce((s, h) => s + h.qty, 0);
      const avail = await assetAvailability([{ id: chairs.id, totalQuantity: TOTAL, status: "ACTIVE" }], probe.start, probe.end);
      expect(avail.get(chairs.id)!, `availability != TOTAL − windowed demand (seed ${seed})`).toBe(Math.max(0, TOTAL - windowedDemand));
    }
    // Over-allocation invariant — instant sweep: at EVERY hold-boundary instant, the
    // Σ of holds actually covering that instant ≤ TOTAL. Boundaries are the only
    // places the concurrent load changes, so this certifies the whole timeline.
    // This is the real "must never happen" assertion (Σ co-occurring live ≤ total).
    const instants = new Set<number>();
    for (const h of accepted) {
      instants.add(h.start.getTime());
      instants.add(h.end.getTime() - 1); // half-open: end is exclusive
    }
    for (const t of instants) {
      const load = accepted.filter((h) => h.start.getTime() <= t && t < h.end.getTime()).reduce((s, h) => s + h.qty, 0);
      expect(load, `Σ co-occurring live holds exceeds total at instant ${t} (seed ${seed})`).toBeLessThanOrEqual(TOTAL);
    }
  });
});

describe("F05-T06 property: combined space + multi-asset acceptance is internally consistent", () => {
  it.each(COMBINED_SEEDS)("seed %i — accepted plan never double-books the space nor over-allocates any asset", async (seed) => {
    const rng = mulberry32(seed * 15_485_863);
    const setup = [0, 60, 120][seed % 3]!;
    const teardown = [0, 30, 60][seed % 3]!;
    const space = await seedSpace({ setupBufferMinutes: setup, teardownBufferMinutes: teardown });
    const A = await seedAsset({ totalQuantity: 50 });
    const B = await seedAsset({ totalQuantity: 30 });
    const totals: Record<string, number> = { [A.id]: 50, [B.id]: 30 };
    const acceptedSpace: Array<{ start: Date; end: Date }> = [];
    const acceptedHolds: Array<{ start: Date; end: Date; assetId: string; qty: number }> = [];

    for (let i = 0; i < 40; i++) {
      const cs = Math.floor(rng() * 180);
      const cd = 1 + Math.floor(rng() * 5);
      const start = at(cs);
      const end = at(cs + cd);
      const requestedAssets = [
        { assetId: A.id, quantity: 1 + Math.floor(rng() * 20) },
        { assetId: B.id, quantity: 1 + Math.floor(rng() * 12) },
      ];
      const conflicts = await detectConflicts({ spaceId: space.id, start, end, requestedAssets });
      if (conflicts.length === 0) {
        const req = await seedRequest();
        await seedReservation({ space, requestId: req.id, start, end, status: "CONFIRMED", assets: requestedAssets });
        acceptedSpace.push({ start, end });
        for (const ra of requestedAssets) acceptedHolds.push({ start, end, assetId: ra.assetId, qty: ra.quantity });
      }
    }

    // Invariant (a): no two accepted reservations share an overlapping effective window.
    for (let i = 0; i < acceptedSpace.length; i++) {
      for (let j = i + 1; j < acceptedSpace.length; j++) {
        const a = effectiveWindow(acceptedSpace[i]!.start, acceptedSpace[i]!.end, setup, teardown);
        const b = effectiveWindow(acceptedSpace[j]!.start, acceptedSpace[j]!.end, setup, teardown);
        expect(overlaps(a, b), `space double-booked (seed ${seed})`).toBe(false);
      }
    }
    // Invariant (b): for each asset, at every effective-window boundary instant,
    // the summed live demand ≤ totalQuantity. Since the space can host only one
    // event at a time here, asset load is bounded too — this certifies it.
    for (const assetId of [A.id, B.id]) {
      const holds = acceptedHolds.filter((h) => h.assetId === assetId);
      const instants = new Set<number>();
      for (const h of holds) {
        const eff = effectiveWindow(h.start, h.end, setup, teardown);
        instants.add(eff.start.getTime());
        instants.add(eff.end.getTime() - 1);
      }
      for (const t of instants) {
        const load = holds
          .filter((h) => {
            const eff = effectiveWindow(h.start, h.end, setup, teardown);
            return eff.start.getTime() <= t && t < eff.end.getTime();
          })
          .reduce((s, h) => s + h.qty, 0);
        expect(load, `asset ${assetId} over-allocated at instant ${t} (seed ${seed})`).toBeLessThanOrEqual(totals[assetId]!);
      }
    }
  });
});

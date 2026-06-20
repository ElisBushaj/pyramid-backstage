import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, prisma } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation } from "./helpers/fixtures";
import { spaceAvailability, assetAvailability, assetHeldQuantities, overlappingSpaceReservations } from "../services/availability";

// All cases drive the real services against real Postgres (no DB mocks). The read
// side (services/availability) is the foundation the conflict engine sits on, so
// every live-hold predicate, half-open boundary, buffer pad, and Σ-overlap path
// is exercised here. Windows below are chosen so the EFFECTIVE window (event ±
// buffers) is what's tested, never the raw event window.

const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };
const FREE = { start: "2026-08-01T09:00:00Z", end: "2026-08-01T18:00:00Z" };
const d = (s: string) => new Date(s);
const live = () => new Date(Date.now() + 600_000);
const lapsed = () => new Date(Date.now() - 1_000);

beforeEach(resetDb);

describe("space availability — buffer-aware (F05-T02)", () => {
  it("a confirmed reservation in the window → available:false with conflictingRequestIds; a free window → available:true []", async () => {
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const busy = await spaceAvailability(space.id, d(W.start), d(W.end));
    expect(busy.spaceId).toBe(space.id);
    expect(busy.available).toBe(false);
    expect(busy.conflictingRequestIds).toEqual([req.id]);

    const free = await spaceAvailability(space.id, d(FREE.start), d(FREE.end));
    expect(free.available).toBe(true);
    expect(free.conflictingRequestIds).toEqual([]);
  });

  it("a live HELD reservation (expiresAt > now) DOES block", async () => {
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: live() });
    const res = await spaceAvailability(space.id, d(W.start), d(W.end));
    expect(res.available).toBe(false);
    expect(res.conflictingRequestIds).toEqual([req.id]);
  });

  it("a lapsed HELD reservation (expiresAt ≤ now) does NOT block — check-on-read", async () => {
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: lapsed() });
    const res = await spaceAvailability(space.id, d(W.start), d(W.end));
    expect(res.available).toBe(true);
    expect(res.conflictingRequestIds).toEqual([]);
  });

  it("a RELEASED reservation does NOT block", async () => {
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "RELEASED" });
    const res = await spaceAvailability(space.id, d(W.start), d(W.end));
    expect(res.available).toBe(true);
  });

  it("half-open: an adjacent-but-touching booking does NOT block (effective windows touch)", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T10:00:00Z", end: "2026-07-22T14:00:00Z", status: "CONFIRMED" });
    // [14:00,18:00) touches [10:00,14:00) at the boundary → free.
    const touch = await spaceAvailability(space.id, d("2026-07-22T14:00:00Z"), d("2026-07-22T18:00:00Z"));
    expect(touch.available).toBe(true);
    // 1ms earlier → overlaps → blocked.
    const overlap = await spaceAvailability(space.id, d("2026-07-22T13:59:59.999Z"), d("2026-07-22T18:00:00Z"));
    expect(overlap.available).toBe(false);
  });

  it("buffers widen occupancy: a back-to-back event collides via the buffer zone", async () => {
    const space = await seedSpace({ setupBufferMinutes: 60, teardownBufferMinutes: 60 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T12:00:00Z", status: "CONFIRMED" });
    // existing effective = [08:00,13:00). New event 13:30–17:00 → effStart 12:30 < 13:00 → blocked.
    const tooClose = await spaceAvailability(space.id, d("2026-07-22T13:30:00Z"), d("2026-07-22T17:00:00Z"));
    expect(tooClose.available).toBe(false);
    // New event 14:00–17:00 → effStart 13:00 == existing effEnd → touching → free.
    const clears = await spaceAvailability(space.id, d("2026-07-22T14:00:00Z"), d("2026-07-22T17:00:00Z"));
    expect(clears.available).toBe(true);
  });

  it("dedupes conflictingRequestIds when one request has two overlapping reservations", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T12:00:00Z", status: "CONFIRMED" });
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T13:00:00Z", end: "2026-07-22T16:00:00Z", status: "CONFIRMED" });
    const res = await spaceAvailability(space.id, d("2026-07-22T08:00:00Z"), d("2026-07-22T20:00:00Z"));
    expect(res.available).toBe(false);
    expect(res.conflictingRequestIds).toEqual([req.id]);
  });

  it("an unknown space id → available:false with no conflicting requests", async () => {
    const res = await spaceAvailability("00000000-0000-4000-8000-000000000000", d(W.start), d(W.end));
    expect(res).toEqual({ spaceId: "00000000-0000-4000-8000-000000000000", available: false, conflictingRequestIds: [] });
  });

  it("a reservation in a DIFFERENT space does not block this one", async () => {
    const a = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const b = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space: b, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const res = await spaceAvailability(a.id, d(W.start), d(W.end));
    expect(res.available).toBe(true);
  });
});

describe("overlappingSpaceReservations — the half-open SQL filter (F05-T02)", () => {
  it("excludeReservationId skips the named row (re-check path)", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    const r = await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const eff = { start: d(W.start), end: d(W.end) };

    const without = await overlappingSpaceReservations(prisma, space.id, eff.start, eff.end, new Date());
    expect(without.map((x) => x.requestId)).toEqual([req.id]);

    const withExclude = await overlappingSpaceReservations(prisma, space.id, eff.start, eff.end, new Date(), r.id);
    expect(withExclude).toEqual([]);
  });

  it("returns the minimal {requestId,start,end} shape per overlapping row", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const rows = await overlappingSpaceReservations(prisma, space.id, d(W.start), d(W.end), new Date());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ requestId: req.id });
    expect(rows[0]!.start.toISOString()).toBe("2026-07-22T09:00:00.000Z");
    expect(rows[0]!.end.toISOString()).toBe("2026-07-22T18:00:00.000Z");
  });
});

describe("asset availability — total − Σ overlapping holds (F05-T03)", () => {
  it("310 of 400 chairs held in the window → 90 free; a non-overlapping hold doesn't reduce it", async () => {
    const space = await seedSpace();
    const chairs = await seedAsset({ name: "Standard chair", totalQuantity: 400 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();
    await seedReservation({ space, requestId: r1.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 200 }] });
    await seedReservation({ space, requestId: r2.id, start: W.start, end: W.end, status: "HELD", expiresAt: live(), assets: [{ assetId: chairs.id, quantity: 110 }] });
    // a non-overlapping hold (different week) must NOT reduce availability
    const r3 = await seedRequest();
    await seedReservation({ space, requestId: r3.id, start: FREE.start, end: FREE.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 300 }] });

    const avail = await assetAvailability([{ id: chairs.id, totalQuantity: 400, status: "ACTIVE" }], d(W.start), d(W.end));
    expect(avail.get(chairs.id)).toBe(90);
  });

  it("availability is the SUM across multiple overlapping holds, not max/any single one", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const chairs = await seedAsset({ totalQuantity: 400 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();
    const r3 = await seedRequest();
    await seedReservation({ space, requestId: r1.id, start: "2026-07-22T08:00:00Z", end: "2026-07-22T12:00:00Z", status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 100 }] });
    await seedReservation({ space, requestId: r2.id, start: "2026-07-22T10:00:00Z", end: "2026-07-22T14:00:00Z", status: "HELD", expiresAt: live(), assets: [{ assetId: chairs.id, quantity: 150 }] });
    await seedReservation({ space, requestId: r3.id, start: "2026-07-22T13:00:00Z", end: "2026-07-22T16:00:00Z", status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 200 }] });
    // 11:00–11:30 overlaps r1+r2 only → 400 − 250 = 150
    const mid = await assetAvailability([{ id: chairs.id, totalQuantity: 400, status: "ACTIVE" }], d("2026-07-22T11:00:00Z"), d("2026-07-22T11:30:00Z"));
    expect(mid.get(chairs.id)).toBe(150);
    // 13:30–13:45 overlaps r2+r3 only → 400 − 350 = 50
    const late = await assetAvailability([{ id: chairs.id, totalQuantity: 400, status: "ACTIVE" }], d("2026-07-22T13:30:00Z"), d("2026-07-22T13:45:00Z"));
    expect(late.get(chairs.id)).toBe(50);
  });

  it("clamps at 0 — never negative even when overlapping demand exceeds total", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const chairs = await seedAsset({ totalQuantity: 100 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();
    await seedReservation({ space, requestId: r1.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 80 }] });
    await seedReservation({ space, requestId: r2.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 80 }] });
    const avail = await assetAvailability([{ id: chairs.id, totalQuantity: 100, status: "ACTIVE" }], d(W.start), d(W.end));
    expect(avail.get(chairs.id)).toBe(0);
  });

  it("MAINTENANCE and RETIRED assets always report 0, regardless of holds", async () => {
    const m = await seedAsset({ status: "MAINTENANCE", totalQuantity: 50 });
    const rt = await seedAsset({ status: "RETIRED", totalQuantity: 30 });
    const avail = await assetAvailability(
      [
        { id: m.id, totalQuantity: 50, status: "MAINTENANCE" },
        { id: rt.id, totalQuantity: 30, status: "RETIRED" },
      ],
      d(W.start),
      d(W.end),
    );
    expect(avail.get(m.id)).toBe(0);
    expect(avail.get(rt.id)).toBe(0);
  });

  it("a lapsed HELD hold does not reduce availability; a live HELD does", async () => {
    const space = await seedSpace();
    const chairs = await seedAsset({ totalQuantity: 100 });
    const rLapsed = await seedRequest();
    await seedReservation({ space, requestId: rLapsed.id, start: W.start, end: W.end, status: "HELD", expiresAt: lapsed(), assets: [{ assetId: chairs.id, quantity: 80 }] });
    const onlyLapsed = await assetAvailability([{ id: chairs.id, totalQuantity: 100, status: "ACTIVE" }], d(W.start), d(W.end));
    expect(onlyLapsed.get(chairs.id)).toBe(100);

    const rLive = await seedRequest();
    await seedReservation({ space, requestId: rLive.id, start: W.start, end: W.end, status: "HELD", expiresAt: live(), assets: [{ assetId: chairs.id, quantity: 30 }] });
    const withLive = await assetAvailability([{ id: chairs.id, totalQuantity: 100, status: "ACTIVE" }], d(W.start), d(W.end));
    expect(withLive.get(chairs.id)).toBe(70);
  });

  it("a RELEASED reservation's assets do not reduce availability", async () => {
    const space = await seedSpace();
    const chairs = await seedAsset({ totalQuantity: 100 });
    const r = await seedRequest();
    await seedReservation({ space, requestId: r.id, start: W.start, end: W.end, status: "RELEASED", assets: [{ assetId: chairs.id, quantity: 90 }] });
    const avail = await assetAvailability([{ id: chairs.id, totalQuantity: 100, status: "ACTIVE" }], d(W.start), d(W.end));
    expect(avail.get(chairs.id)).toBe(100);
  });

  it("excludeReservationId removes a hold from the Σ (self re-check)", async () => {
    const space = await seedSpace();
    const chairs = await seedAsset({ totalQuantity: 100 });
    const r = await seedRequest();
    const res = await seedReservation({ space, requestId: r.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 80 }] });

    const counted = await assetAvailability([{ id: chairs.id, totalQuantity: 100, status: "ACTIVE" }], d(W.start), d(W.end));
    expect(counted.get(chairs.id)).toBe(20);

    const excluded = await assetAvailability([{ id: chairs.id, totalQuantity: 100, status: "ACTIVE" }], d(W.start), d(W.end), undefined, res.id);
    expect(excluded.get(chairs.id)).toBe(100);
  });

  it("availability covers every asset asked for, including ones with no holds (= total)", async () => {
    const space = await seedSpace();
    const held = await seedAsset({ totalQuantity: 100 });
    const idle = await seedAsset({ totalQuantity: 60 });
    const r = await seedRequest();
    await seedReservation({ space, requestId: r.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: held.id, quantity: 40 }] });
    const avail = await assetAvailability(
      [
        { id: held.id, totalQuantity: 100, status: "ACTIVE" },
        { id: idle.id, totalQuantity: 60, status: "ACTIVE" },
      ],
      d(W.start),
      d(W.end),
    );
    expect(avail.get(held.id)).toBe(60);
    expect(avail.get(idle.id)).toBe(60);
  });

  it("an empty asset list yields an empty map (no query)", async () => {
    const avail = await assetAvailability([], d(W.start), d(W.end));
    expect(avail.size).toBe(0);
  });
});

describe("assetHeldQuantities — the single grouped Σ query (F05-T03)", () => {
  it("returns only assets with live overlapping holds, summed; empty ids → empty map", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const a = await seedAsset({ totalQuantity: 400 });
    const b = await seedAsset({ totalQuantity: 400 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();
    await seedReservation({ space, requestId: r1.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: a.id, quantity: 120 }] });
    await seedReservation({ space, requestId: r2.id, start: W.start, end: W.end, status: "HELD", expiresAt: live(), assets: [{ assetId: a.id, quantity: 80 }] });

    const held = await assetHeldQuantities(prisma, [a.id, b.id], d(W.start), d(W.end));
    expect(held.get(a.id)).toBe(200);
    expect(held.has(b.id)).toBe(false); // no holds → absent from the grouped result

    expect((await assetHeldQuantities(prisma, [], d(W.start), d(W.end))).size).toBe(0);
  });

  it("excludeReservationId is honored at the SQL layer", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const a = await seedAsset({ totalQuantity: 400 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();
    const keep = await seedReservation({ space, requestId: r1.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: a.id, quantity: 120 }] });
    const drop = await seedReservation({ space, requestId: r2.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: a.id, quantity: 80 }] });

    expect((await assetHeldQuantities(prisma, [a.id], d(W.start), d(W.end), drop.id)).get(a.id)).toBe(120);
    expect((await assetHeldQuantities(prisma, [a.id], d(W.start), d(W.end), keep.id)).get(a.id)).toBe(80);
  });
});

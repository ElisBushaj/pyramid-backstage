import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation } from "./helpers/fixtures";
import { spaceAvailability, assetAvailability } from "../services/availability";

const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };
const FREE = { start: "2026-08-01T09:00:00Z", end: "2026-08-01T18:00:00Z" };

beforeEach(resetDb);

describe("space availability — buffer-aware (F05-T02)", () => {
  it("a confirmed reservation in the window → available:false with conflictingRequestIds", async () => {
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const busy = await spaceAvailability(space.id, new Date(W.start), new Date(W.end));
    expect(busy.available).toBe(false);
    expect(busy.conflictingRequestIds).toEqual([req.id]);

    const free = await spaceAvailability(space.id, new Date(FREE.start), new Date(FREE.end));
    expect(free.available).toBe(true);
    expect(free.conflictingRequestIds).toEqual([]);
  });

  it("a lapsed HELD reservation does NOT block (check-on-read)", async () => {
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 1000) });
    const res = await spaceAvailability(space.id, new Date(W.start), new Date(W.end));
    expect(res.available).toBe(true);
  });

  it("a live HELD reservation DOES block", async () => {
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() + 600_000) });
    const res = await spaceAvailability(space.id, new Date(W.start), new Date(W.end));
    expect(res.available).toBe(false);
  });
});

describe("asset availability — total − Σ overlapping holds (F05-T03)", () => {
  it("310 of 400 chairs held in the window → 90 free; a non-overlapping hold doesn't reduce it", async () => {
    const space = await seedSpace();
    const chairs = await seedAsset({ name: "Standard chair", totalQuantity: 400 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();
    await seedReservation({ space, requestId: r1.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 200 }] });
    await seedReservation({ space, requestId: r2.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() + 600_000), assets: [{ assetId: chairs.id, quantity: 110 }] });
    // a non-overlapping hold (different week) must NOT reduce availability
    const r3 = await seedRequest();
    await seedReservation({ space, requestId: r3.id, start: FREE.start, end: FREE.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 300 }] });

    const avail = await assetAvailability([{ id: chairs.id, totalQuantity: 400, status: "ACTIVE" }], new Date(W.start), new Date(W.end));
    expect(avail.get(chairs.id)).toBe(90);
  });

  it("MAINTENANCE / RETIRED assets report 0", async () => {
    const a = await seedAsset({ status: "MAINTENANCE", totalQuantity: 50 });
    const avail = await assetAvailability([{ id: a.id, totalQuantity: 50, status: "MAINTENANCE" }], new Date(W.start), new Date(W.end));
    expect(avail.get(a.id)).toBe(0);
  });

  it("a lapsed HELD hold does not reduce availability", async () => {
    const space = await seedSpace();
    const chairs = await seedAsset({ totalQuantity: 100 });
    const r = await seedRequest();
    await seedReservation({ space, requestId: r.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 1000), assets: [{ assetId: chairs.id, quantity: 80 }] });
    const avail = await assetAvailability([{ id: chairs.id, totalQuantity: 100, status: "ACTIVE" }], new Date(W.start), new Date(W.end));
    expect(avail.get(chairs.id)).toBe(100);
  });
});

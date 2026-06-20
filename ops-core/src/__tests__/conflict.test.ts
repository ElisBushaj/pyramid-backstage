import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation } from "./helpers/fixtures";
import { detectConflicts } from "../services/conflict";

// detectConflicts is the authoritative, read-only engine reused both proactively
// (GET /conflicts) and defensively inside the F06 hold transaction. These cases
// pin every conflict type, the exact Conflict shape (ERROR_CONTRACT.md + the
// openapi Conflict schema), the half-open boundaries, and the buffer math.

beforeEach(resetDb);

const d = (s: string) => new Date(s);
const live = () => new Date(Date.now() + 600_000);
const lapsed = () => new Date(Date.now() - 1_000);

describe("detectConflicts — SPACE_DOUBLE_BOOKED (F05-T04)", () => {
  it("fires when event windows overlap in the same space, carrying the full Conflict shape", async () => {
    const space = await seedSpace({ name: "Blue Hall", setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED" });

    const conflicts = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T12:00:00Z"), end: d("2026-07-22T20:00:00Z") });
    expect(conflicts).toHaveLength(1);
    const c = conflicts[0]!;
    expect(c.type).toBe("SPACE_DOUBLE_BOOKED");
    expect(c.spaceId).toBe(space.id);
    expect(c.conflictingRequestIds).toEqual([req.id]);
    expect(c.window).toEqual({ start: "2026-07-22T12:00:00.000Z", end: "2026-07-22T20:00:00.000Z" });
    expect(c.detail).toContain("Blue Hall");
    expect(c.detail).toContain(req.id);
    // asset-only fields are absent on a space conflict
    expect(c.assetId).toBeUndefined();
    expect(c.requested).toBeUndefined();
    expect(c.available).toBeUndefined();
  });

  it("a live HELD reservation double-books; a lapsed HELD does not", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const liveReq = await seedRequest();
    await seedReservation({ space, requestId: liveReq.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "HELD", expiresAt: live() });
    const onLive = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T12:00:00Z") });
    expect(onLive.map((c) => c.type)).toEqual(["SPACE_DOUBLE_BOOKED"]);

    await resetDb();
    const space2 = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const lapsedReq = await seedRequest();
    await seedReservation({ space: space2, requestId: lapsedReq.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "HELD", expiresAt: lapsed() });
    const onLapsed = await detectConflicts({ spaceId: space2.id, start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T12:00:00Z") });
    expect(onLapsed).toEqual([]);
  });

  it("a RELEASED reservation never double-books", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "RELEASED" });
    const conflicts = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T12:00:00Z") });
    expect(conflicts).toEqual([]);
  });

  it("dedupes conflictingRequestIds across two reservations of the same request", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T12:00:00Z", status: "CONFIRMED" });
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T13:00:00Z", end: "2026-07-22T16:00:00Z", status: "CONFIRMED" });
    const conflicts = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T08:00:00Z"), end: d("2026-07-22T20:00:00Z") });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.conflictingRequestIds).toEqual([req.id]);
  });

  it("collects multiple distinct conflicting requests in one window", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();
    await seedReservation({ space, requestId: r1.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T11:00:00Z", status: "CONFIRMED" });
    await seedReservation({ space, requestId: r2.id, start: "2026-07-22T12:00:00Z", end: "2026-07-22T14:00:00Z", status: "CONFIRMED" });
    const conflicts = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T10:00:00Z"), end: d("2026-07-22T13:00:00Z") });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe("SPACE_DOUBLE_BOOKED");
    expect([...conflicts[0]!.conflictingRequestIds!].sort()).toEqual([r1.id, r2.id].sort());
  });
});

describe("detectConflicts — half-open boundaries (F05-T04)", () => {
  it("merely touching windows do NOT conflict; 1ms of overlap DOES", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T10:00:00.000Z", end: "2026-07-22T14:00:00.000Z", status: "CONFIRMED" });

    // [14:00,18:00) touches [10:00,14:00) → free
    expect(await detectConflicts({ spaceId: space.id, start: d("2026-07-22T14:00:00.000Z"), end: d("2026-07-22T18:00:00.000Z") })).toEqual([]);
    // [06:00,10:00) touches the other boundary → free
    expect(await detectConflicts({ spaceId: space.id, start: d("2026-07-22T06:00:00.000Z"), end: d("2026-07-22T10:00:00.000Z") })).toEqual([]);
    // 1ms over the trailing boundary → overlaps
    const tail = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T13:59:59.999Z"), end: d("2026-07-22T18:00:00.000Z") });
    expect(tail.map((c) => c.type)).toEqual(["SPACE_DOUBLE_BOOKED"]);
    // 1ms over the leading boundary → overlaps
    const lead = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T06:00:00.000Z"), end: d("2026-07-22T10:00:00.001Z") });
    expect(lead.map((c) => c.type)).toEqual(["SPACE_DOUBLE_BOOKED"]);
  });
});

describe("detectConflicts — SETUP_WINDOW_OVERLAP (F05-T04)", () => {
  it("fires when event windows don't overlap but the buffer zones collide", async () => {
    const space = await seedSpace({ setupBufferMinutes: 240, teardownBufferMinutes: 120 });
    const req = await seedRequest();
    // existing event 09–14; new event 15–20. Raw windows gap = 1h, but
    // teardown(2h)+setup(4h)=6h > 1h → effective windows collide.
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T14:00:00Z", status: "CONFIRMED" });

    const conflicts = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T15:00:00Z"), end: d("2026-07-22T20:00:00Z") });
    expect(conflicts).toHaveLength(1);
    const c = conflicts[0]!;
    expect(c.type).toBe("SETUP_WINDOW_OVERLAP");
    expect(c.spaceId).toBe(space.id);
    expect(c.conflictingRequestIds).toEqual([req.id]);
    // the reported window is the requested EVENT window, not the padded one
    expect(c.window).toEqual({ start: "2026-07-22T15:00:00.000Z", end: "2026-07-22T20:00:00.000Z" });
  });

  it("the buffer edge is half-open: gap == buffers → touching effective → no conflict; 1 minute closer → SETUP_WINDOW_OVERLAP", async () => {
    const space = await seedSpace({ setupBufferMinutes: 60, teardownBufferMinutes: 60 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T12:00:00Z", status: "CONFIRMED" });
    // existing effEnd = 13:00. new effStart = newStart − 60m. Touching needs newStart = 14:00.
    expect(await detectConflicts({ spaceId: space.id, start: d("2026-07-22T14:00:00Z"), end: d("2026-07-22T18:00:00Z") })).toEqual([]);
    const closer = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T13:59:00Z"), end: d("2026-07-22T18:00:00Z") });
    expect(closer.map((c) => c.type)).toEqual(["SETUP_WINDOW_OVERLAP"]);
  });

  it("with zero buffers a back-to-back event is free (no SETUP_WINDOW_OVERLAP possible)", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T12:00:00Z", status: "CONFIRMED" });
    expect(await detectConflicts({ spaceId: space.id, start: d("2026-07-22T12:00:00Z"), end: d("2026-07-22T15:00:00Z") })).toEqual([]);
  });

  it("a true overlap is reported as SPACE_DOUBLE_BOOKED even when buffers also overlap (severity wins)", async () => {
    const space = await seedSpace({ setupBufferMinutes: 240, teardownBufferMinutes: 120 });
    const req = await seedRequest();
    // events truly overlap (12–16 vs 14–18) AND buffers overlap
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T14:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED" });
    const conflicts = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T12:00:00Z"), end: d("2026-07-22T16:00:00Z") });
    expect(conflicts.map((c) => c.type)).toEqual(["SPACE_DOUBLE_BOOKED"]);
  });

  it("when a true double-book and a buffer-only clash coexist, only SPACE_DOUBLE_BOOKED surfaces, scoped to the truly-overlapping request", async () => {
    const space = await seedSpace({ setupBufferMinutes: 240, teardownBufferMinutes: 120 });
    const overlapReq = await seedRequest();
    const bufferReq = await seedRequest();
    // overlapReq truly overlaps the new event 12–16
    await seedReservation({ space, requestId: overlapReq.id, start: "2026-07-22T14:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED" });
    // bufferReq is earlier — only its teardown buffer reaches the new event's setup buffer
    await seedReservation({ space, requestId: bufferReq.id, start: "2026-07-22T05:00:00Z", end: "2026-07-22T09:00:00Z", status: "CONFIRMED" });
    const conflicts = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T12:00:00Z"), end: d("2026-07-22T16:00:00Z") });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe("SPACE_DOUBLE_BOOKED");
    expect(conflicts[0]!.conflictingRequestIds).toEqual([overlapReq.id]);
  });
});

describe("detectConflicts — ASSET_OVERALLOCATED (F05-T04)", () => {
  it("fires when requested > available, carrying requested/available/assetId + a human detail", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const chairs = await seedAsset({ name: "Standard chair", totalQuantity: 400 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 310 }] });

    const conflicts = await detectConflicts({
      spaceId: space.id,
      start: d("2026-07-22T09:00:00Z"),
      end: d("2026-07-22T18:00:00Z"),
      requestedAssets: [{ assetId: chairs.id, quantity: 180 }],
    });
    const asset = conflicts.find((c) => c.type === "ASSET_OVERALLOCATED");
    expect(asset).toBeDefined();
    expect(asset!.assetId).toBe(chairs.id);
    expect(asset!.requested).toBe(180);
    expect(asset!.available).toBe(90);
    expect(asset!.window).toEqual({ start: "2026-07-22T09:00:00.000Z", end: "2026-07-22T18:00:00.000Z" });
    expect(asset!.detail).toContain("90");
    expect(asset!.detail).toContain("400");
    expect(asset!.detail).toContain("Standard chair");
    expect(asset!.spaceId).toBeUndefined();
  });

  it("requested == available is fine (boundary); requested == available+1 conflicts", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const chairs = await seedAsset({ totalQuantity: 100 });
    const held = await seedRequest();
    await seedReservation({ space, requestId: held.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 40 }] });
    const win = { start: d("2026-07-23T09:00:00Z"), end: d("2026-07-23T18:00:00Z") }; // different day, 100 free

    expect(await detectConflicts({ ...win, requestedAssets: [{ assetId: chairs.id, quantity: 100 }] })).toEqual([]);
    const over = await detectConflicts({ ...win, requestedAssets: [{ assetId: chairs.id, quantity: 101 }] });
    expect(over.map((c) => c.type)).toEqual(["ASSET_OVERALLOCATED"]);
    expect(over[0]!.requested).toBe(101);
    expect(over[0]!.available).toBe(100);
  });

  it("a non-overlapping prior hold does not reduce availability (different window → no conflict)", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const chairs = await seedAsset({ totalQuantity: 400 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 310 }] });
    // a DIFFERENT day → the 310 hold doesn't overlap → 400 free → 180 fits
    const conflicts = await detectConflicts({
      spaceId: space.id,
      start: d("2026-07-23T09:00:00Z"),
      end: d("2026-07-23T18:00:00Z"),
      requestedAssets: [{ assetId: chairs.id, quantity: 180 }],
    });
    expect(conflicts).toEqual([]);
  });

  it("reports one ASSET_OVERALLOCATED per over-allocated asset, leaving fitting ones out", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const chairs = await seedAsset({ name: "Chair", totalQuantity: 100 });
    const mics = await seedAsset({ name: "Mic", type: "MICROPHONE", totalQuantity: 10 });
    const held = await seedRequest();
    await seedReservation({
      space, requestId: held.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED",
      assets: [{ assetId: chairs.id, quantity: 90 }, { assetId: mics.id, quantity: 2 }],
    });
    const conflicts = await detectConflicts({
      spaceId: space.id,
      start: d("2026-07-22T09:00:00Z"),
      end: d("2026-07-22T18:00:00Z"),
      requestedAssets: [
        { assetId: chairs.id, quantity: 50 }, // only 10 free → conflict
        { assetId: mics.id, quantity: 5 }, // 8 free → fits
      ],
    });
    const assetConflicts = conflicts.filter((c) => c.type === "ASSET_OVERALLOCATED");
    expect(assetConflicts).toHaveLength(1);
    expect(assetConflicts[0]!.assetId).toBe(chairs.id);
    expect(assetConflicts[0]!.available).toBe(10);
  });

  it("MAINTENANCE asset reports 0 available → any positive request conflicts", async () => {
    const broken = await seedAsset({ name: "Broken screen", status: "MAINTENANCE", totalQuantity: 5 });
    const conflicts = await detectConflicts({
      start: d("2026-07-22T09:00:00Z"),
      end: d("2026-07-22T18:00:00Z"),
      requestedAssets: [{ assetId: broken.id, quantity: 1 }],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe("ASSET_OVERALLOCATED");
    expect(conflicts[0]!.available).toBe(0);
  });

  it("a non-existent asset id → available 0, fallback detail (cannot allocate a ghost)", async () => {
    const conflicts = await detectConflicts({
      start: d("2026-07-22T09:00:00Z"),
      end: d("2026-07-22T18:00:00Z"),
      requestedAssets: [{ assetId: "00000000-0000-4000-8000-000000000000", quantity: 5 }],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe("ASSET_OVERALLOCATED");
    expect(conflicts[0]!.available).toBe(0);
    expect(conflicts[0]!.requested).toBe(5);
    expect(conflicts[0]!.detail).toContain("units"); // name fallback
  });

  it("asset checks use the EFFECTIVE (buffer-padded) window when a space is given", async () => {
    // Existing hold's effective window reaches into the new event's setup buffer.
    const space = await seedSpace({ setupBufferMinutes: 120, teardownBufferMinutes: 120 });
    const chairs = await seedAsset({ totalQuantity: 100 });
    const held = await seedRequest();
    // existing event 09–11 → effective [07:00,13:00)
    await seedReservation({ space, requestId: held.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T11:00:00Z", status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 80 }] });
    // new event 14–16 → effective [12:00,18:00). Effective windows overlap [12:00,13:00),
    // so the 80 held chairs count → only 20 free.
    const conflicts = await detectConflicts({
      spaceId: space.id,
      start: d("2026-07-22T14:00:00Z"),
      end: d("2026-07-22T16:00:00Z"),
      requestedAssets: [{ assetId: chairs.id, quantity: 50 }],
    });
    const asset = conflicts.find((c) => c.type === "ASSET_OVERALLOCATED");
    expect(asset).toBeDefined();
    expect(asset!.available).toBe(20);
  });
});

describe("detectConflicts — combined + edge inputs (F05-T04)", () => {
  it("returns BOTH a space and an asset conflict when both fail in the same window", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const chairs = await seedAsset({ totalQuantity: 100 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 90 }] });
    const conflicts = await detectConflicts({
      spaceId: space.id,
      start: d("2026-07-22T10:00:00Z"),
      end: d("2026-07-22T16:00:00Z"),
      requestedAssets: [{ assetId: chairs.id, quantity: 50 }],
    });
    const types = conflicts.map((c) => c.type).sort();
    expect(types).toEqual(["ASSET_OVERALLOCATED", "SPACE_DOUBLE_BOOKED"]);
  });

  it("excludeReservationId: a reservation never conflicts with itself (space + asset re-check)", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const chairs = await seedAsset({ totalQuantity: 100 });
    const req = await seedRequest();
    const res = await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 80 }] });

    const selfRecheck = await detectConflicts({
      spaceId: space.id,
      start: d("2026-07-22T09:00:00Z"),
      end: d("2026-07-22T18:00:00Z"),
      requestedAssets: [{ assetId: chairs.id, quantity: 80 }],
      excludeReservationId: res.id,
    });
    expect(selfRecheck).toEqual([]);

    // Without the exclusion the same probe collides with itself on both axes.
    const noExclude = await detectConflicts({
      spaceId: space.id,
      start: d("2026-07-22T09:00:00Z"),
      end: d("2026-07-22T18:00:00Z"),
      requestedAssets: [{ assetId: chairs.id, quantity: 80 }],
    });
    expect(noExclude.map((c) => c.type).sort()).toEqual(["ASSET_OVERALLOCATED", "SPACE_DOUBLE_BOOKED"]);
  });

  it("no spaceId → only the asset constraint is checked (no space lookup)", async () => {
    const chairs = await seedAsset({ totalQuantity: 100 });
    const conflicts = await detectConflicts({
      start: d("2026-07-22T09:00:00Z"),
      end: d("2026-07-22T18:00:00Z"),
      requestedAssets: [{ assetId: chairs.id, quantity: 40 }],
    });
    expect(conflicts).toEqual([]);
  });

  it("a non-existent spaceId yields no space conflict but still checks assets over the raw window", async () => {
    const chairs = await seedAsset({ totalQuantity: 10 });
    const conflicts = await detectConflicts({
      spaceId: "00000000-0000-4000-8000-000000000000",
      start: d("2026-07-22T09:00:00Z"),
      end: d("2026-07-22T18:00:00Z"),
      requestedAssets: [{ assetId: chairs.id, quantity: 25 }],
    });
    expect(conflicts.map((c) => c.type)).toEqual(["ASSET_OVERALLOCATED"]);
  });

  it("a completely free space + window with no assets → no conflicts", async () => {
    const space = await seedSpace();
    expect(await detectConflicts({ spaceId: space.id, start: d("2026-09-01T09:00:00Z"), end: d("2026-09-01T18:00:00Z") })).toEqual([]);
  });

  it("empty requestedAssets array → no asset conflicts", async () => {
    const space = await seedSpace();
    expect(await detectConflicts({ spaceId: space.id, start: d("2026-09-01T09:00:00Z"), end: d("2026-09-01T18:00:00Z"), requestedAssets: [] })).toEqual([]);
  });

  it("no spaceId and no assets → empty (nothing to check)", async () => {
    expect(await detectConflicts({ start: d("2026-09-01T09:00:00Z"), end: d("2026-09-01T18:00:00Z") })).toEqual([]);
  });
});

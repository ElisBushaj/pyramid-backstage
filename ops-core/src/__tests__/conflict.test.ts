import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation } from "./helpers/fixtures";
import { detectConflicts } from "../services/conflict";

beforeEach(resetDb);

const d = (s: string) => new Date(s);

describe("detectConflicts — the three types (F05-T04)", () => {
  it("SPACE_DOUBLE_BOOKED when event windows overlap in the same space", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED" });

    const conflicts = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T12:00:00Z"), end: d("2026-07-22T20:00:00Z") });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe("SPACE_DOUBLE_BOOKED");
    expect(conflicts[0]!.conflictingRequestIds).toEqual([req.id]);
  });

  it("SETUP_WINDOW_OVERLAP when event windows don't overlap but buffers collide", async () => {
    const space = await seedSpace({ setupBufferMinutes: 240, teardownBufferMinutes: 120 });
    const req = await seedRequest();
    // existing event 09–14; new event 15–20. Raw windows don't overlap (gap 1h),
    // but teardown(2h)+setup(4h)=6h > 1h gap → effective windows collide.
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T14:00:00Z", status: "CONFIRMED" });

    const conflicts = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T15:00:00Z"), end: d("2026-07-22T20:00:00Z") });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe("SETUP_WINDOW_OVERLAP");
  });

  it("no conflict when windows merely touch (half-open boundary)", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T10:00:00Z", end: "2026-07-22T14:00:00Z", status: "CONFIRMED" });
    const conflicts = await detectConflicts({ spaceId: space.id, start: d("2026-07-22T14:00:00Z"), end: d("2026-07-22T18:00:00Z") });
    expect(conflicts).toEqual([]);
  });

  it("ASSET_OVERALLOCATED when requested > available, carrying requested/available/assetId", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const chairs = await seedAsset({ name: "Standard chair", totalQuantity: 400 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 310 }] });

    const conflicts = await detectConflicts({
      spaceId: space.id,
      start: d("2026-07-23T09:00:00Z"),
      end: d("2026-07-23T18:00:00Z"),
      requestedAssets: [{ assetId: chairs.id, quantity: 180 }],
    });
    // different day → no space conflict; but assets are checked over the same... no, different window → asset is free
    expect(conflicts).toEqual([]);

    const sameWindow = await detectConflicts({
      spaceId: space.id,
      start: d("2026-07-22T09:00:00Z"),
      end: d("2026-07-22T18:00:00Z"),
      requestedAssets: [{ assetId: chairs.id, quantity: 180 }],
      excludeReservationId: undefined,
    });
    const asset = sameWindow.find((c) => c.type === "ASSET_OVERALLOCATED");
    expect(asset).toBeDefined();
    expect(asset!.assetId).toBe(chairs.id);
    expect(asset!.requested).toBe(180);
    expect(asset!.available).toBe(90);
  });

  it("no conflict at all for a completely free space + window", async () => {
    const space = await seedSpace();
    const conflicts = await detectConflicts({ spaceId: space.id, start: d("2026-09-01T09:00:00Z"), end: d("2026-09-01T18:00:00Z") });
    expect(conflicts).toEqual([]);
  });
});

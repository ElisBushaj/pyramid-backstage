import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, resetDb, prisma } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest } from "./helpers/fixtures";

const RES = "/api/v1/private/reservations";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };

beforeEach(resetDb);

describe("F06-T06 concurrency: the serializable tx + row locks kill the TOCTOU race", () => {
  it("two parallel holds for one scarce ASSET → exactly one wins, the other 409 ASSET_OVERALLOCATED", async () => {
    const client = await loginAs("OPS");
    // distinct spaces so ONLY the shared asset can cause a conflict
    const spaceA = await seedSpace();
    const spaceB = await seedSpace();
    const chairs = await seedAsset({ totalQuantity: 10 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();

    const [a, b] = await Promise.all([
      client.post(RES, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1").send({ requestId: r1.id, spaceId: spaceA.id, dateRange: W, assets: [{ assetId: chairs.id, quantity: 6 }] }),
      client.post(RES, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2").send({ requestId: r2.id, spaceId: spaceB.id, dateRange: W, assets: [{ assetId: chairs.id, quantity: 6 }] }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.conflicts.some((c: any) => c.type === "ASSET_OVERALLOCATED")).toBe(true);

    // post-condition: total held never exceeds stock; exactly one reservation; no partial loser row
    const held = await prisma.reservationAsset.aggregate({ _sum: { quantity: true }, where: { assetId: chairs.id, reservation: { status: "HELD" } } });
    expect(held._sum.quantity ?? 0).toBeLessThanOrEqual(10);
    expect(await prisma.reservation.count({ where: { status: "HELD" } })).toBe(1);
    // no partial loser row: the rolled-back hold left no orphan ReservationAsset behind
    expect(await prisma.reservationAsset.count({ where: { assetId: chairs.id } })).toBe(1);
  });

  it("two parallel holds for one SPACE window → exactly one wins, the other 409 SPACE_DOUBLE_BOOKED", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();

    const [a, b] = await Promise.all([
      client.post(RES, "cccccccc-cccc-4ccc-8ccc-ccccccccccc1").send({ requestId: r1.id, spaceId: space.id, dateRange: W }),
      client.post(RES, "dddddddd-dddd-4ddd-8ddd-ddddddddddd2").send({ requestId: r2.id, spaceId: space.id, dateRange: W }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.conflicts.some((c: any) => c.type === "SPACE_DOUBLE_BOOKED")).toBe(true);
    expect(await prisma.reservation.count({ where: { spaceId: space.id, status: "HELD" } })).toBe(1);
  });
});

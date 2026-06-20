import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, resetDb, prisma } from "./helpers/integration";
import { runSeed, SEED } from "../scripts/seed";

const STATS = "/api/v1/private/dashboard/stats";

describe("GET /dashboard/stats (F13-T05)", () => {
  it("computes each KPI from the seeded fixture", async () => {
    await runSeed({ reset: true });
    const client = await loginAs("OPS");
    const res = await client.get(STATS);
    expect(res.status).toBe(200);

    expect(res.body.data.pendingApprovals.value).toBe(1); // E2 PROPOSED
    expect(res.body.data.spacesInUse).toEqual({ inUse: 2, total: 19 }); // Blue (confirmed) + Green (held); F14: 19-space catalog
    expect(res.body.data.eventsThisWeek.value).toBe(3); // 3 requests created during the seed
    expect(res.body.data.lowStockAssets.value).toBe(0);
  });

  it("reflects an over-90%-committed asset as low stock", async () => {
    await resetDb();
    const client = await loginAs("OPS");
    const space = await prisma.space.create({ data: { name: "H", floor: 0, kind: "MAIN", capacities: { THEATER: 100 }, dayRateMinor: 1 } });
    const req = await prisma.eventRequest.create({ data: { title: "x", organizerName: "y", expectedAttendees: 1, eventType: "OTHER", preferredDates: [SEED.W1], status: "DRAFT" } });
    const mics = await prisma.asset.create({ data: { name: "Mic", type: "MICROPHONE", totalQuantity: 10, location: "AV", status: "ACTIVE" } });
    await client.post("/api/v1/private/reservations").send({ requestId: req.id, spaceId: space.id, dateRange: SEED.W1, assets: [{ assetId: mics.id, quantity: 10 }] });

    const res = await client.get(STATS);
    expect(res.body.data.lowStockAssets.value).toBe(1);
  });
});

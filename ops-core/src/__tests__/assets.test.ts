import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, resetDb, prisma } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation } from "./helpers/fixtures";

const ASSETS = "/api/v1/private/assets";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };

beforeEach(resetDb);

describe("assets CRUD + audit + below-holds guard (F03-T02/T04)", () => {
  it("OPS creates an asset + audit; VIEWER 403; invalid input 422; unknown PATCH 404", async () => {
    const viewer = await loginAs("VIEWER");
    const body = { name: "Wireless mic", type: "MICROPHONE", totalQuantity: 12, location: "AV Room" };
    expect((await viewer.post(ASSETS).send(body)).status).toBe(403);

    await resetDb();
    const ops = await loginAs("OPS");
    const create = await ops.post(ASSETS).send(body);
    expect(create.status).toBe(201);
    expect(await prisma.auditEntry.count({ where: { action: "asset.create" } })).toBe(1);

    const bad = await ops.post(ASSETS).send({ name: "X", type: "ROBOT", totalQuantity: -1, location: "Y" });
    expect(bad.status).toBe(422);

    const missing = await ops.patch(`${ASSETS}/00000000-0000-4000-8000-000000000000`).send({ totalQuantity: 5 });
    expect(missing.status).toBe(404);
  });

  it("rejects lowering totalQuantity below current peak holds (422), allows at/above", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace();
    const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 310 }] });

    const tooLow = await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 300 });
    expect(tooLow.status).toBe(422);
    expect(tooLow.body.fields.totalQuantity).toBe("asset.update.below_holds");

    const ok = await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 320 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.totalQuantity).toBe(320);
  });
});

describe("GET /assets windowed availableQuantity (F03-T03)", () => {
  it("310 of 400 held overlapping the window → availableQuantity 90; a non-overlapping hold doesn't reduce it", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace();
    const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();
    await seedReservation({ space, requestId: r1.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 310 }] });
    await seedReservation({ space, requestId: r2.id, start: "2026-09-09T09:00:00Z", end: "2026-09-09T18:00:00Z", status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 400 }] });

    const res = await ops.get(`${ASSETS}?type=SEATING&start=${W.start}&end=${W.end}`);
    expect(res.status).toBe(200);
    const chair = res.body.data.find((a: any) => a.id === chairs.id);
    expect(chair.availableQuantity).toBe(90);
  });

  it("MAINTENANCE/RETIRED report availableQuantity 0; without a window ACTIVE = total", async () => {
    const ops = await loginAs("OPS");
    await seedAsset({ name: "Broken screen", type: "SCREEN", totalQuantity: 6, status: "MAINTENANCE" });
    await seedAsset({ name: "Good table", type: "TABLE", totalQuantity: 80, status: "ACTIVE" });

    const res = await ops.get(ASSETS);
    const broken = res.body.data.find((a: any) => a.name === "Broken screen");
    const good = res.body.data.find((a: any) => a.name === "Good table");
    expect(broken.availableQuantity).toBe(0);
    expect(good.availableQuantity).toBe(80);
  });
});

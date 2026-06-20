import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, resetDb, prisma } from "./helpers/integration";

// F16 — QR/NFC asset tracking: scan → movement + live location + audit + outbox.
async function makeAsset(totalQuantity = 100, location = "Storage -1") {
  return prisma.asset.create({ data: { name: "Wireless mic", type: "MICROPHONE", totalQuantity, location, status: "ACTIVE" } });
}

const scanUrl = (id: string) => `/api/v1/private/assets/${id}/scan`;
const movesUrl = (id: string) => `/api/v1/private/assets/${id}/movements`;

beforeEach(resetDb);

describe("asset scan + movements (F16)", () => {
  it("CHECK_OUT records a movement, updates live location, writes audit + outbox", async () => {
    const ops = await loginAs("OPS");
    const asset = await makeAsset(100, "AV Room 0");

    const res = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 8, toLocation: "Blue Hall" });
    expect(res.status).toBe(201);
    expect(res.body.data.asset.location).toBe("Blue Hall");
    expect(res.body.data.asset.checkedOutQuantity).toBe(8);
    expect(res.body.data.movement).toMatchObject({ action: "CHECK_OUT", quantity: 8, fromLocation: "AV Room 0", toLocation: "Blue Hall", actorId: ops.user.id });

    expect(await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } }).then((a) => a.location)).toBe("Blue Hall");
    expect(await prisma.auditEntry.count({ where: { action: "asset.scan", entityId: asset.id } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { subject: "asset.moved" } })).toBe(1);
  });

  it("guards over-checkout (can't have more units out than exist) → 422", async () => {
    const ops = await loginAs("OPS");
    const asset = await makeAsset(10);
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 7, toLocation: "Blue Hall" });
    const over = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 5, toLocation: "Green Hall" });
    expect(over.status).toBe(422);
    expect(over.body.messageKey).toBe("validation.failed");
    expect(over.body.fields?.quantity).toBe("asset.scan.over_checkout");
    // net unchanged after the rejected scan
    expect(await prisma.assetMovement.count({ where: { assetId: asset.id } })).toBe(1);
  });

  it("CHECK_IN reduces the net out; guards over-check-in → 422", async () => {
    const ops = await loginAs("OPS");
    const asset = await makeAsset(50);
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 20, toLocation: "Blue Hall" });
    const back = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_IN", quantity: 12, toLocation: "Storage -1" });
    expect(back.status).toBe(201);
    expect(back.body.data.asset.checkedOutQuantity).toBe(8);
    const tooMany = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_IN", quantity: 20, toLocation: "Storage -1" });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.fields?.quantity).toBe("asset.scan.over_checkin");
  });

  it("lists movements newest-first and rolls up checkedOutQuantity on GET /assets", async () => {
    const ops = await loginAs("OPS");
    const asset = await makeAsset(100);
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 30, toLocation: "Blue Hall" });
    await ops.post(scanUrl(asset.id)).send({ action: "RELOCATE", quantity: 30, toLocation: "Orange Hall" });

    const moves = await ops.get(movesUrl(asset.id));
    expect(moves.status).toBe(200);
    expect(moves.body.data.length).toBe(2);
    expect(moves.body.data[0].action).toBe("RELOCATE"); // newest first

    const list = await ops.get("/api/v1/private/assets");
    const row = (list.body.data as Array<{ id: string; checkedOutQuantity: number }>).find((a) => a.id === asset.id);
    expect(row?.checkedOutQuantity).toBe(30); // RELOCATE doesn't change net out
  });

  it("requires OPS+ (VIEWER is 403)", async () => {
    const viewer = await loginAs("VIEWER");
    const asset = await makeAsset();
    const res = await viewer.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 1, toLocation: "Blue Hall" });
    expect(res.status).toBe(403);
  });
});

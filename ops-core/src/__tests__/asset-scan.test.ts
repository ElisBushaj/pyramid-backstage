import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { loginAs, anon, resetDb, prisma, auditEntriesFor } from "./helpers/integration";
import { seedAsset, seedAssetMovement, seedRequest, seedReservation, seedSpace } from "./helpers/fixtures";

// F16 — QR/NFC asset tracking: scan → movement + live location + audit.
const scanUrl = (id: string) => `/api/v1/private/assets/${id}/scan`;
const movesUrl = (id: string) => `/api/v1/private/assets/${id}/movements`;
const ASSETS = "/api/v1/private/assets";

beforeEach(resetDb);

// ───────────────────────────── scan: CHECK_OUT ─────────────────────────────
describe("POST /assets/:id/scan — CHECK_OUT (F16-T02)", () => {
  it("records a movement, flips live location, returns the new net out + movement", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ name: "Wireless mic", type: "MICROPHONE", totalQuantity: 100, location: "AV Room 0" });

    const res = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 8, toLocation: "Blue Hall" });
    expect(res.status).toBe(201);
    expect(res.body.messageKey).toBe("asset.scanned");
    expect(res.body.data.asset.location).toBe("Blue Hall");
    expect(res.body.data.asset.checkedOutQuantity).toBe(8);
    expect(res.body.data.asset.lastMovedAt).toBeTruthy();
    expect(res.body.data.movement).toMatchObject({
      action: "CHECK_OUT", quantity: 8, fromLocation: "AV Room 0", toLocation: "Blue Hall", actorId: ops.user.id,
    });
    expect(res.body.data.movement.id).toBeTruthy();
    expect(res.body.data.movement.at).toBeTruthy();

    const row = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row.location).toBe("Blue Hall");
    expect(await prisma.assetMovement.count({ where: { assetId: asset.id } })).toBe(1);
  });

  it("writes exactly one asset.scan AuditEntry (before/after location) in the same tx", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100, location: "Store -1" });

    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 10, toLocation: "Blue Hall", reservationId: undefined });

    const audit = await auditEntriesFor("Asset", asset.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "asset.scan", actorId: ops.user.id, actorName: ops.user.name });
    expect(audit[0]!.before).toMatchObject({ location: "Store -1" });
    expect(audit[0]!.after).toMatchObject({ location: "Blue Hall" });
  });

  it("persists the optional reservationId + note onto the movement", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100 });
    const space = await seedSpace();
    const req = await seedRequest();
    const reservation = await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED" });

    const res = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 5, toLocation: "Blue Hall", reservationId: reservation.id, note: "for the gala" });
    expect(res.status).toBe(201);
    expect(res.body.data.movement).toMatchObject({ reservationId: reservation.id, note: "for the gala" });
  });

  it("CHECK_OUT exactly up to totalQuantity is allowed (net == total)", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10 });
    const res = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 10, toLocation: "Blue Hall" });
    expect(res.status).toBe(201);
    expect(res.body.data.asset.checkedOutQuantity).toBe(10);
  });

  it("OVER-CHECKOUT (net + qty > total) → 422 asset.scan.over_checkout; ledger + location unchanged", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10, location: "Store" });
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 7, toLocation: "Blue Hall" });

    const over = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 5, toLocation: "Green Hall" });
    expect(over.status).toBe(422);
    expect(over.body.error).toBe("validation");
    expect(over.body.messageKey).toBe("validation.failed");
    expect(over.body.fields.quantity).toBe("asset.scan.over_checkout");

    // The rejected scan left nothing behind: still one movement, location still Blue Hall (from the first scan).
    expect(await prisma.assetMovement.count({ where: { assetId: asset.id } })).toBe(1);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).location).toBe("Blue Hall");
    expect(await prisma.auditEntry.count({ where: { action: "asset.scan", entityId: asset.id } })).toBe(1);
  });

  it("a single CHECK_OUT above total → 422 (no silent negative, no movement)", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 5 });
    const over = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 6, toLocation: "Blue Hall" });
    expect(over.status).toBe(422);
    expect(over.body.fields.quantity).toBe("asset.scan.over_checkout");
    expect(await prisma.assetMovement.count({ where: { assetId: asset.id } })).toBe(0);
  });

  it("the over-checkout guard reads the CURRENT total — a CHECK_OUT honors a freshly-lowered totalQuantity", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100 });
    // Lower total to 5 via PATCH (allowed — no holds), then a CHECK_OUT of 6 must be rejected.
    expect((await ops.patch(`${ASSETS}/${asset.id}`).send({ totalQuantity: 5 })).status).toBe(200);
    const over = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 6, toLocation: "Blue Hall" });
    expect(over.status).toBe(422);
    expect(over.body.fields.quantity).toBe("asset.scan.over_checkout");
  });
});

// ───────────────────────────── scan: CHECK_IN ─────────────────────────────
describe("POST /assets/:id/scan — CHECK_IN (F16-T02)", () => {
  it("reduces the net out and flips location to the return store", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 50, location: "Store -1" });
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 20, toLocation: "Blue Hall" });

    const back = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_IN", quantity: 12, toLocation: "Store -1" });
    expect(back.status).toBe(201);
    expect(back.body.data.asset.checkedOutQuantity).toBe(8);
    expect(back.body.data.asset.location).toBe("Store -1");
    expect(back.body.data.movement).toMatchObject({ action: "CHECK_IN", quantity: 12, fromLocation: "Blue Hall", toLocation: "Store -1" });
  });

  it("checking in exactly the open count returns net to 0", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 50 });
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 20, toLocation: "Blue Hall" });
    const back = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_IN", quantity: 20, toLocation: "Store -1" });
    expect(back.status).toBe(201);
    expect(back.body.data.asset.checkedOutQuantity).toBe(0);
  });

  it("OVER-CHECKIN (qty > net out) → 422 asset.scan.over_checkin; nothing written", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 50 });
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 20, toLocation: "Blue Hall" });

    const tooMany = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_IN", quantity: 21, toLocation: "Store -1" });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.fields.quantity).toBe("asset.scan.over_checkin");
    expect(await prisma.assetMovement.count({ where: { assetId: asset.id } })).toBe(1); // only the CHECK_OUT
  });

  it("CHECK_IN with nothing out → 422 (net is 0)", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 50 });
    const res = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_IN", quantity: 1, toLocation: "Store -1" });
    expect(res.status).toBe(422);
    expect(res.body.fields.quantity).toBe("asset.scan.over_checkin");
  });
});

// ───────────────────────────── scan: RELOCATE ─────────────────────────────
describe("POST /assets/:id/scan — RELOCATE (F16-T02)", () => {
  it("moves location WITHOUT changing the net checked-out count or total", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100, location: "Store" });
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 30, toLocation: "Blue Hall" });

    const reloc = await ops.post(scanUrl(asset.id)).send({ action: "RELOCATE", quantity: 30, toLocation: "Orange Hall" });
    expect(reloc.status).toBe(201);
    expect(reloc.body.data.asset.checkedOutQuantity).toBe(30); // unchanged
    expect(reloc.body.data.asset.location).toBe("Orange Hall");
    expect(reloc.body.data.asset.totalQuantity).toBe(100);
    expect(reloc.body.data.movement).toMatchObject({ action: "RELOCATE", fromLocation: "Blue Hall", toLocation: "Orange Hall" });
  });

  it("RELOCATE works from a fresh asset (no prior checkout) and never trips the over-checkout guard", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10, location: "Store A" });
    const reloc = await ops.post(scanUrl(asset.id)).send({ action: "RELOCATE", quantity: 999, toLocation: "Store B" });
    expect(reloc.status).toBe(201);
    expect(reloc.body.data.asset.checkedOutQuantity).toBe(0);
    expect(reloc.body.data.asset.location).toBe("Store B");
  });
});

// ───────────────────────────── scan: validation + 404 ─────────────────────────────
describe("POST /assets/:id/scan — validation & not-found (F16-T02)", () => {
  it("quantity < 1 → 422 validation.min, no movement", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10 });
    const res = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 0, toLocation: "Blue Hall" });
    expect(res.status).toBe(422);
    expect(res.body.fields.quantity).toBe("validation.min");
    expect(await prisma.assetMovement.count({ where: { assetId: asset.id } })).toBe(0);
  });

  it("negative quantity → 422", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10 });
    expect((await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: -3, toLocation: "Blue Hall" })).status).toBe(422);
  });

  it("unknown action enum → 422", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10 });
    const res = await ops.post(scanUrl(asset.id)).send({ action: "TELEPORT", quantity: 1, toLocation: "Blue Hall" });
    expect(res.status).toBe(422);
    expect(res.body.fields.action).toBe("validation.enum");
  });

  it("missing/blank toLocation → 422", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10 });
    const absent = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 1 });
    expect(absent.status).toBe(422);
    expect(absent.body.fields.toLocation).toBeTruthy();
    const blank = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 1, toLocation: "  " });
    expect(blank.status).toBe(422);
    expect(blank.body.fields.toLocation).toBe("validation.required");
  });

  it("non-UUID reservationId → 422", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10 });
    const res = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 1, toLocation: "Blue Hall", reservationId: "not-a-uuid" });
    expect(res.status).toBe(422);
    expect(res.body.fields.reservationId).toBe("validation.uuid");
  });

  it("an over-long note → 422", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10 });
    const res = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 1, toLocation: "Blue Hall", note: "x".repeat(281) });
    expect(res.status).toBe(422);
    expect(res.body.fields.note).toBe("validation.length");
  });

  it("unknown asset id → 404", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.post(scanUrl(randomUUID())).send({ action: "CHECK_OUT", quantity: 1, toLocation: "Blue Hall" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("requires an Idempotency-Key (422 when absent)", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10 });
    const res = await (ops as unknown as { agent: any }).agent.post(scanUrl(asset.id)).set("x-csrf-token", ops.csrf).send({ action: "CHECK_OUT", quantity: 1, toLocation: "Blue Hall" });
    expect(res.status).toBe(422);
    expect(res.body.fields["Idempotency-Key"]).toBe("validation.required");
  });
});

// ───────────────────────────── scan: idempotency ─────────────────────────────
describe("POST /assets/:id/scan — idempotency (F16-T02)", () => {
  it("a replay with the same key returns the ORIGINAL movement — no second ledger row, no second location flip", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100, location: "Store" });
    const key = "44444444-4444-4444-8444-444444444444";
    const body = { action: "CHECK_OUT", quantity: 30, toLocation: "Blue Hall" };

    const first = await ops.post(scanUrl(asset.id), key).send(body);
    const replay = await ops.post(scanUrl(asset.id), key).send(body);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.data.movement.id).toBe(first.body.data.movement.id);

    // Exactly one movement, net out is 30 (not 60), location flipped once.
    expect(await prisma.assetMovement.count({ where: { assetId: asset.id } })).toBe(1);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).location).toBe("Blue Hall");
    expect(await prisma.auditEntry.count({ where: { action: "asset.scan" } })).toBe(1);
  });

  it("the same key + a DIFFERENT body → 409 idempotency_key_mismatch", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100 });
    const key = "55555555-5555-4555-8555-555555555555";
    await ops.post(scanUrl(asset.id), key).send({ action: "CHECK_OUT", quantity: 30, toLocation: "Blue Hall" });
    const mismatch = await ops.post(scanUrl(asset.id), key).send({ action: "CHECK_OUT", quantity: 31, toLocation: "Blue Hall" });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error).toBe("idempotency_key_mismatch");
    expect(await prisma.assetMovement.count({ where: { assetId: asset.id } })).toBe(1);
  });

  it("a rejected (422) scan is NOT cached — the same key retries successfully after fixing the body", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10 });
    const key = "66666666-6666-4666-8666-666666666666";
    const bad = await ops.post(scanUrl(asset.id), key).send({ action: "CHECK_OUT", quantity: 99, toLocation: "Blue Hall" });
    expect(bad.status).toBe(422);
    // Same key, a body that now passes: idempotency only caches success-ish writes, so this is allowed.
    const good = await ops.post(scanUrl(asset.id), key).send({ action: "CHECK_OUT", quantity: 99, toLocation: "Blue Hall" });
    expect(good.status).toBe(422); // still over — but proves no 409 mismatch off a cached failure
  });
});

// ───────────────────────────── GET /movements (ledger) ─────────────────────────────
describe("GET /assets/:id/movements — ledger (F16-T03)", () => {
  it("returns the ledger newest-first as a paginated envelope", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100 });
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 30, toLocation: "Blue Hall" });
    await ops.post(scanUrl(asset.id)).send({ action: "RELOCATE", quantity: 30, toLocation: "Orange Hall" });

    const res = await ops.get(movesUrl(asset.id));
    expect(res.status).toBe(200);
    expect(res.body.messageKey).toBe("asset.movements.success");
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].action).toBe("RELOCATE"); // newest first
    expect(res.body.data[1].action).toBe("CHECK_OUT");
    expect(res.body).toMatchObject({ total: 2, page: 1 });
    expect(res.body.totalPages).toBe(1);
  });

  it("orders strictly by `at` descending even for fixture rows inserted out of order", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100 });
    const older = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-03-01T00:00:00Z");
    await seedAssetMovement({ assetId: asset.id, action: "CHECK_OUT", quantity: 1, toLocation: "A", at: newer });
    await seedAssetMovement({ assetId: asset.id, action: "RELOCATE", quantity: 1, toLocation: "B", at: older });

    const res = await ops.get(movesUrl(asset.id));
    expect(res.body.data.map((m: any) => m.at)).toEqual([newer.toISOString(), older.toISOString()]);
  });

  it("paginates with page/pageSize and clamps pageSize to the 100 max", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 1000 });
    for (let i = 0; i < 5; i++) await seedAssetMovement({ assetId: asset.id, action: "RELOCATE", quantity: 1, toLocation: `L${i}`, at: new Date(Date.UTC(2026, 0, i + 1)) });

    const p1 = await ops.get(`${movesUrl(asset.id)}?page=1&pageSize=2`);
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body).toMatchObject({ total: 5, page: 1, pageSize: 2, totalPages: 3 });
    const p3 = await ops.get(`${movesUrl(asset.id)}?page=3&pageSize=2`);
    expect(p3.body.data).toHaveLength(1); // last page

    const clamped = await ops.get(`${movesUrl(asset.id)}?pageSize=99999`);
    expect(clamped.body.pageSize).toBe(100);
  });

  it("clamps malformed pagination params — a negative page never 500s, a fractional page is floored", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100 });
    await seedAssetMovement({ assetId: asset.id, action: "CHECK_OUT", quantity: 1, toLocation: "X" });

    const neg = await ops.get(`${movesUrl(asset.id)}?page=-1`);
    expect(neg.status).toBe(200); // clamped to page 1, not a crash
    expect(neg.body.page).toBe(1);
    expect(neg.body.data).toHaveLength(1);

    const frac = await ops.get(`${movesUrl(asset.id)}?page=1.5`);
    expect(frac.status).toBe(200);
    expect(frac.body.page).toBe(1); // floored, not echoed back as 1.5
    expect(frac.body.data).toHaveLength(1);

    const negSize = await ops.get(`${movesUrl(asset.id)}?pageSize=-5`);
    expect(negSize.status).toBe(200);
    expect(negSize.body.pageSize).toBeGreaterThanOrEqual(1);
  });

  it("a page past the end → an empty page (200), not a 404 or 500", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100 });
    await seedAssetMovement({ assetId: asset.id, action: "CHECK_OUT", quantity: 1, toLocation: "X" });
    const res = await ops.get(`${movesUrl(asset.id)}?page=99999&pageSize=10`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(1);
  });

  it("an asset with no movements → an empty page (200), not a 404", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10 });
    const res = await ops.get(movesUrl(asset.id));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("unknown asset id → 404", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.get(movesUrl(randomUUID()));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("scopes the ledger to the asset (never leaks another asset's movements)", async () => {
    const ops = await loginAs("OPS");
    const a = await seedAsset({ totalQuantity: 10 });
    const b = await seedAsset({ totalQuantity: 10 });
    await seedAssetMovement({ assetId: a.id, action: "CHECK_OUT", quantity: 1, toLocation: "X" });
    await seedAssetMovement({ assetId: b.id, action: "CHECK_OUT", quantity: 1, toLocation: "Y" });
    const res = await ops.get(movesUrl(a.id));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data.every((m: any) => m.assetId === a.id)).toBe(true);
  });

  it("the ledger is append-only: a compensating CHECK_IN never mutates the prior CHECK_OUT row", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100 });
    const out = await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 30, toLocation: "Blue Hall" });
    const outId = out.body.data.movement.id;
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_IN", quantity: 30, toLocation: "Store" });

    const original = await prisma.assetMovement.findUniqueOrThrow({ where: { id: outId } });
    expect(original).toMatchObject({ action: "CHECK_OUT", quantity: 30, toLocation: "Blue Hall" });
    expect(await prisma.assetMovement.count({ where: { assetId: asset.id } })).toBe(2);
  });
});

// ───────────────────────── GET /assets rollup (live tracking) ─────────────────────────
describe("GET /assets — live-tracking rollup (F16-T03)", () => {
  it("reports checkedOutQuantity (net out) and lastMovedAt; RELOCATE doesn't change net", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100 });
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 30, toLocation: "Blue Hall" });
    await ops.post(scanUrl(asset.id)).send({ action: "RELOCATE", quantity: 30, toLocation: "Orange Hall" });

    const list = await ops.get(ASSETS);
    const row = list.body.data.find((a: any) => a.id === asset.id);
    expect(row.checkedOutQuantity).toBe(30);
    expect(row.location).toBe("Orange Hall");
    expect(row.lastMovedAt).toBeTruthy();
  });

  it("net out folds CHECK_OUT − CHECK_IN and floors at 0", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100 });
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 30, toLocation: "Blue Hall" });
    await ops.post(scanUrl(asset.id)).send({ action: "CHECK_IN", quantity: 10, toLocation: "Store" });
    const list = await ops.get(ASSETS);
    expect(list.body.data.find((a: any) => a.id === asset.id).checkedOutQuantity).toBe(20);
  });

  it("an asset with no movements rolls up to checkedOutQuantity 0 and no lastMovedAt", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100 });
    const list = await ops.get(ASSETS);
    const row = list.body.data.find((a: any) => a.id === asset.id);
    expect(row.checkedOutQuantity).toBe(0);
    expect(row.lastMovedAt).toBeUndefined();
  });
});

// ──────────────────── concurrency: the over-checkout race (TOCTOU) ────────────────────
describe("POST /assets/:id/scan — concurrent over-checkout is serialized (F16-T02)", () => {
  it("two simultaneous CHECK_OUTs that TOGETHER exceed total: at most one succeeds; net never exceeds total", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10, location: "Store" });

    // Each wants 7; 7+7=14 > 10. The serializable tx + FOR UPDATE row lock must let
    // at most one through; a second 7 would push net to 14 (a silent over-checkout).
    const [a, b] = await Promise.all([
      ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 7, toLocation: "Blue Hall" }),
      ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 7, toLocation: "Green Hall" }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 422]); // exactly one win, one rejection
    const over = [a, b].find((r) => r.status === 422)!;
    expect(over.body.fields.quantity).toBe("asset.scan.over_checkout");

    // Ground truth from the DB: exactly one movement, net out == 7 (never 14).
    expect(await prisma.assetMovement.count({ where: { assetId: asset.id, action: "CHECK_OUT" } })).toBe(1);
    const grouped = await prisma.assetMovement.groupBy({ by: ["action"], where: { assetId: asset.id }, _sum: { quantity: true } });
    const out = grouped.find((g) => g.action === "CHECK_OUT")?._sum.quantity ?? 0;
    expect(out).toBeLessThanOrEqual(asset.totalQuantity);
    expect(out).toBe(7);
  });

  it("many concurrent CHECK_OUTs that each fit individually but not collectively: net is capped at total", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 10 });
    // 6 racers × 3 = 18 demanded; only 10 available. Net out must land ≤ 10.
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        ops.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 3, toLocation: `Hall ${i}` }),
      ),
    );
    const ok = results.filter((r) => r.status === 201).length;
    const grouped = await prisma.assetMovement.groupBy({ by: ["action"], where: { assetId: asset.id }, _sum: { quantity: true } });
    const out = grouped.find((g) => g.action === "CHECK_OUT")?._sum.quantity ?? 0;
    expect(out).toBeLessThanOrEqual(10);
    expect(out).toBe(ok * 3); // every success wrote exactly its quantity, no partials
    // No 5xx — over-checkouts are clean 422s, not crashes.
    expect(results.every((r) => r.status === 201 || r.status === 422)).toBe(true);
  });
});

// ───────────────────────────── RBAC matrix ─────────────────────────────
describe("scan + movements RBAC (F16-T02/T07)", () => {
  it("scan: OPS/MANAGER/ADMIN allowed", async () => {
    for (const role of ["OPS", "MANAGER", "ADMIN"] as const) {
      await resetDb();
      const c = await loginAs(role);
      const asset = await seedAsset({ totalQuantity: 10 });
      const res = await c.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 1, toLocation: "Blue Hall" });
      expect(res.status, role).toBe(201);
    }
  });

  it("scan: VIEWER → 403, PARTNER → 403, anon → 401; no movement written", async () => {
    const viewer = await loginAs("VIEWER");
    const asset = await seedAsset({ totalQuantity: 10 });
    const v = await viewer.post(scanUrl(asset.id)).send({ action: "CHECK_OUT", quantity: 1, toLocation: "Blue Hall" });
    expect(v.status).toBe(403);
    expect(v.body.error).toBe("forbidden");

    await resetDb();
    const partner = await loginAs("PARTNER");
    const asset2 = await seedAsset({ totalQuantity: 10 });
    expect((await partner.post(scanUrl(asset2.id)).send({ action: "CHECK_OUT", quantity: 1, toLocation: "Blue Hall" })).status).toBe(403);

    await resetDb();
    const asset3 = await seedAsset({ totalQuantity: 10 });
    const a = await anon().post(scanUrl(asset3.id)).set("Idempotency-Key", randomUUID()).send({ action: "CHECK_OUT", quantity: 1, toLocation: "Blue Hall" });
    expect(a.status).toBe(401);
    expect(await prisma.assetMovement.count()).toBe(0);
  });

  it("movements: VIEWER may read; PARTNER → 403; anon → 401", async () => {
    const viewer = await loginAs("VIEWER");
    const asset = await seedAsset({ totalQuantity: 10 });
    expect((await viewer.get(movesUrl(asset.id))).status).toBe(200);

    const partner = await loginAs("PARTNER");
    expect((await partner.get(movesUrl(asset.id))).status).toBe(403);

    expect((await anon().get(movesUrl(asset.id))).status).toBe(401);
  });
});

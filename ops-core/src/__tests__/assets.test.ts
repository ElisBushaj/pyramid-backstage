import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { loginAs, anon, resetDb, prisma, auditEntriesFor } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation } from "./helpers/fixtures";

const ASSETS = "/api/v1/private/assets";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };
// A second window that does NOT overlap W (different day).
const W2 = { start: "2026-09-09T09:00:00Z", end: "2026-09-09T18:00:00Z" };

beforeEach(resetDb);

// ───────────────────────────── create (OPS+) ─────────────────────────────
describe("POST /assets — create (F03-T02)", () => {
  it("OPS creates an asset, persists it, and writes exactly one asset.create audit (after, no before)", async () => {
    const ops = await loginAs("OPS");
    const body = { name: "Wireless mic", type: "MICROPHONE", totalQuantity: 12, location: "AV Room" };

    const res = await ops.post(ASSETS).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Wireless mic", type: "MICROPHONE", totalQuantity: 12, location: "AV Room", status: "ACTIVE" });
    expect(res.body.data.id).toBeTruthy();

    const row = await prisma.asset.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.totalQuantity).toBe(12);

    const audit = await auditEntriesFor("Asset", res.body.data.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "asset.create", actorId: ops.user.id, actorName: ops.user.name });
    expect(audit[0]!.after).toMatchObject({ name: "Wireless mic", type: "MICROPHONE", totalQuantity: 12 });
    expect(audit[0]!.before).toBeNull();
  });

  it("defaults status to ACTIVE but honors an explicit MAINTENANCE", async () => {
    const ops = await loginAs("OPS");
    const def = await ops.post(ASSETS).send({ name: "Chairs", type: "SEATING", totalQuantity: 50, location: "Store" });
    expect(def.body.data.status).toBe("ACTIVE");
    const maint = await ops.post(ASSETS).send({ name: "Old screen", type: "SCREEN", totalQuantity: 2, location: "Store", status: "MAINTENANCE" });
    expect(maint.body.data.status).toBe("MAINTENANCE");
  });

  it("allows totalQuantity 0 (intMin 0) on create", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.post(ASSETS).send({ name: "Spare", type: "OTHER", totalQuantity: 0, location: "Store" });
    expect(res.status).toBe(201);
    expect(res.body.data.totalQuantity).toBe(0);
  });

  it("MANAGER and ADMIN can create (OPS+ ladder)", async () => {
    for (const role of ["MANAGER", "ADMIN"] as const) {
      await resetDb();
      const c = await loginAs(role);
      const res = await c.post(ASSETS).send({ name: `${role} mic`, type: "MICROPHONE", totalQuantity: 1, location: "X" });
      expect(res.status, role).toBe(201);
    }
  });

  describe("validation → 422 with field messageKeys, nothing written", () => {
    it("absent name → validation.invalid (not a string); blank name → validation.required", async () => {
      const ops = await loginAs("OPS");
      const absent = await ops.post(ASSETS).send({ type: "MICROPHONE", totalQuantity: 1, location: "X" });
      expect(absent.status).toBe(422);
      expect(absent.body.error).toBe("validation");
      expect(absent.body.messageKey).toBe("validation.failed");
      expect(absent.body.fields.name).toBe("validation.invalid");
      expect(await prisma.asset.count()).toBe(0);

      const blank = await ops.post(ASSETS).send({ name: "   ", type: "MICROPHONE", totalQuantity: 1, location: "X" });
      expect(blank.status).toBe(422);
      expect(blank.body.fields.name).toBe("validation.required");
    });

    it("unknown type enum", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(ASSETS).send({ name: "X", type: "ROBOT", totalQuantity: 1, location: "X" });
      expect(res.status).toBe(422);
      expect(res.body.fields.type).toBe("validation.enum");
    });

    it("negative totalQuantity", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(ASSETS).send({ name: "X", type: "SEATING", totalQuantity: -1, location: "X" });
      expect(res.status).toBe(422);
      expect(res.body.fields.totalQuantity).toBe("validation.min");
    });

    it("absent location → validation.invalid", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(ASSETS).send({ name: "X", type: "SEATING", totalQuantity: 1 });
      expect(res.status).toBe(422);
      expect(res.body.fields.location).toBe("validation.invalid");
    });

    it("bad status enum", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(ASSETS).send({ name: "X", type: "SEATING", totalQuantity: 1, location: "X", status: "BROKEN" });
      expect(res.status).toBe(422);
      expect(res.body.fields.status).toBe("validation.enum");
    });

    it("collects multiple field errors at once", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(ASSETS).send({ type: "ROBOT", totalQuantity: -5 });
      expect(res.status).toBe(422);
      expect(Object.keys(res.body.fields).sort()).toEqual(["location", "name", "totalQuantity", "type"]);
    });
  });

  describe("RBAC", () => {
    it("VIEWER → 403, nothing written", async () => {
      const viewer = await loginAs("VIEWER");
      const res = await viewer.post(ASSETS).send({ name: "X", type: "SEATING", totalQuantity: 1, location: "X" });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("forbidden");
      expect(await prisma.asset.count()).toBe(0);
    });

    it("PARTNER → 403 (staff surface denies rank −1)", async () => {
      const partner = await loginAs("PARTNER");
      const res = await partner.post(ASSETS).send({ name: "X", type: "SEATING", totalQuantity: 1, location: "X" });
      expect(res.status).toBe(403);
    });

    it("anonymous → 401", async () => {
      const res = await anon().post(ASSETS).set("Idempotency-Key", randomUUID()).send({ name: "X", type: "SEATING", totalQuantity: 1, location: "X" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("unauthorized");
    });
  });

  it("requires an Idempotency-Key (422 when absent)", async () => {
    const ops = await loginAs("OPS");
    // bypass the Client auto-key by hitting the agent without setting the header
    const res = await (ops as unknown as { agent: any }).agent.post(ASSETS).set("x-csrf-token", ops.csrf).send({ name: "X", type: "SEATING", totalQuantity: 1, location: "X" });
    expect(res.status).toBe(422);
    expect(res.body.fields["Idempotency-Key"]).toBe("validation.required");
  });
});

// ───────────────────────────── update (OPS+) ─────────────────────────────
describe("PATCH /assets/:id — update (F03-T02/T04)", () => {
  it("OPS updates whitelisted fields, persists, writes one asset.update audit (before/after)", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ name: "Chairs", totalQuantity: 100, status: "ACTIVE", location: "Store" });

    const res = await ops.patch(`${ASSETS}/${asset.id}`).send({ name: "Stacking chairs", totalQuantity: 150, location: "Loading Bay", status: "MAINTENANCE" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Stacking chairs", totalQuantity: 150, location: "Loading Bay", status: "MAINTENANCE" });

    const row = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row).toMatchObject({ name: "Stacking chairs", totalQuantity: 150, location: "Loading Bay", status: "MAINTENANCE" });

    const audit = await auditEntriesFor("Asset", asset.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "asset.update", actorId: ops.user.id });
    expect(audit[0]!.before).toMatchObject({ totalQuantity: 100, status: "ACTIVE" });
    expect(audit[0]!.after).toMatchObject({ totalQuantity: 150, status: "MAINTENANCE" });
  });

  it("ignores unknown columns — never passes req.body straight to Prisma (whitelist)", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ name: "Chairs", totalQuantity: 100 });
    const res = await ops.patch(`${ASSETS}/${asset.id}`).send({ name: "Renamed", id: "hacked", createdAt: "2000-01-01T00:00:00Z", bogus: 1 });
    expect(res.status).toBe(200);
    const row = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row.id).toBe(asset.id); // id not reassigned
    expect(row.name).toBe("Renamed");
  });

  it("a type-only PATCH changes just the type", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ name: "Thing", type: "OTHER", totalQuantity: 10 });
    const res = await ops.patch(`${ASSETS}/${asset.id}`).send({ type: "LIGHTING" });
    expect(res.status).toBe(200);
    const row = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row).toMatchObject({ name: "Thing", type: "LIGHTING", totalQuantity: 10 });
  });

  it("a partial PATCH leaves untouched fields intact", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ name: "Chairs", totalQuantity: 100, location: "Store", status: "ACTIVE" });
    const res = await ops.patch(`${ASSETS}/${asset.id}`).send({ location: "Blue Hall" });
    expect(res.status).toBe(200);
    const row = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row).toMatchObject({ name: "Chairs", totalQuantity: 100, location: "Blue Hall", status: "ACTIVE" });
  });

  it("unknown id → 404", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.patch(`${ASSETS}/${randomUUID()}`).send({ totalQuantity: 5 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("invalid field → 422 (e.g. bad type enum), nothing changed", async () => {
    const ops = await loginAs("OPS");
    const asset = await seedAsset({ totalQuantity: 100 });
    const res = await ops.patch(`${ASSETS}/${asset.id}`).send({ type: "ROBOT" });
    expect(res.status).toBe(422);
    expect(res.body.fields.type).toBe("validation.enum");
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).totalQuantity).toBe(100);
  });

  describe("lower-below-holds guard (peak concurrent hold)", () => {
    it("rejects lowering below the peak concurrent hold (422 asset.update.below_holds), no write", async () => {
      const ops = await loginAs("OPS");
      const space = await seedSpace();
      const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
      const req = await seedRequest();
      await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 310 }] });

      const tooLow = await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 300 });
      expect(tooLow.status).toBe(422);
      expect(tooLow.body.error).toBe("validation");
      expect(tooLow.body.fields.totalQuantity).toBe("asset.update.below_holds");
      expect((await prisma.asset.findUniqueOrThrow({ where: { id: chairs.id } })).totalQuantity).toBe(400);
      expect(await prisma.auditEntry.count({ where: { action: "asset.update" } })).toBe(0);
    });

    it("lowering to EXACTLY the peak hold is allowed", async () => {
      const ops = await loginAs("OPS");
      const space = await seedSpace();
      const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
      const req = await seedRequest();
      await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 310 }] });

      const exact = await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 310 });
      expect(exact.status).toBe(200);
      expect(exact.body.data.totalQuantity).toBe(310);
    });

    it("lowering above the peak hold succeeds", async () => {
      const ops = await loginAs("OPS");
      const space = await seedSpace();
      const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
      const req = await seedRequest();
      await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 310 }] });

      const ok = await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 320 });
      expect(ok.status).toBe(200);
      expect(ok.body.data.totalQuantity).toBe(320);
    });

    it("raising totalQuantity is always allowed (no guard)", async () => {
      const ops = await loginAs("OPS");
      const space = await seedSpace();
      const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
      const req = await seedRequest();
      await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 310 }] });
      const res = await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 9999 });
      expect(res.status).toBe(200);
      expect(res.body.data.totalQuantity).toBe(9999);
    });

    it("PEAK is the max concurrent demand: two NON-overlapping holds → peak is the larger, not the sum", async () => {
      const ops = await loginAs("OPS");
      const space = await seedSpace();
      const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
      const r1 = await seedRequest();
      const r2 = await seedRequest();
      // 250 in W, 300 in the disjoint W2. Concurrent peak = 300 (never summed to 550).
      await seedReservation({ space, requestId: r1.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 250 }] });
      await seedReservation({ space, requestId: r2.id, start: W2.start, end: W2.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 300 }] });

      expect((await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 299 })).status).toBe(422);
      expect((await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 300 })).status).toBe(200);
    });

    it("PEAK sums OVERLAPPING holds in the same window", async () => {
      const ops = await loginAs("OPS");
      const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
      const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
      const r1 = await seedRequest();
      const r2 = await seedRequest();
      // Two holds in the SAME window → concurrent demand = 150 + 200 = 350.
      await seedReservation({ space, requestId: r1.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 150 }] });
      await seedReservation({ space, requestId: r2.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 200 }] });

      expect((await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 349 })).status).toBe(422);
      expect((await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 350 })).status).toBe(200);
    });

    it("a LAPSED held lease does not count toward the peak (can lower freely)", async () => {
      const ops = await loginAs("OPS");
      const space = await seedSpace();
      const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
      const req = await seedRequest();
      await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 60_000), assets: [{ assetId: chairs.id, quantity: 380 }] });
      const res = await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 10 });
      expect(res.status).toBe(200);
    });

    it("a LIVE (unexpired) HELD lease DOES count toward the peak", async () => {
      const ops = await loginAs("OPS");
      const space = await seedSpace();
      const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
      const req = await seedRequest();
      await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() + 1_800_000), assets: [{ assetId: chairs.id, quantity: 380 }] });
      const tooLow = await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 100 });
      expect(tooLow.status).toBe(422);
      expect(tooLow.body.fields.totalQuantity).toBe("asset.update.below_holds");
    });

    it("with no holds at all, lowering to anything ≥ 0 is allowed", async () => {
      const ops = await loginAs("OPS");
      const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
      const res = await ops.patch(`${ASSETS}/${chairs.id}`).send({ totalQuantity: 0 });
      expect(res.status).toBe(200);
      expect(res.body.data.totalQuantity).toBe(0);
    });

    it("a PATCH that does not touch totalQuantity skips the guard even when held", async () => {
      const ops = await loginAs("OPS");
      const space = await seedSpace();
      const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
      const req = await seedRequest();
      await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 310 }] });
      const res = await ops.patch(`${ASSETS}/${chairs.id}`).send({ location: "Blue Hall" });
      expect(res.status).toBe(200);
    });
  });

  describe("RBAC", () => {
    it("VIEWER → 403", async () => {
      const viewer = await loginAs("VIEWER");
      const asset = await seedAsset();
      expect((await viewer.patch(`${ASSETS}/${asset.id}`).send({ totalQuantity: 5 })).status).toBe(403);
    });
    it("PARTNER → 403", async () => {
      const partner = await loginAs("PARTNER");
      const asset = await seedAsset();
      expect((await partner.patch(`${ASSETS}/${asset.id}`).send({ totalQuantity: 5 })).status).toBe(403);
    });
    it("anonymous → 401", async () => {
      const asset = await seedAsset();
      const res = await anon().patch(`${ASSETS}/${asset.id}`).set("Idempotency-Key", randomUUID()).send({ totalQuantity: 5 });
      expect(res.status).toBe(401);
    });
  });
});

// ───────────────────────── GET /assets — windowed availability ─────────────────────────
describe("GET /assets — windowed availableQuantity (F03-T03)", () => {
  it("availableQuantity = total − Σ overlapping live holds; a disjoint hold doesn't reduce it", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace();
    const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();
    await seedReservation({ space, requestId: r1.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 310 }] });
    await seedReservation({ space, requestId: r2.id, start: W2.start, end: W2.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 400 }] });

    const res = await ops.get(`${ASSETS}?type=SEATING&start=${W.start}&end=${W.end}`);
    expect(res.status).toBe(200);
    const chair = res.body.data.find((a: any) => a.id === chairs.id);
    expect(chair.availableQuantity).toBe(90);
  });

  it("sums multiple overlapping holds in the window", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();
    await seedReservation({ space, requestId: r1.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 100 }] });
    await seedReservation({ space, requestId: r2.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() + 1_800_000), assets: [{ assetId: chairs.id, quantity: 50 }] });
    const res = await ops.get(`${ASSETS}?start=${W.start}&end=${W.end}`);
    const chair = res.body.data.find((a: any) => a.id === chairs.id);
    expect(chair.availableQuantity).toBe(250);
  });

  it("a lapsed HELD lease is excluded from Σ holds", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace();
    const chairs = await seedAsset({ name: "Chair", totalQuantity: 400 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 60_000), assets: [{ assetId: chairs.id, quantity: 310 }] });
    const res = await ops.get(`${ASSETS}?start=${W.start}&end=${W.end}`);
    const chair = res.body.data.find((a: any) => a.id === chairs.id);
    expect(chair.availableQuantity).toBe(400); // lapsed hold ignored
  });

  it("availableQuantity never goes negative (over-held floors at 0)", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace();
    const chairs = await seedAsset({ name: "Chair", totalQuantity: 100 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 100 }] });
    const res = await ops.get(`${ASSETS}?start=${W.start}&end=${W.end}`);
    const chair = res.body.data.find((a: any) => a.id === chairs.id);
    expect(chair.availableQuantity).toBe(0);
  });

  it("MAINTENANCE/RETIRED report 0 even with no holds; without a window ACTIVE = total", async () => {
    const ops = await loginAs("OPS");
    await seedAsset({ name: "Broken screen", type: "SCREEN", totalQuantity: 6, status: "MAINTENANCE" });
    await seedAsset({ name: "Dead projector", type: "PROJECTOR", totalQuantity: 3, status: "RETIRED" });
    await seedAsset({ name: "Good table", type: "TABLE", totalQuantity: 80, status: "ACTIVE" });

    const res = await ops.get(ASSETS);
    const byName = (n: string) => res.body.data.find((a: any) => a.name === n);
    expect(byName("Broken screen").availableQuantity).toBe(0);
    expect(byName("Dead projector").availableQuantity).toBe(0);
    expect(byName("Good table").availableQuantity).toBe(80);
  });

  it("MAINTENANCE reports 0 WITH a window even though it has no holds", async () => {
    const ops = await loginAs("OPS");
    await seedAsset({ name: "Broken screen", type: "SCREEN", totalQuantity: 6, status: "MAINTENANCE" });
    const res = await ops.get(`${ASSETS}?start=${W.start}&end=${W.end}`);
    expect(res.body.data.find((a: any) => a.name === "Broken screen").availableQuantity).toBe(0);
  });

  it("filters by type", async () => {
    const ops = await loginAs("OPS");
    await seedAsset({ name: "Chair", type: "SEATING", totalQuantity: 10 });
    await seedAsset({ name: "Mic", type: "MICROPHONE", totalQuantity: 5 });
    const res = await ops.get(`${ASSETS}?type=MICROPHONE`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe("MICROPHONE");
  });

  it("the quantity filter keeps only lines whose availability ≥ quantity", async () => {
    const ops = await loginAs("OPS");
    await seedAsset({ name: "Few", type: "SEATING", totalQuantity: 5 });
    await seedAsset({ name: "Many", type: "SEATING", totalQuantity: 500 });
    const res = await ops.get(`${ASSETS}?quantity=100`);
    expect(res.status).toBe(200);
    const names = res.body.data.map((a: any) => a.name);
    expect(names).toContain("Many");
    expect(names).not.toContain("Few");
  });

  it("the quantity filter respects windowed availability (a fully-held line is filtered out)", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace();
    const chairs = await seedAsset({ name: "Chair", type: "SEATING", totalQuantity: 100 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 100 }] });
    const res = await ops.get(`${ASSETS}?quantity=1&start=${W.start}&end=${W.end}`);
    expect(res.body.data.find((a: any) => a.id === chairs.id)).toBeUndefined();
  });

  it("results are ordered by name ascending", async () => {
    const ops = await loginAs("OPS");
    await seedAsset({ name: "Zebra", type: "OTHER", totalQuantity: 1 });
    await seedAsset({ name: "Alpha", type: "OTHER", totalQuantity: 1 });
    await seedAsset({ name: "Mango", type: "OTHER", totalQuantity: 1 });
    const res = await ops.get(ASSETS);
    const names = res.body.data.map((a: any) => a.name);
    expect(names).toEqual([...names].sort());
  });

  it("bad window/filter params → 422", async () => {
    const ops = await loginAs("OPS");
    expect((await ops.get(`${ASSETS}?start=not-a-date`)).status).toBe(422);
    expect((await ops.get(`${ASSETS}?type=ROBOT`)).status).toBe(422);
    expect((await ops.get(`${ASSETS}?quantity=0`)).status).toBe(422);
  });

  describe("RBAC", () => {
    it("VIEWER may read inventory (staff surface, VIEWER+)", async () => {
      const viewer = await loginAs("VIEWER");
      await seedAsset({ name: "Chair", totalQuantity: 1 });
      const res = await viewer.get(ASSETS);
      expect(res.status).toBe(200);
    });
    it("PARTNER → 403", async () => {
      const partner = await loginAs("PARTNER");
      expect((await partner.get(ASSETS)).status).toBe(403);
    });
    it("anonymous → 401", async () => {
      expect((await anon().get(ASSETS)).status).toBe(401);
    });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, resetDb, prisma } from "./helpers/integration";
import { seedSpace, seedRequest, seedReservation } from "./helpers/fixtures";

const SPACES = "/api/v1/private/spaces";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };

beforeEach(resetDb);

describe("spaces CRUD + audit (F02-T02/T05)", () => {
  it("OPS creates a space and an audit row is written; VIEWER is 403", async () => {
    const viewer = await loginAs("VIEWER");
    const body = { name: "Test Hall", floor: 0, capacities: { THEATER: 200 }, dayRateMinor: 80000 };
    expect((await viewer.post(SPACES).send(body)).status).toBe(403);

    await resetDb();
    const ops = await loginAs("OPS");
    const create = await ops.post(SPACES).send(body);
    expect(create.status).toBe(201);
    const audit = await prisma.auditEntry.findFirst({ where: { action: "space.create", entityId: create.body.data.id } });
    expect(audit?.actorName).toBe("OPS User");
  });

  it("rejects invalid SpaceInput (bad capacity layout) with 422; PATCH unknown id → 404", async () => {
    const ops = await loginAs("OPS");
    const bad = await ops.post(SPACES).send({ name: "X", floor: 0, capacities: { WEDDING: 100 }, dayRateMinor: 1 });
    expect(bad.status).toBe(422);
    expect(bad.body.fields.capacities).toBeDefined();

    const missing = await ops.patch(`${SPACES}/00000000-0000-4000-8000-000000000000`).send({ name: "Y" });
    expect(missing.status).toBe(404);
  });

  it("update writes a space.update audit row with before/after", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "Orig", dayRateMinor: 50000 });
    const res = await ops.patch(`${SPACES}/${space.id}`).send({ dayRateMinor: 60000 });
    expect(res.status).toBe(200);
    expect(res.body.data.dayRateMinor).toBe(60000);
    const audit = await prisma.auditEntry.findFirst({ where: { action: "space.update", entityId: space.id } });
    expect((audit?.before as any).dayRateMinor).toBe(50000);
    expect((audit?.after as any).dayRateMinor).toBe(60000);
  });
});

describe("GET /spaces match + availability annotation (F02-T03/T04)", () => {
  it("filters by layout+minCapacity and omits `available` when no window is given", async () => {
    const ops = await loginAs("OPS");
    await seedSpace({ name: "Big", capacities: { THEATER: 220 } });
    await seedSpace({ name: "Tiny", capacities: { THEATER: 80 } });
    const res = await ops.get(`${SPACES}?minCapacity=180&layout=THEATER`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((s: any) => s.name)).toEqual(["Big"]);
    expect(res.body.data[0].available).toBeUndefined();
  });

  it("annotates available:false for a space booked in the window, true for a free window", async () => {
    const ops = await loginAs("VIEWER");
    const space = await seedSpace({ name: "Booked", capacities: { THEATER: 300 } });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const busy = await ops.get(`${SPACES}?start=${W.start}&end=${W.end}`);
    const found = busy.body.data.find((s: any) => s.id === space.id);
    expect(found.available).toBe(false);

    const free = await ops.get(`${SPACES}?start=2026-09-01T09:00:00Z&end=2026-09-01T18:00:00Z`);
    expect(free.body.data.find((s: any) => s.id === space.id).available).toBe(true);
  });
});

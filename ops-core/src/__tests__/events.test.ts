import { describe, it, expect, beforeEach, vi } from "vitest";
import { loginAs, anon, resetDb, prisma } from "./helpers/integration";
import { seedSpace, seedRequest, seedReservation } from "./helpers/fixtures";
import { runRelayPass } from "../modules/events/relay";

const RES = "/api/v1/private/reservations";
const REQ = "/api/v1/private/requests";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };

beforeEach(resetDb);

describe("outbox relay (F11-T03)", () => {
  it("publishes unpublished rows in createdAt order and marks publishedAt only on ack", async () => {
    await prisma.outboxEvent.create({ data: { subject: "a.one", payload: { n: 1 } } });
    await prisma.outboxEvent.create({ data: { subject: "b.two", payload: { n: 2 } } });

    const seen: string[] = [];
    const publisher = vi.fn(async (subject: string) => { seen.push(subject); return true; });
    const n = await runRelayPass(publisher);
    expect(n).toBe(2);
    expect(seen).toEqual(["a.one", "b.two"]);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: null } })).toBe(0);
  });

  it("a failed publish (no ack) leaves the row unpublished for retry (at-least-once)", async () => {
    await prisma.outboxEvent.create({ data: { subject: "x.fail", payload: {} } });
    const publisher = vi.fn(async () => false);
    expect(await runRelayPass(publisher)).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: null } })).toBe(1);
    // a later successful pass publishes it (no duplicate effect)
    expect(await runRelayPass(async () => true)).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: null } })).toBe(0);
  });
});

describe("degrade to REST — NATS_ENABLED=false (F11-T05)", () => {
  it("the core flow works, outbox rows accumulate, the relay is inert, /ready is 200", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = (await client.post(REQ).send({ title: "Degrade", organizerName: "Acme", expectedAttendees: 50, eventType: "CONFERENCE", preferredDates: [W] })).body.data;
    const hold = await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(hold.status).toBe(201);

    // default publisher + NATS disabled → inert, nothing published
    expect(await runRelayPass()).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: null } })).toBeGreaterThan(0);

    const ready = await anon().get("/ready");
    expect(ready.status).toBe(200);
  });
});

describe("emit domain events to the outbox (F11-T04)", () => {
  it("each owning mutation writes exactly one matching OutboxEvent", async () => {
    const mgr = await loginAs("MANAGER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });

    const req = (await mgr.post(REQ).send({ title: "E", organizerName: "Acme", expectedAttendees: 50, eventType: "CONFERENCE", preferredDates: [W] })).body.data;
    expect(await prisma.outboxEvent.count({ where: { subject: "request.created" } })).toBe(1);

    await mgr.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(await prisma.outboxEvent.count({ where: { subject: "reservation.held" } })).toBe(1);

    await mgr.post(`${REQ}/${req.id}/approve`);
    expect(await prisma.outboxEvent.count({ where: { subject: "reservation.confirmed" } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { subject: "request.approved" } })).toBe(1);
  });

  it("a conflicting hold writes a conflict.detected event carrying the Conflict[]", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const taken = await seedRequest();
    await seedReservation({ space, requestId: taken.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const req = await seedRequest();
    await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });

    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { subject: "conflict.detected" } });
    expect((ev.payload as any).conflicts.length).toBeGreaterThan(0);
  });

  it("holding a scarce asset down to ≤10% emits inventory.low", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const chairs = await seedAssetLocal(100);
    const req = await seedRequest();
    await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W, assets: [{ assetId: chairs.id, quantity: 95 }] });
    expect(await prisma.outboxEvent.count({ where: { subject: "inventory.low" } })).toBe(1);
  });
});

async function seedAssetLocal(total: number) {
  return prisma.asset.create({ data: { name: "Scarce chair", type: "SEATING", totalQuantity: total, location: "S", status: "ACTIVE" } });
}

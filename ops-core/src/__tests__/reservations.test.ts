import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, resetDb, prisma, type Client } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation } from "./helpers/fixtures";
import { reservationsService } from "../modules/reservations/service";

const RES = "/api/v1/private/reservations";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };

beforeEach(resetDb);

async function holdBody(client: Client, over: Record<string, unknown> = {}) {
  const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
  const req = await seedRequest();
  return { space, req, body: { requestId: req.id, spaceId: space.id, dateRange: W, ...over } };
}

describe("POST /reservations — atomic hold (F06-T02)", () => {
  it("holds a space + assets, writes reservation.hold audit + reservation.held outbox", async () => {
    const client = await loginAs("OPS");
    const chairs = await seedAsset({ totalQuantity: 400 });
    const { body } = await holdBody(client, { assets: [{ assetId: chairs.id, quantity: 200 }] });

    const res = await client.post(RES).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "HELD", spaceId: body.spaceId });
    expect(res.body.data.expiresAt).toBeTruthy();
    expect(res.body.data.assets).toEqual([{ assetId: chairs.id, quantity: 200 }]);

    expect(await prisma.auditEntry.count({ where: { action: "reservation.hold" } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { subject: "reservation.held" } })).toBe(1);
  });

  it("returns 409 {conflicts} when the space is already booked; nothing half-written", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const existing = await seedRequest();
    await seedReservation({ space, requestId: existing.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const req = await seedRequest();

    const res = await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("conflict");
    expect(res.body.conflicts[0].type).toBe("SPACE_DOUBLE_BOOKED");
    expect(await prisma.reservation.count({ where: { requestId: req.id } })).toBe(0); // nothing written
    expect(await prisma.outboxEvent.count({ where: { subject: "conflict.detected" } })).toBe(1);
  });

  it("returns 409 ASSET_OVERALLOCATED when assets are scarce", async () => {
    const client = await loginAs("OPS");
    const space1 = await seedSpace();
    const space2 = await seedSpace();
    const chairs = await seedAsset({ totalQuantity: 100 });
    const r1 = await seedRequest();
    await seedReservation({ space: space1, requestId: r1.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 80 }] });
    const r2 = await seedRequest();

    const res = await client.post(RES).send({ requestId: r2.id, spaceId: space2.id, dateRange: W, assets: [{ assetId: chairs.id, quantity: 40 }] });
    expect(res.status).toBe(409);
    expect(res.body.conflicts.find((c: any) => c.type === "ASSET_OVERALLOCATED")).toBeTruthy();
  });
});

describe("idempotent hold replay (F06-T03)", () => {
  it("a replay with the same key returns the original reservation, no duplicate", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client);
    const key = "22222222-2222-4222-8222-222222222222";
    const first = await client.post(RES, key).send(body);
    const replay = await client.post(RES, key).send(body);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await prisma.reservation.count()).toBe(1);
  });

  it("the same key with a different body → 409 idempotency_key_mismatch", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client);
    const key = "33333333-3333-4333-8333-333333333333";
    await client.post(RES, key).send(body);
    const mismatch = await client.post(RES, key).send({ ...body, holdMinutes: 99 });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error).toBe("idempotency_key_mismatch");
  });
});

describe("confirm / release transitions (F06-T04)", () => {
  it("confirm HELD → CONFIRMED (idempotent), audited + outbox", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client);
    const held = (await client.post(RES).send(body)).body.data;

    const c1 = await client.post(`${RES}/${held.id}/confirm`);
    expect(c1.status).toBe(200);
    expect(c1.body.data.status).toBe("CONFIRMED");
    expect(c1.body.data.expiresAt ?? null).toBeNull();
    const c2 = await client.post(`${RES}/${held.id}/confirm`); // idempotent
    expect(c2.status).toBe(200);
    expect(c2.body.data.status).toBe("CONFIRMED");
    expect(await prisma.outboxEvent.count({ where: { subject: "reservation.confirmed" } })).toBe(1);
  });

  it("confirming an expired hold → 409 conflict (re-plan)", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client);
    const held = (await client.post(RES).send(body)).body.data;
    await prisma.reservation.update({ where: { id: held.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await client.post(`${RES}/${held.id}/confirm`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("conflict");
  });

  it("release → RELEASED (idempotent); confirming a RELEASED → 409 invalid_transition; unknown id → 404", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client);
    const held = (await client.post(RES).send(body)).body.data;
    expect((await client.post(`${RES}/${held.id}/release`)).body.data.status).toBe("RELEASED");
    expect((await client.post(`${RES}/${held.id}/release`)).status).toBe(200); // idempotent
    const confirm = await client.post(`${RES}/${held.id}/confirm`);
    expect(confirm.status).toBe(409);
    expect(confirm.body.error).toBe("invalid_transition");
    expect((await client.post(`${RES}/00000000-0000-4000-8000-000000000000/confirm`)).status).toBe(404);
  });
});

describe("HELD expiry reaper + check-on-read (F06-T05)", () => {
  it("a lapsed hold stops blocking (check-on-read) and the reaper flips it to RELEASED", async () => {
    await loginAs("OPS");
    const space = await seedSpace();
    const chairs = await seedAsset({ totalQuantity: 100 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 1000), assets: [{ assetId: chairs.id, quantity: 80 }] });

    const reaped = await reservationsService.reapExpiredHolds();
    expect(reaped).toBe(1);
    expect((await prisma.reservation.findFirstOrThrow()).status).toBe("RELEASED");
    expect(await prisma.auditEntry.count({ where: { action: "reservation.release", actorName: "system" } })).toBe(1);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, anon, resetDb, prisma, type Client } from "./helpers/integration";
import { seedSpace, seedRequest } from "./helpers/fixtures";

const RES = "/api/v1/private/reservations";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };

beforeEach(resetDb);

/** Drive a request to PROPOSED with a live HELD reservation via the real hold path. */
async function proposeWithHold(client: Client) {
  const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
  const req = await seedRequest();
  const hold = await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
  expect(hold.status).toBe(201);
  return { reqId: req.id, reservationId: hold.body.data.id as string };
}

describe("POST /requests/:id/approve (F10-T01)", () => {
  it("MANAGER approve → reservations CONFIRMED, request SCHEDULED, audit + request.approved outbox", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: reqId } })).status).toBe("PROPOSED");

    const res = await mgr.post(`/api/v1/private/requests/${reqId}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("SCHEDULED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe("CONFIRMED");
    expect(await prisma.auditEntry.count({ where: { action: "request.approve", entityId: reqId } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { subject: "request.approved" } })).toBe(1);
  });

  it("an expired hold → 409 conflict, state unchanged", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);
    await prisma.reservation.update({ where: { id: reservationId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await mgr.post(`/api/v1/private/requests/${reqId}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("conflict");
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: reqId } })).status).toBe("PROPOSED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe("HELD");
  });

  it("approving a non-PROPOSED request → 409 invalid_transition", async () => {
    const mgr = await loginAs("MANAGER");
    const req = await seedRequest({ status: "DRAFT" });
    const res = await mgr.post(`/api/v1/private/requests/${req.id}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("invalid_transition");
  });
});

describe("POST /requests/:id/reject (F10-T02)", () => {
  it("MANAGER reject with reason → reservations RELEASED, request REJECTED, reason persisted + audited", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);
    const res = await mgr.post(`/api/v1/private/requests/${reqId}/reject`).send({ reason: "Date no longer available" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "REJECTED", rejectionReason: "Date no longer available" });
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe("RELEASED");
    const audit = await prisma.auditEntry.findFirst({ where: { action: "request.reject", entityId: reqId } });
    expect(audit?.reason).toBe("Date no longer available");
  });

  it("reject without a reason → 422", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(mgr);
    expect((await mgr.post(`/api/v1/private/requests/${reqId}/reject`).send({})).status).toBe(422);
  });
});

describe("role gates on approve/reject (F10-T03)", () => {
  it("VIEWER→403, OPS→403, MANAGER→ok, ADMIN→ok, anon→401", async () => {
    // seed a PROPOSED request once and reuse the id across roles
    const seeder = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(seeder);
    const url = `/api/v1/private/requests/${reqId}/approve`;

    const viewer = await loginAs("VIEWER");
    const ops = await loginAs("OPS");
    expect((await viewer.post(url)).status).toBe(403);
    expect((await ops.post(url)).status).toBe(403);
    expect((await anon().post(url).set("Idempotency-Key", "99999999-9999-4999-8999-999999999999")).status).toBe(401);

    // ADMIN can approve (passes the MANAGER+ floor)
    const admin = await loginAs("ADMIN");
    expect((await admin.post(url)).status).toBe(200);
  });
});

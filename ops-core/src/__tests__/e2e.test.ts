import { describe, it, expect, beforeAll } from "vitest";
import { loginAs, prisma, type Client } from "./helpers/integration";
import { runSeed, SEED } from "../scripts/seed";

const P = "/api/v1/private";
const W3 = { start: "2026-08-01T09:00:00Z", end: "2026-08-01T18:00:00Z" }; // a free window

let ops: Client;
let manager: Client;

beforeAll(async () => {
  await runSeed({ reset: true });
  ops = await loginAs("OPS");
  manager = await loginAs("MANAGER");
});

describe("F13-T03 e2e: intake → match → hold → quote → tasks → approve → SCHEDULED", () => {
  it("drives the full happy path and asserts the contract shapes + cross-cutting invariants", async () => {
    // 1. intake
    const intake = await ops.post(`${P}/requests`).send({
      title: "Robotics Demo Day", organizerName: "Polytechnic", contactEmail: "rd@poly.al",
      expectedAttendees: 180, eventType: "CONFERENCE", preferredDates: [W3], requirements: { layout: "THEATER", avNeeded: true },
    });
    expect(intake.status).toBe(201);
    const reqId = intake.body.data.id;
    expect(intake.body.data.status).toBe("DRAFT");

    // 2. match — Blue (220 theater) is free in W3
    const match = await ops.get(`${P}/spaces?minCapacity=180&layout=THEATER&start=${W3.start}&end=${W3.end}`);
    expect(match.status).toBe(200);
    const blue = match.body.data.find((s: any) => s.id === SEED.BLUE);
    expect(blue.available).toBe(true);

    // 3. hold (→ request PROPOSED)
    const hold = await ops.post(`${P}/reservations`).send({ requestId: reqId, spaceId: SEED.BLUE, dateRange: W3, assets: [{ assetId: SEED.CHAIRS, quantity: 180 }] });
    expect(hold.status).toBe(201);
    expect(hold.body.data.status).toBe("HELD");
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: reqId } })).status).toBe("PROPOSED");

    // 4. quote — server-computed total
    const quote = await ops.post(`${P}/quotes`).send({ requestId: reqId, reservationId: hold.body.data.id });
    expect(quote.status).toBe(201);
    expect(quote.body.data.totalMinor).toBe(quote.body.data.netMinor + quote.body.data.vatMinor);
    expect(quote.body.data.netMinor).toBe(80000); // Blue 1 day, chairs free

    // 5. tasks — dueAt computed from the reserved window
    const tasks = await ops.post(`${P}/requests/${reqId}/tasks`).send({
      tasks: [{ title: "Set up seating", phase: "SETUP", owner: "ops_team", dueOffsetHours: -4 }, { title: "Strike", phase: "TEARDOWN", owner: "ops_team", dueOffsetHours: 2 }],
    });
    expect(tasks.status).toBe(201);
    expect(tasks.body.data[0].dueAt).toBeTruthy();

    // 6. approve (MANAGER) → SCHEDULED + reservation CONFIRMED
    const approve = await manager.post(`${P}/requests/${reqId}/approve`);
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe("SCHEDULED");

    // aggregate + invariants
    const agg = (await ops.get(`${P}/requests/${reqId}`)).body.data;
    expect(agg.request.status).toBe("SCHEDULED");
    expect(agg.reservation.status).toBe("CONFIRMED");
    expect(agg.quote.totalMinor).toBe(96000);
    expect(agg.tasks.length).toBe(2);
    expect(agg.conflicts).toEqual([]); // excludes itself

    const actions = (await prisma.auditEntry.findMany({ where: { requestId: reqId } })).map((a) => a.action);
    for (const a of ["request.create", "reservation.hold", "quote.generate", "request.tasks.persist", "reservation.confirm", "request.approve"]) {
      expect(actions, `missing audit ${a}`).toContain(a);
    }
    const subjects = (await prisma.outboxEvent.findMany()).map((o) => o.subject);
    for (const s of ["request.created", "reservation.held", "reservation.confirmed", "request.approved"]) expect(subjects).toContain(s);
  });

  it("conflict → alternatives: holding the planted Blue@W1 returns 409, an alternative succeeds", async () => {
    const req = await ops.post(`${P}/requests`).send({
      title: "Late Booking", organizerName: "Walk-in", expectedAttendees: 150, eventType: "COMMUNITY", preferredDates: [SEED.W1],
    });
    const reqId = req.body.data.id;

    // Blue is occupied at W1 (planted seed conflict)
    const blocked = await ops.post(`${P}/reservations`).send({ requestId: reqId, spaceId: SEED.BLUE, dateRange: SEED.W1 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.conflicts[0].type).toBe("SPACE_DOUBLE_BOOKED");

    // re-plan onto the free alternative (Green @ W1) → succeeds
    const alt = await ops.post(`${P}/reservations`).send({ requestId: reqId, spaceId: SEED.GREEN, dateRange: SEED.W1 });
    expect(alt.status).toBe(201);
    expect(alt.body.data.spaceId).toBe(SEED.GREEN);
  });

  it("RBAC: a VIEWER cannot approve (403)", async () => {
    const viewer = await loginAs("VIEWER");
    const req = await prisma.eventRequest.findFirstOrThrow({ where: { status: "PROPOSED" } });
    expect((await viewer.post(`${P}/requests/${req.id}/approve`)).status).toBe(403);
  });
});

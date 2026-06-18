import { describe, it, expect, beforeAll } from "vitest";
import { loginAs, prisma, type Client } from "./helpers/integration";
import { runSeed, SEED } from "../scripts/seed";

/**
 * F13-T04 — the four demo beats (docs/07-operations/DEMO_SCRIPT.md) run green
 * end to end on the reset seed. Each beat fails with a clear message, not a
 * stack trace. Run: `pnpm demo:verify`.
 */
const P = "/api/v1/private";
const FRESH = { start: "2026-08-15T09:00:00Z", end: "2026-08-15T18:00:00Z" };

let ops: Client;
let manager: Client;
let viewer: Client;
let reqId: string;

beforeAll(async () => {
  await runSeed({ reset: true });
  ops = await loginAs("OPS");
  manager = await loginAs("MANAGER");
  viewer = await loginAs("VIEWER");
});

describe("demo beats", () => {
  it("Beat 1 — 'Yes, we can make this happen' (intake → match → hold → quote → tasks)", async () => {
    const intake = await ops.post(`${P}/requests`).send({
      title: "FinTech Conference (demo)", organizerName: "Acme", expectedAttendees: 180, eventType: "CONFERENCE", preferredDates: [FRESH], requirements: { layout: "THEATER", avNeeded: true },
    });
    expect(intake.status, "intake should create a DRAFT").toBe(201);
    reqId = intake.body.data.id;

    const match = await ops.get(`${P}/spaces?minCapacity=180&layout=THEATER&start=${FRESH.start}&end=${FRESH.end}`);
    expect(match.body.data.some((s: any) => s.available), "at least one 180-theater space is free").toBe(true);

    const hold = await ops.post(`${P}/reservations`).send({ requestId: reqId, spaceId: SEED.BLUE, dateRange: FRESH, assets: [{ assetId: SEED.CHAIRS, quantity: 180 }] });
    expect(hold.status, "hold should succeed").toBe(201);

    const quote = await ops.post(`${P}/quotes`).send({ requestId: reqId, reservationId: hold.body.data.id });
    expect(quote.body.data.totalMinor, "quote total = net + vat").toBe(quote.body.data.netMinor + quote.body.data.vatMinor);

    const tasks = await ops.post(`${P}/requests/${reqId}/tasks`).send({ tasks: [{ title: "Set up", phase: "SETUP", dueOffsetHours: -4 }] });
    expect(tasks.status, "tasks persisted with dueAt").toBe(201);
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: reqId } })).status).toBe("PROPOSED");
  });

  it("Beat 2 — the conflict moment (Blue@W1 is taken → 409 → an alternative is free)", async () => {
    const r = await ops.post(`${P}/requests`).send({ title: "Clasher (demo)", organizerName: "X", expectedAttendees: 150, eventType: "COMMUNITY", preferredDates: [SEED.W1] });
    const blocked = await ops.post(`${P}/reservations`).send({ requestId: r.body.data.id, spaceId: SEED.BLUE, dateRange: SEED.W1 });
    expect(blocked.status, "Blue@W1 collides with the planted conflict").toBe(409);
    expect(blocked.body.conflicts[0].type).toBe("SPACE_DOUBLE_BOOKED");
    const alt = await ops.post(`${P}/reservations`).send({ requestId: r.body.data.id, spaceId: SEED.GREEN, dateRange: SEED.W1 });
    expect(alt.status, "Green@W1 is a valid alternative").toBe(201);
  });

  it("Beat 3 — approve as a MANAGER (VIEWER/OPS blocked → MANAGER schedules + audits)", async () => {
    expect((await viewer.post(`${P}/requests/${reqId}/approve`)).status, "VIEWER cannot approve").toBe(403);
    expect((await ops.post(`${P}/requests/${reqId}/approve`)).status, "OPS cannot approve").toBe(403);

    const approve = await manager.post(`${P}/requests/${reqId}/approve`);
    expect(approve.status, "MANAGER approves").toBe(200);
    expect(approve.body.data.status, "request is SCHEDULED").toBe("SCHEDULED");

    const audit = await prisma.auditEntry.findFirst({ where: { action: "request.approve", entityId: reqId } });
    expect(audit?.actorName, "approval is on the record with the manager's name").toBe("MANAGER User");
  });

  it("Beat 4 — the live dashboard reflects the new state", async () => {
    const stats = (await ops.get(`${P}/dashboard/stats`)).body.data;
    expect(stats.spacesInUse.inUse, "spaces in use is counted").toBeGreaterThanOrEqual(2);
    expect(stats.pendingApprovals.value, "pending-approvals is a number").toBeGreaterThanOrEqual(0);

    const aggregate = (await ops.get(`${P}/requests/${reqId}`)).body.data;
    expect(aggregate.request.status).toBe("SCHEDULED");
    expect(aggregate.reservation.status).toBe("CONFIRMED");
    expect(aggregate.audit.length, "the full decision trail is reconstructable").toBeGreaterThan(3);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, resetDb, prisma } from "./helpers/integration";
import { seedSpace, seedRequest, seedReservation } from "./helpers/fixtures";

const base = (id: string) => `/api/v1/private/requests/${id}/tasks`;
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };

beforeEach(resetDb);

describe("POST/GET /requests/:id/tasks + dueAt (F08-T02/T04)", () => {
  it("computes dueAt from the reserved window: SETUP -4h before start, TEARDOWN +2h after end", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const res = await client.post(base(req.id)).send({
      tasks: [
        { title: "Set up theater seating", phase: "SETUP", owner: "ops_team", dueOffsetHours: -4 },
        { title: "Strike stage", phase: "TEARDOWN", owner: "ops_team", dueOffsetHours: 2 },
      ],
    });
    expect(res.status).toBe(201);
    const setup = res.body.data.find((t: any) => t.phase === "SETUP");
    const teardown = res.body.data.find((t: any) => t.phase === "TEARDOWN");
    expect(setup.dueAt).toBe("2026-07-22T05:00:00.000Z"); // 09:00 − 4h
    expect(teardown.dueAt).toBe("2026-07-22T20:00:00.000Z"); // 18:00 + 2h
    expect(await prisma.auditEntry.count({ where: { action: "request.tasks.persist" } })).toBe(1);

    const list = await client.get(base(req.id));
    expect(list.body.data.length).toBe(2);
  });

  it("leaves dueAt null when no reservation exists yet (offset retained)", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({ tasks: [{ title: "Pre-plan", phase: "SETUP", dueOffsetHours: -4 }] });
    expect(res.body.data[0].dueAt).toBeNull();
    expect(res.body.data[0].dueOffsetHours).toBe(-4);
  });

  it("422 on invalid TaskInput; 404 on unknown request", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    expect((await client.post(base(req.id)).send({ tasks: [{ title: "x", phase: "LUNCH" }] })).status).toBe(422);
    expect((await client.post(base("00000000-0000-4000-8000-000000000000")).send({ tasks: [{ title: "x", phase: "SETUP" }] })).status).toBe(404);
  });
});

describe("PATCH /tasks/:id assignment + status (F08-T03)", () => {
  it("updates assignee + status and writes a task.update audit; unknown id → 404", async () => {
    const client = await loginAs("OPS");
    const assignee = client.user.id;
    const req = await seedRequest();
    const created = (await client.post(base(req.id)).send({ tasks: [{ title: "Do thing", phase: "SETUP" }] })).body.data[0];

    const patch = await client.patch(`/api/v1/private/tasks/${created.id}`).send({ assigneeId: assignee, status: "IN_PROGRESS" });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({ assigneeId: assignee, status: "IN_PROGRESS" });
    const audit = await prisma.auditEntry.findFirst({ where: { action: "task.update", entityId: created.id } });
    expect((audit?.after as any).status).toBe("IN_PROGRESS");

    expect((await client.patch(`/api/v1/private/tasks/00000000-0000-4000-8000-000000000000`).send({ status: "DONE" })).status).toBe(404);
  });
});

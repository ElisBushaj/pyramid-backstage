import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, anon, resetDb, prisma, auditEntriesFor } from "./helpers/integration";
import { seedSpace, seedRequest, seedReservation, seedTask } from "./helpers/fixtures";

const base = (id: string) => `/api/v1/private/requests/${id}/tasks`;
const taskUrl = (id: string) => `/api/v1/private/tasks/${id}`;
const NOPE = "00000000-0000-4000-8000-000000000000";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };
const HOUR_MS = 3_600_000;

beforeEach(resetDb);

// ───────────────────────────────────────────────────────────────────────────
// persist — dueAt arithmetic (the "must be exact" math)
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/tasks — dueAt arithmetic (F08-T02/T04)", () => {
  it("SETUP −4h before start, TEARDOWN +2h after end (canonical case)", async () => {
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
  });

  it("offset 0 → SETUP dueAt == start, TEARDOWN dueAt == end (not null)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const res = await client.post(base(req.id)).send({
      tasks: [
        { title: "At doors", phase: "SETUP", dueOffsetHours: 0 },
        { title: "At close", phase: "TEARDOWN", dueOffsetHours: 0 },
      ],
    });
    const setup = res.body.data.find((t: any) => t.phase === "SETUP");
    const teardown = res.body.data.find((t: any) => t.phase === "TEARDOWN");
    expect(setup.dueAt).toBe(new Date(W.start).toISOString());
    expect(teardown.dueAt).toBe(new Date(W.end).toISOString());
  });

  it("SETUP positive offset (after start) and TEARDOWN negative offset (before end) — arithmetic applies regardless of sign", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const res = await client.post(base(req.id)).send({
      tasks: [
        { title: "Mid-setup checkpoint", phase: "SETUP", dueOffsetHours: 3 },
        { title: "Pre-close warning", phase: "TEARDOWN", dueOffsetHours: -1 },
      ],
    });
    const setup = res.body.data.find((t: any) => t.phase === "SETUP");
    const teardown = res.body.data.find((t: any) => t.phase === "TEARDOWN");
    expect(setup.dueAt).toBe(new Date(new Date(W.start).getTime() + 3 * HOUR_MS).toISOString()); // 12:00
    expect(teardown.dueAt).toBe(new Date(new Date(W.end).getTime() - 1 * HOUR_MS).toISOString()); // 17:00
  });

  it("large offsets compute exactly via hours→ms (−36h, +72h)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const res = await client.post(base(req.id)).send({
      tasks: [
        { title: "Two-day prep", phase: "SETUP", dueOffsetHours: -36 },
        { title: "Three-day cleanup", phase: "TEARDOWN", dueOffsetHours: 72 },
      ],
    });
    const setup = res.body.data.find((t: any) => t.phase === "SETUP");
    const teardown = res.body.data.find((t: any) => t.phase === "TEARDOWN");
    expect(setup.dueAt).toBe(new Date(new Date(W.start).getTime() - 36 * HOUR_MS).toISOString()); // 2026-07-20T21:00Z
    expect(teardown.dueAt).toBe(new Date(new Date(W.end).getTime() + 72 * HOUR_MS).toISOString()); // 2026-07-25T18:00Z
  });

  it("reservation exists but offset omitted → dueAt null (offset stays null)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const res = await client.post(base(req.id)).send({ tasks: [{ title: "Floating task", phase: "SETUP" }] });
    expect(res.body.data[0].dueAt).toBeNull();
    expect(res.body.data[0].dueOffsetHours).toBeNull();
  });

  it("no reservation yet → dueAt null but offset retained for later", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({ tasks: [{ title: "Pre-plan", phase: "SETUP", dueOffsetHours: -4 }] });
    expect(res.body.data[0].dueAt).toBeNull();
    expect(res.body.data[0].dueOffsetHours).toBe(-4);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// persist — which reservation supplies the window
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/tasks — reservation selection (F08-T04)", () => {
  it("a HELD reservation drives dueAt (not only CONFIRMED)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD" });

    const res = await client.post(base(req.id)).send({ tasks: [{ title: "Held-window setup", phase: "SETUP", dueOffsetHours: -2 }] });
    expect(res.body.data[0].dueAt).toBe(new Date(new Date(W.start).getTime() - 2 * HOUR_MS).toISOString()); // 07:00
  });

  it("a RELEASED reservation does NOT drive dueAt → stays null", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "RELEASED" });

    const res = await client.post(base(req.id)).send({ tasks: [{ title: "Orphaned setup", phase: "SETUP", dueOffsetHours: -4 }] });
    expect(res.body.data[0].dueAt).toBeNull();
    expect(res.body.data[0].dueOffsetHours).toBe(-4);
  });

  it("with several reservations, the most-recent active one supplies the window", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const req = await seedRequest();
    // Older active reservation, then a newer one with a different window.
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });
    await new Promise((r) => setTimeout(r, 5)); // ensure a strictly later createdAt
    const newWindow = { start: "2026-08-01T10:00:00Z", end: "2026-08-01T16:00:00Z" };
    await seedReservation({ space, requestId: req.id, start: newWindow.start, end: newWindow.end, status: "HELD" });

    const res = await client.post(base(req.id)).send({ tasks: [{ title: "Setup", phase: "SETUP", dueOffsetHours: -1 }] });
    expect(res.body.data[0].dueAt).toBe(new Date(new Date(newWindow.start).getTime() - 1 * HOUR_MS).toISOString()); // 2026-08-01T09:00Z
  });
});

// ───────────────────────────────────────────────────────────────────────────
// persist — recompute contract (compute-at-persist; documented actual behavior)
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/tasks — dueAt recompute semantics (F08-T04)", () => {
  it("dueAt is fixed at persist time: pre-reservation rows stay null on read; a later persist (after the reservation) computes dueAt", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const req = await seedRequest();

    // 1) Persist BEFORE any reservation → null dueAt.
    const before = await client.post(base(req.id)).send({ tasks: [{ title: "Early setup", phase: "SETUP", dueOffsetHours: -4 }] });
    expect(before.body.data[0].dueAt).toBeNull();

    // 2) Now a reservation exists.
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    // GET does NOT recompute: the earlier row is still null (this is the contract — list reads stored dueAt).
    const list1 = await client.get(base(req.id));
    expect(list1.body.data[0].dueAt).toBeNull();

    // 3) Persisting a new task now resolves the window for the new row.
    const after = await client.post(base(req.id)).send({ tasks: [{ title: "Late setup", phase: "SETUP", dueOffsetHours: -4 }] });
    expect(after.body.data[0].dueAt).toBe("2026-07-22T05:00:00.000Z");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// persist — batch creation + audit invariants
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/tasks — batch + audit (F08-T02)", () => {
  it("batch-creates every task, all default to status TODO, response length matches", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({
      tasks: [
        { title: "A", phase: "SETUP" },
        { title: "B", phase: "TEARDOWN" },
        { title: "C", phase: "SETUP" },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.every((t: any) => t.status === "TODO")).toBe(true);
    expect(await prisma.task.count({ where: { requestId: req.id } })).toBe(3);
  });

  it("stores owner/assigneeId when provided and null when omitted", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const assignee = client.user.id;
    const res = await client.post(base(req.id)).send({
      tasks: [
        { title: "With meta", phase: "SETUP", owner: "av_team", assigneeId: assignee },
        { title: "Bare", phase: "TEARDOWN" },
      ],
    });
    const withMeta = res.body.data.find((t: any) => t.title === "With meta");
    const bare = res.body.data.find((t: any) => t.title === "Bare");
    expect(withMeta).toMatchObject({ owner: "av_team", assigneeId: assignee });
    expect(bare.owner).toBeNull();
    expect(bare.assigneeId).toBeNull();
  });

  it("writes exactly one request.tasks.persist audit with count + phases, attributed to the caller", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    await client.post(base(req.id)).send({
      tasks: [
        { title: "A", phase: "SETUP" },
        { title: "B", phase: "TEARDOWN" },
      ],
    });
    const audits = await auditEntriesFor("EventRequest", req.id);
    const persist = audits.filter((a) => a.action === "request.tasks.persist");
    expect(persist).toHaveLength(1);
    expect((persist[0]!.after as any).count).toBe(2);
    expect((persist[0]!.after as any).phases).toEqual(["SETUP", "TEARDOWN"]);
    expect(persist[0]!.actorId).toBe(client.user.id);
    expect(persist[0]!.requestId).toBe(req.id);
  });

  it("persist is atomic: N rows AND the single audit commit together", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    await client.post(base(req.id)).send({ tasks: [{ title: "A", phase: "SETUP" }, { title: "B", phase: "SETUP" }] });
    expect(await prisma.task.count({ where: { requestId: req.id } })).toBe(2);
    expect(await prisma.auditEntry.count({ where: { action: "request.tasks.persist", entityId: req.id } })).toBe(1);
  });

  it("ignores any client-supplied status — created tasks are always TODO", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({ tasks: [{ title: "Sneaky", phase: "SETUP", status: "DONE" } as any] });
    expect(res.status).toBe(201);
    expect(res.body.data[0].status).toBe("TODO");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// persist — validation (422 with field keys)
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/tasks — validation (F08-T02)", () => {
  it("tasks omitted → 422 validation, fields.tasks = validation.array", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.messageKey).toBe("validation.failed");
    expect(res.body.fields.tasks).toBe("validation.array");
  });

  it("tasks is an empty array → 422 validation.array", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({ tasks: [] });
    expect(res.status).toBe(422);
    expect(res.body.fields.tasks).toBe("validation.array");
  });

  it("title missing → 422 with fields keyed by index", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({ tasks: [{ phase: "SETUP" }] });
    expect(res.status).toBe(422);
    expect(res.body.fields["tasks[0].title"]).toBe("validation.required");
  });

  it("title empty string → 422 validation.required", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({ tasks: [{ title: "", phase: "SETUP" }] });
    expect(res.status).toBe(422);
    expect(res.body.fields["tasks[0].title"]).toBe("validation.required");
  });

  it("phase not in enum → 422 validation.enum", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({ tasks: [{ title: "x", phase: "LUNCH" }] });
    expect(res.status).toBe(422);
    expect(res.body.fields["tasks[0].phase"]).toBe("validation.enum");
  });

  it("dueOffsetHours non-integer → 422 validation.int", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({ tasks: [{ title: "x", phase: "SETUP", dueOffsetHours: 1.5 }] });
    expect(res.status).toBe(422);
    expect(res.body.fields["tasks[0].dueOffsetHours"]).toBe("validation.int");
  });

  it("dueOffsetHours non-numeric string → 422 validation.int", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({ tasks: [{ title: "x", phase: "SETUP", dueOffsetHours: "abc" }] });
    expect(res.status).toBe(422);
    expect(res.body.fields["tasks[0].dueOffsetHours"]).toBe("validation.int");
  });

  it("assigneeId not a UUID → 422 validation.uuid", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({ tasks: [{ title: "x", phase: "SETUP", assigneeId: "not-a-uuid" }] });
    expect(res.status).toBe(422);
    expect(res.body.fields["tasks[0].assigneeId"]).toBe("validation.uuid");
  });

  it("multiple bad rows → fields keyed per offending index", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({
      tasks: [
        { title: "ok", phase: "SETUP" },
        { title: "", phase: "NOPE" },
      ],
    });
    expect(res.status).toBe(422);
    expect(res.body.fields["tasks[1].title"]).toBe("validation.required");
    expect(res.body.fields["tasks[1].phase"]).toBe("validation.enum");
    expect(res.body.fields["tasks[0].title"]).toBeUndefined();
  });

  it("a validation failure persists nothing (no rows, no audit)", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    await client.post(base(req.id)).send({ tasks: [{ title: "", phase: "SETUP" }] });
    expect(await prisma.task.count({ where: { requestId: req.id } })).toBe(0);
    expect(await prisma.auditEntry.count({ where: { action: "request.tasks.persist" } })).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// persist — 404 + RBAC
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/tasks — not_found + RBAC (F08-T02)", () => {
  it("unknown requestId → 404 not_found", async () => {
    const client = await loginAs("OPS");
    const res = await client.post(base(NOPE)).send({ tasks: [{ title: "x", phase: "SETUP" }] });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
    expect(res.body.messageKey).toBe("common.not_found");
  });

  it("VIEWER cannot persist → 403 forbidden", async () => {
    const client = await loginAs("VIEWER");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({ tasks: [{ title: "x", phase: "SETUP" }] });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
    expect(res.body.messageKey).toBe("auth.forbidden");
  });

  it("anonymous cannot persist → 401 unauthorized", async () => {
    const req = await seedRequest();
    const res = await anon()
      .post(base(req.id))
      .set("Idempotency-Key", "anon-persist")
      .send({ tasks: [{ title: "x", phase: "SETUP" }] });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("MANAGER (above OPS) is allowed to persist", async () => {
    const client = await loginAs("MANAGER");
    const req = await seedRequest();
    const res = await client.post(base(req.id)).send({ tasks: [{ title: "x", phase: "SETUP" }] });
    expect(res.status).toBe(201);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// list — ordering, empty, 404, RBAC
// ───────────────────────────────────────────────────────────────────────────
describe("GET /requests/:id/tasks (F08-T02)", () => {
  it("orders by [phase asc, createdAt asc]: SETUP before TEARDOWN, insertion order within a phase", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    // Seed deliberately out of phase order; spread createdAt so the secondary sort is observable.
    const t1 = await seedTask({ requestId: req.id, title: "teardown-1", phase: "TEARDOWN" });
    await new Promise((r) => setTimeout(r, 5));
    const t2 = await seedTask({ requestId: req.id, title: "setup-1", phase: "SETUP" });
    await new Promise((r) => setTimeout(r, 5));
    const t3 = await seedTask({ requestId: req.id, title: "setup-2", phase: "SETUP" });
    await new Promise((r) => setTimeout(r, 5));
    const t4 = await seedTask({ requestId: req.id, title: "teardown-2", phase: "TEARDOWN" });

    const res = await client.get(base(req.id));
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: any) => t.id)).toEqual([t2.id, t3.id, t1.id, t4.id]);
  });

  it("a request with no tasks → empty list", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.get(base(req.id));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("unknown requestId → 404 not_found", async () => {
    const client = await loginAs("OPS");
    const res = await client.get(base(NOPE));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("VIEWER can read the task list (read tier)", async () => {
    const client = await loginAs("VIEWER");
    const req = await seedRequest();
    await seedTask({ requestId: req.id, title: "visible", phase: "SETUP" });
    const res = await client.get(base(req.id));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("anonymous cannot read → 401", async () => {
    const req = await seedRequest();
    const res = await anon().get(base(req.id));
    expect(res.status).toBe(401);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// update — assignment + status changes + audit
// ───────────────────────────────────────────────────────────────────────────
describe("PATCH /tasks/:id — assignment + status (F08-T03)", () => {
  it("walks TODO → IN_PROGRESS → DONE, auditing before/after each step", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const task = await seedTask({ requestId: req.id, status: "TODO" });

    const r1 = await client.patch(taskUrl(task.id)).send({ status: "IN_PROGRESS" });
    expect(r1.status).toBe(200);
    expect(r1.body.data.status).toBe("IN_PROGRESS");
    const r2 = await client.patch(taskUrl(task.id)).send({ status: "DONE" });
    expect(r2.body.data.status).toBe("DONE");

    const audits = await auditEntriesFor("Task", task.id);
    expect(audits).toHaveLength(2);
    expect((audits[0]!.before as any).status).toBe("TODO");
    expect((audits[0]!.after as any).status).toBe("IN_PROGRESS");
    expect((audits[1]!.before as any).status).toBe("IN_PROGRESS");
    expect((audits[1]!.after as any).status).toBe("DONE");
    expect(audits[0]!.requestId).toBe(req.id);
    expect(audits[0]!.actorId).toBe(client.user.id);
  });

  it("can move a task to BLOCKED", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const task = await seedTask({ requestId: req.id, status: "IN_PROGRESS" });
    const res = await client.patch(taskUrl(task.id)).send({ status: "BLOCKED" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("BLOCKED");
  });

  it("assigns a task to a staff member and records before/after assigneeId", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const task = await seedTask({ requestId: req.id });
    const res = await client.patch(taskUrl(task.id)).send({ assigneeId: client.user.id });
    expect(res.status).toBe(200);
    expect(res.body.data.assigneeId).toBe(client.user.id);
    const audit = (await auditEntriesFor("Task", task.id))[0]!;
    expect((audit.before as any).assigneeId).toBeNull();
    expect((audit.after as any).assigneeId).toBe(client.user.id);
  });

  it("clears an assignee with assigneeId: null", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const task = await seedTask({ requestId: req.id, assigneeId: client.user.id });
    const res = await client.patch(taskUrl(task.id)).send({ assigneeId: null });
    expect(res.status).toBe(200);
    expect(res.body.data.assigneeId).toBeNull();
    const audit = (await auditEntriesFor("Task", task.id))[0]!;
    expect((audit.before as any).assigneeId).toBe(client.user.id);
    expect((audit.after as any).assigneeId).toBeNull();
  });

  it("updating only status leaves the assignee untouched", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const task = await seedTask({ requestId: req.id, assigneeId: client.user.id, status: "TODO" });
    const res = await client.patch(taskUrl(task.id)).send({ status: "IN_PROGRESS" });
    expect(res.body.data.status).toBe("IN_PROGRESS");
    expect(res.body.data.assigneeId).toBe(client.user.id);
  });

  it("updating only assignee leaves the status untouched", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const task = await seedTask({ requestId: req.id, status: "BLOCKED" });
    const res = await client.patch(taskUrl(task.id)).send({ assigneeId: client.user.id });
    expect(res.body.data.assigneeId).toBe(client.user.id);
    expect(res.body.data.status).toBe("BLOCKED");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// update — validation, 404, RBAC
// ───────────────────────────────────────────────────────────────────────────
describe("PATCH /tasks/:id — validation + not_found + RBAC (F08-T03)", () => {
  it("invalid status enum → 422 fields.status = validation.enum", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const task = await seedTask({ requestId: req.id });
    const res = await client.patch(taskUrl(task.id)).send({ status: "PENDING" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.fields.status).toBe("validation.enum");
  });

  it("assigneeId not a UUID → 422 fields.assigneeId = validation.uuid", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const task = await seedTask({ requestId: req.id });
    const res = await client.patch(taskUrl(task.id)).send({ assigneeId: "nope" });
    expect(res.status).toBe(422);
    expect(res.body.fields.assigneeId).toBe("validation.uuid");
  });

  it("a validation failure does not mutate the task and writes no audit", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const task = await seedTask({ requestId: req.id, status: "TODO" });
    await client.patch(taskUrl(task.id)).send({ status: "PENDING" });
    const fresh = await prisma.task.findUnique({ where: { id: task.id } });
    expect(fresh!.status).toBe("TODO");
    expect(await prisma.auditEntry.count({ where: { action: "task.update", entityId: task.id } })).toBe(0);
  });

  it("unknown taskId → 404 not_found", async () => {
    const client = await loginAs("OPS");
    const res = await client.patch(taskUrl(NOPE)).send({ status: "DONE" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
    expect(res.body.messageKey).toBe("common.not_found");
  });

  it("VIEWER cannot update → 403 forbidden", async () => {
    const owner = await loginAs("OPS");
    const req = await seedRequest();
    const task = await seedTask({ requestId: req.id });
    const viewer = await loginAs("VIEWER");
    const res = await viewer.patch(taskUrl(task.id)).send({ status: "DONE" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
    // and the task is untouched
    void owner;
    const fresh = await prisma.task.findUnique({ where: { id: task.id } });
    expect(fresh!.status).toBe("TODO");
  });

  it("anonymous cannot update → 401 unauthorized", async () => {
    const ops = await loginAs("OPS");
    const req = await seedRequest();
    const task = await seedTask({ requestId: req.id });
    void ops;
    const res = await anon().patch(taskUrl(task.id)).set("Idempotency-Key", "anon-patch").send({ status: "DONE" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });
});

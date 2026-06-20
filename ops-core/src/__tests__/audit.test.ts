import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app, loginAs, makeUser, anon, resetDb, prisma, auditEntriesFor } from "./helpers/integration";
import { writeAudit, writeSystemAudit } from "../modules/audit/audit.writer";
import { writeOutbox } from "../modules/events/outbox.writer";

/**
 * A raw authenticated supertest agent (cookies + CSRF) so we can fire verbs the
 * Client helper doesn't expose (DELETE/PUT) when proving the ledger is append-only.
 */
async function rawAgent(role: "ADMIN" | "MANAGER" | "OPS" | "VIEWER") {
  const email = `${role.toLowerCase()}.raw@pyramid.test`;
  await makeUser(role, { email, name: `${role} Raw` });
  const agent = request.agent(app);
  const login = await agent.post("/api/v1/public/auth/login").send({ email, password: "password123" });
  const setCookie = login.headers["set-cookie"] as unknown as string[] | undefined;
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  let csrf = "";
  for (const c of arr) {
    const m = c.match(/pb_csrf=([^;]+)/);
    if (m) csrf = decodeURIComponent(m[1]!);
  }
  return { agent, csrf };
}

const AUDIT = "/api/v1/private/audit";

beforeEach(resetDb);

// ---------------------------------------------------------------------------
// GET /audit — query, ordering, filtering, envelope (F09-T03)
// ---------------------------------------------------------------------------
describe("GET /audit (F09-T03)", () => {
  it("filters by entityType and orders by `at` ascending (oldest-first)", async () => {
    const admin = await loginAs("ADMIN");
    // each create writes a user.create AuditEntry (entityType User)
    await admin.post("/api/v1/admin/users").send({ email: "a@pyramid.test", name: "A", password: "password123", role: "OPS" });
    await admin.post("/api/v1/admin/users").send({ email: "b@pyramid.test", name: "B", password: "password123", role: "VIEWER" });

    const res = await admin.get(`${AUDIT}?entityType=User`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every((e: any) => e.entityType === "User")).toBe(true);
    const times = res.body.data.map((e: any) => e.at);
    expect([...times].sort()).toEqual(times); // ascending

    const none = await admin.get(`${AUDIT}?entityType=Nonexistent`);
    expect(none.body.data).toEqual([]); // empty, not 404
  });

  it("filters by requestId", async () => {
    const admin = await loginAs("ADMIN");
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, { actor: admin.user, action: "request.create", entityType: "EventRequest", entityId: "req_x", requestId: "req_x", after: { status: "DRAFT" } });
      await writeAudit(tx, { actor: admin.user, action: "space.update", entityType: "Space", entityId: "sp_y" });
    });
    const res = await admin.get(`${AUDIT}?requestId=req_x`);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].action).toBe("request.create");
  });

  it("combines requestId AND entityType (both filters narrow together)", async () => {
    const admin = await loginAs("ADMIN");
    await prisma.$transaction(async (tx) => {
      // same requestId, different entity types
      await writeAudit(tx, { actor: admin.user, action: "request.create", entityType: "EventRequest", entityId: "req_1", requestId: "req_1" });
      await writeAudit(tx, { actor: admin.user, action: "reservation.hold", entityType: "Reservation", entityId: "res_1", requestId: "req_1" });
      // different requestId, same entity type as the one we'll filter for
      await writeAudit(tx, { actor: admin.user, action: "reservation.hold", entityType: "Reservation", entityId: "res_2", requestId: "req_2" });
    });
    const res = await admin.get(`${AUDIT}?requestId=req_1&entityType=Reservation`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].entityId).toBe("res_1");
  });

  it("with no filters returns the whole ledger oldest-first", async () => {
    const admin = await loginAs("ADMIN");
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, { actor: admin.user, action: "a.one", entityType: "A", entityId: "a1" });
      await writeAudit(tx, { actor: admin.user, action: "b.two", entityType: "B", entityId: "b1" });
    });
    const res = await admin.get(AUDIT);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.map((e: any) => e.action)).toEqual(["a.one", "b.two"]);
  });

  it("returns the ServiceResponse envelope (status OK, messageKey, data[])", async () => {
    const admin = await loginAs("ADMIN");
    const res = await admin.get(AUDIT);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
    expect(res.body.messageKey).toBe("audit.list.success");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("each row exposes the full AuditEntry contract shape", async () => {
    const mgr = await loginAs("MANAGER");
    await prisma.$transaction((tx) =>
      writeAudit(tx, {
        actor: mgr.user, action: "request.reject", entityType: "EventRequest", entityId: "r1", requestId: "r1",
        before: { status: "PROPOSED" }, after: { status: "REJECTED" }, reason: "no date",
      }),
    );
    const res = await mgr.get(`${AUDIT}?requestId=r1`);
    const row = res.body.data[0];
    expect(row).toMatchObject({
      action: "request.reject",
      entityType: "EventRequest",
      entityId: "r1",
      requestId: "r1",
      before: { status: "PROPOSED" },
      after: { status: "REJECTED" },
      reason: "no date",
    });
    expect(typeof row.id).toBe("string");
    expect(typeof row.actorId).toBe("string");
    expect(typeof row.actorName).toBe("string");
    expect(typeof row.at).toBe("string"); // ISO timestamp
    expect(() => new Date(row.at).toISOString()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// RBAC — who can read the ledger (anon 401, PARTNER 403, VIEWER+ allowed)
// ---------------------------------------------------------------------------
describe("GET /audit RBAC", () => {
  it("anonymous → 401 unauthorized", async () => {
    const res = await anon().get(AUDIT);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
    expect(res.body.messageKey).toBe("common.unauthorized");
  });

  it("PARTNER (below staff floor) → 403 forbidden", async () => {
    const partner = await loginAs("PARTNER");
    const res = await partner.get(AUDIT);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
    expect(res.body.messageKey).toBe("auth.forbidden");
  });

  it.each(["VIEWER", "OPS", "MANAGER", "ADMIN"] as const)("%s (staff) may read the ledger", async (role) => {
    const client = await loginAs(role);
    const res = await client.get(AUDIT);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Atomicity + no dual-write (F09-T04 / ADR-0002)
// ---------------------------------------------------------------------------
describe("audit atomicity + no dual-write (F09-T04)", () => {
  it("rolls back the audit row when the caller's transaction aborts", async () => {
    const ops = await loginAs("OPS");
    const actor = ops.user;
    await expect(
      prisma.$transaction(async (tx) => {
        await writeAudit(tx, { actor, action: "x.create", entityType: "X", entityId: "x_1" });
        throw new Error("boom"); // abort
      }),
    ).rejects.toThrow("boom");
    expect(await prisma.auditEntry.count()).toBe(0);
  });

  it("state + audit + outbox commit all-or-nothing: a forced failure leaves NONE of the three", async () => {
    const ops = await loginAs("OPS");
    const actor = ops.user;
    // A self-contained mutation: write a Space (state) + its audit + its outbox event,
    // then abort. The outbox row and the audit row are bound to the same commit.
    await expect(
      prisma.$transaction(async (tx) => {
        const space = await tx.space.create({
          data: { name: "Rollback Hall", floor: 0, kind: "MAIN", capacities: { THEATER: 10 }, dayRateMinor: 1000, setupBufferMinutes: 0, teardownBufferMinutes: 0, status: "ACTIVE" },
        });
        await writeAudit(tx, { actor, action: "space.create", entityType: "Space", entityId: space.id, after: { name: space.name } });
        await writeOutbox(tx, "space.created", { spaceId: space.id });
        throw new Error("abort after all three writes");
      }),
    ).rejects.toThrow("abort after all three writes");

    expect(await prisma.space.count({ where: { name: "Rollback Hall" } })).toBe(0);
    expect(await prisma.auditEntry.count({ where: { action: "space.create" } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { subject: "space.created" } })).toBe(0);
  });

  it("state + audit + outbox commit together on success (the positive of the same path)", async () => {
    const ops = await loginAs("OPS");
    const actor = ops.user;
    const space = await prisma.$transaction(async (tx) => {
      const s = await tx.space.create({
        data: { name: "Commit Hall", floor: 0, kind: "MAIN", capacities: { THEATER: 10 }, dayRateMinor: 1000, setupBufferMinutes: 0, teardownBufferMinutes: 0, status: "ACTIVE" },
      });
      await writeAudit(tx, { actor, action: "space.create", entityType: "Space", entityId: s.id, after: { name: s.name } });
      await writeOutbox(tx, "space.created", { spaceId: s.id });
      return s;
    });
    expect(await prisma.space.count({ where: { id: space.id } })).toBe(1);
    expect((await auditEntriesFor("Space", space.id)).length).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { subject: "space.created" } })).toBe(1);
  });

  it("a real mutation that fails mid-transaction (DB constraint) leaves no audit behind", async () => {
    const ops = await loginAs("OPS");
    const actor = ops.user;
    // Write audit first, then violate a NOT NULL/required constraint so Postgres aborts the tx.
    await expect(
      prisma.$transaction(async (tx) => {
        await writeAudit(tx, { actor, action: "asset.create", entityType: "Asset", entityId: "pending" });
        // `name` is required → this insert throws and rolls the whole tx back.
        await tx.$executeRawUnsafe(`INSERT INTO "Asset" (id, type, "totalQuantity", location, status, "createdAt", "updatedAt") VALUES ('x', 'SEATING', 1, 'L', 'ACTIVE', now(), now())`);
      }),
    ).rejects.toThrow();
    expect(await prisma.auditEntry.count({ where: { action: "asset.create" } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Actor recording + system actor (F09-T04)
// ---------------------------------------------------------------------------
describe("audit actor + diff capture (F09-T04)", () => {
  it("records the real actor + a before/after diff", async () => {
    const mgr = await loginAs("MANAGER");
    await prisma.$transaction((tx) =>
      writeAudit(tx, { actor: mgr.user, action: "request.transition", entityType: "EventRequest", entityId: "r1", before: { status: "PROPOSED" }, after: { status: "APPROVED" } }),
    );
    const row = await prisma.auditEntry.findFirstOrThrow();
    expect(row.actorId).toBe(mgr.user.id);
    expect(row.actorName).toBe("MANAGER User");
    expect(row.before).toEqual({ status: "PROPOSED" });
    expect(row.after).toEqual({ status: "APPROVED" });
  });

  it("a real mutation through the API records req.actor (never anonymous)", async () => {
    const admin = await loginAs("ADMIN");
    const created = await admin.post("/api/v1/admin/users").send({ email: "rec@pyramid.test", name: "Rec", password: "password123", role: "OPS" });
    const rows = await auditEntriesFor("User", created.body.data.id);
    expect(rows.length).toBe(1);
    expect(rows[0]!.actorId).toBe(admin.user.id); // the acting admin, not the created user
    expect(rows[0]!.actorName).toBe(admin.user.name);
    expect(rows[0]!.action).toBe("user.create");
  });

  it("the system actor (reaper) writes a non-anonymous 'system' row, surfaced via GET", async () => {
    await prisma.$transaction((tx) =>
      writeSystemAudit(tx, { action: "reservation.release", entityType: "Reservation", entityId: "r_sys", requestId: "req_sys", before: { status: "HELD" }, after: { status: "RELEASED" }, reason: "hold lease expired" }),
    );
    const viewer = await loginAs("VIEWER");
    const res = await viewer.get(`${AUDIT}?requestId=req_sys`);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].actorId).toBeNull();
    expect(res.body.data[0].actorName).toBe("system");
    expect(res.body.data[0].reason).toBe("hold lease expired");
  });
});

// ---------------------------------------------------------------------------
// Append-only — no update / delete path is exposed (F09-T04)
// ---------------------------------------------------------------------------
describe("audit append-only (F09-T04)", () => {
  it("the audit router exposes no mutating verb (POST/PATCH/PUT/DELETE are not routed)", async () => {
    const admin = await loginAs("ADMIN");
    // seed one row via a real mutation
    await admin.post("/api/v1/admin/users").send({ email: "imm@pyramid.test", name: "Imm", password: "password123", role: "OPS" });
    const before = await prisma.auditEntry.findFirstOrThrow();
    const beforeCount = await prisma.auditEntry.count();

    const { agent, csrf } = await rawAgent("ADMIN");
    // No write verb is mapped on /audit (only GET). Each must NOT succeed (no 2xx) and must not change the row.
    const post = await agent.post(AUDIT).set("x-csrf-token", csrf).set("Idempotency-Key", "k1").send({ action: "tampered" });
    const patch = await agent.patch(`${AUDIT}/${before.id}`).set("x-csrf-token", csrf).set("Idempotency-Key", "k2").send({ action: "tampered" });
    const put = await agent.put(`${AUDIT}/${before.id}`).set("x-csrf-token", csrf).set("Idempotency-Key", "k3").send({ action: "tampered" });
    const del = await agent.delete(`${AUDIT}/${before.id}`).set("x-csrf-token", csrf).set("Idempotency-Key", "k4");

    for (const r of [post, patch, put, del]) {
      expect(r.status).not.toBe(200);
      expect(r.status).not.toBe(201);
    }
    // The ledger is untouched.
    const after = await prisma.auditEntry.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.action).toBe(before.action);
    expect(await prisma.auditEntry.count()).toBe(beforeCount);
  });

  it("the AuditEntry shape carries no updatedAt/deletedAt (append-only by schema)", async () => {
    const ops = await loginAs("OPS");
    await prisma.$transaction((tx) => writeAudit(tx, { actor: ops.user, action: "x.create", entityType: "X", entityId: "x1" }));
    const row = (await prisma.auditEntry.findFirstOrThrow()) as Record<string, unknown>;
    expect(row).not.toHaveProperty("updatedAt");
    expect(row).not.toHaveProperty("deletedAt");
    expect(row.at).toBeInstanceOf(Date); // single immutable timestamp
  });
});

// ---------------------------------------------------------------------------
// History reconstruction across a real entity lifecycle (F09-T04)
// ---------------------------------------------------------------------------
describe("GET /audit?requestId reconstructs full ordered history (F09-T04)", () => {
  it("a request created → held → approved yields its events oldest-first", async () => {
    const mgr = await loginAs("MANAGER");
    // a space with no buffers keeps the hold window clean
    const space = await prisma.space.create({
      data: { name: "Hist Hall", floor: 0, kind: "MAIN", capacities: { THEATER: 200 }, dayRateMinor: 1000, setupBufferMinutes: 0, teardownBufferMinutes: 0, status: "ACTIVE" },
    });
    const W = { start: "2026-09-01T09:00:00Z", end: "2026-09-01T18:00:00Z" };
    const req = (await mgr.post("/api/v1/private/requests").send({ title: "Hist", organizerName: "Acme", expectedAttendees: 50, eventType: "CONFERENCE", preferredDates: [W] })).body.data;
    await mgr.post("/api/v1/private/reservations").send({ requestId: req.id, spaceId: space.id, dateRange: W });
    await mgr.post(`/api/v1/private/requests/${req.id}/approve`);

    const res = await mgr.get(`${AUDIT}?requestId=${req.id}`);
    expect(res.status).toBe(200);
    const actions = res.body.data.map((e: any) => e.action);
    // request.create, reservation.hold, request.transition (DRAFT→PROPOSED), reservation.confirm, request.approve
    expect(actions[0]).toBe("request.create");
    expect(actions).toContain("reservation.hold");
    expect(actions).toContain("request.approve");
    // oldest-first ordering holds across the whole history
    const times = res.body.data.map((e: any) => new Date(e.at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // every row carries the acting manager
    expect(res.body.data.every((e: any) => e.actorId === mgr.user.id)).toBe(true);
  });
});

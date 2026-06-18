import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, resetDb, prisma } from "./helpers/integration";
import { writeAudit } from "../modules/audit/audit.writer";

const AUDIT = "/api/v1/private/audit";

beforeEach(resetDb);

describe("GET /audit (F09-T03)", () => {
  it("filters by entityType and orders by `at` ascending", async () => {
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
});

describe("audit atomicity + append-only (F09-T04)", () => {
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
});

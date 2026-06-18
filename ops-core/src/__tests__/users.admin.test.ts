import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, anon, resetDb, prisma } from "./helpers/integration";

const USERS = "/api/v1/admin/users";

beforeEach(resetDb);

describe("admin users CRUD (F01-T07)", () => {
  it("ADMIN can list and create; create writes an audit row", async () => {
    const admin = await loginAs("ADMIN");
    const list0 = await admin.get(USERS);
    expect(list0.status).toBe(200);
    expect(list0.body.data.length).toBe(1); // just the admin

    const create = await admin
      .post(USERS)
      .send({ email: "new@pyramid.test", name: "New Staff", password: "password123", role: "OPS" });
    expect(create.status).toBe(201);
    expect(create.body.data).toMatchObject({ email: "new@pyramid.test", role: "OPS", isActive: true });

    const audit = await prisma.auditEntry.findFirst({ where: { action: "user.create", entityId: create.body.data.id } });
    expect(audit?.actorName).toBe("ADMIN User");
  });

  it("a non-ADMIN authed actor gets 403; anonymous gets 401", async () => {
    const manager = await loginAs("MANAGER");
    expect((await manager.get(USERS)).status).toBe(403);
    expect((await anon().get(USERS)).status).toBe(401);
  });

  it("rejects a duplicate email with 422 keyed on email", async () => {
    const admin = await loginAs("ADMIN");
    const body = { email: "dup@pyramid.test", name: "A", password: "password123", role: "VIEWER" };
    expect((await admin.post(USERS).send(body)).status).toBe(201);
    const dup = await admin.post(USERS).send(body);
    expect(dup.status).toBe(422);
    expect(dup.body.fields.email).toBe("user.email_taken");
  });

  it("rejects an unknown role value with 422", async () => {
    const admin = await loginAs("ADMIN");
    const res = await admin.post(USERS).send({ email: "r@pyramid.test", name: "A", password: "password123", role: "SUPERUSER" });
    expect(res.status).toBe(422);
    expect(res.body.fields.role).toBe("validation.enum");
  });

  it("PATCH updates role/isActive + audits; unknown id → 404", async () => {
    const admin = await loginAs("ADMIN");
    const created = (await admin.post(USERS).send({ email: "p@pyramid.test", name: "P", password: "password123", role: "VIEWER" })).body.data;
    const patch = await admin.patch(`${USERS}/${created.id}`).send({ role: "MANAGER", isActive: false });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({ role: "MANAGER", isActive: false });

    const missing = await admin.patch(`${USERS}/00000000-0000-4000-8000-000000000000`).send({ role: "OPS" });
    expect(missing.status).toBe(404);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, makeUser, anon, resetDb, prisma, auditEntriesFor } from "./helpers/integration";
import type { Role } from "../types/api/auth";

const USERS = "/api/v1/admin/users";
const PW = "password123";

beforeEach(resetDb);

/**
 * F01-T07 — admin staff CRUD. The "things that must not happen" here:
 *  - a non-ADMIN (or anon) ever touching the user table;
 *  - a password ever stored as plaintext or echoed back in any response;
 *  - a duplicate email surfacing as a 500 instead of a field-keyed 422;
 *  - a PATCH mass-assigning immutable identity (id/email/createdAt/passwordHash);
 *  - a deactivated user still being able to authenticate;
 *  - a mutation landing without an audit row carrying the real actor.
 */
describe("admin users — list", () => {
  it("ADMIN lists staff (200), newest-by-createdAt ascending, with the success key", async () => {
    const admin = await loginAs("ADMIN");
    await makeUser("OPS", { email: "ops1@pyramid.test" });
    await makeUser("VIEWER", { email: "viewer1@pyramid.test" });

    const res = await admin.get(USERS);
    expect(res.status).toBe(200);
    expect(res.body.messageKey).toBe("user.list.success");
    expect(res.body.data).toHaveLength(3); // admin + 2 seeded
    // ordered by createdAt asc → the admin (logged in first) is first.
    expect(res.body.data[0].email).toBe("admin@pyramid.test");
  });

  it("never leaks passwordHash or password on any listed row", async () => {
    const admin = await loginAs("ADMIN");
    const res = await admin.get(USERS);
    for (const u of res.body.data) {
      expect(u).not.toHaveProperty("passwordHash");
      expect(u).not.toHaveProperty("password");
      expect(Object.keys(u).sort()).toEqual(["createdAt", "email", "id", "isActive", "name", "role"]);
    }
  });
});

describe("admin users — pagination (F01-T09, ADR-0017)", () => {
  it("bounds the staff list with page/pageSize + meta; pageSize>100 → 422", async () => {
    const admin = await loginAs("ADMIN");
    await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        prisma.user.create({
          data: { email: `staff${String(i).padStart(2, "0")}@pyramid.test`, name: `Staff ${i}`, passwordHash: "x", role: "VIEWER" },
        }),
      ),
    );
    const p1 = await admin.get(`${USERS}?page=1&pageSize=10`);
    expect(p1.status).toBe(200);
    expect(p1.body.data).toHaveLength(10);
    expect(p1.body).toMatchObject({ total: 25, page: 1, pageSize: 10, totalPages: 3 }); // 24 + the admin

    const p3 = await admin.get(`${USERS}?page=3&pageSize=10`);
    expect(p3.body.data).toHaveLength(5);

    expect((await admin.get(`${USERS}?pageSize=500`)).status).toBe(422);
  });
});

describe("admin users — RBAC (ADMIN-only; the whole router)", () => {
  // Every non-ADMIN authenticated role is forbidden; anonymous is unauthorized.
  for (const role of ["VIEWER", "OPS", "MANAGER", "PARTNER"] as const) {
    it(`${role} is forbidden from listing (403 auth.forbidden)`, async () => {
      const client = await loginAs(role);
      const res = await client.get(USERS);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("forbidden");
      expect(res.body.messageKey).toBe("auth.forbidden");
    });

    it(`${role} is forbidden from creating (403 auth.forbidden)`, async () => {
      const client = await loginAs(role);
      const res = await client.post(USERS).send({ email: "x@pyramid.test", name: "X", password: PW, role: "VIEWER" });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("forbidden");
      expect(res.body.messageKey).toBe("auth.forbidden");
    });

    it(`${role} is forbidden from patching (403 auth.forbidden)`, async () => {
      const client = await loginAs(role);
      const victim = await makeUser("VIEWER", { email: "victim@pyramid.test" });
      const res = await client.patch(`${USERS}/${victim.id}`).send({ role: "OPS" });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("forbidden");
      expect(res.body.messageKey).toBe("auth.forbidden");
    });
  }

  it("anonymous is unauthorized on list/create/patch (401 common.unauthorized)", async () => {
    const list = await anon().get(USERS);
    expect(list.status).toBe(401);
    expect(list.body.error).toBe("unauthorized");
    expect(list.body.messageKey).toBe("common.unauthorized");

    const create = await anon().post(USERS).send({ email: "x@pyramid.test", name: "X", password: PW });
    expect(create.status).toBe(401);
    expect(create.body.error).toBe("unauthorized");

    const patch = await anon().patch(`${USERS}/00000000-0000-4000-8000-000000000000`).send({ role: "OPS" });
    expect(patch.status).toBe(401);
    expect(patch.body.error).toBe("unauthorized");
  });

  it("a forbidden create writes no user and no audit row (defense holds before the service)", async () => {
    const ops = await loginAs("OPS");
    await ops.post(USERS).send({ email: "ghost@pyramid.test", name: "Ghost", password: PW });
    expect(await prisma.user.findUnique({ where: { email: "ghost@pyramid.test" } })).toBeNull();
    expect(await prisma.auditEntry.count({ where: { action: "user.create" } })).toBe(0);
  });
});

describe("admin users — create", () => {
  it("creates a user (201), returns the DTO with the created key, defaults role VIEWER + isActive true", async () => {
    const admin = await loginAs("ADMIN");
    const res = await admin.post(USERS).send({ email: "new@pyramid.test", name: "New Staff", password: PW });
    expect(res.status).toBe(201);
    expect(res.body.messageKey).toBe("user.created");
    expect(res.body.data).toMatchObject({ email: "new@pyramid.test", name: "New Staff", role: "VIEWER", isActive: true });
    expect(res.body.data.id).toBeTypeOf("string");
    expect(res.body.data.createdAt).toBeTypeOf("string");
  });

  it("hashes the password (argon2id), never stores plaintext, never returns it", async () => {
    const admin = await loginAs("ADMIN");
    const res = await admin.post(USERS).send({ email: "secure@pyramid.test", name: "Sec", password: PW, role: "OPS" });
    expect(res.status).toBe(201);
    expect(res.body.data).not.toHaveProperty("password");
    expect(res.body.data).not.toHaveProperty("passwordHash");

    const row = await prisma.user.findUnique({ where: { email: "secure@pyramid.test" } });
    expect(row!.passwordHash).not.toBe(PW);
    expect(row!.passwordHash).not.toContain(PW);
    expect(row!.passwordHash.startsWith("$argon2")).toBe(true);
  });

  it("lowercases the email before storing (case-insensitive identity)", async () => {
    const admin = await loginAs("ADMIN");
    const res = await admin.post(USERS).send({ email: "MixedCase@Example.AL", name: "M", password: PW });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe("mixedcase@example.al");
    expect(await prisma.user.findUnique({ where: { email: "mixedcase@example.al" } })).not.toBeNull();
  });

  it("rejects a duplicate email as 422 keyed on email — NOT a 500 — (pre-check path)", async () => {
    const admin = await loginAs("ADMIN");
    const body = { email: "dup@pyramid.test", name: "A", password: PW, role: "VIEWER" as const };
    expect((await admin.post(USERS).send(body)).status).toBe(201);
    const dup = await admin.post(USERS).send(body);
    expect(dup.status).toBe(422);
    expect(dup.body.error).toBe("validation");
    expect(dup.body.fields.email).toBe("user.email_taken");
  });

  it("treats a differently-cased duplicate email as taken (422, no second row)", async () => {
    const admin = await loginAs("ADMIN");
    expect((await admin.post(USERS).send({ email: "casey@pyramid.test", name: "A", password: PW })).status).toBe(201);
    const dup = await admin.post(USERS).send({ email: "CASEY@PYRAMID.TEST", name: "B", password: PW });
    expect(dup.status).toBe(422);
    expect(dup.body.fields.email).toBe("user.email_taken");
    expect(await prisma.user.count({ where: { email: "casey@pyramid.test" } })).toBe(1);
  });

  it("re-throws a NON-P2002 insert failure unchanged (must not masquerade as email-taken)", async () => {
    // The catch block must only map the unique-violation race. Any other DB error
    // has to propagate (→ 500 internal), never be swallowed into a 422 email field.
    const { usersService } = await import("../modules/users/service");
    const actor = { id: "00000000-0000-4000-8000-000000000002", name: "Admin", role: "ADMIN" as Role };
    // The insert+audit run inside $transaction; force that to throw a generic (non-P2002) error.
    const origTx = prisma.$transaction;
    const boom = new Error("connection reset");
    (prisma as { $transaction: unknown }).$transaction = async () => {
      throw boom;
    };
    try {
      await expect(usersService.create(actor, { email: "boom@pyramid.test", name: "Boom", password: PW })).rejects.toBe(boom);
    } finally {
      (prisma as { $transaction: unknown }).$transaction = origTx;
    }
  });

  it("maps the P2002 unique-violation race to the 422 field error (service catch branch)", async () => {
    // Exercise the catch branch directly: an insert that loses the email race after
    // the pre-check passes must surface as 422 user.email_taken, never a 500.
    const { usersService } = await import("../modules/users/service");
    const actor = { id: "00000000-0000-4000-8000-000000000001", name: "Race Admin", role: "ADMIN" as Role };
    await prisma.user.create({ data: { email: "race@pyramid.test", name: "First", passwordHash: "x", role: "VIEWER" } });
    // Stub findUnique to miss (simulate the TOCTOU window) so create() reaches the insert + P2002.
    const orig = prisma.user.findUnique;
    (prisma.user as { findUnique: unknown }).findUnique = async () => null;
    try {
      await expect(usersService.create(actor, { email: "race@pyramid.test", name: "Second", password: PW })).rejects.toMatchObject({
        status: 422,
        error: "validation",
        fields: { email: "user.email_taken" },
      });
    } finally {
      (prisma.user as { findUnique: unknown }).findUnique = orig;
    }
  });

  describe("validation (422 fields)", () => {
    it("missing email/name/password → field keys for each", async () => {
      const admin = await loginAs("ADMIN");
      const res = await admin.post(USERS).send({});
      expect(res.status).toBe(422);
      expect(res.body.messageKey).toBe("validation.failed");
      expect(res.body.fields.email).toBe("validation.email");
      expect(res.body.fields.name).toBe("validation.invalid");
      expect(res.body.fields.password).toBe("validation.invalid");
    });

    it("malformed email → validation.email", async () => {
      const admin = await loginAs("ADMIN");
      const res = await admin.post(USERS).send({ email: "notanemail", name: "N", password: PW });
      expect(res.status).toBe(422);
      expect(res.body.fields.email).toBe("validation.email");
    });

    it("password shorter than 8 chars → validation.length", async () => {
      const admin = await loginAs("ADMIN");
      const res = await admin.post(USERS).send({ email: "short@pyramid.test", name: "S", password: "short" });
      expect(res.status).toBe(422);
      expect(res.body.fields.password).toBe("validation.length");
    });

    it("unknown role value → validation.enum (and no user is written)", async () => {
      const admin = await loginAs("ADMIN");
      const res = await admin.post(USERS).send({ email: "r@pyramid.test", name: "A", password: PW, role: "SUPERUSER" });
      expect(res.status).toBe(422);
      expect(res.body.fields.role).toBe("validation.enum");
      expect(await prisma.user.findUnique({ where: { email: "r@pyramid.test" } })).toBeNull();
    });

    it("non-boolean isActive → validation.invalid", async () => {
      const admin = await loginAs("ADMIN");
      const res = await admin.post(USERS).send({ email: "ia@pyramid.test", name: "I", password: PW, isActive: "nope" });
      expect(res.status).toBe(422);
      expect(res.body.fields.isActive).toBe("validation.invalid");
    });
  });

  it("accepts every role in the ladder, including PARTNER (F15/ADR-0010)", async () => {
    const admin = await loginAs("ADMIN");
    for (const role of ["ADMIN", "MANAGER", "OPS", "VIEWER", "PARTNER"] as const) {
      const res = await admin.post(USERS).send({ email: `${role.toLowerCase()}.role@pyramid.test`, name: role, password: PW, role });
      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe(role);
    }
  });

  it("honors an explicit isActive:false on create", async () => {
    const admin = await loginAs("ADMIN");
    const res = await admin.post(USERS).send({ email: "inactive@pyramid.test", name: "Inactive", password: PW, isActive: false });
    expect(res.status).toBe(201);
    expect(res.body.data.isActive).toBe(false);
  });

  it("writes a create audit row with the real actor and an after-snapshot (no before)", async () => {
    const admin = await loginAs("ADMIN");
    const created = (await admin.post(USERS).send({ email: "audited@pyramid.test", name: "Aud", password: PW, role: "OPS" })).body.data;
    const audits = await auditEntriesFor("User", created.id);
    expect(audits).toHaveLength(1);
    const a = audits[0]!;
    expect(a.action).toBe("user.create");
    expect(a.actorId).toBe(admin.user.id);
    expect(a.actorName).toBe("ADMIN User");
    expect(a.before).toBeNull();
    expect(a.after).toMatchObject({ email: "audited@pyramid.test", name: "Aud", role: "OPS", isActive: true });
  });

  it("a duplicate-email rejection writes no audit row", async () => {
    const admin = await loginAs("ADMIN");
    const body = { email: "noaudit@pyramid.test", name: "A", password: PW };
    await admin.post(USERS).send(body);
    const before = await prisma.auditEntry.count({ where: { action: "user.create" } });
    await admin.post(USERS).send(body); // duplicate
    expect(await prisma.auditEntry.count({ where: { action: "user.create" } })).toBe(before);
  });
});

describe("admin users — update", () => {
  async function seedTarget(role: Role = "VIEWER") {
    const admin = await loginAs("ADMIN");
    const u = (await admin.post(USERS).send({ email: `target.${role.toLowerCase()}@pyramid.test`, name: "Target", password: PW, role })).body.data;
    return { admin, target: u };
  }

  it("updates name/role/isActive (200) and returns the updated DTO", async () => {
    const { admin, target } = await seedTarget();
    const res = await admin.patch(`${USERS}/${target.id}`).send({ name: "Renamed", role: "MANAGER", isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.messageKey).toBe("user.updated");
    expect(res.body.data).toMatchObject({ id: target.id, name: "Renamed", role: "MANAGER", isActive: false });
  });

  it("assigns PARTNER via PATCH (F15)", async () => {
    const { admin, target } = await seedTarget("VIEWER");
    const res = await admin.patch(`${USERS}/${target.id}`).send({ role: "PARTNER" });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("PARTNER");
  });

  it("is whitelist-guarded: id/email/createdAt/passwordHash in the body are ignored", async () => {
    const { admin, target } = await seedTarget();
    const res = await admin.patch(`${USERS}/${target.id}`).send({
      id: "11111111-1111-4111-8111-111111111111",
      email: "hijack@pyramid.test",
      createdAt: "2000-01-01T00:00:00.000Z",
      passwordHash: "$argon2id$forged",
      role: "OPS",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("OPS"); // the one whitelisted field took
    const row = await prisma.user.findUnique({ where: { id: target.id } });
    expect(row!.id).toBe(target.id); // unchanged
    expect(row!.email).toBe(target.email); // unchanged
    expect(row!.createdAt.toISOString()).toBe(target.createdAt); // unchanged
    expect(row!.passwordHash).not.toBe("$argon2id$forged"); // unchanged
    // The forged email must not have created a reachable identity.
    expect(await prisma.user.findUnique({ where: { email: "hijack@pyramid.test" } })).toBeNull();
  });

  it("changing the password re-hashes it (stored hash changes; plaintext never stored/returned)", async () => {
    const { admin, target } = await seedTarget();
    const before = (await prisma.user.findUnique({ where: { id: target.id } }))!.passwordHash;
    const res = await admin.patch(`${USERS}/${target.id}`).send({ password: "brand-new-password" });
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty("password");
    expect(res.body.data).not.toHaveProperty("passwordHash");
    const after = (await prisma.user.findUnique({ where: { id: target.id } }))!.passwordHash;
    expect(after).not.toBe(before);
    expect(after).not.toContain("brand-new-password");
    expect(after.startsWith("$argon2")).toBe(true);
  });

  it("an empty-body PATCH is a no-op that still succeeds and changes nothing", async () => {
    const { admin, target } = await seedTarget("OPS");
    const res = await admin.patch(`${USERS}/${target.id}`).send({});
    expect(res.status).toBe(200);
    const row = await prisma.user.findUnique({ where: { id: target.id } });
    expect(row).toMatchObject({ name: "Target", role: "OPS", isActive: true });
  });

  it("unknown id → 404 not_found", async () => {
    const admin = await loginAs("ADMIN");
    const res = await admin.patch(`${USERS}/00000000-0000-4000-8000-000000000000`).send({ role: "OPS" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
    expect(res.body.messageKey).toBe("common.not_found");
  });

  it("a 404 update writes no audit row", async () => {
    const admin = await loginAs("ADMIN");
    await admin.patch(`${USERS}/00000000-0000-4000-8000-000000000000`).send({ role: "OPS" });
    expect(await prisma.auditEntry.count({ where: { action: "user.update" } })).toBe(0);
  });

  describe("update validation (422 fields)", () => {
    it("bad role enum → validation.enum", async () => {
      const { admin, target } = await seedTarget();
      const res = await admin.patch(`${USERS}/${target.id}`).send({ role: "NOPE" });
      expect(res.status).toBe(422);
      expect(res.body.fields.role).toBe("validation.enum");
    });
    it("name too long → validation.length", async () => {
      const { admin, target } = await seedTarget();
      const res = await admin.patch(`${USERS}/${target.id}`).send({ name: "x".repeat(121) });
      expect(res.status).toBe(422);
      expect(res.body.fields.name).toBe("validation.length");
    });
    it("empty name → validation.length", async () => {
      const { admin, target } = await seedTarget();
      const res = await admin.patch(`${USERS}/${target.id}`).send({ name: "" });
      expect(res.status).toBe(422);
      expect(res.body.fields.name).toBe("validation.length");
    });
    it("short password → validation.length", async () => {
      const { admin, target } = await seedTarget();
      const res = await admin.patch(`${USERS}/${target.id}`).send({ password: "short" });
      expect(res.status).toBe(422);
      expect(res.body.fields.password).toBe("validation.length");
    });
    it("non-boolean isActive → validation.invalid", async () => {
      const { admin, target } = await seedTarget();
      const res = await admin.patch(`${USERS}/${target.id}`).send({ isActive: "maybe" });
      expect(res.status).toBe(422);
      expect(res.body.fields.isActive).toBe("validation.invalid");
    });
  });

  it("writes an update audit row with before/after snapshots and the real actor", async () => {
    const { admin, target } = await seedTarget("VIEWER");
    await admin.patch(`${USERS}/${target.id}`).send({ role: "MANAGER", isActive: false, name: "After Name" });
    const audits = await auditEntriesFor("User", target.id);
    const upd = audits.find((a) => a.action === "user.update")!;
    expect(upd).toBeDefined();
    expect(upd.actorId).toBe(admin.user.id);
    expect(upd.before).toMatchObject({ role: "VIEWER", isActive: true, name: "Target" });
    expect(upd.after).toMatchObject({ role: "MANAGER", isActive: false, name: "After Name" });
  });
});

describe("admin users — cross-feature invariants", () => {
  it("deactivating a user (isActive:false) blocks their subsequent login (401)", async () => {
    const admin = await loginAs("ADMIN");
    // Create an active user that can log in.
    const created = (await admin.post(USERS).send({ email: "toggle@pyramid.test", name: "Toggle", password: PW, role: "OPS" })).body.data;
    const okLogin = await anon().post("/api/v1/public/auth/login").send({ email: "toggle@pyramid.test", password: PW });
    expect(okLogin.status).toBe(200);

    // Deactivate, then a fresh login must be rejected.
    expect((await admin.patch(`${USERS}/${created.id}`).send({ isActive: false })).status).toBe(200);
    const blocked = await anon().post("/api/v1/public/auth/login").send({ email: "toggle@pyramid.test", password: PW });
    expect(blocked.status).toBe(401);
    expect(blocked.body.messageKey).toBe("auth.login.invalid");
  });

  it("re-activating a previously deactivated user restores login", async () => {
    const admin = await loginAs("ADMIN");
    const created = (await admin.post(USERS).send({ email: "react@pyramid.test", name: "React", password: PW })).body.data;
    await admin.patch(`${USERS}/${created.id}`).send({ isActive: false });
    expect((await anon().post("/api/v1/public/auth/login").send({ email: "react@pyramid.test", password: PW })).status).toBe(401);
    await admin.patch(`${USERS}/${created.id}`).send({ isActive: true });
    expect((await anon().post("/api/v1/public/auth/login").send({ email: "react@pyramid.test", password: PW })).status).toBe(200);
  });

  it("a role change is enforced on the user's next request (VIEWER→ADMIN can then list users)", async () => {
    const admin = await loginAs("ADMIN");
    const viewer = await loginAs("VIEWER"); // logs in as viewer@pyramid.test
    // VIEWER cannot list users.
    expect((await viewer.get(USERS)).status).toBe(403);
    // Promote the viewer to ADMIN.
    await admin.patch(`${USERS}/${viewer.user.id}`).send({ role: "ADMIN" });
    // A fresh session for the now-ADMIN user can list.
    const promoted = await anon().post("/api/v1/public/auth/login").send({ email: viewer.user.email, password: PW });
    const csrf = (Array.isArray(promoted.headers["set-cookie"]) ? promoted.headers["set-cookie"] : [])
      .map((c) => c.match(/pb_csrf=([^;]+)/))
      .filter(Boolean)[0]?.[1];
    const list = await anon()
      .get(USERS)
      .set("Cookie", promoted.headers["set-cookie"] as unknown as string[])
      .set("x-csrf-token", csrf ?? "");
    expect(list.status).toBe(200);
  });

  it("an updated password authenticates; the old one no longer does", async () => {
    const admin = await loginAs("ADMIN");
    const created = (await admin.post(USERS).send({ email: "pwchange@pyramid.test", name: "PwC", password: PW })).body.data;
    await admin.patch(`${USERS}/${created.id}`).send({ password: "the-new-secret" });
    expect((await anon().post("/api/v1/public/auth/login").send({ email: "pwchange@pyramid.test", password: PW })).status).toBe(401);
    expect((await anon().post("/api/v1/public/auth/login").send({ email: "pwchange@pyramid.test", password: "the-new-secret" })).status).toBe(200);
  });

  it("a mutation without a CSRF token is rejected (403) before reaching the service", async () => {
    const admin = await loginAs("ADMIN");
    // Bypass the Client helper (which auto-attaches CSRF): no x-csrf-token header.
    const res = await admin
      .post(USERS) // Client.post sets the header...
      .set("x-csrf-token", "") // ...so blank it out.
      .send({ email: "csrf@pyramid.test", name: "C", password: PW });
    expect(res.status).toBe(403);
    expect(res.body.messageKey).toBe("auth.csrf_invalid");
    expect(await prisma.user.findUnique({ where: { email: "csrf@pyramid.test" } })).toBeNull();
  });
});

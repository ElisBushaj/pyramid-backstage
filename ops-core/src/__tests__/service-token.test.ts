import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { anon, makeUser, resetDb, prisma } from "./helpers/integration";

// Exercises F17 — AI ↔ ops-core service-token auth + forwarded actor + role ceiling.
// vitest.setup.ts sets OPS_CORE_SERVICE_TOKEN=test-service-token.
const TOKEN = "test-service-token";
const ME = "/api/v1/private/auth/me";
const REQUESTS = "/api/v1/private/requests";
const ADMIN_USERS = "/api/v1/admin/users";

const BODY = {
  title: "AI-created request",
  organizerName: "Copilot",
  expectedAttendees: 50,
  eventType: "CONFERENCE",
  preferredDates: [{ start: "2026-09-01T09:00:00Z", end: "2026-09-01T17:00:00Z" }],
};

type Method = "get" | "post";
function svc(method: Method, url: string, opts: { token?: string; id?: string; role?: string } = {}) {
  let r = anon()[method](url).set("Authorization", `Bearer ${opts.token ?? TOKEN}`);
  if (method === "post") r = r.set("Idempotency-Key", randomUUID());
  if (opts.id !== undefined) r = r.set("X-Acting-User-Id", opts.id);
  if (opts.role !== undefined) r = r.set("X-Acting-User-Role", opts.role);
  return r;
}

beforeEach(resetDb);

describe("service-token auth (F17)", () => {
  it("acts as the forwarded user — CSRF-exempt mutation attributed to the real actor", async () => {
    const ops = await makeUser("OPS", { email: "ops@svc.test" });

    // /me resolves to the forwarded user (no session cookie, no CSRF cookie present).
    const me = await svc("get", ME, { id: ops.id, role: "OPS" });
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe("ops@svc.test");

    // A POST succeeds despite carrying no CSRF cookie (service-token calls are CSRF-exempt).
    const created = await svc("post", REQUESTS, { id: ops.id, role: "OPS" }).send(BODY);
    expect(created.status).toBe(201);

    // Audit is attributed to the forwarded staff user, NOT a null system actor.
    const audit = await prisma.auditEntry.findFirst({ where: { action: "request.create" } });
    expect(audit?.actorId).toBe(ops.id);
    expect(audit?.actorName).toBe(ops.name);
  });

  it("a forwarded role above the MANAGER ceiling is rejected (403) even for an ADMIN user", async () => {
    const admin = await makeUser("ADMIN", { email: "admin@svc.test" });
    const res = await svc("get", REQUESTS, { id: admin.id, role: "ADMIN" });
    expect(res.status).toBe(403);
  });

  it("the ceiling caps an admin acting via the AI — it cannot reach ADMIN-only routes", async () => {
    const admin = await makeUser("ADMIN", { email: "admin2@svc.test" });
    // Forward a legal (≤ ceiling, ≤ real) role; the effective actor is capped at OPS.
    const res = await svc("get", ADMIN_USERS, { id: admin.id, role: "OPS" });
    expect(res.status).toBe(403);
  });

  it("a forwarded role exceeding the user's real role is rejected (403)", async () => {
    const ops = await makeUser("OPS", { email: "ops2@svc.test" });
    const res = await svc("get", REQUESTS, { id: ops.id, role: "MANAGER" });
    expect(res.status).toBe(403);
  });

  it("missing actor headers with a valid token → 401", async () => {
    expect((await svc("get", REQUESTS, {})).status).toBe(401);
    const ops = await makeUser("OPS", { email: "ops3@svc.test" });
    expect((await svc("get", REQUESTS, { id: ops.id })).status).toBe(401); // role missing
  });

  it("an unknown or inactive forwarded user → 401", async () => {
    expect((await svc("get", REQUESTS, { id: randomUUID(), role: "OPS" })).status).toBe(401);
    const off = await makeUser("OPS", { email: "off@svc.test", isActive: false });
    expect((await svc("get", REQUESTS, { id: off.id, role: "OPS" })).status).toBe(401);
  });

  it("a wrong bearer token falls through to the session path → 401 without a cookie", async () => {
    const ops = await makeUser("OPS", { email: "ops4@svc.test" });
    const res = await svc("get", REQUESTS, { token: "not-the-token", id: ops.id, role: "OPS" });
    expect(res.status).toBe(401);
  });
});

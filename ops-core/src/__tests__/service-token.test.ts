import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { anon, makeUser, resetDb, prisma } from "./helpers/integration";
import { seedRequest } from "./helpers/fixtures";

// Exercises F17 — AI ↔ ops-core service-token auth + forwarded actor + role ceiling.
// vitest.setup.ts sets OPS_CORE_SERVICE_TOKEN=test-service-token. The seam lives in
// requireAuth (src/middlewares/auth.middleware.ts): a matching Bearer token makes
// ops-core ACT AS the forwarded staff user; anything else falls through to the cookie.
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
/** Build a service-token request; omit a field by leaving its option undefined. */
function svc(method: Method, url: string, opts: { token?: string | null; id?: string; role?: string; auth?: string } = {}) {
  let r = anon()[method](url);
  if (opts.auth !== undefined) {
    r = r.set("Authorization", opts.auth); // explicit raw header (malformed-scheme cases)
  } else if (opts.token !== null) {
    r = r.set("Authorization", `Bearer ${opts.token ?? TOKEN}`);
  }
  if (method === "post") r = r.set("Idempotency-Key", randomUUID());
  if (opts.id !== undefined) r = r.set("X-Acting-User-Id", opts.id);
  if (opts.role !== undefined) r = r.set("X-Acting-User-Role", opts.role);
  return r;
}

beforeEach(resetDb);

// ─────────────────────────────────────────────────────────────────────────────
// HAPPY PATH — token + valid forwarded actor
// ─────────────────────────────────────────────────────────────────────────────
describe("service-token: forwarded actor (F17)", () => {
  it("resolves /me to the forwarded user — no session cookie required", async () => {
    const ops = await makeUser("OPS", { email: "ops@svc.test" });
    const me = await svc("get", ME, { id: ops.id, role: "OPS" });
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe("ops@svc.test");
    expect(me.body.data.id).toBe(ops.id);
  });

  it("a forwarded role BELOW the user's real role is honored (clamp-down is legal)", async () => {
    // real MANAGER, forwarded as VIEWER — allowed (≤ real, ≤ ceiling); actor role = VIEWER.
    const mgr = await makeUser("MANAGER", { email: "mgr-down@svc.test" });
    const me = await svc("get", ME, { id: mgr.id, role: "VIEWER" });
    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(mgr.id);
  });

  it("a forwarded role EXACTLY at the user's real role passes (OPS=OPS)", async () => {
    const ops = await makeUser("OPS", { email: "ops-eq@svc.test" });
    expect((await svc("get", ME, { id: ops.id, role: "OPS" })).status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSRF EXEMPTION + AUDIT ATTRIBUTION
// ─────────────────────────────────────────────────────────────────────────────
describe("service-token: CSRF-exempt mutation attributed to the forwarded human (F17)", () => {
  it("a POST succeeds with NO CSRF cookie/header, and audit names the forwarded user", async () => {
    const ops = await makeUser("OPS", { email: "writer@svc.test" });
    const created = await svc("post", REQUESTS, { id: ops.id, role: "OPS" }).send(BODY);
    expect(created.status).toBe(201);

    // attribution: the AuditEntry carries the forwarded REAL human, never a null "system" actor
    const audit = await prisma.auditEntry.findFirst({ where: { action: "request.create" } });
    expect(audit?.actorId).toBe(ops.id);
    expect(audit?.actorName).toBe(ops.name);
    expect(audit?.actorId).not.toBeNull(); // distinct from writeSystemAudit(null)
  });

  it("attribution follows the forwarded id even when other users exist", async () => {
    await makeUser("MANAGER", { email: "bystander@svc.test" });
    const actor = await makeUser("OPS", { email: "the-actor@svc.test" });
    const created = await svc("post", REQUESTS, { id: actor.id, role: "OPS" }).send(BODY);
    expect(created.status).toBe(201);
    const audit = await prisma.auditEntry.findFirst({ where: { action: "request.create" } });
    expect(audit?.actorId).toBe(actor.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROLE CEILING — no privilege escalation
// ─────────────────────────────────────────────────────────────────────────────
describe("service-token: forwarded-role ceiling (F17)", () => {
  it("a forwarded ADMIN (above the MANAGER ceiling) is rejected 403 — even for a real ADMIN user", async () => {
    const admin = await makeUser("ADMIN", { email: "admin@svc.test" });
    const res = await svc("get", REQUESTS, { id: admin.id, role: "ADMIN" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("a forwarded role above the user's REAL role is rejected 403 (no self-promotion)", async () => {
    const ops = await makeUser("OPS", { email: "climber@svc.test" });
    const res = await svc("get", REQUESTS, { id: ops.id, role: "MANAGER" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("an ADMIN acting via the AI is capped — a legal (≤ceiling) forward still cannot reach /admin/users", async () => {
    const admin = await makeUser("ADMIN", { email: "admin2@svc.test" });
    // forward a legal role (≤ ceiling, ≤ real); the effective actor never reaches ADMIN-only routes
    const res = await svc("get", ADMIN_USERS, { id: admin.id, role: "OPS" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("forwarding MANAGER (== ceiling) for a real MANAGER is accepted at the seam", async () => {
    const mgr = await makeUser("MANAGER", { email: "ceiling@svc.test" });
    expect((await svc("get", ME, { id: mgr.id, role: "MANAGER" })).status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DOWNSTREAM requireRole STILL APPLIES on top of the forwarded actor
// ─────────────────────────────────────────────────────────────────────────────
describe("service-token: downstream requireRole runs on the forwarded actor (F17)", () => {
  it("a forwarded OPS gets 403 on a MANAGER+ approve, exactly as that user would", async () => {
    const ops = await makeUser("OPS", { email: "ops-approve@svc.test" });
    const reqRow = await seedRequest({ status: "PROPOSED" });
    const res = await svc("post", `${REQUESTS}/${reqRow.id}/approve`, { id: ops.id, role: "OPS" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("a forwarded MANAGER clears the MANAGER+ gate and performs the approve (200)", async () => {
    const mgr = await makeUser("MANAGER", { email: "mgr-approve@svc.test" });
    const reqRow = await seedRequest({ status: "PROPOSED" });
    const res = await svc("post", `${REQUESTS}/${reqRow.id}/approve`, { id: mgr.id, role: "MANAGER" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("SCHEDULED");
    // and the approval is audited to the forwarded manager
    const audit = await prisma.auditEntry.findFirst({ where: { action: "request.approve" } });
    expect(audit?.actorId).toBe(mgr.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MISSING / INVALID FORWARDED-IDENTITY HEADERS — never a silent system actor
// ─────────────────────────────────────────────────────────────────────────────
describe("service-token: identity-header validation (F17)", () => {
  it("valid token but NO acting-user headers → 401 (the seam demands an identity)", async () => {
    const res = await svc("get", REQUESTS, {});
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("valid token + id but MISSING role → 401", async () => {
    const ops = await makeUser("OPS", { email: "norole@svc.test" });
    expect((await svc("get", REQUESTS, { id: ops.id })).status).toBe(401);
  });

  it("valid token + role but MISSING id → 401", async () => {
    expect((await svc("get", REQUESTS, { role: "OPS" })).status).toBe(401);
  });

  it("a forwarded role that is not a real role value → 401 (rejected before any lookup)", async () => {
    const ops = await makeUser("OPS", { email: "badrole@svc.test" });
    expect((await svc("get", REQUESTS, { id: ops.id, role: "SUPERADMIN" })).status).toBe(401);
    expect((await svc("get", REQUESTS, { id: ops.id, role: "garbage" })).status).toBe(401);
    expect((await svc("get", REQUESTS, { id: ops.id, role: "" })).status).toBe(401);
  });

  it("an UNKNOWN forwarded user id → 401 (never a silent system actor, never 500)", async () => {
    const res = await svc("get", REQUESTS, { id: randomUUID(), role: "OPS" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("an INACTIVE forwarded user → 401", async () => {
    const off = await makeUser("OPS", { email: "off@svc.test", isActive: false });
    expect((await svc("get", REQUESTS, { id: off.id, role: "OPS" })).status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN MATCHING — anything but an exact match falls through to the cookie path
// ─────────────────────────────────────────────────────────────────────────────
describe("service-token: token matching falls through to the session path (F17)", () => {
  it("a wrong bearer token + valid headers → falls to session → 401 (never acts as the user)", async () => {
    const ops = await makeUser("OPS", { email: "wrongtok@svc.test" });
    const res = await svc("get", REQUESTS, { token: "not-the-token", id: ops.id, role: "OPS" });
    expect(res.status).toBe(401);
    // proves the branch did NOT resolve a service actor — no resource served
    expect(res.body.error).toBe("unauthorized");
  });

  it("no Authorization header at all → pure session path → 401", async () => {
    const ops = await makeUser("OPS", { email: "noauth@svc.test" });
    const res = await svc("get", REQUESTS, { token: null, id: ops.id, role: "OPS" });
    expect(res.status).toBe(401);
  });

  it("a non-Bearer scheme (Basic ...) → not the token → session path → 401", async () => {
    const ops = await makeUser("OPS", { email: "basic@svc.test" });
    const res = await svc("get", REQUESTS, { auth: "Basic dXNlcjpwYXNz", id: ops.id, role: "OPS" });
    expect(res.status).toBe(401);
  });

  it("a token that is a PREFIX of the real token → length mismatch, rejected (timing-safe compare)", async () => {
    const ops = await makeUser("OPS", { email: "prefix@svc.test" });
    const res = await svc("get", REQUESTS, { token: TOKEN.slice(0, -1), id: ops.id, role: "OPS" });
    expect(res.status).toBe(401); // safeEqual returns false on unequal length, never throws
  });

  it("a token with trailing junk (longer) → length mismatch, rejected", async () => {
    const ops = await makeUser("OPS", { email: "suffix@svc.test" });
    const res = await svc("get", REQUESTS, { token: `${TOKEN}x`, id: ops.id, role: "OPS" });
    expect(res.status).toBe(401);
  });
});

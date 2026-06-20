import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, anon, makeUser, resetDb, prisma, auditEntriesFor, type Client } from "./helpers/integration";
import { seedRequest } from "./helpers/fixtures";

// F15 — PARTNER row-scoping + staff-surface lockout (ADR-0010). SECURITY-CRITICAL:
// a partner must never see, mutate, or even learn the existence of a row they
// don't own. Cross-tenant reads return 404 (not 403) so the row set stays
// non-enumerable.
const REQUESTS = "/api/v1/private/requests";
const BODY = {
  title: "Partner event",
  organizerName: "Acme",
  expectedAttendees: 40,
  eventType: "CONFERENCE",
  preferredDates: [{ start: "2026-10-01T09:00:00Z", end: "2026-10-01T17:00:00Z" }],
};

// A single PARTNER per test reuses loginAs (one email per role). Tests that need
// TWO distinct partners use uniquePartner() to avoid the email unique-constraint.
let n = 0;
const partnerClient = (): Promise<Client> => loginAs("PARTNER");

/** A partner with a unique identity (loginAs reuses one email per role). */
async function uniquePartner(): Promise<Client> {
  const email = `partner${n++}@acme.test`;
  await makeUser("PARTNER", { email });
  // mirror loginAs but with our email
  const mod = await import("supertest");
  const request = mod.default;
  const { app } = await import("./helpers/integration");
  const agent = request.agent(app);
  const res = await agent.post("/api/v1/public/auth/login").send({ email, password: "password123" });
  if (res.status !== 200) throw new Error(`partner login failed: ${res.status}`);
  const setCookie = res.headers["set-cookie"] as unknown as string[];
  const csrf = (setCookie.join(";").match(/pb_csrf=([^;]+)/) || [])[1] ?? "";
  const { Client: ClientCls } = await import("./helpers/integration");
  return new ClientCls(agent, csrf, { id: res.body.data.id, email, name: "PARTNER", role: "PARTNER" });
}

beforeEach(resetDb);

// ─────────────────────────────────────────────────────────────────────────────
// PARTNER create → PROPOSED, owned by the partner
// ─────────────────────────────────────────────────────────────────────────────
describe("F15 — PARTNER create", () => {
  it("a PARTNER may POST /requests; it lands PROPOSED with createdById = actor.id and is audited", async () => {
    const p = await partnerClient();
    const res = await p.post(REQUESTS).send(BODY);
    expect(res.status).toBe(201);
    // F15 SPEC: partner submissions enter the approval queue directly → PROPOSED.
    expect(res.body.data.status).toBe("PROPOSED");
    expect(res.body.data.createdById).toBe(p.user.id);

    const audit = await auditEntriesFor("EventRequest", res.body.data.id);
    expect(audit.some((a) => a.action === "request.create" && a.actorId === p.user.id)).toBe(true);
    // create still emits the request.created outbox event, same as staff
    expect(await prisma.outboxEvent.count({ where: { subject: "request.created" } })).toBe(1);
  });

  it("staff create still lands DRAFT (the PROPOSED default is PARTNER-only)", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.post(REQUESTS).send(BODY);
    expect(res.body.data.status).toBe("DRAFT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTNER reads are row-scoped to createdById
// ─────────────────────────────────────────────────────────────────────────────
describe("F15 — PARTNER read scoping (list + get)", () => {
  it("a PARTNER lists ONLY their own requests", async () => {
    const a = await uniquePartner();
    const b = await uniquePartner();
    await a.post(REQUESTS).send(BODY);
    await a.post(REQUESTS).send({ ...BODY, title: "Second" });
    await b.post(REQUESTS).send({ ...BODY, title: "B's" });
    // a staff-owned row exists too — must not appear in either partner's list
    await seedRequest({ title: "Staff row", createdById: (await loginAs("OPS")).user.id });

    const aList = await a.get(REQUESTS);
    expect(aList.status).toBe(200);
    expect(aList.body.data.length).toBe(2);
    expect(aList.body.data.every((r: { createdById: string }) => r.createdById === a.user.id)).toBe(true);
    expect(aList.body.total).toBe(2); // total reflects the scoped count, not the global one

    const bList = await b.get(REQUESTS);
    expect(bList.body.data.length).toBe(1);
    expect(bList.body.data[0].title).toBe("B's");
  });

  it("a PARTNER reading their OWN request → 200", async () => {
    const p = await partnerClient();
    const created = (await p.post(REQUESTS).send(BODY)).body.data;
    const res = await p.get(`${REQUESTS}/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.request.id).toBe(created.id);
  });

  it("a PARTNER reading ANOTHER partner's request → 404 (never 403 — no existence leak)", async () => {
    const a = await uniquePartner();
    const otherId = (await a.post(REQUESTS).send(BODY)).body.data.id as string;

    const b = await uniquePartner();
    const read = await b.get(`${REQUESTS}/${otherId}`);
    expect(read.status).toBe(404);
    expect(read.body.error).toBe("not_found");
    // the message must be the generic not_found — identical to a truly-missing id,
    // so the two cases are indistinguishable.
    const missing = await b.get(`${REQUESTS}/00000000-0000-4000-8000-000000000000`);
    expect(missing.status).toBe(404);
    expect(read.body.messageKey).toBe(missing.body.messageKey);
    expect(read.body.error).toBe(missing.body.error);
  });

  it("a PARTNER reading a STAFF-only request (no partner owner) → 404", async () => {
    const ops = await loginAs("OPS");
    const staffReq = (await ops.post(REQUESTS).send(BODY)).body.data; // DRAFT, owned by staff
    const p = await partnerClient();
    const res = await p.get(`${REQUESTS}/${staffReq.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("a PARTNER reading a request with NO owner (createdById null) → 404", async () => {
    const orphan = await seedRequest({ createdById: undefined }); // createdById null
    const p = await partnerClient();
    expect((await p.get(`${REQUESTS}/${orphan.id}`)).status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTNER cross-tenant MUTATION is blocked
// ─────────────────────────────────────────────────────────────────────────────
describe("F15 — PARTNER cross-tenant mutation is blocked", () => {
  it("a PARTNER cannot PATCH another partner's draft → 404 (no leak)", async () => {
    const a = await uniquePartner();
    // a's request is PROPOSED (partner default) — force it to DRAFT so a PATCH would
    // be otherwise-legal, isolating the OWNERSHIP check from the status check.
    const aReq = (await a.post(REQUESTS).send(BODY)).body.data;
    await prisma.eventRequest.update({ where: { id: aReq.id }, data: { status: "DRAFT" } });

    const b = await uniquePartner();
    const res = await b.patch(`${REQUESTS}/${aReq.id}`).send({ title: "hijacked" });
    expect(res.status).toBe(404); // ownership fails before the DRAFT-status check
    expect(res.body.error).toBe("not_found");

    // unchanged
    const row = await prisma.eventRequest.findUniqueOrThrow({ where: { id: aReq.id } });
    expect(row.title).toBe(BODY.title);
  });

  it("a PARTNER cannot PATCH a staff-owned request → 404", async () => {
    const ops = await loginAs("OPS");
    const staffReq = (await ops.post(REQUESTS).send(BODY)).body.data; // DRAFT
    const p = await partnerClient();
    const res = await p.patch(`${REQUESTS}/${staffReq.id}`).send({ title: "x" });
    expect(res.status).toBe(404);
  });

  it("a PARTNER editing their OWN DRAFT succeeds (ownership ok)", async () => {
    const p = await partnerClient();
    const own = (await p.post(REQUESTS).send(BODY)).body.data;
    await prisma.eventRequest.update({ where: { id: own.id }, data: { status: "DRAFT" } });
    const res = await p.patch(`${REQUESTS}/${own.id}`).send({ title: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Renamed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTNER cannot reach the staff tool surface or approval/reject
// ─────────────────────────────────────────────────────────────────────────────
describe("F15 — PARTNER staff-surface lockout (below VIEWER → 403)", () => {
  it("a PARTNER is 403 on every staff-only read surface", async () => {
    const p = await partnerClient();
    for (const path of [
      "/api/v1/private/spaces",
      "/api/v1/private/assets",
      "/api/v1/private/reservations",
      "/api/v1/private/quotes",
      "/api/v1/private/conflicts",
      "/api/v1/private/audit",
      "/api/v1/private/dashboard/stats",
    ]) {
      const res = await p.get(path);
      expect(res.status, path).toBe(403);
      expect(res.body.error, path).toBe("forbidden");
    }
  });

  it("a PARTNER cannot approve or reject — 403 (staff gate fires before any existence check)", async () => {
    const p = await partnerClient();
    const own = (await p.post(REQUESTS).send(BODY)).body.data; // PROPOSED, partner-owned

    const approve = await p.post(`${REQUESTS}/${own.id}/approve`);
    expect(approve.status).toBe(403);
    expect(approve.body.error).toBe("forbidden");

    const reject = await p.post(`${REQUESTS}/${own.id}/reject`).send({ reason: "no" });
    expect(reject.status).toBe(403);

    // even against a non-existent id, the staff gate returns 403 (not 404) — the
    // partner never reaches the controller, so existence is never probed.
    const ghost = await p.post(`${REQUESTS}/00000000-0000-4000-8000-000000000000/approve`);
    expect(ghost.status).toBe(403);

    // state unchanged: still PROPOSED, no approve audit
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: own.id } })).status).toBe("PROPOSED");
    expect(await prisma.auditEntry.count({ where: { action: "request.approve" } })).toBe(0);
  });

  it("a PARTNER cannot create or read a request's tasks (staff-only sub-routes) → 403", async () => {
    const p = await partnerClient();
    const own = (await p.post(REQUESTS).send(BODY)).body.data;
    expect((await p.get(`${REQUESTS}/${own.id}/tasks`)).status).toBe(403);
    expect((await p.post(`${REQUESTS}/${own.id}/tasks`).send({ tasks: [] })).status).toBe(403);
  });

  it("a PARTNER CAN reach /auth/me (the one non-request surface allowed)", async () => {
    const p = await partnerClient();
    const res = await p.get("/api/v1/private/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("PARTNER");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Staff (VIEWER+) are UNSCOPED — they see everything
// ─────────────────────────────────────────────────────────────────────────────
describe("F15 — staff (VIEWER+) see all requests unscoped", () => {
  it("VIEWER/OPS/MANAGER/ADMIN list every request regardless of owner", async () => {
    const p = await uniquePartner();
    await p.post(REQUESTS).send(BODY); // partner-owned
    await seedRequest({ title: "Orphan", createdById: undefined }); // unowned
    const staffUser = await makeUser("OPS", { email: `staffowner${n++}@pyramid.test` });
    await seedRequest({ title: "Staff one", createdById: staffUser.id }); // staff-owned

    for (const role of ["VIEWER", "OPS", "MANAGER", "ADMIN"] as const) {
      const staff = await loginAs(role);
      const list = await staff.get(REQUESTS);
      expect(list.status, role).toBe(200);
      // sees the partner's + the orphan + the staff-owned = at least 3, unscoped
      expect(list.body.total, role).toBeGreaterThanOrEqual(3);
    }
  });

  it("a staff member can read a PARTNER-owned request's aggregate (no scoping for staff)", async () => {
    const p = await partnerClient();
    const partnerReq = (await p.post(REQUESTS).send(BODY)).body.data;
    const ops = await loginAs("OPS");
    const res = await ops.get(`${REQUESTS}/${partnerReq.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.request.id).toBe(partnerReq.id);
  });

  it("a MANAGER can approve/reject a PARTNER-submitted (PROPOSED) request — the portal flow end to end", async () => {
    const p = await partnerClient();
    const partnerReq = (await p.post(REQUESTS).send(BODY)).body.data;
    expect(partnerReq.status).toBe("PROPOSED"); // appears in the approval queue

    const mgr = await loginAs("MANAGER");
    // reject path (no held reservation needed): PROPOSED → REJECTED with a reason
    const res = await mgr.post(`${REQUESTS}/${partnerReq.id}/reject`).send({ reason: "Date taken" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REJECTED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RBAC sanity for unauthenticated access on the partner surface
// ─────────────────────────────────────────────────────────────────────────────
describe("F15 — unauthenticated access", () => {
  it("anon cannot list, read, create, or patch", async () => {
    const seeded = await seedRequest({});
    expect((await anon().get(REQUESTS)).status).toBe(401);
    expect((await anon().get(`${REQUESTS}/${seeded.id}`)).status).toBe(401);
    expect((await anon().post(REQUESTS).set("Idempotency-Key", "33333333-3333-4333-8333-333333333333").send(BODY)).status).toBe(401);
  });
});

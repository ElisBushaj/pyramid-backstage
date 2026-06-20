import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, makeUser, resetDb } from "./helpers/integration";
import request from "supertest";
import { app } from "./helpers/integration";

// F15 — PARTNER row-scoping + staff-surface lockout (ADR-0010).
const REQUESTS = "/api/v1/private/requests";
const BODY = {
  title: "Partner event",
  organizerName: "Acme",
  expectedAttendees: 40,
  eventType: "CONFERENCE",
  preferredDates: [{ start: "2026-10-01T09:00:00Z", end: "2026-10-01T17:00:00Z" }],
};

async function loginPartner(email: string) {
  await makeUser("PARTNER", { email });
  const agent = request.agent(app);
  const res = await agent.post("/api/v1/public/auth/login").send({ email, password: "password123" });
  if (res.status !== 200) throw new Error(`partner login failed: ${res.status}`);
  const setCookie = res.headers["set-cookie"] as unknown as string[]
  const csrf = (setCookie.join(";").match(/pb_csrf=([^;]+)/) || [])[1] ?? ""
  return { agent, csrf, id: res.body.data.id as string }
}

beforeEach(resetDb);

describe("partner portal scoping (F15)", () => {
  it("a PARTNER can create a request and read only their own", async () => {
    const p = await loginPartner("p1@acme.al");
    const created = await p.agent.post(REQUESTS).set("x-csrf-token", p.csrf).set("Idempotency-Key", crypto.randomUUID()).send(BODY);
    expect(created.status).toBe(201);
    expect(created.body.data.createdById).toBe(p.id);

    const list = await p.agent.get(REQUESTS).set("x-csrf-token", p.csrf);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);
    expect(list.body.data.every((r: { createdById: string }) => r.createdById === p.id)).toBe(true);
  });

  it("a PARTNER cannot see another partner's requests (list is scoped; get is 404)", async () => {
    const a = await loginPartner("a@acme.al");
    const created = await a.agent.post(REQUESTS).set("x-csrf-token", a.csrf).set("Idempotency-Key", crypto.randomUUID()).send(BODY);
    const otherId = created.body.data.id as string;

    const b = await loginPartner("b@acme.al");
    const list = await b.agent.get(REQUESTS).set("x-csrf-token", b.csrf);
    expect(list.body.data.length).toBe(0); // b sees none of a's
    const read = await b.agent.get(`${REQUESTS}/${otherId}`).set("x-csrf-token", b.csrf);
    expect(read.status).toBe(404); // not 403 — no existence leak
  });

  it("staff (VIEWER+) see all requests; a PARTNER is locked out of the staff surface", async () => {
    const p = await loginPartner("p2@acme.al");
    await p.agent.post(REQUESTS).set("x-csrf-token", p.csrf).set("Idempotency-Key", crypto.randomUUID()).send(BODY);

    const viewer = await loginAs("VIEWER");
    expect((await viewer.get(REQUESTS)).body.data.length).toBeGreaterThanOrEqual(1); // sees the partner's

    // PARTNER (rank −1) is below VIEWER → 403 on the staff tool surface.
    expect((await p.agent.get("/api/v1/private/spaces").set("x-csrf-token", p.csrf)).status).toBe(403);
    expect((await p.agent.get("/api/v1/private/assets").set("x-csrf-token", p.csrf)).status).toBe(403);
    expect((await p.agent.get("/api/v1/private/audit").set("x-csrf-token", p.csrf)).status).toBe(403);
    expect((await p.agent.get("/api/v1/private/dashboard/stats").set("x-csrf-token", p.csrf)).status).toBe(403);
  });
});

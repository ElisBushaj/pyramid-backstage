import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { app, anon, loginAs, makeUser, resetDb, prisma } from "./helpers/integration";
import { loginRateLimiter } from "../middlewares/rate-limit.middleware";

const LOGIN = "/api/v1/public/auth/login";
const ME = "/api/v1/private/auth/me";

beforeEach(resetDb);

describe("auth: login → me → logout (F01-T03/T04/T08)", () => {
  it("logs in, sets pb_session, and /me returns the user", async () => {
    await makeUser("OPS", { email: "ops@pyramid.test" });
    const agent = request.agent(app);
    const login = await agent.post(LOGIN).send({ email: "ops@pyramid.test", password: "password123" });
    expect(login.status).toBe(200);
    expect(login.body.data.email).toBe("ops@pyramid.test");
    const cookies = (login.headers["set-cookie"] as unknown as string[]).join(";");
    expect(cookies).toContain("pb_session=");
    expect(cookies).toContain("HttpOnly");

    const me = await agent.get(ME);
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe("OPS");
  });

  it("rejects a wrong password with 401 and no user enumeration", async () => {
    await makeUser("OPS", { email: "real@pyramid.test" });
    const wrongPw = await anon().post(LOGIN).send({ email: "real@pyramid.test", password: "wrongpassword" });
    const unknown = await anon().post(LOGIN).send({ email: "nobody@pyramid.test", password: "whatever12" });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    // same messageKey + shape regardless of which factor failed
    expect(wrongPw.body.messageKey).toBe("auth.login.invalid");
    expect(unknown.body.messageKey).toBe("auth.login.invalid");
  });

  it("logout destroys the session (me → 401 afterward)", async () => {
    const client = await loginAs("OPS");
    expect((await client.get(ME)).status).toBe(200);
    expect((await client.post("/api/v1/private/auth/logout")).status).toBe(200);
    expect((await client.get(ME)).status).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it("unauthenticated /me is 401", async () => {
    expect((await anon().get(ME)).status).toBe(401);
  });
});

describe("auth: session expiry (F01-T04)", () => {
  it("an expired session is rejected as 401 and reaped on read", async () => {
    const client = await loginAs("VIEWER");
    // expire the only session
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const me = await client.get(ME);
    expect(me.status).toBe(401);
    expect(await prisma.session.count()).toBe(0); // reaped on read
  });
});

describe("auth: role gates + CSRF (F01-T05/T06)", () => {
  it("VIEWER is 403 on an OPS+ mutation; OPS succeeds", async () => {
    const viewer = await loginAs("VIEWER");
    const space = { name: "X", floor: 0, capacities: { THEATER: 10 }, dayRateMinor: 100 };
    expect((await viewer.post("/api/v1/private/spaces").send(space)).status).toBe(403);

    await resetDb();
    const ops = await loginAs("OPS");
    expect((await ops.post("/api/v1/private/spaces").send(space)).status).toBe(201);
  });

  it("a mutation without a CSRF header is rejected (403 csrf)", async () => {
    const client = await loginAs("OPS");
    // bypass Client (which sets the header) — go through the raw agent
    const res = await (client as any).agent
      .post("/api/v1/private/spaces")
      .set("Idempotency-Key", "11111111-1111-4111-8111-111111111111")
      .send({ name: "Y", floor: 0, capacities: { THEATER: 10 }, dayRateMinor: 100 });
    expect(res.status).toBe(403);
    expect(res.body.messageKey).toBe("auth.csrf_invalid");
  });
});

describe("auth: login rate limit (F01-T06)", () => {
  it("returns 429 once the per-identifier threshold is exceeded", async () => {
    const tiny = express();
    tiny.use(express.json());
    tiny.post("/login", loginRateLimiter(2), (_req, res) => res.json({ ok: true }));
    tiny.use((err: any, _req: any, res: any, _next: any) => res.status(err.status ?? 500).json({ error: err.error }));

    const a = request(tiny);
    const body = { email: "x@y.z" };
    expect((await a.post("/login").send(body)).status).toBe(200);
    expect((await a.post("/login").send(body)).status).toBe(200);
    const third = await a.post("/login").send(body);
    expect(third.status).toBe(429);
    expect(third.body.error).toBe("rate_limited");
  });
});

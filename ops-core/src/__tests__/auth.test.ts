import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { app, anon, loginAs, makeUser, resetDb, prisma } from "./helpers/integration";
import { loginRateLimiter } from "../middlewares/rate-limit.middleware";

// The app signs cookies with vars.sessionSecret ("test-secret" in test). To forge a
// *validly-signed* session cookie (to prove a good signature over an unknown token is
// still rejected), we reproduce cookie-parser's signing — HMAC-SHA256, base64, no pad,
// in the "s:<value>.<sig>" format — with the same secret.
const SESSION_SECRET = "test-secret";
function signCookie(value: string): string {
  const sig = createHmac("sha256", SESSION_SECRET).update(value).digest("base64").replace(/=+$/, "");
  return `${value}.${sig}`;
}
const signedSession = (token: string) => `pb_session=s:${encodeURIComponent(signCookie(token))}`;

const LOGIN = "/api/v1/public/auth/login";
const LOGOUT = "/api/v1/private/auth/logout";
const ME = "/api/v1/private/auth/me";
const SPACES = "/api/v1/private/spaces";
const PW = "password123";

const SPACE = { name: "X", floor: 0, kind: "MAIN", capacities: { THEATER: 10 }, dayRateMinor: 100 };

/** Pull a single cookie's value out of a Set-Cookie header array. */
function cookie(setCookie: unknown, name: string): string {
  const arr = (Array.isArray(setCookie) ? setCookie : [setCookie]) as string[];
  for (const c of arr) {
    const m = c?.match(new RegExp(`${name}=([^;]+)`));
    if (m) return decodeURIComponent(m[1]!);
  }
  return "";
}
/** The raw Set-Cookie entry (with attributes) for a named cookie. */
function cookieRaw(setCookie: unknown, name: string): string {
  const arr = (Array.isArray(setCookie) ? setCookie : [setCookie]) as string[];
  return arr.find((c) => c?.startsWith(`${name}=`)) ?? "";
}

/** Log in an already-seeded user; returns the cookie-bearing agent + its CSRF token. */
async function loginAgent(email: string): Promise<{ agent: ReturnType<typeof request.agent>; csrf: string }> {
  const agent = request.agent(app);
  const res = await agent.post(LOGIN).send({ email, password: PW });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return { agent, csrf: cookie(res.headers["set-cookie"], "pb_csrf") };
}

beforeEach(resetDb);

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────
describe("auth login (F01-T03)", () => {
  it("correct creds → 200, UserEnvelope, httpOnly signed pb_session + readable pb_csrf", async () => {
    const u = await makeUser("OPS", { email: "ops@pyramid.test" });
    const res = await anon().post(LOGIN).send({ email: "ops@pyramid.test", password: PW });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("ops@pyramid.test");
    expect(res.body.data.id).toBe(u.id);
    expect(res.body.data.role).toBe("OPS");
    // password material never leaves the boundary
    expect(res.body.data.passwordHash).toBeUndefined();

    const setCookie = res.headers["set-cookie"];
    const sessionRaw = cookieRaw(setCookie, "pb_session");
    const csrfRaw = cookieRaw(setCookie, "pb_csrf");
    expect(sessionRaw).toMatch(/HttpOnly/i); // session cookie is httpOnly
    expect(sessionRaw).toMatch(/SameSite=Lax/i);
    expect(csrfRaw).not.toMatch(/HttpOnly/i); // CSRF cookie must be readable by the SPA
    expect(cookie(setCookie, "pb_csrf").length).toBeGreaterThan(0);

    // a real server-side Session row was opened (the cookie is opaque; only its hash persists)
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(1);
  });

  it("login is case-insensitive on email (stored lowercase, mixed-case login works)", async () => {
    await makeUser("VIEWER", { email: "casey@pyramid.test" });
    const res = await anon().post(LOGIN).send({ email: "CASEY@Pyramid.TEST", password: PW });
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("casey@pyramid.test");
  });

  it("wrong password → 401 unauthorized (never 500), canonical body", async () => {
    await makeUser("OPS", { email: "real@pyramid.test" });
    const res = await anon().post(LOGIN).send({ email: "real@pyramid.test", password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
    expect(res.body.messageKey).toBe("auth.login.invalid");
    expect(await prisma.session.count()).toBe(0); // no session minted on failure
  });

  it("unknown email → 401 with NO user-enumeration (identical body to wrong password)", async () => {
    await makeUser("OPS", { email: "real@pyramid.test" });
    const wrongPw = await anon().post(LOGIN).send({ email: "real@pyramid.test", password: "wrongpassword" });
    const unknown = await anon().post(LOGIN).send({ email: "nobody@pyramid.test", password: "whatever12" });
    expect(unknown.status).toBe(401);
    // status, machine code AND messageKey are indistinguishable → the dummy-hash path masks which factor failed
    expect(unknown.status).toBe(wrongPw.status);
    expect(unknown.body.error).toBe(wrongPw.body.error);
    expect(unknown.body.messageKey).toBe(wrongPw.body.messageKey);
  });

  it("inactive user with correct password cannot log in → 401, no session", async () => {
    await makeUser("OPS", { email: "off@pyramid.test", isActive: false });
    const res = await anon().post(LOGIN).send({ email: "off@pyramid.test", password: PW });
    expect(res.status).toBe(401);
    expect(res.body.messageKey).toBe("auth.login.invalid");
    expect(await prisma.session.count()).toBe(0);
  });

  it("missing fields → 422 validation (not 401, not 500)", async () => {
    const noEmail = await anon().post(LOGIN).send({ password: PW });
    const noPw = await anon().post(LOGIN).send({ email: "x@pyramid.test" });
    const empty = await anon().post(LOGIN).send({});
    for (const r of [noEmail, noPw, empty]) {
      expect(r.status).toBe(422);
      expect(r.body.error).toBe("validation");
      expect(r.body.messageKey).toBe("validation.failed");
      expect(r.body.fields).toBeTruthy();
    }
    expect(noEmail.body.fields.email).toBeTruthy();
    expect(noPw.body.fields.password).toBeTruthy();
  });

  it("malformed email / short password → 422 with field-keyed messageKeys", async () => {
    const badEmail = await anon().post(LOGIN).send({ email: "not-an-email", password: PW });
    expect(badEmail.status).toBe(422);
    expect(badEmail.body.fields.email).toBe("validation.email");

    const shortPw = await anon().post(LOGIN).send({ email: "x@pyramid.test", password: "short" });
    expect(shortPw.status).toBe(422);
    expect(shortPw.body.fields.password).toBe("validation.length");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SESSION / ME / LOGOUT
// ─────────────────────────────────────────────────────────────────────────────
describe("auth session — me / logout / expiry (F01-T04/T08)", () => {
  it("authenticated me() returns the actor", async () => {
    const client = await loginAs("MANAGER");
    const me = await client.get(ME);
    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(client.user.id);
    expect(me.body.data.role).toBe("MANAGER");
  });

  it("missing session → 401 unauthorized", async () => {
    const res = await anon().get(ME);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
    expect(res.body.messageKey).toBe("common.unauthorized");
  });

  it("an unsigned session cookie → 401 (cookie-parser ignores it; resolves to no token)", async () => {
    // A syntactically-plausible but unsigned token. Unsigned cookies never land in
    // signedCookies, so this resolves to no actor → 401.
    const res = await anon().get(ME).set("Cookie", `pb_session=${"a".repeat(64)}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("a validly-SIGNED cookie over an unknown token → 401 (a good signature is not a valid session)", async () => {
    // The signature verifies (same secret) so signedCookies yields the token — but no
    // Session row hashes to it, so resolveActor returns null → 401. A forged-but-signed
    // cookie must never authenticate.
    const res = await anon().get(ME).set("Cookie", signedSession("unknown-token-" + "f".repeat(40)));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
    expect(await prisma.session.count()).toBe(0);
  });

  it("expired session → 401 and is reaped on read (check-on-read)", async () => {
    const client = await loginAs("VIEWER");
    expect((await client.get(ME)).status).toBe(200);
    expect(await prisma.session.count()).toBe(1);

    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const me = await client.get(ME);
    expect(me.status).toBe(401);
    expect(me.body.error).toBe("unauthorized");
    expect(await prisma.session.count()).toBe(0); // reaped so it can never be replayed
  });

  it("a session whose user was deactivated after login → 401 (not served stale)", async () => {
    const client = await loginAs("OPS");
    await prisma.user.update({ where: { id: client.user.id }, data: { isActive: false } });
    const me = await client.get(ME);
    expect(me.status).toBe(401);
  });

  it("logout destroys the session; subsequent me() → 401; logout is idempotent", async () => {
    const client = await loginAs("OPS");
    expect((await client.get(ME)).status).toBe(200);

    const out = await client.post(LOGOUT);
    expect(out.status).toBe(200);
    expect(await prisma.session.count()).toBe(0);

    expect((await client.get(ME)).status).toBe(401);
    // logging out again (no live session) does not error — 401 from requireAuth, never a 500
    expect((await client.post(LOGOUT)).status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSRF
// ─────────────────────────────────────────────────────────────────────────────
describe("auth CSRF guard (F01-T06)", () => {
  it("a mutation with no CSRF header → 403 forbidden auth.csrf_invalid", async () => {
    const client = await loginAs("OPS");
    const res = await (client as unknown as { agent: ReturnType<typeof request.agent> }).agent
      .post(SPACES)
      .set("Idempotency-Key", randomUUID())
      .send(SPACE);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
    expect(res.body.messageKey).toBe("auth.csrf_invalid");
  });

  it("a mutation with a mismatched CSRF header → 403 (double-submit must agree)", async () => {
    const client = await loginAs("OPS");
    const res = await (client as unknown as { agent: ReturnType<typeof request.agent> }).agent
      .post(SPACES)
      .set("x-csrf-token", "not-the-cookie-value")
      .set("Idempotency-Key", randomUUID())
      .send(SPACE);
    expect(res.status).toBe(403);
    expect(res.body.messageKey).toBe("auth.csrf_invalid");
  });

  it("a matching CSRF header (cookie === header) passes the guard", async () => {
    const client = await loginAs("OPS"); // Client auto-attaches the correct csrf header
    const res = await client.post(SPACES).send(SPACE);
    expect(res.status).toBe(201);
  });

  it("CSRF is enforced before role — a VIEWER without CSRF is 403 on the csrf key, not the role", async () => {
    const client = await loginAs("VIEWER");
    const res = await (client as unknown as { agent: ReturnType<typeof request.agent> }).agent
      .post(SPACES)
      .set("Idempotency-Key", randomUUID())
      .send(SPACE);
    expect(res.status).toBe(403);
    expect(res.body.messageKey).toBe("auth.csrf_invalid");
  });

  it("safe methods (GET) need no CSRF token", async () => {
    const client = await loginAs("VIEWER");
    const res = await (client as unknown as { agent: ReturnType<typeof request.agent> }).agent.get(ME);
    expect(res.status).toBe(200);
  });

  it("CSRF without a session is still 401 (auth runs before csrf on the tier)", async () => {
    const res = await anon().post(SPACES).set("x-csrf-token", "anything").set("Idempotency-Key", randomUUID()).send(SPACE);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROLE GATES (integration — real cookie + real routes)
// ─────────────────────────────────────────────────────────────────────────────
describe("auth role gates — 401 vs 403 (F01-T05)", () => {
  it("unauthenticated write → 401; authenticated-but-too-low → 403 (strictly distinct)", async () => {
    const anonWrite = await anon().post(SPACES).set("x-csrf-token", "x").set("Idempotency-Key", randomUUID()).send(SPACE);
    expect(anonWrite.status).toBe(401);

    const viewer = await loginAs("VIEWER");
    const lowWrite = await viewer.post(SPACES).send(SPACE);
    expect(lowWrite.status).toBe(403);
    expect(lowWrite.body.error).toBe("forbidden");
  });

  it("OPS+ write surface: VIEWER 403, OPS 201", async () => {
    const viewer = await loginAs("VIEWER");
    expect((await viewer.post(SPACES).send(SPACE)).status).toBe(403);
    await resetDb();
    const ops = await loginAs("OPS");
    expect((await ops.post(SPACES).send(SPACE)).status).toBe(201);
  });

  it("ADMIN admin surface: a MANAGER is 403 on /admin/users, ADMIN passes", async () => {
    const manager = await loginAs("MANAGER");
    expect((await manager.get("/api/v1/admin/users")).status).toBe(403);
    await resetDb();
    const admin = await loginAs("ADMIN");
    expect((await admin.get("/api/v1/admin/users")).status).toBe(200);
  });

  it("PARTNER is below VIEWER → 403 on the staff tool surface (ADR-0010)", async () => {
    const partner = await loginAs("PARTNER");
    const res = await partner.get(SPACES);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN RATE LIMIT
// ─────────────────────────────────────────────────────────────────────────────
describe("auth login rate-limit (F01-T06)", () => {
  it("over the per-identifier threshold → 429 rate_limited", async () => {
    const tiny = express();
    tiny.use(express.json());
    tiny.post("/login", loginRateLimiter(2), (_req, res) => res.json({ ok: true }));
    tiny.use((err: { status?: number; error?: string; messageKey?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
      res.status(err.status ?? 500).json({ error: err.error, messageKey: err.messageKey }),
    );

    const a = request(tiny);
    const body = { email: "x@y.z" };
    expect((await a.post("/login").send(body)).status).toBe(200);
    expect((await a.post("/login").send(body)).status).toBe(200);
    const third = await a.post("/login").send(body);
    expect(third.status).toBe(429);
    expect(third.body.error).toBe("rate_limited");
    expect(third.body.messageKey).toBe("auth.rate_limited");
  });

  it("the limiter is keyed per email — a different identifier is unaffected by another's strikes", async () => {
    const tiny = express();
    tiny.use(express.json());
    tiny.post("/login", loginRateLimiter(2), (_req, res) => res.json({ ok: true }));
    tiny.use((err: { status?: number; error?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
      res.status(err.status ?? 500).json({ error: err.error }),
    );

    const a = request(tiny);
    // burn the limit for victim@y.z
    await a.post("/login").send({ email: "victim@y.z" });
    await a.post("/login").send({ email: "victim@y.z" });
    expect((await a.post("/login").send({ email: "victim@y.z" })).status).toBe(429);
    // a different account is not locked out — no global account lock from one attacker
    expect((await a.post("/login").send({ email: "other@y.z" })).status).toBe(200);
  });

  it("an attempt with no email field is keyed without error (nullish email → empty bucket segment)", async () => {
    const tiny = express();
    tiny.use(express.json());
    tiny.post("/login", loginRateLimiter(1), (_req, res) => res.json({ ok: true }));
    tiny.use((err: { status?: number; error?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
      res.status(err.status ?? 500).json({ error: err.error }),
    );
    const a = request(tiny);
    expect((await a.post("/login").send({})).status).toBe(200); // no email → keyed on "", no throw
    expect((await a.post("/login").send({})).status).toBe(429); // same empty bucket trips
  });

  it("the email key is case-folded so VICTIM and victim share one bucket", async () => {
    const tiny = express();
    tiny.use(express.json());
    tiny.post("/login", loginRateLimiter(2), (_req, res) => res.json({ ok: true }));
    tiny.use((err: { status?: number; error?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
      res.status(err.status ?? 500).json({ error: err.error }),
    );
    const a = request(tiny);
    await a.post("/login").send({ email: "Victim@Y.Z" });
    await a.post("/login").send({ email: "victim@y.z" });
    const third = await a.post("/login").send({ email: "VICTIM@y.z" });
    expect(third.status).toBe(429);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCY MIDDLEWARE (owned; mounted on every mutating route)
// ─────────────────────────────────────────────────────────────────────────────
describe("idempotency middleware (ADR-0005)", () => {
  it("missing Idempotency-Key on a mutation → 422 validation.required", async () => {
    const ops = await loginAs("OPS");
    // go via the raw agent so the auto-key from Client.post is NOT attached
    const res = await (ops as unknown as { agent: ReturnType<typeof request.agent> }).agent
      .post(SPACES)
      .set("x-csrf-token", ops.csrf)
      .send(SPACE);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.fields["Idempotency-Key"]).toBe("validation.required");
  });

  it("malformed (non-UUID) Idempotency-Key → 422 validation.uuid", async () => {
    const ops = await loginAs("OPS");
    // a non-UUID key (set via the raw agent so it isn't auto-replaced with a valid UUID)
    const res = await (ops as unknown as { agent: ReturnType<typeof request.agent> }).agent
      .post(SPACES)
      .set("x-csrf-token", ops.csrf)
      .set("Idempotency-Key", "not-a-uuid")
      .send(SPACE);
    expect(res.status).toBe(422);
    expect(res.body.fields["Idempotency-Key"]).toBe("validation.uuid");
  });

  it("replay with the same key + same body → the ORIGINAL response; the mutation runs once", async () => {
    const ops = await loginAs("OPS");
    const key = randomUUID();
    const first = await ops.post(SPACES, key).send(SPACE);
    expect(first.status).toBe(201);
    const createdId = first.body.data.id;

    const replay = await ops.post(SPACES, key).send(SPACE);
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(createdId); // same payload echoed back
    // and it did NOT create a second row
    expect(await prisma.space.count()).toBe(1);
  });

  it("same key + DIFFERENT body → 409 idempotency_key_mismatch, no second mutation", async () => {
    const ops = await loginAs("OPS");
    const key = randomUUID();
    const first = await ops.post(SPACES, key).send(SPACE);
    expect(first.status).toBe(201);

    const mismatch = await ops.post(SPACES, key).send({ ...SPACE, name: "DIFFERENT" });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error).toBe("idempotency_key_mismatch");
    expect(mismatch.body.messageKey).toBe("common.idempotency_mismatch");
    expect(await prisma.space.count()).toBe(1); // the second body never executed
  });

  it("key reordering is canonical — same logical body, keys in a different order, still a replay", async () => {
    const ops = await loginAs("OPS");
    const key = randomUUID();
    const a = await ops.post(SPACES, key).send({ name: "Z", floor: 0, kind: "MAIN", capacities: { THEATER: 10 }, dayRateMinor: 100 });
    expect(a.status).toBe(201);
    // same fields, different insertion order → stableStringify hashes identically → replay (not a 409)
    const b = await ops.post(SPACES, key).send({ dayRateMinor: 100, capacities: { THEATER: 10 }, kind: "MAIN", floor: 0, name: "Z" });
    expect(b.status).toBe(201);
    expect(b.body.data.id).toBe(a.body.data.id);
    expect(await prisma.space.count()).toBe(1);
  });

  it("the same Idempotency-Key is scoped per actor — a second actor is not served the first's cached response", async () => {
    await makeUser("OPS", { email: "opsa@pyramid.test" });
    await makeUser("OPS", { email: "opsb@pyramid.test" });
    const key = randomUUID();

    const a = await loginAgent("opsa@pyramid.test");
    const ra = await a.agent.post(SPACES).set("x-csrf-token", a.csrf).set("Idempotency-Key", key).send(SPACE);
    expect(ra.status).toBe(201);

    const b = await loginAgent("opsb@pyramid.test");
    // different actor + same key + different body must NOT collide → fresh create, not a 409
    const rb = await b.agent.post(SPACES).set("x-csrf-token", b.csrf).set("Idempotency-Key", key).send({ ...SPACE, name: "B-space" });
    expect(rb.status).toBe(201);
    expect(rb.body.data.name).toBe("B-space");
    expect(await prisma.space.count()).toBe(2);
  });

  it("the same key on two DIFFERENT routes does not collide (keyed per route + key)", async () => {
    const ops = await loginAs("OPS");
    const key = randomUUID();
    const space = await ops.post(SPACES, key).send(SPACE);
    expect(space.status).toBe(201);
    // same Idempotency-Key, different route → fresh execution, not a cross-route replay/409
    const asset = await ops
      .post("/api/v1/private/assets", key)
      .send({ name: "Chairs", type: "SEATING", totalQuantity: 100, location: "Storage -1" });
    expect(asset.status).toBe(201);
    expect(await prisma.asset.count()).toBe(1);
  });

  it("a failed mutation (4xx) is NOT cached — a later valid call with the same key still executes", async () => {
    const ops = await loginAs("OPS");
    const key = randomUUID();
    // first call fails validation (the create handler rejects), so nothing is cached.
    // The null field also exercises stableStringify's nested-null hashing branch.
    const bad = await ops.post(SPACES, key).send({ floor: 0, name: null }); // missing required fields
    expect(bad.status).toBe(422);

    // same key, now a valid body → must run (not replay the 422)
    const good = await ops.post(SPACES, key).send(SPACE);
    expect(good.status).toBe(201);
    expect(await prisma.space.count()).toBe(1);
  });
});

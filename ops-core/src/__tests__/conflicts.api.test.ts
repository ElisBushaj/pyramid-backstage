import { describe, it, expect, beforeEach } from "vitest";
import { anon, loginAs, resetDb } from "./helpers/integration";
import { seedSpace, seedRequest, seedReservation } from "./helpers/fixtures";

// HTTP integration for the two read endpoints the engine backs:
//   GET /private/conflicts?spaceId&start&end       → Conflict[]
//   GET /private/spaces/:id/availability?start&end  → SpaceAvailability
// Every negative path asserts status + error + messageKey (+ fields/conflicts as
// applicable) against ERROR_CONTRACT.md. Real app, real Postgres, real auth.

const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };
const FREE = { start: "2026-08-10T09:00:00Z", end: "2026-08-10T18:00:00Z" };
const enc = encodeURIComponent;

beforeEach(resetDb);

describe("GET /private/conflicts (F05-T05)", () => {
  it("a busy space → 200 with one SPACE_DOUBLE_BOOKED carrying the full Conflict shape", async () => {
    const client = await loginAs("VIEWER");
    const space = await seedSpace({ name: "Blue Hall", setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const res = await client.get(`/api/v1/private/conflicts?spaceId=${space.id}&start=${enc(W.start)}&end=${enc(W.end)}`);
    expect(res.status).toBe(200);
    expect(res.body.messageKey).toBe("conflict.list.success");
    expect(res.body.data).toHaveLength(1);
    const c = res.body.data[0];
    expect(c.type).toBe("SPACE_DOUBLE_BOOKED");
    expect(c.spaceId).toBe(space.id);
    expect(c.conflictingRequestIds).toEqual([req.id]);
    expect(c.window).toEqual({ start: "2026-07-22T09:00:00.000Z", end: "2026-07-22T18:00:00.000Z" });
    expect(typeof c.detail).toBe("string");
  });

  it("a buffered back-to-back booking → SETUP_WINDOW_OVERLAP", async () => {
    const client = await loginAs("VIEWER");
    const space = await seedSpace({ setupBufferMinutes: 240, teardownBufferMinutes: 120 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T14:00:00Z", status: "CONFIRMED" });

    const res = await client.get(`/api/v1/private/conflicts?spaceId=${space.id}&start=${enc("2026-07-22T15:00:00Z")}&end=${enc("2026-07-22T20:00:00Z")}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe("SETUP_WINDOW_OVERLAP");
  });

  it("a free window → 200 with an empty array (not 404)", async () => {
    const client = await loginAs("VIEWER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const res = await client.get(`/api/v1/private/conflicts?spaceId=${space.id}&start=${enc(FREE.start)}&end=${enc(FREE.end)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("touching windows (half-open) → 200 empty array", async () => {
    const client = await loginAs("VIEWER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T10:00:00Z", end: "2026-07-22T14:00:00Z", status: "CONFIRMED" });
    const res = await client.get(`/api/v1/private/conflicts?spaceId=${space.id}&start=${enc("2026-07-22T14:00:00Z")}&end=${enc("2026-07-22T18:00:00Z")}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("spaceId is optional — start+end alone → 200 empty array (nothing to check)", async () => {
    const client = await loginAs("VIEWER");
    const res = await client.get(`/api/v1/private/conflicts?start=${enc(W.start)}&end=${enc(W.end)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("missing both start and end → 422 with field-keyed messageKeys", async () => {
    const client = await loginAs("VIEWER");
    const res = await client.get(`/api/v1/private/conflicts?spaceId=x`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.messageKey).toBe("validation.failed");
    expect(res.body.fields.start).toBe("validation.datetime");
    expect(res.body.fields.end).toBe("validation.datetime");
  });

  it("missing only end → 422 naming end", async () => {
    const client = await loginAs("VIEWER");
    const res = await client.get(`/api/v1/private/conflicts?start=${enc(W.start)}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.fields.end).toBe("validation.datetime");
  });

  it("a non-ISO date → 422 datetime", async () => {
    const client = await loginAs("VIEWER");
    const res = await client.get(`/api/v1/private/conflicts?start=not-a-date&end=${enc(W.end)}`);
    expect(res.status).toBe(422);
    expect(res.body.fields.start).toBe("validation.datetime");
  });

  it("start >= end → 422 range", async () => {
    const client = await loginAs("VIEWER");
    const res = await client.get(`/api/v1/private/conflicts?start=${enc(W.end)}&end=${enc(W.start)}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.fields.end).toBe("validation.range");
  });

  it("equal start and end → 422 range (zero-length window)", async () => {
    const client = await loginAs("VIEWER");
    const res = await client.get(`/api/v1/private/conflicts?start=${enc(W.start)}&end=${enc(W.start)}`);
    expect(res.status).toBe(422);
    expect(res.body.fields.end).toBe("validation.range");
  });

  it("unauthenticated → 401 unauthorized", async () => {
    const res = await anon().get(`/api/v1/private/conflicts?start=${enc(W.start)}&end=${enc(W.end)}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
    expect(res.body.messageKey).toBe("common.unauthorized");
  });

  it("PARTNER (below VIEWER) → 403 forbidden", async () => {
    const client = await loginAs("PARTNER");
    const res = await client.get(`/api/v1/private/conflicts?start=${enc(W.start)}&end=${enc(W.end)}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
    expect(res.body.messageKey).toBe("auth.forbidden"); // requireRole's key
  });

  it("OPS (above VIEWER) → 200", async () => {
    const client = await loginAs("OPS");
    const res = await client.get(`/api/v1/private/conflicts?start=${enc(W.start)}&end=${enc(W.end)}`);
    expect(res.status).toBe(200);
  });
});

describe("GET /private/spaces/:id/availability (F05-T05)", () => {
  it("a busy space → 200 available:false with conflictingRequestIds; a free window → available:true []", async () => {
    const client = await loginAs("VIEWER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const busy = await client.get(`/api/v1/private/spaces/${space.id}/availability?start=${enc(W.start)}&end=${enc(W.end)}`);
    expect(busy.status).toBe(200);
    expect(busy.body.messageKey).toBe("space.availability.success");
    expect(busy.body.data).toMatchObject({ spaceId: space.id, available: false });
    expect(busy.body.data.conflictingRequestIds).toEqual([req.id]);

    const free = await client.get(`/api/v1/private/spaces/${space.id}/availability?start=${enc(FREE.start)}&end=${enc(FREE.end)}`);
    expect(free.status).toBe(200);
    expect(free.body.data).toMatchObject({ spaceId: space.id, available: true });
    expect(free.body.data.conflictingRequestIds).toEqual([]);
  });

  it("a live HELD blocks; a lapsed HELD does not", async () => {
    const client = await loginAs("VIEWER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const liveReq = await seedRequest();
    await seedReservation({ space, requestId: liveReq.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() + 600_000) });
    const blocked = await client.get(`/api/v1/private/spaces/${space.id}/availability?start=${enc(W.start)}&end=${enc(W.end)}`);
    expect(blocked.body.data.available).toBe(false);

    await resetDb();
    const client2 = await loginAs("VIEWER");
    const space2 = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const lapsedReq = await seedRequest();
    await seedReservation({ space: space2, requestId: lapsedReq.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 1_000) });
    const open = await client2.get(`/api/v1/private/spaces/${space2.id}/availability?start=${enc(W.start)}&end=${enc(W.end)}`);
    expect(open.body.data.available).toBe(true);
  });

  it("an unknown space id → 404 not_found", async () => {
    const client = await loginAs("VIEWER");
    const res = await client.get(`/api/v1/private/spaces/00000000-0000-4000-8000-000000000000/availability?start=${enc(W.start)}&end=${enc(W.end)}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
    expect(res.body.messageKey).toBe("common.not_found");
  });

  it("missing start/end → 422 datetime on each", async () => {
    const client = await loginAs("VIEWER");
    const space = await seedSpace();
    const res = await client.get(`/api/v1/private/spaces/${space.id}/availability`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.fields.start).toBe("validation.datetime");
    expect(res.body.fields.end).toBe("validation.datetime");
  });

  it("start >= end → 422 range", async () => {
    const client = await loginAs("VIEWER");
    const space = await seedSpace();
    const res = await client.get(`/api/v1/private/spaces/${space.id}/availability?start=${enc(W.end)}&end=${enc(W.start)}`);
    expect(res.status).toBe(422);
    expect(res.body.fields.end).toBe("validation.range");
  });

  it("unauthenticated → 401", async () => {
    const space = await seedSpace();
    const res = await anon().get(`/api/v1/private/spaces/${space.id}/availability?start=${enc(W.start)}&end=${enc(W.end)}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("PARTNER → 403 forbidden", async () => {
    const client = await loginAs("PARTNER");
    const space = await seedSpace();
    const res = await client.get(`/api/v1/private/spaces/${space.id}/availability?start=${enc(W.start)}&end=${enc(W.end)}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
    expect(res.body.messageKey).toBe("auth.forbidden");
  });
});

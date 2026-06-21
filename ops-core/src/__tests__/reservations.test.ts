import { describe, it, expect, beforeEach } from "vitest";
import {
  loginAs,
  resetDb,
  prisma,
  anon,
  auditEntriesFor,
  type Client,
} from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation } from "./helpers/fixtures";
import {
  reservationsService,
  confirmReservationTx,
  releaseReservationTx,
} from "../modules/reservations/service";
import { assetAvailability } from "../services/availability";
import type { Actor } from "../types";

const RES = "/api/v1/private/reservations";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };

beforeEach(resetDb);

async function holdBody(client: Client, over: Record<string, unknown> = {}) {
  const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
  const req = await seedRequest();
  return { space, req, body: { requestId: req.id, spaceId: space.id, dateRange: W, ...over } };
}

// ───────────────────────────────────────────────────────────────────────────
// HOLD — success path
// ───────────────────────────────────────────────────────────────────────────
describe("POST /reservations — atomic hold success (F06-T02)", () => {
  it("holds a space + assets, writes reservation.hold audit in the same tx", async () => {
    const client = await loginAs("OPS");
    const chairs = await seedAsset({ totalQuantity: 400 });
    const { body } = await holdBody(client, { assets: [{ assetId: chairs.id, quantity: 200 }] });

    const res = await client.post(RES).send(body);
    expect(res.status).toBe(201);
    expect(res.body.messageKey).toBe("reservation.held");
    expect(res.body.data).toMatchObject({ status: "HELD", spaceId: body.spaceId, requestId: body.requestId });
    expect(res.body.data.expiresAt).toBeTruthy();
    expect(res.body.data.assets).toEqual([{ assetId: chairs.id, quantity: 200 }]);

    // ReservationAsset rows actually persisted
    expect(await prisma.reservationAsset.count({ where: { reservationId: res.body.data.id } })).toBe(1);

    // audit written, attributed to the real actor
    const audits = await auditEntriesFor("Reservation", res.body.data.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "reservation.hold", actorId: client.user.id, actorName: client.user.name });
  });

  it("computes effectiveStart/effectiveEnd by padding the event window with the space buffers", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 60, teardownBufferMinutes: 30 });
    const req = await seedRequest();

    const res = await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(res.status).toBe(201);
    const row = await prisma.reservation.findUniqueOrThrow({ where: { id: res.body.data.id } });
    // 09:00 − 60m = 08:00 ; 18:00 + 30m = 18:30
    expect(row.effectiveStart.toISOString()).toBe("2026-07-22T08:00:00.000Z");
    expect(row.effectiveEnd.toISOString()).toBe("2026-07-22T18:30:00.000Z");
  });

  it("sets expiresAt = now + holdMinutes (custom) and defaults to 30m when omitted", async () => {
    const client = await loginAs("OPS");

    const custom = await holdBody(client, { holdMinutes: 5 });
    const before = Date.now();
    const r1 = await client.post(RES).send(custom.body);
    expect(r1.status).toBe(201);
    const exp1 = new Date(r1.body.data.expiresAt).getTime();
    expect(exp1).toBeGreaterThanOrEqual(before + 5 * 60_000 - 5_000);
    expect(exp1).toBeLessThanOrEqual(Date.now() + 5 * 60_000 + 5_000);

    const dft = await holdBody(client);
    const before2 = Date.now();
    const r2 = await client.post(RES).send(dft.body);
    const exp2 = new Date(r2.body.data.expiresAt).getTime();
    expect(exp2).toBeGreaterThanOrEqual(before2 + 30 * 60_000 - 5_000);
    expect(exp2).toBeLessThanOrEqual(Date.now() + 30 * 60_000 + 5_000);
  });

  it("moves the request DRAFT → PROPOSED (with a request.transition audit)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest({ status: "DRAFT" });

    const res = await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(res.status).toBe(201);
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PROPOSED");
    const reqAudits = await auditEntriesFor("EventRequest", req.id);
    expect(reqAudits.map((a) => a.action)).toContain("request.transition");
    expect(reqAudits.find((a) => a.action === "request.transition")).toMatchObject({ before: { status: "DRAFT" }, after: { status: "PROPOSED" } });
  });

  it("is idempotent on the request status: a hold against an already-PROPOSED request does not re-transition", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest({ status: "PROPOSED" });

    const res = await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(res.status).toBe(201);
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PROPOSED");
    // no spurious request.transition audit row
    expect(await prisma.auditEntry.count({ where: { entityType: "EventRequest", action: "request.transition" } })).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// HOLD — conflict path (nothing half-written)
// ───────────────────────────────────────────────────────────────────────────
describe("POST /reservations — conflict path (F06-T02)", () => {
  it("returns 409 conflict {SPACE_DOUBLE_BOOKED}; no Reservation/ReservationAsset/audit rows persist", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const existing = await seedRequest();
    await seedReservation({ space, requestId: existing.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const req = await seedRequest();

    const res = await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("conflict");
    expect(res.body.messageKey).toBe("reservation.conflict");
    expect(res.body.conflicts[0]).toMatchObject({ type: "SPACE_DOUBLE_BOOKED", spaceId: space.id });
    expect(res.body.conflicts[0].conflictingRequestIds).toContain(existing.id);

    // nothing half-written for the loser
    expect(await prisma.reservation.count({ where: { requestId: req.id } })).toBe(0);
    expect(await prisma.auditEntry.count({ where: { requestId: req.id } })).toBe(0);
  });

  it("returns 409 {ASSET_OVERALLOCATED} carrying requested + available; no partial row", async () => {
    const client = await loginAs("OPS");
    const space1 = await seedSpace();
    const space2 = await seedSpace();
    const chairs = await seedAsset({ totalQuantity: 100 });
    const r1 = await seedRequest();
    await seedReservation({ space: space1, requestId: r1.id, start: W.start, end: W.end, status: "CONFIRMED", assets: [{ assetId: chairs.id, quantity: 80 }] });
    const r2 = await seedRequest();

    const res = await client.post(RES).send({ requestId: r2.id, spaceId: space2.id, dateRange: W, assets: [{ assetId: chairs.id, quantity: 40 }] });
    expect(res.status).toBe(409);
    const c = res.body.conflicts.find((x: any) => x.type === "ASSET_OVERALLOCATED");
    expect(c).toMatchObject({ assetId: chairs.id, requested: 40, available: 20 });
    expect(await prisma.reservationAsset.count({ where: { assetId: chairs.id, reservation: { requestId: r2.id } } })).toBe(0);
  });

  it("surfaces SETUP_WINDOW_OVERLAP when buffers collide but the event windows don't", async () => {
    const client = await loginAs("OPS");
    // 4h setup / 2h teardown buffers (fixture default). Two back-to-back events
    // whose event windows touch but whose buffers overlap.
    const space = await seedSpace({ setupBufferMinutes: 240, teardownBufferMinutes: 120 });
    const r1 = await seedRequest();
    // existing event 09:00–12:00 → effective 05:00–14:00
    await seedReservation({ space, requestId: r1.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T12:00:00Z", status: "CONFIRMED" });
    const r2 = await seedRequest();

    // new event 13:00–16:00: event windows DON'T overlap (12:00 ≤ 13:00) but
    // effective windows do (existing teardown to 14:00 vs new setup from 09:00).
    const res = await client.post(RES).send({ requestId: r2.id, spaceId: space.id, dateRange: { start: "2026-07-22T13:00:00Z", end: "2026-07-22T16:00:00Z" } });
    expect(res.status).toBe(409);
    expect(res.body.conflicts.some((c: any) => c.type === "SETUP_WINDOW_OVERLAP")).toBe(true);
    expect(await prisma.reservation.count({ where: { requestId: r2.id } })).toBe(0);
  });

  it("half-open: a back-to-back booking with zero buffers does NOT conflict (touching windows are free)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const r1 = await seedRequest();
    await seedReservation({ space, requestId: r1.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T14:00:00Z", status: "CONFIRMED" });
    const r2 = await seedRequest();

    // 14:00–18:00 starts exactly when the other ends → half-open → no overlap.
    const res = await client.post(RES).send({ requestId: r2.id, spaceId: space.id, dateRange: { start: "2026-07-22T14:00:00Z", end: "2026-07-22T18:00:00Z" } });
    expect(res.status).toBe(201);
  });

  it("an expired hold does NOT block a new hold for the same space (lapsed holds release inventory)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const stale = await seedRequest();
    await seedReservation({ space, requestId: stale.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 1000) });
    const req = await seedRequest();

    const res = await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(res.status).toBe(201);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// HOLD — idempotency
// ───────────────────────────────────────────────────────────────────────────
describe("POST /reservations — idempotency (F06-T03)", () => {
  it("a replay with the same key returns the original reservation, no duplicate", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client);
    const key = "22222222-2222-4222-8222-222222222222";
    const first = await client.post(RES, key).send(body);
    const replay = await client.post(RES, key).send(body);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await prisma.reservation.count()).toBe(1);
    // the mutation ran once: one audit
    expect(await prisma.auditEntry.count({ where: { action: "reservation.hold" } })).toBe(1);
  });

  it("the same key with a different body → 409 idempotency_key_mismatch", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client);
    const key = "33333333-3333-4333-8333-333333333333";
    await client.post(RES, key).send(body);
    const mismatch = await client.post(RES, key).send({ ...body, holdMinutes: 99 });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error).toBe("idempotency_key_mismatch");
    expect(mismatch.body.messageKey).toBe("common.idempotency_mismatch");
  });

  it("a missing Idempotency-Key → 422 validation (field Idempotency-Key)", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client);
    // bypass the helper's auto-key by talking to the agent directly
    const res = await (client as any).agent.post(RES).set("x-csrf-token", client.csrf).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.fields["Idempotency-Key"]).toBe("validation.required");
  });

  it("a non-UUID Idempotency-Key → 422 validation", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client);
    // talk to the agent directly so we can send a non-UUID header value
    const res = await (client as any).agent.post(RES).set("x-csrf-token", client.csrf).set("Idempotency-Key", "not-a-uuid").send(body);
    expect(res.status).toBe(422);
    expect(res.body.fields["Idempotency-Key"]).toBe("validation.uuid");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// HOLD — validation & 404
// ───────────────────────────────────────────────────────────────────────────
describe("POST /reservations — validation & not-found (F06-T02)", () => {
  it("start ≥ end → 422 validation with the range field", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client, { dateRange: { start: "2026-07-22T18:00:00Z", end: "2026-07-22T09:00:00Z" } });
    const res = await client.post(RES).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.messageKey).toBe("validation.failed");
    expect(res.body.fields.dateRange).toBe("validation.range");
  });

  it("equal start and end → 422 validation.range", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client, { dateRange: { start: W.start, end: W.start } });
    const res = await client.post(RES).send(body);
    expect(res.status).toBe(422);
    expect(res.body.fields.dateRange).toBe("validation.range");
  });

  it("a non-ISO date → 422 validation.datetime", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client, { dateRange: { start: "nope", end: "also-nope" } });
    const res = await client.post(RES).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.fields["dateRange.start"]).toBe("validation.datetime");
  });

  it("an asset quantity < 1 → 422 validation.min", async () => {
    const client = await loginAs("OPS");
    const chairs = await seedAsset({ totalQuantity: 100 });
    const { body } = await holdBody(client, { assets: [{ assetId: chairs.id, quantity: 0 }] });
    const res = await client.post(RES).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    // express-validator reports the concrete element path (e.g. "assets[0].quantity")
    const qtyField = Object.keys(res.body.fields).find((k) => k.includes("quantity"));
    expect(qtyField).toBeDefined();
    expect(res.body.fields[qtyField!]).toBe("validation.min");
  });

  it("a non-UUID spaceId → 422 validation.uuid", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(RES).send({ requestId: req.id, spaceId: "not-a-uuid", dateRange: W });
    expect(res.status).toBe(422);
    expect(res.body.fields.spaceId).toBe("validation.uuid");
  });

  it("the service itself rejects an inverted range (defense-in-depth past the validator)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    // call the service directly, bypassing the express-validator chain, to prove the
    // hold() guard rejects start ≥ end on its own (the path AI/approval callers take).
    await expect(
      reservationsService.hold(client.user, { requestId: req.id, spaceId: space.id, dateRange: { start: W.end, end: W.start } }),
    ).rejects.toMatchObject({ status: 422, error: "validation", fields: { dateRange: "validation.range" } });
  });

  it("an unknown (but well-formed) space → 404 not_found", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(RES).send({ requestId: req.id, spaceId: "00000000-0000-4000-8000-000000000000", dateRange: W });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("an unknown request → 404 not_found", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const res = await client.post(RES).send({ requestId: "00000000-0000-4000-8000-000000000000", spaceId: space.id, dateRange: W });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("an unknown asset id → 409 ASSET_OVERALLOCATED (zero available)", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client, { assets: [{ assetId: "00000000-0000-4000-8000-0000000000aa", quantity: 1 }] });
    const res = await client.post(RES).send(body);
    expect(res.status).toBe(409);
    expect(res.body.conflicts.some((c: any) => c.type === "ASSET_OVERALLOCATED" && c.available === 0)).toBe(true);
  });

  it("a MAINTENANCE asset reports 0 available → 409 ASSET_OVERALLOCATED", async () => {
    const client = await loginAs("OPS");
    const broken = await seedAsset({ totalQuantity: 100, status: "MAINTENANCE" });
    const { body } = await holdBody(client, { assets: [{ assetId: broken.id, quantity: 1 }] });
    const res = await client.post(RES).send(body);
    expect(res.status).toBe(409);
    expect(res.body.conflicts.some((c: any) => c.type === "ASSET_OVERALLOCATED" && c.available === 0)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// CONFIRM
// ───────────────────────────────────────────────────────────────────────────
describe("POST /reservations/:id/confirm (F06-T04)", () => {
  async function heldReservation(client: Client) {
    const { body } = await holdBody(client);
    return (await client.post(RES).send(body)).body.data;
  }

  it("HELD → CONFIRMED, clears expiresAt, idempotent, single audit", async () => {
    const client = await loginAs("OPS");
    const held = await heldReservation(client);

    const c1 = await client.post(`${RES}/${held.id}/confirm`);
    expect(c1.status).toBe(200);
    expect(c1.body.messageKey).toBe("reservation.confirmed");
    expect(c1.body.data.status).toBe("CONFIRMED");
    expect(c1.body.data.expiresAt ?? null).toBeNull();
    // expiresAt cleared in the DB, not just the DTO
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: held.id } })).expiresAt).toBeNull();

    const c2 = await client.post(`${RES}/${held.id}/confirm`); // idempotent
    expect(c2.status).toBe(200);
    expect(c2.body.data.status).toBe("CONFIRMED");
    // the idempotent replay must NOT write a second confirm audit
    expect(await prisma.auditEntry.count({ where: { action: "reservation.confirm", entityId: held.id } })).toBe(1);
  });

  it("confirming an expired hold whose slot is FREE (merely lapsed) → 410 reservation.hold_expired, not confirmed (ADR-0015)", async () => {
    const client = await loginAs("OPS");
    const held = await heldReservation(client);
    await prisma.reservation.update({ where: { id: held.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await client.post(`${RES}/${held.id}/confirm`);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe("gone");
    expect(res.body.messageKey).toBe("reservation.hold_expired");
    // it was NOT confirmed
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: held.id } })).status).toBe("HELD");
  });

  it("an expired hold whose slot was retaken → 409 conflict carrying the live conflicts[]", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const r1 = await seedRequest();
    // my own expired hold
    const mine = await seedReservation({ space, requestId: r1.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 1000) });
    // someone else grabbed the slot in the meantime
    const r2 = await seedRequest();
    await seedReservation({ space, requestId: r2.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const res = await client.post(`${RES}/${mine.id}/confirm`);
    expect(res.status).toBe(409);
    expect(res.body.conflicts.some((c: any) => c.type === "SPACE_DOUBLE_BOOKED")).toBe(true);
  });

  it("confirming a RELEASED hold → 409 invalid_transition (from RELEASED → CONFIRMED)", async () => {
    const client = await loginAs("OPS");
    const held = await heldReservation(client);
    await client.post(`${RES}/${held.id}/release`);

    const res = await client.post(`${RES}/${held.id}/confirm`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("invalid_transition");
    expect(res.body.messageKey).toBe("reservation.invalid_transition");
    expect(res.body.from).toBe("RELEASED");
    expect(res.body.to).toBe("CONFIRMED");
  });

  it("confirming an unknown reservation → 404 not_found", async () => {
    const client = await loginAs("OPS");
    const res = await client.post(`${RES}/00000000-0000-4000-8000-000000000000/confirm`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// RELEASE
// ───────────────────────────────────────────────────────────────────────────
describe("POST /reservations/:id/release (F06-T04)", () => {
  it("HELD → RELEASED, idempotent (re-release is a no-op), single audit", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client);
    const held = (await client.post(RES).send(body)).body.data;

    const r1 = await client.post(`${RES}/${held.id}/release`);
    expect(r1.status).toBe(200);
    expect(r1.body.messageKey).toBe("reservation.released");
    expect(r1.body.data.status).toBe("RELEASED");

    const r2 = await client.post(`${RES}/${held.id}/release`); // idempotent no-op
    expect(r2.status).toBe(200);
    expect(r2.body.data.status).toBe("RELEASED");
    // re-release wrote no second audit
    expect(await prisma.auditEntry.count({ where: { action: "reservation.release", entityId: held.id } })).toBe(1);
  });

  it("releasing a CONFIRMED reservation also moves it to RELEASED", async () => {
    const client = await loginAs("OPS");
    const { body } = await holdBody(client);
    const held = (await client.post(RES).send(body)).body.data;
    await client.post(`${RES}/${held.id}/confirm`);

    const res = await client.post(`${RES}/${held.id}/release`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("RELEASED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: held.id } })).status).toBe("RELEASED");
  });

  it("releasing returns inventory: availability rises back to total", async () => {
    const client = await loginAs("OPS");
    const chairs = await seedAsset({ totalQuantity: 100 });
    const { body } = await holdBody(client, { assets: [{ assetId: chairs.id, quantity: 70 }] });
    const held = (await client.post(RES).send(body)).body.data;

    const start = new Date(W.start);
    const end = new Date(W.end);
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: chairs.id } });
    const beforeRelease = (await assetAvailability([asset], start, end)).get(chairs.id);
    expect(beforeRelease).toBe(30); // 100 − 70 held

    await client.post(`${RES}/${held.id}/release`);
    const afterRelease = (await assetAvailability([asset], start, end)).get(chairs.id);
    expect(afterRelease).toBe(100); // fully returned
  });

  it("releasing an unknown reservation → 404 not_found", async () => {
    const client = await loginAs("OPS");
    const res = await client.post(`${RES}/00000000-0000-4000-8000-000000000000/release`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// REAPER + check-on-read
// ───────────────────────────────────────────────────────────────────────────
describe("HELD-expiry reaper (F06-T05)", () => {
  it("flips a lapsed HELD → RELEASED and writes a system-actor audit", async () => {
    await loginAs("OPS");
    const space = await seedSpace();
    const chairs = await seedAsset({ totalQuantity: 100 });
    const req = await seedRequest();
    const r = await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 1000), assets: [{ assetId: chairs.id, quantity: 80 }] });

    const reaped = await reservationsService.reapExpiredHolds();
    expect(reaped).toBe(1);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("RELEASED");
    const sysAudit = await prisma.auditEntry.findMany({ where: { action: "reservation.release", actorName: "system", entityId: r.id } });
    expect(sysAudit).toHaveLength(1);
    expect(sysAudit[0]).toMatchObject({ actorId: null, before: { status: "HELD" }, after: { status: "RELEASED" } });
  });

  it("only reaps holds whose expiresAt ≤ now; a live HELD is left untouched", async () => {
    await loginAs("OPS");
    const space = await seedSpace();
    const liveReq = await seedRequest();
    const live = await seedReservation({ space, requestId: liveReq.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() + 3_600_000) });
    const deadReq = await seedRequest();
    const dead = await seedReservation({ space, requestId: deadReq.id, start: "2026-08-01T09:00:00Z", end: "2026-08-01T18:00:00Z", status: "HELD", expiresAt: new Date(Date.now() - 1000) });

    const reaped = await reservationsService.reapExpiredHolds();
    expect(reaped).toBe(1);
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: live.id } })).status).toBe("HELD");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: dead.id } })).status).toBe("RELEASED");
  });

  it("reaps a batch of lapsed holds and never touches CONFIRMED/RELEASED rows", async () => {
    await loginAs("OPS");
    const space = await seedSpace();
    const past = new Date(Date.now() - 1000);
    for (let i = 0; i < 3; i++) {
      const rq = await seedRequest();
      await seedReservation({ space, requestId: rq.id, start: `2026-09-0${i + 1}T09:00:00Z`, end: `2026-09-0${i + 1}T18:00:00Z`, status: "HELD", expiresAt: past });
    }
    const confReq = await seedRequest();
    await seedReservation({ space, requestId: confReq.id, start: "2026-10-01T09:00:00Z", end: "2026-10-01T18:00:00Z", status: "CONFIRMED" });

    const reaped = await reservationsService.reapExpiredHolds();
    expect(reaped).toBe(3);
    expect(await prisma.reservation.count({ where: { status: "RELEASED" } })).toBe(3);
    expect(await prisma.reservation.count({ where: { status: "CONFIRMED" } })).toBe(1);
  });

  it("is a no-op when nothing has expired (returns 0)", async () => {
    await loginAs("OPS");
    const space = await seedSpace();
    const rq = await seedRequest();
    await seedReservation({ space, requestId: rq.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() + 3_600_000) });
    expect(await reservationsService.reapExpiredHolds()).toBe(0);
  });

  it("frees inventory: a reaped hold no longer counts against availability", async () => {
    await loginAs("OPS");
    const space = await seedSpace();
    const chairs = await seedAsset({ totalQuantity: 100 });
    const rq = await seedRequest();
    await seedReservation({ space, requestId: rq.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 1000), assets: [{ assetId: chairs.id, quantity: 90 }] });

    await reservationsService.reapExpiredHolds();
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: chairs.id } });
    expect((await assetAvailability([asset], new Date(W.start), new Date(W.end))).get(chairs.id)).toBe(100);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// getById (service-level — no HTTP route)
// ───────────────────────────────────────────────────────────────────────────
describe("reservationsService.getById (F06)", () => {
  it("returns the reservation including its assets", async () => {
    const client = await loginAs("OPS");
    const chairs = await seedAsset({ totalQuantity: 100 });
    const { body } = await holdBody(client, { assets: [{ assetId: chairs.id, quantity: 10 }] });
    const held = (await client.post(RES).send(body)).body.data;

    const row = await reservationsService.getById(held.id);
    expect(row.id).toBe(held.id);
    expect(row.assets).toHaveLength(1);
    expect(row.assets![0]).toMatchObject({ assetId: chairs.id, quantity: 10 });
  });

  it("throws a 404 APIError for an unknown id", async () => {
    await expect(reservationsService.getById("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ status: 404, error: "not_found" });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Transaction-scoped primitives reused by the approval flow (F10)
//   confirmReservationTx / releaseReservationTx — the CAS guards approvals rely on.
// ───────────────────────────────────────────────────────────────────────────
describe("confirmReservationTx / releaseReservationTx (F06 → reused by F10)", () => {
  const actor: Actor = { id: "", name: "Approver", role: "MANAGER" };

  async function heldRow(client: Client, assets: Array<{ assetId: string; quantity: number }> = []) {
    const { body } = await holdBody(client, assets.length ? { assets } : {});
    return (await client.post(RES).send(body)).body.data as { id: string; requestId: string; spaceId: string };
  }

  it("confirmReservationTx flips a HELD row → CONFIRMED with audit in the caller's tx", async () => {
    const client = await loginAs("MANAGER");
    actor.id = client.user.id;
    const held = await heldRow(client);

    const u = await prisma.$transaction((tx) => confirmReservationTx(tx, { ...held, status: "HELD" }, actor));
    expect(u!.status).toBe("CONFIRMED");
    expect(u!.expiresAt).toBeNull();
    expect(await prisma.auditEntry.count({ where: { action: "reservation.confirm", entityId: held.id, actorId: client.user.id } })).toBe(1);
  });

  it("confirmReservationTx on a non-HELD row → 409 invalid_transition (no resurrection of a reaped/released hold)", async () => {
    const client = await loginAs("MANAGER");
    actor.id = client.user.id;
    const held = await heldRow(client);
    await client.post(`${RES}/${held.id}/release`); // now RELEASED

    await expect(
      prisma.$transaction((tx) => confirmReservationTx(tx, { ...held, status: "RELEASED" }, actor)),
    ).rejects.toMatchObject({ status: 409, error: "invalid_transition", from: "RELEASED", to: "CONFIRMED" });
    // the row stayed RELEASED — never resurrected to CONFIRMED
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: held.id } })).status).toBe("RELEASED");
  });

  it("releaseReservationTx flips a HELD row → RELEASED with audit", async () => {
    const client = await loginAs("MANAGER");
    actor.id = client.user.id;
    const held = await heldRow(client);

    await prisma.$transaction((tx) => releaseReservationTx(tx, { ...held, status: "HELD" }, actor));
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: held.id } })).status).toBe("RELEASED");
    expect(await prisma.auditEntry.count({ where: { action: "reservation.release", entityId: held.id, actorId: client.user.id } })).toBe(1);
  });

  it("releaseReservationTx on an already-RELEASED row is a silent no-op (concurrent release/reap safe)", async () => {
    const client = await loginAs("MANAGER");
    actor.id = client.user.id;
    const held = await heldRow(client);
    await client.post(`${RES}/${held.id}/release`);
    const auditsBefore = await prisma.auditEntry.count({ where: { action: "reservation.release", entityId: held.id } });

    await prisma.$transaction((tx) => releaseReservationTx(tx, { ...held, status: "RELEASED" }, actor));
    // no second audit row written by the no-op
    expect(await prisma.auditEntry.count({ where: { action: "reservation.release", entityId: held.id } })).toBe(auditsBefore);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// RBAC
// ───────────────────────────────────────────────────────────────────────────
describe("RBAC — inventory writes require OPS+ (F06)", () => {
  it("a VIEWER cannot hold (403 forbidden)", async () => {
    const viewer = await loginAs("VIEWER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    const res = await viewer.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
    expect(await prisma.reservation.count()).toBe(0);
  });

  it("an anonymous caller cannot hold (401 unauthorized)", async () => {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    const res = await anon()
      .post(RES)
      .set("Idempotency-Key", "44444444-4444-4444-8444-444444444444")
      .send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("a VIEWER cannot confirm or release (403 forbidden)", async () => {
    const ops = await loginAs("OPS");
    const { body } = await holdBody(ops);
    const held = (await ops.post(RES).send(body)).body.data;

    const viewer = await loginAs("VIEWER");
    expect((await viewer.post(`${RES}/${held.id}/confirm`)).status).toBe(403);
    expect((await viewer.post(`${RES}/${held.id}/release`)).status).toBe(403);
  });

  it("a MANAGER (OPS+) may hold", async () => {
    const mgr = await loginAs("MANAGER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    expect((await mgr.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W })).status).toBe(201);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// GET /reservations — schedule by window (F06-T08, ADR-0016)
// ───────────────────────────────────────────────────────────────────────────
describe("GET /reservations — schedule by window (F06-T08)", () => {
  const DAY = { start: "2026-07-22T00:00:00Z", end: "2026-07-23T00:00:00Z" };
  const qs = (p: Record<string, string>) => `${RES}?${new URLSearchParams(p).toString()}`;

  it("returns live windows overlapping [start,end] with denormalised title + attendees + buffers", async () => {
    const viewer = await loginAs("VIEWER");
    const space = await seedSpace({ setupBufferMinutes: 240, teardownBufferMinutes: 120 });
    const req = await seedRequest({ title: "FinTech Conf", status: "SCHEDULED" });
    const resv = await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const res = await viewer.get(qs(DAY));
    expect(res.status).toBe(200);
    expect(res.body.messageKey).toBe("reservation.schedule.success");
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: resv.id, spaceId: space.id, requestId: req.id,
      requestTitle: "FinTech Conf", attendees: 100, status: "CONFIRMED",
      setupBufferMinutes: 240, teardownBufferMinutes: 120,
    });
    expect(res.body.data[0].start).toBe("2026-07-22T09:00:00.000Z");
  });

  it("excludes out-of-window reservations and expired (non-live) HELD holds", async () => {
    const viewer = await loginAs("VIEWER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: "2026-08-01T09:00:00Z", end: "2026-08-01T18:00:00Z", status: "CONFIRMED" });
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 1000) });

    const res = await viewer.get(qs(DAY));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("filters by spaceId and status", async () => {
    const viewer = await loginAs("VIEWER");
    const a = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const b = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space: a, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });
    await seedReservation({ space: b, requestId: req.id, start: W.start, end: W.end, status: "HELD" });

    expect((await viewer.get(qs({ ...DAY, spaceId: a.id }))).body.data).toHaveLength(1);
    const held = await viewer.get(qs({ ...DAY, status: "HELD" }));
    expect(held.body.data).toHaveLength(1);
    expect(held.body.data[0].spaceId).toBe(b.id);
  });

  it("422 on missing/inverted window; PARTNER → 403 (staff-only read)", async () => {
    const viewer = await loginAs("VIEWER");
    expect((await viewer.get(RES)).status).toBe(422);
    expect((await viewer.get(qs({ start: DAY.end, end: DAY.start }))).status).toBe(422);
    const partner = await loginAs("PARTNER");
    expect((await partner.get(qs(DAY))).status).toBe(403);
  });
});

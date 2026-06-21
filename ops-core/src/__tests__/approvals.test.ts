import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  loginAs,
  anon,
  resetDb,
  prisma,
  auditEntriesFor,
  type Client,
} from "./helpers/integration";
import { seedSpace, seedRequest, seedReservation } from "./helpers/fixtures";

const RES = "/api/v1/private/reservations";
const P = "/api/v1/private";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };
// A second, non-overlapping window for multi-hold fixtures (distinct day → no clash).
const W2 = { start: "2026-08-05T09:00:00Z", end: "2026-08-05T18:00:00Z" };

const approveUrl = (id: string) => `${P}/requests/${id}/approve`;
const rejectUrl = (id: string) => `${P}/requests/${id}/reject`;

beforeEach(resetDb);

/** Drive a request to PROPOSED with one live HELD reservation via the real hold path. */
async function proposeWithHold(client: Client) {
  const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
  const req = await seedRequest();
  const hold = await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
  expect(hold.status).toBe(201);
  return { reqId: req.id, reservationId: hold.body.data.id as string, spaceId: space.id };
}

/** A PROPOSED request with N live HELD reservations across distinct spaces/windows. */
async function proposeWithHolds(client: Client, n: number) {
  const req = await seedRequest({ status: "PROPOSED" });
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const r = await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD" });
    ids.push(r.id);
  }
  return { reqId: req.id, reservationIds: ids };
}

// ───────────────────────────────────────────────────────────────────────────
// APPROVE — happy path (PROPOSED → SCHEDULED, confirm holds, audit)
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/approve — happy path (F10-T01)", () => {
  it("MANAGER approve → reservation CONFIRMED (expiresAt cleared), request SCHEDULED, request.approve audit in one tx", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: reqId } })).status).toBe("PROPOSED");

    const res = await mgr.post(approveUrl(reqId));
    expect(res.status).toBe(200);
    expect(res.body.messageKey).toBe("request.approved");
    expect(res.body.data.status).toBe("SCHEDULED");

    const reservation = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });
    expect(reservation.status).toBe("CONFIRMED");
    expect(reservation.expiresAt).toBeNull();

    // request.approve audit attributed to the real actor, with before/after
    const audits = await auditEntriesFor("EventRequest", reqId);
    const approve = audits.find((a) => a.action === "request.approve");
    expect(approve).toMatchObject({
      action: "request.approve",
      actorId: mgr.user.id,
      actorName: mgr.user.name,
      before: { status: "PROPOSED" },
      after: { status: "SCHEDULED" },
    });

    // the hold was confirmed through the F06 path: one reservation.confirm audit
    expect(await prisma.auditEntry.count({ where: { action: "reservation.confirm", entityId: reservationId } })).toBe(1);
  });

  it("ADMIN may approve (clears the MANAGER+ floor)", async () => {
    const seeder = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(seeder);
    const admin = await loginAs("ADMIN");
    const res = await admin.post(approveUrl(reqId));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("SCHEDULED");
  });

  it("a PROPOSED request with NO holds still approves → SCHEDULED, audit, no reservation confirms", async () => {
    const mgr = await loginAs("MANAGER");
    const req = await seedRequest({ status: "PROPOSED" });

    const res = await mgr.post(approveUrl(req.id));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("SCHEDULED");
    // nothing to confirm → no reservation confirm audit
    expect(await prisma.auditEntry.count({ where: { action: "reservation.confirm" } })).toBe(0);
  });

  it("MULTI-HOLD: every HELD reservation is confirmed atomically and the request reaches SCHEDULED", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationIds } = await proposeWithHolds(mgr, 3);

    const res = await mgr.post(approveUrl(reqId));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("SCHEDULED");

    for (const id of reservationIds) {
      expect((await prisma.reservation.findUniqueOrThrow({ where: { id } })).status).toBe("CONFIRMED");
    }
    // one confirm audit per hold
    expect(await prisma.auditEntry.count({ where: { action: "reservation.confirm" } })).toBe(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// APPROVE — expired-hold edge (re-detect: retaken → 409, lapsed-uncontested → 410) (ADR-0015)
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/approve — expired hold re-detection (F10-T01, F10-T05)", () => {
  it("expired hold whose slot is still FREE (merely lapsed) → 410 reservation.hold_expired, never a stale confirm, state unchanged", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);
    await prisma.reservation.update({ where: { id: reservationId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await mgr.post(approveUrl(reqId));
    expect(res.status).toBe(410);
    expect(res.body.error).toBe("gone");
    expect(res.body.messageKey).toBe("reservation.hold_expired");

    // nothing committed: request still PROPOSED, hold still HELD, no approve audit
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: reqId } })).status).toBe("PROPOSED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe("HELD");
    expect(await prisma.auditEntry.count({ where: { action: "request.approve", entityId: reqId } })).toBe(0);
    expect(await prisma.auditEntry.count({ where: { action: "reservation.confirm", entityId: reservationId } })).toBe(0);
  });

  it("expired hold whose slot was RETAKEN → 409 conflict carrying the live conflicts[], state unchanged", async () => {
    const mgr = await loginAs("MANAGER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest({ status: "PROPOSED" });
    // my own hold, expired
    const mine = await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 1000) });
    // someone else grabbed the slot in the meantime
    const other = await seedRequest();
    await seedReservation({ space, requestId: other.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const res = await mgr.post(approveUrl(req.id));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("conflict");
    expect(res.body.messageKey).toBe("reservation.expired");
    expect(Array.isArray(res.body.conflicts)).toBe(true);
    expect(res.body.conflicts.length).toBeGreaterThan(0);
    expect(res.body.conflicts.some((c: { type: string }) => c.type === "SPACE_DOUBLE_BOOKED")).toBe(true);

    // unchanged
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PROPOSED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("HELD");
    expect(await prisma.auditEntry.count({ where: { action: "request.approve", entityId: req.id } })).toBe(0);
  });

  it("ATOMICITY: a multi-hold request where ONE hold expired confirms NOTHING (all-or-none); valid holds stay HELD", async () => {
    const mgr = await loginAs("MANAGER");
    const req = await seedRequest({ status: "PROPOSED" });
    const spaceA = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const spaceB = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    // a healthy live hold...
    const live = await seedReservation({ space: spaceA, requestId: req.id, start: W.start, end: W.end, status: "HELD" });
    // ...and an expired one whose slot got retaken (forces a hard 409 inside the tx)
    const expired = await seedReservation({ space: spaceB, requestId: req.id, start: W2.start, end: W2.end, status: "HELD", expiresAt: new Date(Date.now() - 1000) });
    const thief = await seedRequest();
    await seedReservation({ space: spaceB, requestId: thief.id, start: W2.start, end: W2.end, status: "CONFIRMED" });

    const res = await mgr.post(approveUrl(req.id));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("conflict");

    // NOTHING committed: request PROPOSED, BOTH of the request's holds still HELD (the
    // healthy one was NOT confirmed because the whole tx rolled back).
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PROPOSED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: live.id } })).status).toBe("HELD");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe("HELD");
    expect(await prisma.auditEntry.count({ where: { action: "reservation.confirm" } })).toBe(0);
    expect(await prisma.auditEntry.count({ where: { action: "request.approve", entityId: req.id } })).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// APPROVE — guards (RBAC, 404, invalid_transition)
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/approve — RBAC (F10-T03)", () => {
  it("VIEWER → 403, OPS → 403, PARTNER → 403, anon → 401; the request is never mutated", async () => {
    const seeder = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(seeder);
    const url = approveUrl(reqId);

    for (const role of ["VIEWER", "OPS", "PARTNER"] as const) {
      const client = await loginAs(role);
      const res = await client.post(url);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("forbidden");
    }

    const a = await anon().post(url).set("Idempotency-Key", randomUUID());
    expect(a.status).toBe(401);
    expect(a.body.error).toBe("unauthorized");

    // still untouched after every denied attempt
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: reqId } })).status).toBe("PROPOSED");
    expect(await prisma.auditEntry.count({ where: { action: "request.approve", entityId: reqId } })).toBe(0);
  });
});

describe("POST /requests/:id/approve — not-found & invalid transition (F10-T01)", () => {
  it("an unknown (well-formed) id → 404 not_found", async () => {
    const mgr = await loginAs("MANAGER");
    const res = await mgr.post(approveUrl("00000000-0000-4000-8000-000000000000"));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("approving from a non-PROPOSED state → 409 invalid_transition {from, to: APPROVED}", async () => {
    const mgr = await loginAs("MANAGER");
    for (const from of ["DRAFT", "APPROVED", "SCHEDULED", "COMPLETED", "REJECTED"] as const) {
      const req = await seedRequest({ status: from });
      const res = await mgr.post(approveUrl(req.id));
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("invalid_transition");
      expect(res.body.messageKey).toBe("request.invalid_transition");
      expect(res.body.from).toBe(from);
      expect(res.body.to).toBe("APPROVED");
      // unchanged
      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe(from);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// APPROVE — idempotency
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/approve — idempotency (F10-T01)", () => {
  it("a replay with the same key returns the original outcome; the mutation runs exactly once", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);
    const key = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";

    const first = await mgr.post(approveUrl(reqId), key);
    const replay = await mgr.post(approveUrl(reqId), key);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.data.status).toBe("SCHEDULED");
    expect(replay.body.data.id).toBe(first.body.data.id);

    // exactly one mutation: one approve audit, one confirm audit
    expect(await prisma.auditEntry.count({ where: { action: "request.approve", entityId: reqId } })).toBe(1);
    expect(await prisma.auditEntry.count({ where: { action: "reservation.confirm", entityId: reservationId } })).toBe(1);
  });

  it("the same key with a different body → 409 idempotency_key_mismatch (mutation not re-run)", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(mgr);
    const key = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";

    const first = await mgr.post(approveUrl(reqId), key).send({ note: "first" });
    expect(first.status).toBe(200);
    const mismatch = await mgr.post(approveUrl(reqId), key).send({ note: "second" });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error).toBe("idempotency_key_mismatch");
    expect(mismatch.body.messageKey).toBe("common.idempotency_mismatch");
    expect(await prisma.auditEntry.count({ where: { action: "request.approve", entityId: reqId } })).toBe(1);
  });

  it("a missing Idempotency-Key → 422 validation (field Idempotency-Key)", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(mgr);
    const res = await (mgr as unknown as { agent: import("supertest").SuperAgentTest }).agent
      .post(approveUrl(reqId))
      .set("x-csrf-token", mgr.csrf);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.fields["Idempotency-Key"]).toBe("validation.required");
  });

  it("a non-UUID Idempotency-Key → 422 validation.uuid", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(mgr);
    const res = await (mgr as unknown as { agent: import("supertest").SuperAgentTest }).agent
      .post(approveUrl(reqId))
      .set("x-csrf-token", mgr.csrf)
      .set("Idempotency-Key", "not-a-uuid");
    expect(res.status).toBe(422);
    expect(res.body.fields["Idempotency-Key"]).toBe("validation.uuid");
  });

  it("re-approving an already-SCHEDULED request with a FRESH key → 409 invalid_transition (no double-confirm)", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);
    expect((await mgr.post(approveUrl(reqId))).status).toBe(200);

    const again = await mgr.post(approveUrl(reqId)); // fresh auto key
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("invalid_transition");
    expect(again.body.from).toBe("SCHEDULED");
    expect(again.body.to).toBe("APPROVED");
    // still exactly one confirm — the second attempt never re-confirmed
    expect(await prisma.auditEntry.count({ where: { action: "reservation.confirm", entityId: reservationId } })).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// REJECT — happy path (release reservations, REJECTED + reason, audit)
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/reject — happy path (F10-T02)", () => {
  it("MANAGER reject with reason → hold RELEASED, request REJECTED with reason persisted + request.reject audit carrying the reason", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);

    const res = await mgr.post(rejectUrl(reqId)).send({ reason: "Date no longer available" });
    expect(res.status).toBe(200);
    expect(res.body.messageKey).toBe("request.rejected");
    expect(res.body.data).toMatchObject({ status: "REJECTED", rejectionReason: "Date no longer available" });

    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe("RELEASED");

    const audits = await auditEntriesFor("EventRequest", reqId);
    const reject = audits.find((a) => a.action === "request.reject");
    expect(reject).toMatchObject({
      action: "request.reject",
      actorId: mgr.user.id,
      reason: "Date no longer available",
      before: { status: "PROPOSED" },
      after: { status: "REJECTED" },
    });
    // the release went through the F06 path: one release audit
    expect(await prisma.auditEntry.count({ where: { action: "reservation.release", entityId: reservationId } })).toBe(1);
  });

  it("ADMIN may reject", async () => {
    const seeder = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(seeder);
    const admin = await loginAs("ADMIN");
    const res = await admin.post(rejectUrl(reqId)).send({ reason: "Cancelled by organizer" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REJECTED");
  });

  it("reject also releases CONFIRMED reservations (HELD ∪ CONFIRMED are released)", async () => {
    const mgr = await loginAs("MANAGER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest({ status: "SCHEDULED" });
    const confirmed = await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const res = await mgr.post(rejectUrl(req.id)).send({ reason: "Event scrapped after confirmation" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REJECTED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: confirmed.id } })).status).toBe("RELEASED");
    expect(await prisma.auditEntry.count({ where: { action: "reservation.release", entityId: confirmed.id } })).toBe(1);
  });

  it("MULTI-HOLD: every HELD reservation is released and the request reaches REJECTED", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationIds } = await proposeWithHolds(mgr, 3);

    const res = await mgr.post(rejectUrl(reqId)).send({ reason: "Conflicting priorities" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REJECTED");
    for (const id of reservationIds) {
      expect((await prisma.reservation.findUniqueOrThrow({ where: { id } })).status).toBe("RELEASED");
    }
    expect(await prisma.auditEntry.count({ where: { action: "reservation.release" } })).toBe(3);
  });

  it("a PROPOSED request with NO reservations still rejects → REJECTED, audited, no release events", async () => {
    const mgr = await loginAs("MANAGER");
    const req = await seedRequest({ status: "PROPOSED" });
    const res = await mgr.post(rejectUrl(req.id)).send({ reason: "Not viable" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REJECTED");
    expect(await prisma.auditEntry.count({ where: { action: "reservation.release" } })).toBe(0);
  });

  it("reject is allowed from every non-terminal state (DRAFT, PROPOSED, APPROVED, SCHEDULED)", async () => {
    const mgr = await loginAs("MANAGER");
    for (const from of ["DRAFT", "PROPOSED", "APPROVED", "SCHEDULED"] as const) {
      const req = await seedRequest({ status: from });
      const res = await mgr.post(rejectUrl(req.id)).send({ reason: `rejecting from ${from}` });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("REJECTED");
      expect(res.body.data.rejectionReason).toBe(`rejecting from ${from}`);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// REJECT — reason validation (3–500 chars)
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/reject — reason validation (F10-T02)", () => {
  it("a missing reason → 422 validation, field reason", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(mgr);
    const res = await mgr.post(rejectUrl(reqId)).send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.messageKey).toBe("validation.failed");
    expect(res.body.fields.reason).toBeDefined();
  });

  it("a too-short reason (< 3) → 422 fields.reason = validation.length", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(mgr);
    const res = await mgr.post(rejectUrl(reqId)).send({ reason: "no" });
    expect(res.status).toBe(422);
    expect(res.body.fields.reason).toBe("validation.length");
  });

  it("a too-long reason (> 500) → 422 fields.reason = validation.length", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(mgr);
    const res = await mgr.post(rejectUrl(reqId)).send({ reason: "x".repeat(501) });
    expect(res.status).toBe(422);
    expect(res.body.fields.reason).toBe("validation.length");
  });

  it("a non-string reason → 422 fields.reason = validation.invalid", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(mgr);
    const res = await mgr.post(rejectUrl(reqId)).send({ reason: 12345 });
    expect(res.status).toBe(422);
    expect(res.body.fields.reason).toBe("validation.invalid");
  });

  it("boundary reasons (exactly 3 and exactly 500 chars) are accepted", async () => {
    const mgr = await loginAs("MANAGER");

    const a = await proposeWithHold(mgr);
    const min = await mgr.post(rejectUrl(a.reqId)).send({ reason: "abc" });
    expect(min.status).toBe(200);
    expect(min.body.data.rejectionReason).toBe("abc");

    const b = await proposeWithHold(mgr);
    const longReason = "y".repeat(500);
    const max = await mgr.post(rejectUrl(b.reqId)).send({ reason: longReason });
    expect(max.status).toBe(200);
    expect(max.body.data.rejectionReason).toBe(longReason);
  });

  it("a failed reason validation mutates nothing (hold stays HELD, request stays PROPOSED)", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);
    expect((await mgr.post(rejectUrl(reqId)).send({ reason: "x" })).status).toBe(422);
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: reqId } })).status).toBe("PROPOSED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe("HELD");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// REJECT — guards (RBAC, 404, invalid_transition)
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/reject — RBAC (F10-T03)", () => {
  it("VIEWER → 403, OPS → 403, PARTNER → 403, anon → 401; the request is never mutated", async () => {
    const seeder = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(seeder);
    const url = rejectUrl(reqId);

    for (const role of ["VIEWER", "OPS", "PARTNER"] as const) {
      const client = await loginAs(role);
      const res = await client.post(url).send({ reason: "should not pass the floor" });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("forbidden");
    }

    const a = await anon().post(url).set("Idempotency-Key", randomUUID()).send({ reason: "anon attempt here" });
    expect(a.status).toBe(401);
    expect(a.body.error).toBe("unauthorized");

    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: reqId } })).status).toBe("PROPOSED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe("HELD");
  });
});

describe("POST /requests/:id/reject — not-found & invalid transition (F10-T02)", () => {
  it("an unknown (well-formed) id → 404 not_found", async () => {
    const mgr = await loginAs("MANAGER");
    const res = await mgr.post(rejectUrl("00000000-0000-4000-8000-000000000000")).send({ reason: "no such request" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("rejecting a terminal request (REJECTED / COMPLETED) → 409 invalid_transition {from, to: REJECTED}", async () => {
    const mgr = await loginAs("MANAGER");
    for (const from of ["REJECTED", "COMPLETED"] as const) {
      const req = await seedRequest({ status: from });
      const res = await mgr.post(rejectUrl(req.id)).send({ reason: `cannot reject from ${from}` });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("invalid_transition");
      expect(res.body.messageKey).toBe("request.invalid_transition");
      expect(res.body.from).toBe(from);
      expect(res.body.to).toBe("REJECTED");
      expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe(from);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// REJECT — idempotency
// ───────────────────────────────────────────────────────────────────────────
describe("POST /requests/:id/reject — idempotency (F10-T02)", () => {
  it("a replay with the same key returns the original outcome; the release runs exactly once", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);
    const key = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
    const body = { reason: "Out of capacity" };

    const first = await mgr.post(rejectUrl(reqId), key).send(body);
    const replay = await mgr.post(rejectUrl(reqId), key).send(body);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.data.status).toBe("REJECTED");
    expect(replay.body.data.rejectionReason).toBe("Out of capacity");

    expect(await prisma.auditEntry.count({ where: { action: "request.reject", entityId: reqId } })).toBe(1);
    expect(await prisma.auditEntry.count({ where: { action: "reservation.release", entityId: reservationId } })).toBe(1);
  });

  it("the same key with a different reason → 409 idempotency_key_mismatch", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(mgr);
    const key = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
    const first = await mgr.post(rejectUrl(reqId), key).send({ reason: "first reason here" });
    expect(first.status).toBe(200);
    const mismatch = await mgr.post(rejectUrl(reqId), key).send({ reason: "a different reason" });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error).toBe("idempotency_key_mismatch");
    expect(mismatch.body.messageKey).toBe("common.idempotency_mismatch");
  });

  it("a missing Idempotency-Key → 422 (field Idempotency-Key) — checked before the reason body", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId } = await proposeWithHold(mgr);
    const res = await (mgr as unknown as { agent: import("supertest").SuperAgentTest }).agent
      .post(rejectUrl(reqId))
      .set("x-csrf-token", mgr.csrf)
      .send({ reason: "valid reason here" });
    expect(res.status).toBe(422);
    expect(res.body.fields["Idempotency-Key"]).toBe("validation.required");
  });

  it("re-rejecting an already-REJECTED request with a FRESH key → 409 invalid_transition (no double-release)", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);
    expect((await mgr.post(rejectUrl(reqId)).send({ reason: "first rejection" })).status).toBe(200);

    const again = await mgr.post(rejectUrl(reqId)).send({ reason: "second rejection" });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("invalid_transition");
    expect(again.body.from).toBe("REJECTED");
    expect(again.body.to).toBe("REJECTED");
    // the release ran exactly once across both attempts
    expect(await prisma.auditEntry.count({ where: { action: "reservation.release", entityId: reservationId } })).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Resilience under serialization contention (runSerializable retry, never 500)
// ───────────────────────────────────────────────────────────────────────────
describe("approve/reject resilience: serializable aborts retry, never escape as 500 (F10)", () => {
  // Capture the pristine $transaction ONCE so the delegating mock never recurses.
  const ORIGINAL_TX = prisma.$transaction;
  afterEach(() => {
    (prisma as { $transaction: typeof ORIGINAL_TX }).$transaction = ORIGINAL_TX;
    vi.restoreAllMocks();
  });

  /** Make the FIRST serializable tx abort with a serialization error, then delegate
   *  every subsequent call to the pristine implementation so the retry succeeds. */
  function abortFirstSerializableOnce() {
    let aborted = false;
    const impl = ((arg: unknown, opts?: { isolationLevel?: unknown }) => {
      if (!aborted && typeof arg === "function" && opts?.isolationLevel === Prisma.TransactionIsolationLevel.Serializable) {
        aborted = true;
        return Promise.reject(new Prisma.PrismaClientKnownRequestError("could not serialize access due to read/write dependencies among transactions", { code: "P2034", clientVersion: "test" }));
      }
      return (ORIGINAL_TX as (a: unknown, o?: unknown) => unknown).call(prisma, arg, opts);
    }) as typeof prisma.$transaction;
    (prisma as { $transaction: typeof ORIGINAL_TX }).$transaction = impl;
  }

  it("approve retries past a transient serialization abort and still lands SCHEDULED", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);
    abortFirstSerializableOnce();

    const res = await mgr.post(approveUrl(reqId));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("SCHEDULED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe("CONFIRMED");
    // the retried body is idempotent: exactly one approve audit.
    expect(await prisma.auditEntry.count({ where: { action: "request.approve", entityId: reqId } })).toBe(1);
  });

  it("reject retries past a transient serialization abort and still lands REJECTED", async () => {
    const mgr = await loginAs("MANAGER");
    const { reqId, reservationId } = await proposeWithHold(mgr);
    abortFirstSerializableOnce();

    const res = await mgr.post(rejectUrl(reqId)).send({ reason: "retry then reject" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REJECTED");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } })).status).toBe("RELEASED");
    expect(await prisma.auditEntry.count({ where: { action: "request.reject", entityId: reqId } })).toBe(1);
  });
});

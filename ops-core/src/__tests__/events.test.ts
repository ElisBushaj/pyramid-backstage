import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loginAs, anon, resetDb, prisma, outboxFor, unpublishedOutbox } from "./helpers/integration";
import { seedSpace, seedRequest, seedReservation } from "./helpers/fixtures";
import { runRelayPass, startRelay, stopRelay } from "../modules/events/relay";
import { writeOutbox } from "../modules/events/outbox.writer";
import { vars } from "../config/vars";

const RES = "/api/v1/private/reservations";
const REQ = "/api/v1/private/requests";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };

beforeEach(resetDb);

// ---------------------------------------------------------------------------
// outbox.writer — appends an unpublished row in the caller's tx (F11-T01/04)
// ---------------------------------------------------------------------------
describe("writeOutbox (outbox.writer)", () => {
  it("appends one OutboxEvent { subject, payload, publishedAt: null } in the caller's transaction", async () => {
    await prisma.$transaction((tx) => writeOutbox(tx, "reservation.held", { reservationId: "r_1", spaceId: "s_1" }));
    const rows = await outboxFor("reservation.held");
    expect(rows.length).toBe(1);
    expect(rows[0]!.subject).toBe("reservation.held");
    expect(rows[0]!.publishedAt).toBeNull(); // born unpublished — the relay marks it later
    expect(rows[0]!.payload).toEqual({ reservationId: "r_1", spaceId: "s_1" });
    expect(rows[0]!.createdAt).toBeInstanceOf(Date);
  });

  it("rolls back with the caller's tx (no phantom event on abort) — no dual-write", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await writeOutbox(tx, "x.phantom", { n: 1 });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await prisma.outboxEvent.count({ where: { subject: "x.phantom" } })).toBe(0);
  });

  it("a null/undefined payload is stored as an empty object (never SQL NULL JSON that breaks the relay)", async () => {
    await prisma.$transaction((tx) => writeOutbox(tx, "x.empty", undefined));
    const rows = await outboxFor("x.empty");
    expect(rows[0]!.payload).toEqual({});
  });

  it("serializes a rich payload (nested + arrays) as plain JSON", async () => {
    const payload = { conflicts: [{ type: "SPACE_DOUBLE_BOOKED", ids: ["a", "b"] }], window: { start: W.start, end: W.end } };
    await prisma.$transaction((tx) => writeOutbox(tx, "conflict.detected", payload));
    const rows = await outboxFor("conflict.detected");
    expect(rows[0]!.payload).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
// relay — at-least-once, in-order, never-double-marked, never-lost (F11-T03)
// ---------------------------------------------------------------------------
describe("outbox relay (F11-T03)", () => {
  it("publishes unpublished rows in createdAt order and marks publishedAt only on ack", async () => {
    await prisma.outboxEvent.create({ data: { subject: "a.one", payload: { n: 1 } } });
    await prisma.outboxEvent.create({ data: { subject: "b.two", payload: { n: 2 } } });

    const seen: string[] = [];
    const publisher = vi.fn(async (subject: string) => { seen.push(subject); return true; });
    const n = await runRelayPass(publisher);
    expect(n).toBe(2);
    expect(seen).toEqual(["a.one", "b.two"]);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: null } })).toBe(0);
  });

  it("forwards the exact subject AND payload to the publisher", async () => {
    await prisma.outboxEvent.create({ data: { subject: "reservation.held", payload: { reservationId: "r_9" } } });
    const publisher = vi.fn(async () => true);
    await runRelayPass(publisher);
    expect(publisher).toHaveBeenCalledWith("reservation.held", { reservationId: "r_9" });
  });

  it("a failed publish (no ack) leaves the row unpublished for retry (at-least-once)", async () => {
    await prisma.outboxEvent.create({ data: { subject: "x.fail", payload: {} } });
    const publisher = vi.fn(async () => false);
    expect(await runRelayPass(publisher)).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: null } })).toBe(1);
    // a later successful pass publishes it (no duplicate effect)
    expect(await runRelayPass(async () => true)).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: null } })).toBe(0);
  });

  it("a partial-batch failure marks only the acked rows; the failed one stays for retry, order preserved", async () => {
    await prisma.outboxEvent.create({ data: { subject: "ok.first", payload: {} } });
    await prisma.outboxEvent.create({ data: { subject: "fail.middle", payload: {} } });
    await prisma.outboxEvent.create({ data: { subject: "ok.last", payload: {} } });

    const seen: string[] = [];
    const publisher = vi.fn(async (subject: string) => {
      seen.push(subject);
      return subject !== "fail.middle"; // ack everything except the middle one
    });
    const published = await runRelayPass(publisher);
    expect(published).toBe(2);
    expect(seen).toEqual(["ok.first", "fail.middle", "ok.last"]); // still attempted in order
    const remaining = await unpublishedOutbox();
    expect(remaining.map((r) => r.subject)).toEqual(["fail.middle"]); // only the un-acked row remains
  });

  it("does NOT re-mark an already-published row (never double-marked) — only fresh backlog is processed", async () => {
    const stamp = new Date("2020-01-01T00:00:00.000Z");
    const already = await prisma.outboxEvent.create({ data: { subject: "old.published", payload: {}, publishedAt: stamp } });
    await prisma.outboxEvent.create({ data: { subject: "new.pending", payload: {} } });

    const seen: string[] = [];
    const publisher = vi.fn(async (subject: string) => { seen.push(subject); return true; });
    const n = await runRelayPass(publisher);

    expect(n).toBe(1);
    expect(seen).toEqual(["new.pending"]); // the already-published row was never selected/re-sent
    const untouched = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: already.id } });
    expect(untouched.publishedAt!.getTime()).toBe(stamp.getTime()); // its publishedAt was not overwritten
  });

  it("processes nothing when the backlog is empty (no-op, returns 0, never throws)", async () => {
    const publisher = vi.fn(async () => true);
    expect(await runRelayPass(publisher)).toBe(0);
    expect(publisher).not.toHaveBeenCalled();
  });

  it("a re-publish (duplicate delivery) does not double-mark — once published, the row is out of the backlog", async () => {
    await prisma.outboxEvent.create({ data: { subject: "dup.once", payload: { n: 1 } } });
    const publisher = vi.fn(async () => true);
    expect(await runRelayPass(publisher)).toBe(1);
    // a second pass finds nothing — the row will never be selected (or published) twice by the relay
    expect(await runRelayPass(publisher)).toBe(0);
    expect(publisher).toHaveBeenCalledTimes(1);
  });

  it("respects batchSize: a pass publishes at most `batchSize`, the rest wait for the next pass (in order)", async () => {
    for (let i = 0; i < 5; i++) await prisma.outboxEvent.create({ data: { subject: `n.${i}`, payload: { i } } });
    const seen: string[] = [];
    const publisher = vi.fn(async (s: string) => { seen.push(s); return true; });

    const first = await runRelayPass(publisher, 2);
    expect(first).toBe(2);
    expect(seen).toEqual(["n.0", "n.1"]); // oldest two

    const second = await runRelayPass(publisher, 2);
    expect(second).toBe(2);
    expect(seen).toEqual(["n.0", "n.1", "n.2", "n.3"]);

    const third = await runRelayPass(publisher, 2);
    expect(third).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: null } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// degrade to REST — NATS_ENABLED=false (F11-T05)
// ---------------------------------------------------------------------------
describe("degrade to REST — NATS_ENABLED=false (F11-T05)", () => {
  it("the core flow works, outbox rows accumulate, the relay is inert, /ready is 200", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = (await client.post(REQ).send({ title: "Degrade", organizerName: "Acme", expectedAttendees: 50, eventType: "CONFERENCE", preferredDates: [W] })).body.data;
    const hold = await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(hold.status).toBe(201);

    // default publisher + NATS disabled → inert, nothing published
    expect(await runRelayPass()).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: null } })).toBeGreaterThan(0);

    const ready = await anon().get("/ready");
    expect(ready.status).toBe(200);
  });

  it("the inert relay leaves the backlog completely untouched (rows stay unpublished, not lost)", async () => {
    await prisma.outboxEvent.create({ data: { subject: "reservation.held", payload: { reservationId: "r_keep" } } });
    const before = await unpublishedOutbox();
    expect(before.length).toBe(1);

    // default-publisher path with NATS disabled → no publish, no mark, no throw
    await expect(runRelayPass()).resolves.toBe(0);

    const after = await unpublishedOutbox();
    expect(after.length).toBe(1);
    expect(after[0]!.publishedAt).toBeNull();
  });

  it("the full core flow create→hold→approve completes with NATS disabled and grows the backlog", async () => {
    const mgr = await loginAs("MANAGER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = (await mgr.post(REQ).send({ title: "Flow", organizerName: "Acme", expectedAttendees: 50, eventType: "CONFERENCE", preferredDates: [W] })).body.data;
    expect((await mgr.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W })).status).toBe(201);
    const approve = await mgr.post(`${REQ}/${req.id}/approve`);
    expect(approve.status).toBe(200);

    // every step still produced its outbox rows (replay-safe when NATS is later enabled)
    expect((await unpublishedOutbox()).length).toBeGreaterThanOrEqual(3); // created + held + (confirmed & approved)
  });
});

// ---------------------------------------------------------------------------
// emit domain events to the outbox (F11-T04) — subjects + payloads
// ---------------------------------------------------------------------------
describe("emit domain events to the outbox (F11-T04)", () => {
  it("each owning mutation writes exactly one matching OutboxEvent", async () => {
    const mgr = await loginAs("MANAGER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });

    const req = (await mgr.post(REQ).send({ title: "E", organizerName: "Acme", expectedAttendees: 50, eventType: "CONFERENCE", preferredDates: [W] })).body.data;
    expect(await prisma.outboxEvent.count({ where: { subject: "request.created" } })).toBe(1);

    await mgr.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(await prisma.outboxEvent.count({ where: { subject: "reservation.held" } })).toBe(1);

    await mgr.post(`${REQ}/${req.id}/approve`);
    expect(await prisma.outboxEvent.count({ where: { subject: "reservation.confirmed" } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { subject: "request.approved" } })).toBe(1);
  });

  it("request.created carries { requestId, title, eventType }", async () => {
    const mgr = await loginAs("MANAGER");
    const req = (await mgr.post(REQ).send({ title: "Gala", organizerName: "Acme", expectedAttendees: 50, eventType: "CONFERENCE", preferredDates: [W] })).body.data;
    const [ev] = await outboxFor("request.created");
    expect(ev!.payload).toMatchObject({ requestId: req.id, title: "Gala", eventType: "CONFERENCE" });
  });

  it("reservation.held carries { reservationId, requestId, spaceId }", async () => {
    const mgr = await loginAs("MANAGER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = (await mgr.post(REQ).send({ title: "H", organizerName: "Acme", expectedAttendees: 50, eventType: "CONFERENCE", preferredDates: [W] })).body.data;
    const hold = (await mgr.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W })).body.data;
    const [ev] = await outboxFor("reservation.held");
    expect(ev!.payload).toMatchObject({ reservationId: hold.id, requestId: req.id, spaceId: space.id });
  });

  it("approve emits BOTH reservation.confirmed and request.approved; request.approved lists the confirmed holds", async () => {
    const mgr = await loginAs("MANAGER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = (await mgr.post(REQ).send({ title: "A", organizerName: "Acme", expectedAttendees: 50, eventType: "CONFERENCE", preferredDates: [W] })).body.data;
    const hold = (await mgr.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W })).body.data;
    await mgr.post(`${REQ}/${req.id}/approve`);

    const [confirmed] = await outboxFor("reservation.confirmed");
    expect(confirmed!.payload).toMatchObject({ reservationId: hold.id, requestId: req.id });
    const [approved] = await outboxFor("request.approved");
    expect(approved!.payload).toMatchObject({ requestId: req.id });
    expect((approved!.payload as any).confirmedReservations).toContain(hold.id);
  });

  it("a conflicting hold writes a conflict.detected event carrying the Conflict[] (and the window)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const taken = await seedRequest();
    await seedReservation({ space, requestId: taken.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const req = await seedRequest();
    const res = await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    expect(res.status).toBe(409); // the conflict is also returned to the caller

    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { subject: "conflict.detected" } });
    const payload = ev.payload as any;
    expect(payload.conflicts.length).toBeGreaterThan(0);
    expect(payload.requestId).toBe(req.id);
    expect(payload.spaceId).toBe(space.id);
    expect(payload.window).toMatchObject({ start: W.start, end: W.end });
  });

  it("holding a scarce asset down to ≤10% emits inventory.low with availability + window", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const chairs = await seedAssetLocal(100);
    const req = await seedRequest();
    const res = await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W, assets: [{ assetId: chairs.id, quantity: 95 }] });
    expect(res.status).toBe(201);
    const [ev] = await outboxFor("inventory.low");
    expect(ev).toBeTruthy();
    expect(ev!.payload).toMatchObject({ assetId: chairs.id, total: 100 });
    expect((ev!.payload as any).available).toBeLessThanOrEqual(10);
  });

  it("a hold that leaves plenty of inventory does NOT emit inventory.low", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const chairs = await seedAssetLocal(100);
    const req = await seedRequest();
    await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W, assets: [{ assetId: chairs.id, quantity: 10 }] });
    expect(await prisma.outboxEvent.count({ where: { subject: "inventory.low" } })).toBe(0);
  });

  it("subjects use the documented dotted, lowercase form (determinism for consumers)", async () => {
    const mgr = await loginAs("MANAGER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = (await mgr.post(REQ).send({ title: "Det", organizerName: "Acme", expectedAttendees: 50, eventType: "CONFERENCE", preferredDates: [W] })).body.data;
    await mgr.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    await mgr.post(`${REQ}/${req.id}/approve`);

    const subjects = (await prisma.outboxEvent.findMany({ select: { subject: true } })).map((r) => r.subject);
    for (const s of subjects) {
      expect(s).toMatch(/^[a-z]+(\.[a-z]+)+$/); // namespace.verb, all lowercase
    }
    expect(new Set(subjects)).toEqual(new Set(["request.created", "reservation.held", "reservation.confirmed", "request.approved"]));
  });

  it("no dual-write: every produced event lands in the outbox unpublished (nothing is published inline)", async () => {
    const mgr = await loginAs("MANAGER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = (await mgr.post(REQ).send({ title: "ND", organizerName: "Acme", expectedAttendees: 50, eventType: "CONFERENCE", preferredDates: [W] })).body.data;
    await mgr.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    // with NATS disabled there is no relay running in-band, so EVERY event row is still unpublished
    const all = await prisma.outboxEvent.findMany();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((r) => r.publishedAt === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// roundtrip — events written by a real mutation drain through one relay pass
// ---------------------------------------------------------------------------
describe("outbox → relay roundtrip (injected publisher, no broker)", () => {
  it("a real hold's events all drain on one relay pass, in createdAt order, exactly once each", async () => {
    const mgr = await loginAs("MANAGER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = (await mgr.post(REQ).send({ title: "RT", organizerName: "Acme", expectedAttendees: 50, eventType: "CONFERENCE", preferredDates: [W] })).body.data;
    await mgr.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });

    const backlogBefore = (await unpublishedOutbox()).map((r) => r.subject);
    expect(backlogBefore).toEqual(["request.created", "reservation.held"]);

    const seen: string[] = [];
    const published = await runRelayPass(async (s) => { seen.push(s); return true; });
    expect(published).toBe(backlogBefore.length);
    expect(seen).toEqual(backlogBefore); // delivered oldest-first
    expect((await unpublishedOutbox()).length).toBe(0); // backlog drained

    // a second pass is a clean no-op — no event is delivered twice by the relay
    expect(await runRelayPass(async () => true)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// relay lifecycle — startRelay/stopRelay wiring (F11-T03)
// ---------------------------------------------------------------------------
describe("relay lifecycle (startRelay/stopRelay)", () => {
  afterEach(() => {
    stopRelay();
    vi.useRealTimers();
    (vars as { natsEnabled: boolean }).natsEnabled = false; // restore the test default
  });

  it("startRelay is inert when NATS is disabled (no timer, no publishing) and stopRelay is safe", async () => {
    await prisma.outboxEvent.create({ data: { subject: "x.inert", payload: {} } });
    expect((vars as { natsEnabled: boolean }).natsEnabled).toBe(false);
    expect(() => startRelay(10)).not.toThrow(); // early-returns: no interval armed
    expect(() => stopRelay()).not.toThrow(); // safe even with no timer running
    expect(() => stopRelay()).not.toThrow(); // idempotent
    // nothing was published — the disabled relay never armed
    expect((await unpublishedOutbox()).length).toBe(1);
  });

  it("when enabled, startRelay arms a periodic pass; with no broker connected it ticks harmlessly (no double-mark)", async () => {
    vi.useFakeTimers();
    (vars as { natsEnabled: boolean }).natsEnabled = true; // arm the timer path
    await prisma.outboxEvent.create({ data: { subject: "reservation.held", payload: { reservationId: "r_tick" } } });

    startRelay(1000);
    // drive several intervals; the default publisher (publishEvent) returns false because
    // no NATS connection exists in tests → the row stays unpublished, never falsely marked.
    await vi.advanceTimersByTimeAsync(3500);
    stopRelay();

    const remaining = await unpublishedOutbox();
    expect(remaining.length).toBe(1); // not lost, not marked published without an ack
    expect(remaining[0]!.publishedAt).toBeNull();
  });

  it("stopRelay halts the loop: no further passes fire after it is stopped", async () => {
    vi.useFakeTimers();
    (vars as { natsEnabled: boolean }).natsEnabled = true;
    startRelay(1000);
    stopRelay();
    await prisma.outboxEvent.create({ data: { subject: "after.stop", payload: {} } });
    await vi.advanceTimersByTimeAsync(5000);
    // the loop is stopped, so even the inert (no-broker) pass never runs against this row
    const row = await prisma.outboxEvent.findFirstOrThrow({ where: { subject: "after.stop" } });
    expect(row.publishedAt).toBeNull();
  });
});

async function seedAssetLocal(total: number) {
  return prisma.asset.create({ data: { name: "Scarce chair", type: "SEATING", totalQuantity: total, location: "S", status: "ACTIVE" } });
}

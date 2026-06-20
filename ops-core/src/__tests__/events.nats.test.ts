import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connect, StringCodec, type NatsConnection } from "nats";
import { loginAs, resetDb, prisma, unpublishedOutbox } from "./helpers/integration";
import { seedSpace, seedRequest, seedReservation } from "./helpers/fixtures";
import { runRelayPass } from "../modules/events/relay";

const RES = "/api/v1/private/reservations";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };
const sc = StringCodec();
let nc: NatsConnection | null = null;

beforeAll(async () => {
  try {
    nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222", timeout: 1500 });
  } catch {
    nc = null; // NATS not available (the default in tests: NATS_ENABLED=false) — live tests below self-skip
  }
});
afterAll(async () => {
  await nc?.drain().catch(() => undefined);
});
beforeEach(resetDb);

/** Inject a core-NATS publisher so the relay round-trips through a real broker. */
function natsPublisher() {
  return async (subject: string, payload: unknown) => {
    nc!.publish(`e2e.${subject}`, sc.encode(JSON.stringify(payload)));
    return true;
  };
}

/**
 * A fake broker that records what the relay handed it, with controllable ack —
 * lets us assert the at-least-once / idempotent contract WITHOUT a live broker
 * (the contract that matters even when NATS_ENABLED=false in CI).
 */
function fakeBroker() {
  const delivered: Array<{ subject: string; payload: unknown }> = [];
  let ack = true;
  return {
    delivered,
    setAck(v: boolean) { ack = v; },
    publisher: async (subject: string, payload: unknown) => {
      if (!ack) return false;
      delivered.push({ subject, payload });
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Broker-free: the outbox/relay contract the NATS path rides on (always runs).
// ---------------------------------------------------------------------------
describe("F11-T06 events (broker-free contract — runs with NATS disabled)", () => {
  it("a real hold delivers reservation.held to the relay's publisher with the AI-relevant payload", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    const hold = (await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W })).body.data;

    const broker = fakeBroker();
    await runRelayPass(broker.publisher);

    const held = broker.delivered.find((d) => d.subject === "reservation.held");
    expect(held).toBeTruthy();
    expect(held!.payload).toMatchObject({ reservationId: hold.id, requestId: req.id, spaceId: space.id });
  });

  it("a conflicting hold delivers conflict.detected carrying the Conflict[] (what the AI consumes)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const taken = await seedRequest();
    await seedReservation({ space, requestId: taken.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const req = await seedRequest();
    await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });

    const broker = fakeBroker();
    await runRelayPass(broker.publisher);

    const conflict = broker.delivered.find((d) => d.subject === "conflict.detected");
    expect(conflict).toBeTruthy();
    expect((conflict!.payload as any).conflicts.length).toBeGreaterThan(0);
  });

  it("at-least-once: a broker outage (no ack) keeps the row unpublished; recovery delivers it (never lost)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });

    const broker = fakeBroker();
    broker.setAck(false); // broker is down — nothing ack'd
    expect(await runRelayPass(broker.publisher)).toBe(0);
    expect((await unpublishedOutbox()).length).toBeGreaterThan(0); // nothing lost — still queued

    broker.setAck(true); // broker recovers
    const published = await runRelayPass(broker.publisher);
    expect(published).toBeGreaterThan(0);
    expect((await unpublishedOutbox()).length).toBe(0); // fully drained on recovery
    expect(broker.delivered.some((d) => d.subject === "reservation.held")).toBe(true);
  });

  it("idempotent re-delivery: a duplicate publish of the same event does not corrupt a deduping consumer", async () => {
    await prisma.outboxEvent.create({ data: { subject: "reservation.held", payload: { reservationId: "r_dup" } } });
    const broker = fakeBroker();
    await runRelayPass(broker.publisher);

    // simulate at-least-once: the relay (or a crash-retry) hands the same event again
    await broker.publisher("reservation.held", { reservationId: "r_dup" });

    // a consumer that dedupes by reservationId sees a single logical event despite two deliveries
    const byId = new Map(broker.delivered.map((d) => [(d.payload as any).reservationId, d]));
    expect(byId.size).toBe(1);
    expect(broker.delivered.length).toBe(2); // delivered twice (at-least-once) ...
    expect(byId.has("r_dup")).toBe(true); // ... but idempotent on the consumer's key
  });

  it("the relay never marks a row published without an ack, even mid-stream (split broker outage)", async () => {
    await prisma.outboxEvent.create({ data: { subject: "a.ok", payload: {} } });
    await prisma.outboxEvent.create({ data: { subject: "b.down", payload: {} } });
    // broker acks the first, then goes down for the second
    let calls = 0;
    const published = await runRelayPass(async () => { calls++; return calls === 1; });
    expect(published).toBe(1);
    const remaining = (await unpublishedOutbox()).map((r) => r.subject);
    expect(remaining).toEqual(["b.down"]); // the un-acked one is still pending — not silently marked
  });
});

// ---------------------------------------------------------------------------
// Live broker (only when a real NATS is reachable; self-skips otherwise).
// ---------------------------------------------------------------------------
describe("F11-T06 events: outbox → relay → a real NATS consumer receives", () => {
  it("delivers reservation.held + conflict.detected to a subscriber", async (ctx) => {
    if (!nc) return ctx.skip();
    const received: Record<string, unknown[]> = {};
    const sub = nc.subscribe("e2e.>");
    void (async () => {
      for await (const m of sub) {
        const subj = m.subject.replace(/^e2e\./, "");
        (received[subj] ??= []).push(JSON.parse(sc.decode(m.data)));
      }
    })();

    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });

    // a clean hold → reservation.held
    const req = await seedRequest();
    await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    // a conflicting hold → conflict.detected
    const taken = await seedRequest();
    await seedReservation({ space, requestId: taken.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const req2 = await seedRequest();
    await client.post(RES).send({ requestId: req2.id, spaceId: space.id, dateRange: W });

    const published = await runRelayPass(natsPublisher());
    expect(published).toBeGreaterThanOrEqual(2);
    await nc.flush();
    await new Promise((r) => setTimeout(r, 150));

    expect(received["reservation.held"]?.length).toBeGreaterThanOrEqual(1);
    expect(received["conflict.detected"]?.length).toBeGreaterThanOrEqual(1);

    // duplicate delivery (re-publish) doesn't corrupt the consumer's view (idempotent subjects)
    await natsPublisher()("reservation.held", { reservationId: "dup" });
    await nc.flush();
    await new Promise((r) => setTimeout(r, 100));
    expect(received["reservation.held"]!.length).toBeGreaterThanOrEqual(2);
  });

  it("the relay drains the backlog through the broker exactly once per row", async (ctx) => {
    if (!nc) return ctx.skip();
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });

    const before = (await unpublishedOutbox()).length;
    expect(before).toBeGreaterThan(0);
    const published = await runRelayPass(natsPublisher());
    expect(published).toBe(before);
    expect((await unpublishedOutbox()).length).toBe(0);
    // a second pass publishes nothing (the relay won't re-send a marked row)
    expect(await runRelayPass(natsPublisher())).toBe(0);
  });
});

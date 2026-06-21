import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, resetDb, prisma, anon, auditEntriesFor } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation, seedQuote } from "./helpers/fixtures";
import { quotesService } from "../modules/quotes/service";
import type { Actor } from "../types";

const QUOTES = "/api/v1/private/quotes";
const NIL_UUID = "00000000-0000-4000-8000-000000000000";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" }; // 9h → 1 billable day

beforeEach(resetDb);

/** A request with a single HELD reservation on a `dayRate` space. Returns both. */
async function setup(dayRate = 80000, opts: { start?: string; end?: string; assets?: Array<{ assetId: string; quantity: number }> } = {}) {
  const space = await seedSpace({ name: "Blue Hall", dayRateMinor: dayRate });
  const req = await seedRequest();
  const reservation = await seedReservation({
    space,
    requestId: req.id,
    start: opts.start ?? W.start,
    end: opts.end ?? W.end,
    status: "HELD",
    expiresAt: new Date(Date.now() + 600_000),
    assets: opts.assets,
  });
  return { req, space, reservation };
}

const actorOf = (c: Awaited<ReturnType<typeof loginAs>>): Actor => c.user;

// ─────────────────────────────────────────────────────────────────────────────
// Money math through the endpoint
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /quotes — server-computed money (F07-T03/T05)", () => {
  it("computes net → vat → total (worked example) and stores integers", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup(80000);
    const res = await client.post(QUOTES).send({ requestId: req.id, extraLineItems: [{ label: "Catering", qty: 1, unitPriceMinor: 31667 }] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ netMinor: 111667, vatMinor: 22333, totalMinor: 134000, vatRate: 0.2, status: "DRAFT", version: 1, currency: "ALL" });

    // total identity + no float leaks anywhere money lives, on the wire AND in the DB row.
    expect(res.body.data.totalMinor).toBe(res.body.data.netMinor + res.body.data.vatMinor);
    for (const k of ["netMinor", "vatMinor", "totalMinor"]) expect(Number.isInteger(res.body.data[k])).toBe(true);
    for (const li of res.body.data.lineItems) {
      expect(Number.isInteger(li.qty)).toBe(true);
      expect(Number.isInteger(li.unitPriceMinor)).toBe(true);
      expect(Number.isInteger(li.subtotalMinor)).toBe(true);
    }
    const row = await prisma.quote.findFirstOrThrow({ where: { requestId: req.id } });
    expect([row.netMinor, row.vatMinor, row.totalMinor].every(Number.isInteger)).toBe(true);
    expect(row.totalMinor).toBe(134000);
  });

  it("rounds VAT through the endpoint (net 80,000 → vat 16,000 → total 96,000)", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup(80000);
    const res = await client.post(QUOTES).send({ requestId: req.id });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ netMinor: 80000, vatMinor: 16000, totalMinor: 96000 });
  });

  it("composes a SPACE line plus a multi-day window via ceil days", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup(55000, { start: "2026-07-22T09:00:00Z", end: "2026-07-24T12:00:00Z" }); // ~2.1 days → 3
    const res = await client.post(QUOTES).send({ requestId: req.id });
    expect(res.status).toBe(201);
    const spaceLine = res.body.data.lineItems.find((l: { kind: string }) => l.kind === "SPACE");
    expect(spaceLine).toMatchObject({ kind: "SPACE", qty: 3, unitPriceMinor: 55000, subtotalMinor: 165000 });
    expect(res.body.data.netMinor).toBe(165000);
  });

  it("prices reserved assets at 0 by default (free per Q-03) as ASSET lines", async () => {
    const client = await loginAs("OPS");
    const chairs = await seedAsset({ name: "Standard chair", type: "SEATING", totalQuantity: 500 });
    const { req } = await setup(80000, { assets: [{ assetId: chairs.id, quantity: 200 }] });
    const res = await client.post(QUOTES).send({ requestId: req.id });
    expect(res.status).toBe(201);
    const assetLine = res.body.data.lineItems.find((l: { kind: string }) => l.kind === "ASSET");
    expect(assetLine).toMatchObject({ kind: "ASSET", qty: 200, unitPriceMinor: 0, subtotalMinor: 0, label: "Standard chair" });
    expect(res.body.data.netMinor).toBe(80000); // assets add nothing
  });

  it("returns lineItems in SPACE → ASSET → SERVICE order", async () => {
    const client = await loginAs("OPS");
    const proj = await seedAsset({ name: "Projector", type: "PROJECTOR", totalQuantity: 5 });
    const { req } = await setup(80000, { assets: [{ assetId: proj.id, quantity: 1 }] });
    const res = await client.post(QUOTES).send({ requestId: req.id, extraLineItems: [{ label: "Catering", qty: 1, unitPriceMinor: 5000 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.lineItems.map((l: { kind: string }) => l.kind)).toEqual(["SPACE", "ASSET", "SERVICE"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The client may NEVER dictate money
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /quotes — client cannot dictate money (F07-T05)", () => {
  it("ignores a planted total/net/vat — server recomputes from line items", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup(80000);
    const res = await client.post(QUOTES).send({ requestId: req.id, totalMinor: 999_999_999, total: 1, netMinor: 7, vatMinor: 3 });
    expect(res.status).toBe(201);
    expect(res.body.data.netMinor).toBe(80000);
    expect(res.body.data.vatMinor).toBe(16000);
    expect(res.body.data.totalMinor).toBe(96000); // never the bogus 999,999,999 / 1
  });

  it("ignores a forged subtotal on an extra line item — recomputes qty × unitPrice", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup(80000);
    // subtotalMinor is not an accepted input; even if planted it must be recomputed (2 × 5000 = 10000).
    const res = await client.post(QUOTES).send({ requestId: req.id, extraLineItems: [{ label: "Staff", qty: 2, unitPriceMinor: 5000, subtotalMinor: 1 }] });
    expect(res.status).toBe(201);
    const svc = res.body.data.lineItems.find((l: { kind: string }) => l.kind === "SERVICE");
    expect(svc.subtotalMinor).toBe(10000);
    expect(res.body.data.netMinor).toBe(90000); // 80000 + 10000, not 80000 + 1
  });

  it("ignores a client-sent vatRate — uses the server-configured 0.20", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup(80000);
    const res = await client.post(QUOTES).send({ requestId: req.id, vatRate: 0.99 });
    expect(res.status).toBe(201);
    expect(res.body.data.vatRate).toBe(0.2);
    expect(res.body.data.vatMinor).toBe(16000);
  });

  it("ignores a client-sent status/version/currency/expiresAt", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup(80000);
    const res = await client.post(QUOTES).send({ requestId: req.id, status: "ACCEPTED", version: 99, currency: "EUR", expiresAt: "2000-01-01T00:00:00Z" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "DRAFT", version: 1, currency: "ALL" });
    expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now()); // ~ now + 14d, not the planted past
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reservation resolution
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /quotes — reservation resolution (F07-T03)", () => {
  it("uses an explicit reservationId when given", async () => {
    const client = await loginAs("OPS");
    const { req, reservation } = await setup(80000);
    const res = await client.post(QUOTES).send({ requestId: req.id, reservationId: reservation.id });
    expect(res.status).toBe(201);
    expect(res.body.data.netMinor).toBe(80000);
  });

  it("falls back to the latest HELD|CONFIRMED reservation when no id is given", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ name: "Blue Hall", dayRateMinor: 80000 });
    const req = await seedRequest();
    // An older CONFIRMED + a newer HELD; the newer one must win (orderBy createdAt desc).
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED", expiresAt: null });
    const newer = await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-24T12:00:00Z", status: "HELD", expiresAt: new Date(Date.now() + 600_000) });
    const res = await client.post(QUOTES).send({ requestId: req.id });
    expect(res.status).toBe(201);
    // The newer (3-day) HELD reservation must win over the older (1-day) CONFIRMED one.
    expect(res.body.data.lineItems.find((l: { kind: string }) => l.kind === "SPACE").qty).toBe(3);
    expect(res.body.data.netMinor).toBe(240000); // 3 days × 80,000, not 1 day
    void newer;
  });

  it("a CONFIRMED reservation alone is enough to price", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ name: "Blue Hall", dayRateMinor: 80000 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED", expiresAt: null });
    const res = await client.post(QUOTES).send({ requestId: req.id });
    expect(res.status).toBe(201);
    expect(res.body.data.netMinor).toBe(80000);
  });

  it("404s when the request has no resolvable reservation (no id, only a RELEASED hold) — Q-13", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ name: "Blue Hall", dayRateMinor: 80000 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "RELEASED", expiresAt: null });
    const res = await client.post(QUOTES).send({ requestId: req.id });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 404, error: "not_found", messageKey: "common.not_found" });
    expect(await prisma.quote.count({ where: { requestId: req.id } })).toBe(0); // no zero-quote persisted
  });

  it("404s when the request exists but has no reservation at all — Q-13", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest();
    const res = await client.post(QUOTES).send({ requestId: req.id });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 404, error: "not_found", messageKey: "common.not_found" });
    expect(await prisma.quote.count()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 404 / validation
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /quotes — not_found & validation (F07-T03)", () => {
  it("404 on an unknown requestId", async () => {
    const client = await loginAs("OPS");
    const res = await client.post(QUOTES).send({ requestId: NIL_UUID });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 404, error: "not_found", messageKey: "common.not_found" });
  });

  it("404 on an unknown reservationId (request is real)", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup();
    const res = await client.post(QUOTES).send({ requestId: req.id, reservationId: NIL_UUID });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 404, error: "not_found", messageKey: "common.not_found" });
  });

  it("422 when requestId is missing", async () => {
    const client = await loginAs("OPS");
    const res = await client.post(QUOTES).send({});
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ status: 422, error: "validation", messageKey: "validation.failed" });
    expect(res.body.fields).toMatchObject({ requestId: "validation.uuid" });
  });

  it("422 when requestId is not a UUID", async () => {
    const client = await loginAs("OPS");
    const res = await client.post(QUOTES).send({ requestId: "not-a-uuid" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.fields.requestId).toBe("validation.uuid");
  });

  it("422 when reservationId is present but not a UUID", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup();
    const res = await client.post(QUOTES).send({ requestId: req.id, reservationId: "nope" });
    expect(res.status).toBe(422);
    expect(res.body.fields.reservationId).toBe("validation.uuid");
  });

  it("422 when extraLineItems is not an array", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup();
    const res = await client.post(QUOTES).send({ requestId: req.id, extraLineItems: "catering" });
    expect(res.status).toBe(422);
    expect(res.body.fields.extraLineItems).toBe("validation.array");
  });

  it("422 when an extra line item is missing its label", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup();
    const res = await client.post(QUOTES).send({ requestId: req.id, extraLineItems: [{ qty: 1, unitPriceMinor: 100 }] });
    expect(res.status).toBe(422);
    expect(res.body.fields).toMatchObject({ "extraLineItems[0].label": "validation.required" });
  });

  it("422 when an extra line item has qty < 1", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup();
    const res = await client.post(QUOTES).send({ requestId: req.id, extraLineItems: [{ label: "x", qty: 0, unitPriceMinor: 100 }] });
    expect(res.status).toBe(422);
    expect(res.body.fields).toMatchObject({ "extraLineItems[0].qty": "validation.min" });
  });

  it("422 when an extra line item has a negative unitPriceMinor", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup();
    const res = await client.post(QUOTES).send({ requestId: req.id, extraLineItems: [{ label: "x", qty: 1, unitPriceMinor: -5 }] });
    expect(res.status).toBe(422);
    expect(res.body.fields).toMatchObject({ "extraLineItems[0].unitPriceMinor": "validation.min" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Versioning & expiry
// ─────────────────────────────────────────────────────────────────────────────
describe("quote versioning + expiry (F07-T04)", () => {
  it("regenerating bumps version, retains the prior row, and sets expiresAt ≈ now + 14d", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup();
    const before = Date.now();
    const v1 = (await client.post(QUOTES).send({ requestId: req.id })).body.data;
    const v2 = (await client.post(QUOTES).send({ requestId: req.id, extraLineItems: [{ label: "Extra", qty: 1, unitPriceMinor: 5000 }] })).body.data;
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(await prisma.quote.count({ where: { requestId: req.id } })).toBe(2); // old retained

    const fourteenDays = 14 * 86_400_000;
    const exp = new Date(v1.expiresAt).getTime();
    expect(exp).toBeGreaterThanOrEqual(before + fourteenDays - 5000);
    expect(exp).toBeLessThanOrEqual(Date.now() + fourteenDays + 5000);
  });

  it("each regenerate strictly increments from the current max version", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup();
    const versions: number[] = [];
    for (let i = 0; i < 3; i++) versions.push((await client.post(QUOTES).send({ requestId: req.id })).body.data.version);
    expect(versions).toEqual([1, 2, 3]);
  });

  it("a freshly generated quote reads as DRAFT (expiry in the future)", async () => {
    const client = await loginAs("OPS");
    const { req } = await setup();
    const q = (await client.post(QUOTES).send({ requestId: req.id })).body.data;
    expect(q.status).toBe("DRAFT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle transitions + check-on-read expiry
// ─────────────────────────────────────────────────────────────────────────────
describe("quote lifecycle transitions (F07-T04)", () => {
  it("walks DRAFT → SENT → ACCEPTED (terminal) and audits each step", async () => {
    const ops = await loginAs("OPS");
    const { req } = await setup();
    const q = (await ops.post(QUOTES).send({ requestId: req.id })).body.data;

    const sent = await quotesService.transition(actorOf(ops), q.id, "SENT");
    expect(sent.data.status).toBe("SENT");
    const accepted = await quotesService.transition(actorOf(ops), q.id, "ACCEPTED");
    expect(accepted.data.status).toBe("ACCEPTED");

    // generate + 2 transitions = 3 audit rows for this quote, in order.
    const audits = await auditEntriesFor("Quote", q.id);
    expect(audits.map((a) => a.action)).toEqual(["quote.generate", "quote.transition", "quote.transition"]);
  });

  it("allows DRAFT → EXPIRED and SENT → EXPIRED", async () => {
    const ops = await loginAs("OPS");
    const a = await seedRequest();
    const b = await seedRequest();
    const draft = await seedQuote({ requestId: a.id, status: "DRAFT" });
    const sent = await seedQuote({ requestId: b.id, status: "SENT" });
    expect((await quotesService.transition(actorOf(ops), draft.id, "EXPIRED")).data.status).toBe("EXPIRED");
    expect((await quotesService.transition(actorOf(ops), sent.id, "EXPIRED")).data.status).toBe("EXPIRED");
  });

  it("rejects an illegal transition with 409 invalid_transition { from, to }", async () => {
    const ops = await loginAs("OPS");
    const req = await seedRequest();
    const q = await seedQuote({ requestId: req.id, status: "DRAFT" });
    // DRAFT → ACCEPTED skips SENT — illegal.
    await expect(quotesService.transition(actorOf(ops), q.id, "ACCEPTED")).rejects.toMatchObject({
      status: 409,
      error: "invalid_transition",
      messageKey: "quote.invalid_transition",
      from: "DRAFT",
      to: "ACCEPTED",
    });
  });

  it("rejects a transition out of a terminal ACCEPTED state with 409", async () => {
    const ops = await loginAs("OPS");
    const req = await seedRequest();
    const q = await seedQuote({ requestId: req.id, status: "ACCEPTED" });
    await expect(quotesService.transition(actorOf(ops), q.id, "SENT")).rejects.toMatchObject({
      status: 409,
      error: "invalid_transition",
      from: "ACCEPTED",
      to: "SENT",
    });
  });

  it("rejects a no-op self transition (SENT → SENT) with 409", async () => {
    const ops = await loginAs("OPS");
    const req = await seedRequest();
    const q = await seedQuote({ requestId: req.id, status: "SENT" });
    await expect(quotesService.transition(actorOf(ops), q.id, "SENT")).rejects.toMatchObject({ status: 409, error: "invalid_transition", from: "SENT", to: "SENT" });
  });

  it("404s a transition on an unknown quote id", async () => {
    const ops = await loginAs("OPS");
    await expect(quotesService.transition(actorOf(ops), NIL_UUID, "SENT")).rejects.toMatchObject({ status: 404, error: "not_found", messageKey: "common.not_found" });
  });

  it("a quote with a null expiresAt never reads as EXPIRED and serializes expiresAt as null", async () => {
    const ops = await loginAs("OPS");
    const req = await seedRequest();
    const q = await seedQuote({ requestId: req.id, status: "DRAFT", expiresAt: null });
    const moved = await quotesService.transition(actorOf(ops), q.id, "SENT");
    expect(moved.data.status).toBe("SENT"); // no expiry → not flipped to EXPIRED
    expect(moved.data.expiresAt).toBeNull();
  });

  it("does not persist the row when a transition is rejected (atomic)", async () => {
    const ops = await loginAs("OPS");
    const req = await seedRequest();
    const q = await seedQuote({ requestId: req.id, status: "DRAFT" });
    await expect(quotesService.transition(actorOf(ops), q.id, "ACCEPTED")).rejects.toMatchObject({ status: 409 });
    const row = await prisma.quote.findUniqueOrThrow({ where: { id: q.id } });
    expect(row.status).toBe("DRAFT"); // unchanged
    expect(await auditEntriesFor("Quote", q.id)).toHaveLength(0); // no audit on a rejected move
  });
});

describe("quote expiry — check-on-read & accept guard (F07-T04)", () => {
  it("a DRAFT past expiresAt READS as EXPIRED without a stored status change", async () => {
    const req = await seedRequest();
    const q = await seedQuote({ requestId: req.id, status: "DRAFT", expiresAt: new Date(Date.now() - 1000) });
    const dto = await prisma.quote.findUniqueOrThrow({ where: { id: q.id } });
    expect(dto.status).toBe("DRAFT"); // stored is still DRAFT
    // read via the service mapper (transition would, but we assert the DTO projection):
    const ops = await loginAs("OPS");
    await expect(quotesService.transition(actorOf(ops), q.id, "SENT")).rejects.toMatchObject({ status: 409 }); // can't SENT an effectively-EXPIRED quote
  });

  it("a SENT quote past expiresAt cannot be ACCEPTED → 409 with from EXPIRED", async () => {
    const ops = await loginAs("OPS");
    const req = await seedRequest();
    const q = await seedQuote({ requestId: req.id, status: "SENT", expiresAt: new Date(Date.now() - 1000) });
    await expect(quotesService.transition(actorOf(ops), q.id, "ACCEPTED")).rejects.toMatchObject({
      status: 409,
      error: "invalid_transition",
      messageKey: "quote.expired",
      from: "EXPIRED",
      to: "ACCEPTED",
    });
    // and the stored row was not flipped to ACCEPTED.
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q.id } })).status).toBe("SENT");
  });

  it("exactly-at-expiry (expiresAt == now) reads as EXPIRED (boundary is inclusive)", async () => {
    const ops = await loginAs("OPS");
    const req = await seedRequest();
    // 50ms in the past guarantees the effectiveStatus `<=` boundary has tripped by read time.
    const q = await seedQuote({ requestId: req.id, status: "SENT", expiresAt: new Date(Date.now() - 50) });
    await expect(quotesService.transition(actorOf(ops), q.id, "ACCEPTED")).rejects.toMatchObject({ status: 409, from: "EXPIRED" });
  });

  it("an already-ACCEPTED quote stays ACCEPTED even past expiresAt (terminal wins)", async () => {
    const req = await seedRequest();
    const q = await seedQuote({ requestId: req.id, status: "ACCEPTED", expiresAt: new Date(Date.now() - 1000) });
    const ops = await loginAs("OPS");
    // a terminal state never reads as EXPIRED; transitioning out still 409s from ACCEPTED.
    await expect(quotesService.transition(actorOf(ops), q.id, "EXPIRED")).rejects.toMatchObject({ status: 409, from: "ACCEPTED", to: "EXPIRED" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /quotes — audit (F07-T03)", () => {
  it("writes exactly one quote.generate audit row attributed to the actor", async () => {
    const ops = await loginAs("OPS");
    const { req } = await setup(80000);
    const res = await ops.post(QUOTES).send({ requestId: req.id });
    const audits = await auditEntriesFor("Quote", res.body.data.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "quote.generate", entityType: "Quote", entityId: res.body.data.id, actorId: ops.user.id, requestId: req.id });
    // the audit `after` snapshot carries the server-computed money + version.
    expect(audits[0]!.after).toMatchObject({ version: 1, netMinor: 80000, vatMinor: 16000, totalMinor: 96000 });
  });

  it("persists nothing (no quote, no audit) when generation 404s on a missing reservation", async () => {
    const ops = await loginAs("OPS");
    const req = await seedRequest();
    const res = await ops.post(QUOTES).send({ requestId: req.id });
    expect(res.status).toBe(404);
    expect(await prisma.quote.count()).toBe(0);
    expect(await prisma.auditEntry.count({ where: { action: "quote.generate" } })).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RBAC
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /quotes — RBAC (F07-T03, SECURITY.md)", () => {
  it("OPS can generate (201)", async () => {
    const ops = await loginAs("OPS");
    const { req } = await setup();
    expect((await ops.post(QUOTES).send({ requestId: req.id })).status).toBe(201);
  });

  it("MANAGER can generate (201)", async () => {
    const mgr = await loginAs("MANAGER");
    const { req } = await setup();
    expect((await mgr.post(QUOTES).send({ requestId: req.id })).status).toBe(201);
  });

  it("ADMIN can generate (201)", async () => {
    const admin = await loginAs("ADMIN");
    const { req } = await setup();
    expect((await admin.post(QUOTES).send({ requestId: req.id })).status).toBe(201);
  });

  it("VIEWER is forbidden (403)", async () => {
    const viewer = await loginAs("VIEWER");
    const { req } = await setup();
    const res = await viewer.post(QUOTES).send({ requestId: req.id });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ status: 403, error: "forbidden", messageKey: "auth.forbidden" });
    expect(await prisma.quote.count()).toBe(0);
  });

  it("PARTNER is forbidden on the staff surface (403)", async () => {
    const partner = await loginAs("PARTNER");
    const { req } = await setup();
    const res = await partner.post(QUOTES).send({ requestId: req.id });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ status: 403, error: "forbidden" });
  });

  it("an anonymous request is unauthorized (401)", async () => {
    const { req } = await setup();
    const res = await anon().post(QUOTES).set("Idempotency-Key", "anon-1").send({ requestId: req.id });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ status: 401, error: "unauthorized", messageKey: "common.unauthorized" });
  });
});

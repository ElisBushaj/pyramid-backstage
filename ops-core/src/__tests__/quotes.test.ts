import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, resetDb, prisma } from "./helpers/integration";
import { seedSpace, seedRequest, seedReservation } from "./helpers/fixtures";
import { quotesService } from "../modules/quotes/service";

const QUOTES = "/api/v1/private/quotes";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };

beforeEach(resetDb);

async function setup(dayRate = 80000) {
  const space = await seedSpace({ name: "Blue Hall", dayRateMinor: dayRate });
  const req = await seedRequest();
  await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() + 600_000) });
  return req;
}

describe("POST /quotes — server-computed VAT, ignores client total (F07-T03/T05)", () => {
  it("computes net→vat→total and writes a quote.generate audit row", async () => {
    const client = await loginAs("OPS");
    const req = await setup(80000);
    const res = await client.post(QUOTES).send({ requestId: req.id, extraLineItems: [{ label: "Catering", qty: 1, unitPriceMinor: 31667 }] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ netMinor: 111667, vatMinor: 22333, totalMinor: 134000, status: "DRAFT", version: 1 });
    expect(res.body.data.currency).toBe("ALL");

    // no float in any money field
    for (const k of ["netMinor", "vatMinor", "totalMinor"]) expect(Number.isInteger(res.body.data[k])).toBe(true);
    for (const li of res.body.data.lineItems) expect(Number.isInteger(li.subtotalMinor)).toBe(true);
    expect(await prisma.auditEntry.count({ where: { action: "quote.generate" } })).toBe(1);
  });

  it("ignores a client-supplied total — recomputes from line items", async () => {
    const client = await loginAs("OPS");
    const req = await setup(80000);
    const res = await client.post(QUOTES).send({ requestId: req.id, totalMinor: 999999999, total: 1, netMinor: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.totalMinor).toBe(96000); // 80000 net + 16000 vat — not the bogus client value
    expect(res.body.data.netMinor).toBe(80000);
  });

  it("404 on unknown requestId / reservationId", async () => {
    const client = await loginAs("OPS");
    expect((await client.post(QUOTES).send({ requestId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
    const req = await setup();
    expect((await client.post(QUOTES).send({ requestId: req.id, reservationId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
  });
});

describe("quote versioning + expiry (F07-T04)", () => {
  it("regenerating bumps the version and keeps the prior one discoverable", async () => {
    const client = await loginAs("OPS");
    const req = await setup();
    const v1 = (await client.post(QUOTES).send({ requestId: req.id })).body.data;
    const v2 = (await client.post(QUOTES).send({ requestId: req.id, extraLineItems: [{ label: "Extra", qty: 1, unitPriceMinor: 5000 }] })).body.data;
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(await prisma.quote.count({ where: { requestId: req.id } })).toBe(2); // old retained
  });

  it("an expired quote cannot be ACCEPTED", async () => {
    const ops = await loginAs("OPS");
    const req = await setup();
    const quote = (await ops.post(QUOTES).send({ requestId: req.id })).body.data;
    await prisma.quote.update({ where: { id: quote.id }, data: { status: "SENT", expiresAt: new Date(Date.now() - 1000) } });
    await expect(quotesService.transition(ops.user, quote.id, "ACCEPTED")).rejects.toMatchObject({ status: 409 });
  });
});

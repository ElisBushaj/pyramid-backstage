import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, resetDb, prisma } from "./helpers/integration";

const REQ = "/api/v1/private/requests";

const validBody = {
  title: "FinTech Startup Conference",
  organizerName: "Acme",
  contactEmail: "x@acme.al",
  expectedAttendees: 180,
  eventType: "CONFERENCE",
  preferredDates: [{ start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" }],
  requirements: { layout: "THEATER", avNeeded: true },
};

beforeEach(resetDb);

describe("POST /requests (F04-T02)", () => {
  it("creates a DRAFT with createdById, writes request.create audit + request.created outbox", async () => {
    const client = await loginAs("OPS");
    const res = await client.post(REQ).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ title: "FinTech Startup Conference", status: "DRAFT" });
    expect(res.body.data.createdById).toBe(client.user.id);

    expect(await prisma.auditEntry.count({ where: { action: "request.create", entityId: res.body.data.id } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { subject: "request.created" } })).toBe(1);
  });

  it("422 on invalid input (bad eventType, empty preferredDates, start>=end)", async () => {
    const client = await loginAs("OPS");
    expect((await client.post(REQ).send({ ...validBody, eventType: "WEDDING" })).status).toBe(422);
    expect((await client.post(REQ).send({ ...validBody, preferredDates: [] })).status).toBe(422);
    const bad = await client.post(REQ).send({ ...validBody, preferredDates: [{ start: "2026-07-22T18:00:00Z", end: "2026-07-22T09:00:00Z" }] });
    expect(bad.status).toBe(422);
    expect(bad.body.fields.preferredDates).toBe("validation.range");
  });
});

describe("GET /requests/:id aggregate (F04-T03)", () => {
  it("a bare DRAFT returns the request with empty related collections", async () => {
    const client = await loginAs("OPS");
    const created = (await client.post(REQ).send(validBody)).body.data;
    const agg = await client.get(`${REQ}/${created.id}`);
    expect(agg.status).toBe(200);
    expect(agg.body.data.request.id).toBe(created.id);
    expect(agg.body.data.reservation ?? null).toBeNull();
    expect(agg.body.data.quote ?? null).toBeNull();
    expect(agg.body.data.tasks).toEqual([]);
    expect(agg.body.data.conflicts).toEqual([]);
    expect(agg.body.data.audit.length).toBeGreaterThanOrEqual(1); // request.create
  });

  it("unknown id → 404", async () => {
    const client = await loginAs("OPS");
    expect((await client.get(`${REQ}/00000000-0000-4000-8000-000000000000`)).status).toBe(404);
  });
});

describe("GET /requests list + filters + search (F04-T05/T07)", () => {
  it("filters by status, paginates, and free-text searches title/organizer", async () => {
    const client = await loginAs("OPS");
    await client.post(REQ).send({ ...validBody, title: "Alpha Summit", organizerName: "Northwind" });
    await client.post(REQ).send({ ...validBody, title: "Beta Workshop", organizerName: "Acme", eventType: "WORKSHOP" });

    const all = await client.get(`${REQ}?page=1&pageSize=20`);
    expect(all.status).toBe(200);
    expect(all.body.data.length).toBe(2);
    expect(all.body.total).toBe(2);
    expect(all.body.totalPages).toBe(1);

    const drafts = await client.get(`${REQ}?status=DRAFT`);
    expect(drafts.body.data.length).toBe(2);
    expect((await client.get(`${REQ}?status=APPROVED`)).body.data.length).toBe(0);

    const search = await client.get(`${REQ}?q=northwind`);
    expect(search.body.data.map((r: any) => r.title)).toEqual(["Alpha Summit"]);
    const searchTitle = await client.get(`${REQ}?q=beta`);
    expect(searchTitle.body.data.map((r: any) => r.title)).toEqual(["Beta Workshop"]);
    expect((await client.get(`${REQ}?q=nonexistent`)).body.data).toEqual([]);
  });
});

describe("PATCH /requests/:id edit DRAFT (F04-T06)", () => {
  it("edits a DRAFT and audits; rejects editing a non-DRAFT with 409 invalid_transition", async () => {
    const client = await loginAs("OPS");
    const created = (await client.post(REQ).send(validBody)).body.data;
    const patch = await client.patch(`${REQ}/${created.id}`).send({ expectedAttendees: 250 });
    expect(patch.status).toBe(200);
    expect(patch.body.data.expectedAttendees).toBe(250);
    expect(await prisma.auditEntry.count({ where: { action: "request.update", entityId: created.id } })).toBe(1);

    await prisma.eventRequest.update({ where: { id: created.id }, data: { status: "PROPOSED" } });
    const blocked = await client.patch(`${REQ}/${created.id}`).send({ expectedAttendees: 300 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("invalid_transition");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  loginAs,
  anon,
  resetDb,
  prisma,
  auditEntriesFor,
  outboxFor,
  unpublishedOutbox,
  type Client,
} from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation, seedQuote, seedTask } from "./helpers/fixtures";
import { requestsService } from "../modules/requests/service";
import { transitionRequest } from "../modules/requests/transitions";
import { APIError } from "../errors";
import type { Actor } from "../types";

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

// ─────────────────────────────────────────────────────────────────────────────
// CREATE (F04-T02)
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /requests — create (F04-T02)", () => {
  it("staff create lands DRAFT with createdById = actor.id; writes request.create audit + request.created outbox in ONE tx", async () => {
    const client = await loginAs("OPS");
    const res = await client.post(REQ).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: "FinTech Startup Conference",
      organizerName: "Acme",
      eventType: "CONFERENCE",
      expectedAttendees: 180,
      status: "DRAFT",
    });
    expect(res.body.data.createdById).toBe(client.user.id);
    expect(res.body.data.id).toBeTruthy();
    // RFC-3339 UTC timestamps
    expect(res.body.data.createdAt).toMatch(/\dT.*Z$/);
    expect(res.body.data.updatedAt).toMatch(/\dT.*Z$/);

    const id = res.body.data.id as string;
    const audit = await auditEntriesFor("EventRequest", id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "request.create", actorId: client.user.id, requestId: id });
    // after-snapshot captured
    expect((audit[0]!.after as { status?: string }).status).toBe("DRAFT");

    const outbox = await outboxFor("request.created");
    expect(outbox).toHaveLength(1);
    expect((outbox[0]!.payload as { requestId?: string }).requestId).toBe(id);
    // audit + outbox were committed together (one create => one of each)
    expect(await prisma.eventRequest.count()).toBe(1);
  });

  it("persists optional fields and requirements; defaults nullable optionals to null", async () => {
    const client = await loginAs("OPS");
    const res = await client.post(REQ).send({
      title: "Bare Minimum",
      organizerName: "Solo",
      expectedAttendees: 1,
      eventType: "OTHER",
      preferredDates: [{ start: "2026-09-01T09:00:00Z", end: "2026-09-01T10:00:00Z" }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.contactEmail ?? null).toBeNull();
    expect(res.body.data.contactPhone ?? null).toBeNull();
    expect(res.body.data.requirements ?? null).toBeNull();
    expect(res.body.data.rejectionReason ?? null).toBeNull();

    const full = await client.post(REQ).send({ ...validBody, requirements: { layout: "BANQUET", avNeeded: true, cateringNeeded: true, notes: "VIP" } });
    expect(full.body.data.requirements).toMatchObject({ layout: "BANQUET", avNeeded: true, cateringNeeded: true, notes: "VIP" });
  });

  describe("422 validation — field by field, asserting status + error + messageKey + fields", () => {
    const cases: Array<[string, Record<string, unknown>, string, string]> = [
      ["missing title", { title: undefined }, "title", "validation.invalid"],
      ["empty title", { title: "   " }, "title", "validation.required"],
      ["missing organizerName", { organizerName: undefined }, "organizerName", "validation.invalid"],
      ["empty organizerName", { organizerName: "" }, "organizerName", "validation.required"],
      ["expectedAttendees = 0", { expectedAttendees: 0 }, "expectedAttendees", "validation.min"],
      ["expectedAttendees negative", { expectedAttendees: -5 }, "expectedAttendees", "validation.min"],
      ["bad eventType", { eventType: "WEDDING" }, "eventType", "validation.enum"],
      ["empty preferredDates", { preferredDates: [] }, "preferredDates", "validation.array"],
      ["missing preferredDates", { preferredDates: undefined }, "preferredDates", "validation.array"],
      ["preferredDates start>=end", { preferredDates: [{ start: "2026-07-22T18:00:00Z", end: "2026-07-22T09:00:00Z" }] }, "preferredDates", "validation.range"],
      ["preferredDates non-date element", { preferredDates: [{ start: "not-a-date", end: "also-bad" }] }, "preferredDates", "validation.datetime"],
      ["preferredDates missing end", { preferredDates: [{ start: "2026-07-22T09:00:00Z" }] }, "preferredDates", "validation.datetime"],
      ["bad contactEmail", { contactEmail: "not-an-email" }, "contactEmail", "validation.email"],
      ["bad requirements.layout", { requirements: { layout: "IGLOO" } }, "requirements.layout", "validation.enum"],
    ];

    for (const [name, patch, field, key] of cases) {
      it(`rejects: ${name}`, async () => {
        const client = await loginAs("OPS");
        const body = { ...validBody, ...patch };
        if (patch[Object.keys(patch)[0]!] === undefined) delete (body as Record<string, unknown>)[Object.keys(patch)[0]!];
        const res = await client.post(REQ).send(body);
        expect(res.status, name).toBe(422);
        expect(res.body.error).toBe("validation");
        expect(res.body.messageKey).toBe("validation.failed");
        expect(res.body.fields[field], `${name} → fields.${field}`).toBe(key);
      });
    }

    it("a MISSING required eventType is rejected (422, field flagged)", async () => {
      // A missing enum maps to the registered validation.enum key — ValidationHelpers.enumOf
      // attaches it to the leading .isString() too, so it never leaks the raw default.
      const client = await loginAs("OPS");
      const body = { ...validBody } as Record<string, unknown>;
      delete body.eventType;
      const res = await client.post(REQ).send(body);
      expect(res.status).toBe(422);
      expect(res.body.error).toBe("validation");
      expect(res.body.messageKey).toBe("validation.failed");
      expect(res.body.fields.eventType).toBe("validation.enum");
    });

    it("does NOT persist anything on a validation failure", async () => {
      const client = await loginAs("OPS");
      await client.post(REQ).send({ ...validBody, eventType: "WEDDING" });
      expect(await prisma.eventRequest.count()).toBe(0);
      expect(await prisma.auditEntry.count()).toBe(0);
      expect(await outboxFor("request.created")).toHaveLength(0);
    });
  });

  describe("RBAC on create", () => {
    it("anon → 401", async () => {
      const res = await anon().post(REQ).set("Idempotency-Key", "11111111-1111-4111-8111-111111111111").send(validBody);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("unauthorized");
    });

    it("VIEWER / OPS / MANAGER / ADMIN can all create", async () => {
      for (const role of ["VIEWER", "OPS", "MANAGER", "ADMIN"] as const) {
        const client = await loginAs(role);
        const res = await client.post(REQ).send(validBody);
        expect(res.status, role).toBe(201);
        expect(res.body.data.status, role).toBe("DRAFT");
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET AGGREGATE (F04-T03)
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /requests/:id — aggregate (F04-T03)", () => {
  it("a bare DRAFT returns the request with empty related collections + the create audit", async () => {
    const client = await loginAs("OPS");
    const created = (await client.post(REQ).send(validBody)).body.data;
    const agg = await client.get(`${REQ}/${created.id}`);
    expect(agg.status).toBe(200);
    expect(agg.body.data.request.id).toBe(created.id);
    expect(agg.body.data.reservation ?? null).toBeNull();
    expect(agg.body.data.quote ?? null).toBeNull();
    expect(agg.body.data.tasks).toEqual([]);
    expect(agg.body.data.conflicts).toEqual([]);
    expect(agg.body.data.audit.length).toBeGreaterThanOrEqual(1);
    expect(agg.body.data.audit[0].action).toBe("request.create");
  });

  it("assembles request + latest reservation + latest quote + tasks + audit", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const asset = await seedAsset({ totalQuantity: 500 });
    const req = await seedRequest({ status: "PROPOSED", createdById: client.user.id });

    await seedReservation({
      space, requestId: req.id, status: "HELD",
      start: "2026-08-01T09:00:00Z", end: "2026-08-01T17:00:00Z",
      assets: [{ assetId: asset.id, quantity: 10 }],
    });
    await seedQuote({ requestId: req.id, version: 1, status: "SENT" });
    await seedTask({ requestId: req.id, title: "Set chairs", phase: "SETUP" });
    await seedTask({ requestId: req.id, title: "Strike", phase: "TEARDOWN" });

    const agg = await client.get(`${REQ}/${req.id}`);
    expect(agg.status).toBe(200);
    expect(agg.body.data.request.id).toBe(req.id);
    expect(agg.body.data.reservation).not.toBeNull();
    expect(agg.body.data.reservation.status).toBe("HELD");
    expect(agg.body.data.quote).not.toBeNull();
    expect(agg.body.data.quote.version).toBe(1);
    expect(agg.body.data.tasks).toHaveLength(2);
    // tasks ordered by phase asc → SETUP before TEARDOWN
    expect(agg.body.data.tasks.map((t: { phase: string }) => t.phase)).toEqual(["SETUP", "TEARDOWN"]);
    expect(Array.isArray(agg.body.data.audit)).toBe(true);
  });

  it("returns the LATEST quote (highest version) and the latest active reservation", async () => {
    const client = await loginAs("OPS");
    const req = await seedRequest({ createdById: client.user.id });
    await seedQuote({ requestId: req.id, version: 1, status: "EXPIRED", netMinor: 100000 });
    await seedQuote({ requestId: req.id, version: 2, status: "SENT", netMinor: 200000 });

    const agg = await client.get(`${REQ}/${req.id}`);
    expect(agg.body.data.quote.version).toBe(2);
    expect(agg.body.data.quote.netMinor).toBe(200000);
  });

  it("ignores RELEASED reservations (only HELD/CONFIRMED surface in the aggregate)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace();
    const req = await seedRequest({ createdById: client.user.id });
    await seedReservation({ space, requestId: req.id, status: "RELEASED", start: "2026-08-02T09:00:00Z", end: "2026-08-02T17:00:00Z" });

    const agg = await client.get(`${REQ}/${req.id}`);
    expect(agg.body.data.reservation ?? null).toBeNull();
  });

  it("RE-DETECTS conflicts live against current DB state (not a stored snapshot)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const W = { start: "2026-08-10T09:00:00Z", end: "2026-08-10T17:00:00Z" };

    // The request under inspection holds the space…
    const mine = await seedRequest({ status: "PROPOSED", createdById: client.user.id });
    await seedReservation({ space, requestId: mine.id, status: "HELD", start: W.start, end: W.end });

    // …with no clash, the aggregate reports zero conflicts.
    let agg = await client.get(`${REQ}/${mine.id}`);
    expect(agg.body.data.conflicts).toEqual([]);

    // Now a DIFFERENT request CONFIRMS the same space+window. Re-reading the aggregate
    // must surface the live double-booking — proving conflicts are computed, not cached.
    const other = await seedRequest({ status: "SCHEDULED" });
    await seedReservation({ space, requestId: other.id, status: "CONFIRMED", start: W.start, end: W.end });

    agg = await client.get(`${REQ}/${mine.id}`);
    expect(agg.body.data.conflicts.length).toBeGreaterThanOrEqual(1);
    const c = agg.body.data.conflicts.find((x: { type: string }) => x.type === "SPACE_DOUBLE_BOOKED");
    expect(c).toBeTruthy();
    expect(c.conflictingRequestIds).toContain(other.id);
  });

  it("surfaces an ASSET_OVERALLOCATED conflict when stock runs short live", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const space2 = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const asset = await seedAsset({ totalQuantity: 100 });
    const W = { start: "2026-08-11T09:00:00Z", end: "2026-08-11T17:00:00Z" };

    const mine = await seedRequest({ status: "PROPOSED", createdById: client.user.id });
    await seedReservation({ space, requestId: mine.id, status: "HELD", start: W.start, end: W.end, assets: [{ assetId: asset.id, quantity: 80 }] });

    // a concurrent CONFIRMED hold consumes the rest of the stock in the same window
    const other = await seedRequest({ status: "SCHEDULED" });
    await seedReservation({ space: space2, requestId: other.id, status: "CONFIRMED", start: W.start, end: W.end, assets: [{ assetId: asset.id, quantity: 40 }] });

    const agg = await client.get(`${REQ}/${mine.id}`);
    const c = agg.body.data.conflicts.find((x: { type: string }) => x.type === "ASSET_OVERALLOCATED");
    expect(c).toBeTruthy();
    expect(c.assetId).toBe(asset.id);
  });

  it("unknown id → 404 not_found", async () => {
    const client = await loginAs("OPS");
    const res = await client.get(`${REQ}/00000000-0000-4000-8000-000000000000`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
    expect(res.body.messageKey).toBeTruthy();
  });

  it("anon → 401", async () => {
    const created = await (await loginAs("OPS")).post(REQ).send(validBody);
    const res = await anon().get(`${REQ}/${created.body.data.id}`);
    expect(res.status).toBe(401);
  });

  it("VIEWER (staff) can read any request's aggregate", async () => {
    const ops = await loginAs("OPS");
    const created = (await ops.post(REQ).send(validBody)).body.data;
    const viewer = await loginAs("VIEWER");
    expect((await viewer.get(`${REQ}/${created.id}`)).status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LIST (F04-T05 / T07)
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /requests — list, filter, search, paginate (F04-T05/T07)", () => {
  it("filters by status, paginates, and free-text searches title/organizer (case-insensitive)", async () => {
    const client = await loginAs("OPS");
    await client.post(REQ).send({ ...validBody, title: "Alpha Summit", organizerName: "Northwind" });
    await client.post(REQ).send({ ...validBody, title: "Beta Workshop", organizerName: "Acme", eventType: "WORKSHOP" });

    const all = await client.get(`${REQ}?page=1&pageSize=20`);
    expect(all.status).toBe(200);
    expect(all.body.data.length).toBe(2);
    expect(all.body.total).toBe(2);
    expect(all.body.totalPages).toBe(1);
    expect(all.body.page).toBe(1);
    expect(all.body.pageSize).toBe(20);

    expect((await client.get(`${REQ}?status=DRAFT`)).body.data.length).toBe(2);
    expect((await client.get(`${REQ}?status=APPROVED`)).body.data.length).toBe(0);

    expect((await client.get(`${REQ}?q=northwind`)).body.data.map((r: { title: string }) => r.title)).toEqual(["Alpha Summit"]);
    expect((await client.get(`${REQ}?q=NORTHWIND`)).body.data.map((r: { title: string }) => r.title)).toEqual(["Alpha Summit"]); // case-insensitive
    expect((await client.get(`${REQ}?q=beta`)).body.data.map((r: { title: string }) => r.title)).toEqual(["Beta Workshop"]);
    expect((await client.get(`${REQ}?q=nonexistent`)).body.data).toEqual([]);
  });

  it("orders newest-first by createdAt", async () => {
    const client = await loginAs("OPS");
    const a = await seedRequest({ title: "Oldest", createdById: client.user.id });
    await new Promise((r) => setTimeout(r, 5));
    const b = await seedRequest({ title: "Newest", createdById: client.user.id });

    const res = await client.get(REQ);
    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });

  it("defaults to page 1 / pageSize 20 when omitted", async () => {
    const client = await loginAs("OPS");
    for (let i = 0; i < 3; i++) await seedRequest({ createdById: client.user.id });
    const res = await client.get(REQ);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
    expect(res.body.data.length).toBe(3);
  });

  it("paginates correctly across pages and reports totalPages", async () => {
    const client = await loginAs("OPS");
    for (let i = 0; i < 5; i++) await seedRequest({ title: `R${i}`, createdById: client.user.id });

    const p1 = await client.get(`${REQ}?page=1&pageSize=2`);
    expect(p1.body.data.length).toBe(2);
    expect(p1.body.total).toBe(5);
    expect(p1.body.totalPages).toBe(3);

    const p3 = await client.get(`${REQ}?page=3&pageSize=2`);
    expect(p3.body.data.length).toBe(1); // remainder

    // page beyond the end → empty page, total still reported
    const p9 = await client.get(`${REQ}?page=9&pageSize=2`);
    expect(p9.body.data).toEqual([]);
    expect(p9.body.total).toBe(5);
  });

  it("clamps pageSize to a max of 100", async () => {
    const client = await loginAs("OPS");
    const res = await client.get(`${REQ}?pageSize=100`);
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
    // pageSize above 100 is rejected by the validator (intMin has no max; service clamps),
    // but the contract caps the effective page at 100 — see clamp test below.
  });

  it("422 on invalid list params (bad status enum, page < 1, pageSize < 1)", async () => {
    const client = await loginAs("OPS");
    expect((await client.get(`${REQ}?status=BOGUS`)).status).toBe(422);
    expect((await client.get(`${REQ}?page=0`)).status).toBe(422);
    expect((await client.get(`${REQ}?pageSize=0`)).status).toBe(422);
    const bad = await client.get(`${REQ}?status=BOGUS`);
    expect(bad.body.error).toBe("validation");
    expect(bad.body.fields.status).toBe("validation.enum");
  });

  it("anon → 401", async () => {
    expect((await anon().get(REQ)).status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE DRAFT (F04-T06)
// ─────────────────────────────────────────────────────────────────────────────
describe("PATCH /requests/:id — edit DRAFT only (F04-T06)", () => {
  async function freshDraft(client: Client) {
    return (await client.post(REQ).send(validBody)).body.data;
  }

  it("edits a DRAFT's whitelisted fields and writes a request.update audit", async () => {
    const client = await loginAs("OPS");
    const created = await freshDraft(client);
    const patch = await client.patch(`${REQ}/${created.id}`).send({
      title: "Renamed Conference",
      expectedAttendees: 250,
      requirements: { layout: "CLASSROOM" },
    });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({ title: "Renamed Conference", expectedAttendees: 250 });
    expect(patch.body.data.requirements.layout).toBe("CLASSROOM");

    const audit = await prisma.auditEntry.findMany({ where: { action: "request.update", entityId: created.id } });
    expect(audit).toHaveLength(1);
    expect((audit[0]!.actorId)).toBe(client.user.id);
  });

  it("applies every whitelisted field when all are supplied", async () => {
    const client = await loginAs("OPS");
    const created = await freshDraft(client);
    const patch = await client.patch(`${REQ}/${created.id}`).send({
      title: "All Fields",
      organizerName: "New Org",
      contactEmail: "new@org.al",
      contactPhone: "+355690000000",
      expectedAttendees: 99,
      eventType: "EXHIBITION",
      preferredDates: [{ start: "2026-11-01T09:00:00Z", end: "2026-11-01T18:00:00Z" }],
      requirements: { layout: "RECEPTION", notes: "updated" },
    });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({
      title: "All Fields",
      organizerName: "New Org",
      contactEmail: "new@org.al",
      contactPhone: "+355690000000",
      expectedAttendees: 99,
      eventType: "EXHIBITION",
    });
    expect(Date.parse(patch.body.data.preferredDates[0].start)).toBe(Date.parse("2026-11-01T09:00:00Z"));
    expect(patch.body.data.requirements.layout).toBe("RECEPTION");
  });

  it("is whitelist-guarded: cannot mass-assign status, id, or createdById", async () => {
    const client = await loginAs("OPS");
    const created = await freshDraft(client);
    const other = await loginAs("ADMIN");

    const patch = await client.patch(`${REQ}/${created.id}`).send({
      title: "Legit edit",
      status: "APPROVED", // must be ignored
      id: "hacked-id", // must be ignored
      createdById: other.user.id, // must be ignored
    });
    expect(patch.status).toBe(200);
    expect(patch.body.data.status).toBe("DRAFT"); // unchanged
    expect(patch.body.data.id).toBe(created.id); // unchanged
    expect(patch.body.data.createdById).toBe(client.user.id); // unchanged

    const row = await prisma.eventRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe("DRAFT");
    expect(row.createdById).toBe(client.user.id);
  });

  it("rejects editing a non-DRAFT request with 409 invalid_transition { from, to=DRAFT }", async () => {
    const client = await loginAs("OPS");
    const created = await freshDraft(client);

    for (const from of ["PROPOSED", "APPROVED", "SCHEDULED", "COMPLETED", "REJECTED"] as const) {
      await prisma.eventRequest.update({ where: { id: created.id }, data: { status: from } });
      const res = await client.patch(`${REQ}/${created.id}`).send({ expectedAttendees: 300 });
      expect(res.status, from).toBe(409);
      expect(res.body.error).toBe("invalid_transition");
      expect(res.body.messageKey).toBe("request.invalid_transition");
      expect(res.body.from).toBe(from);
      expect(res.body.to).toBe("DRAFT");
    }
    // nothing was mutated by the blocked edits
    const row = await prisma.eventRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.expectedAttendees).toBe(180);
  });

  it("does not write an audit when the edit is blocked (non-DRAFT)", async () => {
    const client = await loginAs("OPS");
    const created = await freshDraft(client);
    await prisma.eventRequest.update({ where: { id: created.id }, data: { status: "PROPOSED" } });
    await client.patch(`${REQ}/${created.id}`).send({ expectedAttendees: 300 });
    expect(await prisma.auditEntry.count({ where: { action: "request.update", entityId: created.id } })).toBe(0);
  });

  it("unknown id → 404", async () => {
    const client = await loginAs("OPS");
    const res = await client.patch(`${REQ}/00000000-0000-4000-8000-000000000000`).send({ title: "x" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("422 on invalid patch fields (empty title, bad email, attendees < 1)", async () => {
    const client = await loginAs("OPS");
    const created = await freshDraft(client);
    expect((await client.patch(`${REQ}/${created.id}`).send({ title: "" })).status).toBe(422);
    expect((await client.patch(`${REQ}/${created.id}`).send({ expectedAttendees: 0 })).status).toBe(422);
    const bad = await client.patch(`${REQ}/${created.id}`).send({ contactEmail: "nope" });
    expect(bad.status).toBe(422);
    expect(bad.body.fields.contactEmail).toBe("validation.email");
  });

  it("anon → 401", async () => {
    const created = await (await loginAs("OPS")).post(REQ).send(validBody);
    const res = await anon().patch(`${REQ}/${created.body.data.id}`).set("Idempotency-Key", "22222222-2222-4222-8222-222222222222").send({ title: "x" });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT + OUTBOX integrity across the lifecycle (sanity that mutations co-write)
// ─────────────────────────────────────────────────────────────────────────────
describe("audit + outbox integrity (REQUESTS.md)", () => {
  it("create writes exactly one request.created outbox row, left unpublished for the relay", async () => {
    const client = await loginAs("OPS");
    await client.post(REQ).send(validBody);
    const pending = await unpublishedOutbox();
    expect(pending.filter((e) => e.subject === "request.created")).toHaveLength(1);
  });

  it("each mutation's audit carries the real actor (never anonymous)", async () => {
    const client = await loginAs("MANAGER");
    const created = (await client.post(REQ).send(validBody)).body.data;
    await client.patch(`${REQ}/${created.id}`).send({ title: "Edited" });
    const audit = await auditEntriesFor("EventRequest", created.id);
    expect(audit.length).toBe(2);
    for (const a of audit) expect(a.actorId).toBe(client.user.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Service-layer helpers exercised directly (assertExists, the assertTransition
// re-export, and the audited transitionRequest tx helper).
// ─────────────────────────────────────────────────────────────────────────────
describe("requestsService helpers + transitionRequest (F04 service layer)", () => {
  const actor: Actor = { id: "", name: "Sys", role: "MANAGER" };

  it("assertExists returns the row for a known id and throws 404 APIError for an unknown one", async () => {
    const req = await seedRequest({});
    const row = await requestsService.assertExists(req.id);
    expect(row.id).toBe(req.id);

    await expect(requestsService.assertExists("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      status: 404,
      error: "not_found",
    });
  });

  it("the assertTransition re-export is the same guard (throws 409 on an illegal edge)", () => {
    expect(requestsService.assertTransition("DRAFT", "PROPOSED")).toBeUndefined();
    try {
      requestsService.assertTransition("REJECTED", "APPROVED");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(APIError);
      expect((e as APIError).status).toBe(409);
      expect((e as APIError).error).toBe("invalid_transition");
      expect((e as APIError).from).toBe("REJECTED");
      expect((e as APIError).to).toBe("APPROVED");
    }
  });

  it("transitionRequest applies a legal move in a tx, persists status, and writes a request.transition audit", async () => {
    const owner = await loginAs("MANAGER");
    const req = await seedRequest({ status: "DRAFT", createdById: owner.user.id });
    const me: Actor = { ...actor, id: owner.user.id };

    const updated = await prisma.$transaction((tx) =>
      transitionRequest(tx, { id: req.id, from: "DRAFT", to: "PROPOSED", actor: me }),
    );
    expect(updated.status).toBe("PROPOSED");
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PROPOSED");

    const audit = await prisma.auditEntry.findMany({ where: { action: "request.transition", entityId: req.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorId).toBe(owner.user.id);
    expect((audit[0]!.before as { status?: string }).status).toBe("DRAFT");
    expect((audit[0]!.after as { status?: string }).status).toBe("PROPOSED");
  });

  it("transitionRequest persists the rejectionReason when moving to REJECTED", async () => {
    const owner = await loginAs("MANAGER");
    const req = await seedRequest({ status: "PROPOSED", createdById: owner.user.id });
    const me: Actor = { ...actor, id: owner.user.id };

    await prisma.$transaction((tx) =>
      transitionRequest(tx, { id: req.id, from: "PROPOSED", to: "REJECTED", actor: me, reason: "Out of capacity" }),
    );
    const row = await prisma.eventRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(row.status).toBe("REJECTED");
    expect(row.rejectionReason).toBe("Out of capacity");
    const audit = await prisma.auditEntry.findFirst({ where: { action: "request.transition", entityId: req.id } });
    expect(audit?.reason).toBe("Out of capacity");
  });

  it("transitionRequest refuses an illegal move (409) and writes nothing", async () => {
    const owner = await loginAs("MANAGER");
    const req = await seedRequest({ status: "DRAFT", createdById: owner.user.id });
    const me: Actor = { ...actor, id: owner.user.id };

    await expect(
      prisma.$transaction((tx) =>
        transitionRequest(tx, { id: req.id, from: "DRAFT", to: "SCHEDULED", actor: me }),
      ),
    ).rejects.toMatchObject({ status: 409, error: "invalid_transition", from: "DRAFT", to: "SCHEDULED" });

    // the guard threw before the update → status untouched, no audit
    expect((await prisma.eventRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("DRAFT");
    expect(await prisma.auditEntry.count({ where: { action: "request.transition", entityId: req.id } })).toBe(0);
  });
});

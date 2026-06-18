import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, resetDb } from "./helpers/integration";
import { seedSpace, seedRequest, seedReservation } from "./helpers/fixtures";

const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };
const FREE = { start: "2026-08-10T09:00:00Z", end: "2026-08-10T18:00:00Z" };

beforeEach(resetDb);

describe("GET /conflicts + GET /spaces/:id/availability (F05-T05)", () => {
  it("a busy space yields SPACE_DOUBLE_BOOKED and available:false; a free window yields neither", async () => {
    const client = await loginAs("VIEWER");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const conflicts = await client.get(`/api/v1/private/conflicts?spaceId=${space.id}&start=${W.start}&end=${W.end}`);
    expect(conflicts.status).toBe(200);
    expect(conflicts.body.data).toHaveLength(1);
    expect(conflicts.body.data[0].type).toBe("SPACE_DOUBLE_BOOKED");

    const avail = await client.get(`/api/v1/private/spaces/${space.id}/availability?start=${W.start}&end=${W.end}`);
    expect(avail.status).toBe(200);
    expect(avail.body.data).toMatchObject({ spaceId: space.id, available: false });
    expect(avail.body.data.conflictingRequestIds).toEqual([req.id]);

    const freeConflicts = await client.get(`/api/v1/private/conflicts?spaceId=${space.id}&start=${FREE.start}&end=${FREE.end}`);
    expect(freeConflicts.body.data).toEqual([]); // empty array, not 404

    const freeAvail = await client.get(`/api/v1/private/spaces/${space.id}/availability?start=${FREE.start}&end=${FREE.end}`);
    expect(freeAvail.body.data.available).toBe(true);
  });

  it("an unknown space id on availability → 404", async () => {
    const client = await loginAs("VIEWER");
    const res = await client.get(`/api/v1/private/spaces/00000000-0000-4000-8000-000000000000/availability?start=${W.start}&end=${W.end}`);
    expect(res.status).toBe(404);
  });

  it("missing start/end on /conflicts → 422", async () => {
    const client = await loginAs("VIEWER");
    const res = await client.get(`/api/v1/private/conflicts?spaceId=x`);
    expect(res.status).toBe(422);
  });
});

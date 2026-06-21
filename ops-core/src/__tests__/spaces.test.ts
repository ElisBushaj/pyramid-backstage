import { describe, it, expect, beforeEach } from "vitest";
import { loginAs, anon, resetDb, prisma, auditEntriesFor } from "./helpers/integration";
import { seedSpace, seedRequest, seedReservation } from "./helpers/fixtures";

const SPACES = "/api/v1/private/spaces";
// A reservation window and a far-away free window. Buffers (240/120 min) never
// reach the free window, so a space busy in W is free in FREE.
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };
const FREE = { start: "2026-09-01T09:00:00Z", end: "2026-09-01T18:00:00Z" };
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

const validBody = (over: Record<string, unknown> = {}) => ({
  name: "Test Hall",
  floor: 0,
  capacities: { THEATER: 200, BANQUET: 150 },
  dayRateMinor: 80000,
  ...over,
});

/** Assert the canonical error-contract envelope for a non-422 error. */
function expectError(res: { status: number; body: Record<string, unknown> }, status: number, error: string, messageKey: string) {
  expect(res.status).toBe(status);
  expect(res.body.error).toBe(error);
  expect(res.body.messageKey).toBe(messageKey);
}

beforeEach(resetDb);

// ─────────────────────────────────────────────────────────────── RBAC matrix
describe("spaces RBAC (F01/F02)", () => {
  it("anon cannot read or write — 401 unauthorized (auth runs before CSRF/role)", async () => {
    expectError(await anon().get(SPACES), 401, "unauthorized", "common.unauthorized");
    expectError(await anon().get(`${SPACES}/${UNKNOWN_ID}/availability?start=${W.start}&end=${W.end}`), 401, "unauthorized", "common.unauthorized");
    // anon mutations: requireAuth (401) fires before requireRole/CSRF.
    expectError(await anon().post(SPACES).set("Idempotency-Key", crypto.randomUUID()).send(validBody()), 401, "unauthorized", "common.unauthorized");
    expectError(await anon().patch(`${SPACES}/${UNKNOWN_ID}`).set("Idempotency-Key", crypto.randomUUID()).send({ name: "X" }), 401, "unauthorized", "common.unauthorized");
  });

  it("PARTNER (rank −1) is forbidden from the whole staff tier — 403 on reads", async () => {
    const partner = await loginAs("PARTNER");
    expectError(await partner.get(SPACES), 403, "forbidden", "auth.forbidden");
  });

  it("VIEWER can read but cannot create or update — 403 forbidden (auth.forbidden)", async () => {
    const viewer = await loginAs("VIEWER");
    expect((await viewer.get(SPACES)).status).toBe(200);
    expectError(await viewer.post(SPACES).send(validBody()), 403, "forbidden", "auth.forbidden");
    const space = await seedSpace({ name: "Locked" });
    expectError(await viewer.patch(`${SPACES}/${space.id}`).send({ name: "Nope" }), 403, "forbidden", "auth.forbidden");
  });

  it("OPS, MANAGER, ADMIN can each create (OPS+ gate)", async () => {
    for (const role of ["OPS", "MANAGER", "ADMIN"] as const) {
      await resetDb();
      const client = await loginAs(role);
      const res = await client.post(SPACES).send(validBody({ name: `Hall ${role}` }));
      expect(res.status, role).toBe(201);
    }
  });

  it("a write with no role escalation is still gated before idempotency runs (VIEWER → 403, not 422)", async () => {
    const viewer = await loginAs("VIEWER");
    // No body at all: requireRole rejects before validators/idempotency, so it's 403, never a 422.
    expectError(await viewer.post(SPACES).send({}), 403, "forbidden", "auth.forbidden");
  });
});

// ─────────────────────────────────────────────────────────── create + audit
describe("POST /spaces — create, audit, whitelist (F02-T02/T05)", () => {
  it("OPS creates a space, persists it, and writes exactly one space.create audit row (real actor)", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.post(SPACES).send(validBody({ name: "Aurora Hall", floor: -1 }));
    expect(res.status).toBe(201);
    expect(res.body.messageKey).toBe("space.created");
    expect(res.body.data.name).toBe("Aurora Hall");
    expect(res.body.data.floor).toBe(-1);

    const row = await prisma.space.findUnique({ where: { id: res.body.data.id } });
    expect(row?.name).toBe("Aurora Hall");

    const audit = await auditEntriesFor("Space", res.body.data.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe("space.create");
    expect(audit[0]!.actorId).toBe(ops.user.id);
    expect(audit[0]!.actorName).toBe("OPS User");
    expect((audit[0]!.after as Record<string, unknown>).name).toBe("Aurora Hall");
  });

  it("create applies field defaults (kind MAIN, buffers 240/120, currency ALL, status ACTIVE, features [])", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.post(SPACES).send(validBody());
    expect(res.body.data.kind).toBe("MAIN");
    expect(res.body.data.setupBufferMinutes).toBe(240);
    expect(res.body.data.teardownBufferMinutes).toBe(120);
    expect(res.body.data.currency).toBe("ALL");
    expect(res.body.data.status).toBe("ACTIVE");
    expect(res.body.data.features).toEqual([]);
  });

  it("whitelist guard: unknown / protected body fields are NOT mass-assigned", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.post(SPACES).send(
      validBody({
        id: "attacker-chosen-id",
        currency: "EUR", // protected — must stay ALL
        status: "INACTIVE", // not in SpaceInput create whitelist — must stay ACTIVE
        createdAt: "1999-01-01T00:00:00Z",
        bogusColumn: "ignored",
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.id).not.toBe("attacker-chosen-id");
    expect(res.body.data.currency).toBe("ALL");
    expect(res.body.data.status).toBe("ACTIVE");
    const row = await prisma.space.findUnique({ where: { id: res.body.data.id } });
    expect(row?.currency).toBe("ALL");
    expect(row?.status).toBe("ACTIVE");
  });

  describe("create validation → 422 with fields (F02-T02)", () => {
    it("missing name → 422 fields.name", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ name: undefined }));
      expect(res.status).toBe(422);
      expect(res.body.error).toBe("validation");
      expect(res.body.messageKey).toBe("validation.failed");
      expect(res.body.fields.name).toBeDefined();
    });

    it("non-integer floor → 422 fields.floor", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ floor: "ground" }));
      expect(res.status).toBe(422);
      expect(res.body.fields.floor).toBe("validation.int");
    });

    it("capacities with an unknown layout key → 422 fields.capacities", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ capacities: { WEDDING: 100 } }));
      expect(res.status).toBe(422);
      expect(res.body.fields.capacities).toBe("validation.enum");
    });

    it("capacities with a non-positive / non-integer value → 422 fields.capacities", async () => {
      const ops = await loginAs("OPS");
      expect((await ops.post(SPACES).send(validBody({ capacities: { THEATER: 0 } }))).body.fields.capacities).toBe("validation.min");
      expect((await ops.post(SPACES).send(validBody({ capacities: { THEATER: -5 } }))).body.fields.capacities).toBe("validation.min");
      expect((await ops.post(SPACES).send(validBody({ capacities: { THEATER: 1.5 } }))).body.fields.capacities).toBe("validation.min");
    });

    it("empty capacities {} → 422 (a space must support at least one layout)", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ capacities: {} }));
      expect(res.status).toBe(422);
      expect(res.body.fields.capacities).toBe("validation.required");
    });

    it("capacities not an object → 422 fields.capacities", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ capacities: "lots" }));
      expect(res.status).toBe(422);
      expect(res.body.fields.capacities).toBe("validation.object");
    });

    it("negative dayRateMinor → 422 fields.dayRateMinor", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ dayRateMinor: -1 }));
      expect(res.status).toBe(422);
      expect(res.body.fields.dayRateMinor).toBe("validation.min");
    });

    it("negative buffers → 422", async () => {
      const ops = await loginAs("OPS");
      expect((await ops.post(SPACES).send(validBody({ setupBufferMinutes: -1 }))).body.fields.setupBufferMinutes).toBe("validation.min");
      expect((await ops.post(SPACES).send(validBody({ teardownBufferMinutes: -1 }))).body.fields.teardownBufferMinutes).toBe("validation.min");
    });

    it("features not an array → 422 fields.features", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ features: "stage" }));
      expect(res.status).toBe(422);
      expect(res.body.fields.features).toBe("validation.array");
    });

    it("invalid kind enum → 422 fields.kind", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ kind: "BALLROOM" }));
      expect(res.status).toBe(422);
      expect(res.body.fields.kind).toBe("validation.enum");
    });

    it("multiple bad fields → all reported in fields", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send({ name: "", floor: "x", capacities: {}, dayRateMinor: -3 });
      expect(res.status).toBe(422);
      expect(Object.keys(res.body.fields).sort()).toEqual(["capacities", "dayRateMinor", "floor", "name"]);
    });
  });

  it("missing Idempotency-Key on an OPS create → 422 (idempotency guard, after the role gate)", async () => {
    const ops = await loginAs("OPS");
    // Bypass the Client's auto-key with an empty key — the idempotency guard treats it as missing.
    const res = await ops.post(SPACES, "" as never).send(validBody());
    expect(res.status).toBe(422);
    expect(res.body.fields["Idempotency-Key"]).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────── F14 catalog fields
describe("POST/GET /spaces — F14 catalog-extension fields", () => {
  it("accepts and persists slug/category/zone/isCirculation/adjacent/map/ceilingCm", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.post(SPACES).send(
      validBody({
        name: "Blue Hall",
        slug: "blue_hall",
        category: "HALL",
        zone: "F0-N",
        isCirculation: false,
        adjacent: ["central_atrium", "orange_hall"],
        map: { floor: 0, ring: "outer", sectorFrom: 1, sectorTo: 4 },
        ceilingCm: 850,
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe("blue_hall");
    expect(res.body.data.category).toBe("HALL");
    expect(res.body.data.zone).toBe("F0-N");
    expect(res.body.data.isCirculation).toBe(false);
    expect(res.body.data.adjacent).toEqual(["central_atrium", "orange_hall"]);
    expect(res.body.data.map).toEqual({ floor: 0, ring: "outer", sectorFrom: 1, sectorTo: 4 });
    expect(res.body.data.ceilingCm).toBe(850);

    const row = await prisma.space.findUnique({ where: { id: res.body.data.id } });
    expect(row?.slug).toBe("blue_hall");
    expect(row?.adjacent).toEqual(["central_atrium", "orange_hall"]);
  });

  it("omits null catalog fields from the DTO (lean JSON) and defaults adjacent → []", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.post(SPACES).send(validBody());
    expect(res.body.data.slug).toBeUndefined();
    expect(res.body.data.category).toBeUndefined();
    expect(res.body.data.zone).toBeUndefined();
    expect(res.body.data.map).toBeUndefined();
    expect(res.body.data.ceilingCm).toBeUndefined();
    expect(res.body.data.adjacent).toEqual([]);
    expect(res.body.data.isCirculation).toBe(false);
  });

  it("duplicate slug is handled gracefully → 422 fields.slug (NOT a 500) — F14", async () => {
    const ops = await loginAs("OPS");
    const first = await ops.post(SPACES).send(validBody({ name: "First", slug: "lower_gallery" }));
    expect(first.status).toBe(201);
    const dup = await ops.post(SPACES).send(validBody({ name: "Second", slug: "lower_gallery" }));
    expect(dup.status).toBe(422);
    expect(dup.body.error).toBe("validation");
    expect(dup.body.messageKey).toBe("validation.failed");
    expect(dup.body.fields.slug).toBeDefined();
    // Only the first space exists; the duplicate never persisted.
    expect(await prisma.space.count()).toBe(1);
  });

  describe("F14 catalog validation → 422", () => {
    it("category outside the enum → 422 fields.category", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ category: "BALLROOM" }));
      expect(res.status).toBe(422);
      expect(res.body.fields.category).toBe("validation.enum");
    });

    it("non-array adjacent → 422 fields.adjacent", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ adjacent: "central_atrium" }));
      expect(res.status).toBe(422);
      expect(res.body.fields.adjacent).toBe("validation.array");
    });

    it("non-integer ceilingCm → 422 fields.ceilingCm", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ ceilingCm: 8.5 }));
      expect(res.status).toBe(422);
      expect(res.body.fields.ceilingCm).toBe("validation.min");
    });

    it("non-object map → 422 fields.map", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ map: "floor-0" }));
      expect(res.status).toBe(422);
      expect(res.body.fields.map).toBe("validation.object");
    });

    it("empty slug string → 422 fields.slug", async () => {
      const ops = await loginAs("OPS");
      const res = await ops.post(SPACES).send(validBody({ slug: "" }));
      expect(res.status).toBe(422);
      expect(res.body.fields.slug).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────── update
describe("PATCH /spaces/:id — update, audit, whitelist (F02-T02)", () => {
  it("partial update changes only the supplied field and writes a before/after audit row", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "Orig", dayRateMinor: 50000 });
    const res = await ops.patch(`${SPACES}/${space.id}`).send({ dayRateMinor: 60000 });
    expect(res.status).toBe(200);
    expect(res.body.messageKey).toBe("space.updated");
    expect(res.body.data.dayRateMinor).toBe(60000);
    expect(res.body.data.name).toBe("Orig"); // untouched

    const audit = await auditEntriesFor("Space", space.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe("space.update");
    expect((audit[0]!.before as Record<string, unknown>).dayRateMinor).toBe(50000);
    expect((audit[0]!.after as Record<string, unknown>).dayRateMinor).toBe(60000);
    expect(audit[0]!.actorId).toBe(ops.user.id);
  });

  it("can toggle status INACTIVE then back to ACTIVE (status IS in the update whitelist)", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "Toggle", status: "ACTIVE" });
    const off = await ops.patch(`${SPACES}/${space.id}`).send({ status: "INACTIVE" });
    expect(off.status).toBe(200);
    expect(off.body.data.status).toBe("INACTIVE");
    const on = await ops.patch(`${SPACES}/${space.id}`).send({ status: "ACTIVE" });
    expect(on.body.data.status).toBe("ACTIVE");
  });

  it("whitelist guard: currency / id / createdAt in the body are ignored", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "Guarded" });
    const res = await ops.patch(`${SPACES}/${space.id}`).send({ currency: "USD", id: "new-id", createdAt: "2000-01-01T00:00:00Z", name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Renamed");
    expect(res.body.data.id).toBe(space.id);
    expect(res.body.data.currency).toBe("ALL");
  });

  it("updates the full set of partial fields (kind, features, buffers, zone, adjacent, map) in one PATCH", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "FullPatch", kind: "MAIN" });
    const res = await ops.patch(`${SPACES}/${space.id}`).send({
      floor: -1,
      kind: "TRANSITIONAL",
      features: ["av_builtin", "step_free"],
      setupBufferMinutes: 30,
      teardownBufferMinutes: 45,
      zone: "F-1-core",
      adjacent: ["central_atrium"],
      map: { floor: -1, ring: "inner" },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.floor).toBe(-1);
    expect(res.body.data.kind).toBe("TRANSITIONAL");
    expect(res.body.data.features).toEqual(["av_builtin", "step_free"]);
    expect(res.body.data.setupBufferMinutes).toBe(30);
    expect(res.body.data.teardownBufferMinutes).toBe(45);
    expect(res.body.data.zone).toBe("F-1-core");
    expect(res.body.data.adjacent).toEqual(["central_atrium"]);
    expect(res.body.data.map).toEqual({ floor: -1, ring: "inner" });
  });

  it("updates F14 catalog fields and persists them", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "Cat" });
    const res = await ops.patch(`${SPACES}/${space.id}`).send({ slug: "roof_terrace", category: "TERRACE", isCirculation: true, ceilingCm: 600 });
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe("roof_terrace");
    expect(res.body.data.category).toBe("TERRACE");
    expect(res.body.data.isCirculation).toBe(true);
    expect(res.body.data.ceilingCm).toBe(600);
  });

  it("update to a slug already taken by another space → 422 fields.slug (not 500)", async () => {
    const ops = await loginAs("OPS");
    await ops.post(SPACES).send(validBody({ name: "Holder", slug: "north_foyer" }));
    const other = await ops.post(SPACES).send(validBody({ name: "Other", slug: "east_ring" }));
    const collide = await ops.patch(`${SPACES}/${other.body.data.id}`).send({ slug: "north_foyer" });
    expect(collide.status).toBe(422);
    expect(collide.body.error).toBe("validation");
    expect(collide.body.fields.slug).toBeDefined();
  });

  it("unknown id → 404 not_found (no audit row written)", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.patch(`${SPACES}/${UNKNOWN_ID}`).send({ name: "Ghost" });
    expectError(res, 404, "not_found", "common.not_found");
    expect(await prisma.auditEntry.count()).toBe(0);
  });

  it("a valid capacities replacement via PATCH is accepted and persisted", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "Recap", capacities: { THEATER: 100 } });
    const res = await ops.patch(`${SPACES}/${space.id}`).send({ capacities: { THEATER: 250, CLASSROOM: 120 } });
    expect(res.status).toBe(200);
    expect(res.body.data.capacities).toEqual({ THEATER: 250, CLASSROOM: 120 });
  });

  it("invalid update payload → 422 (bad capacity layout, bad value, bad rate, bad category, bad status)", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "V" });
    expect((await ops.patch(`${SPACES}/${space.id}`).send({ capacities: { WEDDING: 10 } })).body.fields.capacities).toBe("validation.enum");
    expect((await ops.patch(`${SPACES}/${space.id}`).send({ capacities: { THEATER: 0 } })).body.fields.capacities).toBe("validation.min");
    expect((await ops.patch(`${SPACES}/${space.id}`).send({ dayRateMinor: -1 })).body.fields.dayRateMinor).toBe("validation.min");
    expect((await ops.patch(`${SPACES}/${space.id}`).send({ category: "NOPE" })).body.fields.category).toBe("validation.enum");
    expect((await ops.patch(`${SPACES}/${space.id}`).send({ status: "ARCHIVED" })).body.fields.status).toBe("validation.enum");
  });
});

// ─────────────────────────────────────────────────────────── match / list
describe("GET /spaces — match + filter (F02-T03)", () => {
  it("filters by layout + minCapacity (capacity read for the requested layout)", async () => {
    const ops = await loginAs("OPS");
    await seedSpace({ name: "Big", capacities: { THEATER: 220, BANQUET: 120 } });
    await seedSpace({ name: "Tiny", capacities: { THEATER: 80 } });
    const res = await ops.get(`${SPACES}?minCapacity=180&layout=THEATER`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((s: { name: string }) => s.name)).toEqual(["Big"]);
  });

  it("excludes a space lacking the requested layout entirely", async () => {
    const ops = await loginAs("OPS");
    await seedSpace({ name: "TheaterOnly", capacities: { THEATER: 300 } });
    const res = await ops.get(`${SPACES}?minCapacity=10&layout=CLASSROOM`);
    expect(res.body.data).toHaveLength(0);
  });

  it("layout filter without minCapacity returns only spaces that support that layout", async () => {
    const ops = await loginAs("OPS");
    await seedSpace({ name: "HasBanquet", capacities: { THEATER: 100, BANQUET: 80 } });
    await seedSpace({ name: "NoBanquet", capacities: { THEATER: 100 } });
    const res = await ops.get(`${SPACES}?layout=BANQUET`);
    expect(res.body.data.map((s: { name: string }) => s.name)).toEqual(["HasBanquet"]);
  });

  it("without layout, minCapacity matches the space's MAX supported-layout capacity", async () => {
    const ops = await loginAs("OPS");
    await seedSpace({ name: "MaxBig", capacities: { THEATER: 220, BANQUET: 160 } });
    await seedSpace({ name: "MaxSmall", capacities: { THEATER: 90, BANQUET: 70 } });
    const res = await ops.get(`${SPACES}?minCapacity=200`);
    expect(res.body.data.map((s: { name: string }) => s.name)).toEqual(["MaxBig"]);
  });

  it("a minCapacity equal to the layout capacity is INCLUSIVE (≥)", async () => {
    const ops = await loginAs("OPS");
    await seedSpace({ name: "Exact", capacities: { THEATER: 150 } });
    const res = await ops.get(`${SPACES}?minCapacity=150&layout=THEATER`);
    expect(res.body.data.map((s: { name: string }) => s.name)).toEqual(["Exact"]);
  });

  it("INACTIVE spaces are never returned by match", async () => {
    const ops = await loginAs("OPS");
    await seedSpace({ name: "Live", capacities: { THEATER: 100 }, status: "ACTIVE" });
    await seedSpace({ name: "Dead", capacities: { THEATER: 100 }, status: "INACTIVE" });
    const res = await ops.get(SPACES);
    expect(res.body.data.map((s: { name: string }) => s.name)).toEqual(["Live"]);
  });

  it("results are sorted by name ascending", async () => {
    const ops = await loginAs("OPS");
    await seedSpace({ name: "Zephyr" });
    await seedSpace({ name: "Apex" });
    await seedSpace({ name: "Meridian" });
    const res = await ops.get(SPACES);
    expect(res.body.data.map((s: { name: string }) => s.name)).toEqual(["Apex", "Meridian", "Zephyr"]);
  });

  it("no spaces → empty list, still 200 with the list envelope", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.get(SPACES);
    expect(res.status).toBe(200);
    expect(res.body.messageKey).toBe("space.list.success");
    expect(res.body.data).toEqual([]);
  });

  it("invalid query params → 422 (bad minCapacity, bad layout, bad date)", async () => {
    const ops = await loginAs("OPS");
    expect((await ops.get(`${SPACES}?minCapacity=0`)).body.fields.minCapacity).toBe("validation.min");
    expect((await ops.get(`${SPACES}?minCapacity=abc`)).body.fields.minCapacity).toBe("validation.min");
    expect((await ops.get(`${SPACES}?layout=SOFA`)).body.fields.layout).toBe("validation.enum");
    expect((await ops.get(`${SPACES}?start=not-a-date&end=${W.end}`)).body.fields.start).toBe("validation.datetime");
  });
});

// ───────────────────────────────────────────── match windowed availability
describe("GET /spaces — windowed availability annotation (F02-T04)", () => {
  it("omits `available` when no window is supplied", async () => {
    const ops = await loginAs("OPS");
    await seedSpace({ name: "NoWindow" });
    const res = await ops.get(SPACES);
    expect(res.body.data[0].available).toBeUndefined();
  });

  it("omits `available` when only `start` (not both) is supplied", async () => {
    const ops = await loginAs("OPS");
    await seedSpace({ name: "HalfWindow" });
    const res = await ops.get(`${SPACES}?start=${W.start}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].available).toBeUndefined();
  });

  it("annotates available:false for a CONFIRMED booking in the window, true for a free window", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "Booked", capacities: { THEATER: 300 } });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });

    const busy = await ops.get(`${SPACES}?start=${W.start}&end=${W.end}`);
    expect(busy.body.data.find((s: { id: string }) => s.id === space.id).available).toBe(false);

    const free = await ops.get(`${SPACES}?start=${FREE.start}&end=${FREE.end}`);
    expect(free.body.data.find((s: { id: string }) => s.id === space.id).available).toBe(true);
  });

  it("buffer-aware: a probe window overlapping ONLY via setup/teardown buffers is busy", async () => {
    const ops = await loginAs("OPS");
    // event 09:00–18:00, teardown 120m → effective end 20:00. A 18:30–19:00 probe
    // falls inside the teardown buffer → must be busy even though the EVENT ended.
    const space = await seedSpace({ name: "Buffered", capacities: { THEATER: 100 }, setupBufferMinutes: 240, teardownBufferMinutes: 120 });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const within = await ops.get(`${SPACES}?start=2026-07-22T18:30:00Z&end=2026-07-22T19:00:00Z`);
    expect(within.body.data.find((s: { id: string }) => s.id === space.id).available).toBe(false);
  });

  it("a live HELD lease blocks; a lapsed HELD lease and a RELEASED hold do not", async () => {
    const ops = await loginAs("OPS");
    const req = await seedRequest();
    const live = await seedSpace({ name: "LiveHold", capacities: { THEATER: 100 } });
    const lapsed = await seedSpace({ name: "LapsedHold", capacities: { THEATER: 100 } });
    const released = await seedSpace({ name: "ReleasedHold", capacities: { THEATER: 100 } });
    await seedReservation({ space: live, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() + 1_800_000) });
    await seedReservation({ space: lapsed, requestId: req.id, start: W.start, end: W.end, status: "HELD", expiresAt: new Date(Date.now() - 1_000) });
    await seedReservation({ space: released, requestId: req.id, start: W.start, end: W.end, status: "RELEASED" });

    const res = await ops.get(`${SPACES}?start=${W.start}&end=${W.end}`);
    const byId = (id: string) => res.body.data.find((s: { id: string }) => s.id === id).available;
    expect(byId(live.id)).toBe(false);
    expect(byId(lapsed.id)).toBe(true);
    expect(byId(released.id)).toBe(true);
  });
});

// ─────────────────────────────────────────── GET /:id/availability (F05-T05)
describe("GET /spaces/:id/availability — single-space deep check", () => {
  it("free window → available:true with no conflicting requests", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "Deep" });
    const res = await ops.get(`${SPACES}/${space.id}/availability?start=${FREE.start}&end=${FREE.end}`);
    expect(res.status).toBe(200);
    expect(res.body.messageKey).toBe("space.availability.success");
    expect(res.body.data.available).toBe(true);
    expect(res.body.data.conflictingRequestIds).toEqual([]);
  });

  it("busy window → available:false and surfaces the conflicting requestId", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "DeepBusy" });
    const req = await seedRequest();
    await seedReservation({ space, requestId: req.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const res = await ops.get(`${SPACES}/${space.id}/availability?start=${W.start}&end=${W.end}`);
    expect(res.body.data.available).toBe(false);
    expect(res.body.data.conflictingRequestIds).toContain(req.id);
  });

  it("invalid range (start ≥ end) → 422 fields.end (range)", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "Range" });
    const res = await ops.get(`${SPACES}/${space.id}/availability?start=${W.end}&end=${W.start}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("validation");
    expect(res.body.fields.end).toBe("validation.range");
  });

  it("equal start and end (zero-length) → 422 (start must be before end)", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "Zero" });
    const res = await ops.get(`${SPACES}/${space.id}/availability?start=${W.start}&end=${W.start}`);
    expect(res.status).toBe(422);
    expect(res.body.fields.end).toBe("validation.range");
  });

  it("missing start/end → 422 (both required)", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "Req" });
    const res = await ops.get(`${SPACES}/${space.id}/availability`);
    expect(res.status).toBe(422);
    expect(res.body.fields.start).toBe("validation.datetime");
    expect(res.body.fields.end).toBe("validation.datetime");
  });

  it("malformed date → 422 fields.start", async () => {
    const ops = await loginAs("OPS");
    const space = await seedSpace({ name: "Mal" });
    const res = await ops.get(`${SPACES}/${space.id}/availability?start=yesterday&end=${W.end}`);
    expect(res.status).toBe(422);
    expect(res.body.fields.start).toBe("validation.datetime");
  });

  it("unknown space id → 404 not_found (exact contract)", async () => {
    const ops = await loginAs("OPS");
    const res = await ops.get(`${SPACES}/${UNKNOWN_ID}/availability?start=${W.start}&end=${W.end}`);
    expectError(res, 404, "not_found", "common.not_found");
  });
});

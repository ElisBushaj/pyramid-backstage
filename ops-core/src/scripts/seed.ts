/**
 * Deterministic demo seed (F12). Stable ids for spaces/assets/users; events +
 * reservations are created through the REAL service paths (hold → quote → tasks
 * → approve) so they carry valid effective windows + audit + outbox. Plants a
 * conflict: Blue Hall is occupied at window W1, so a hold there returns 409 and
 * the conflict→alternatives demo/e2e works.
 *
 *   pnpm db:seed            — upsert spaces/assets/users; create events if none
 *   pnpm db:seed -- --reset — wipe domain data first, then reseed deterministically
 *
 * Refuses to create users / reset against NODE_ENV=production.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../config/prisma";
import { vars } from "../config/vars";
import { hashPassword } from "../utils/password";
import type { Actor } from "../types";
import { requestsService } from "../modules/requests/service";
import { reservationsService } from "../modules/reservations/service";
import { quotesService } from "../modules/quotes/service";
import { tasksService } from "../modules/tasks/service";
import { approvalsService } from "../modules/approvals/service";

const id = (n: number, kind: string) => {
  const tag = { space: "5", asset: "a", user: "c" }[kind] ?? "0";
  return `${tag}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
};

// The 19-space catalog is the single shared source (ops-core seed + AI venue_facts + FloorMap).
// Rows 1-6 are byte-authoritative vs the original seed; 7-19 add transitional/upper spaces.
// See docs/03-data/spaces.catalog.json + docs/08-decisions/0013-space-catalog-extension-fields.md.
type CatalogSpace = {
  id: string; slug: string; name: string; floor: number; kind: "MAIN" | "TRANSITIONAL";
  category: string; zone: string; isCirculation: boolean;
  capacities: Record<string, number>; features: string[];
  dayRateMinor: number; setupBufferMinutes: number; teardownBufferMinutes: number;
  adjacent: string[]; map: unknown; ceilingCm?: number;
};
const CATALOG_PATH = resolve(__dirname, "../../../docs/03-data/spaces.catalog.json");
const CATALOG = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as { spaces: CatalogSpace[] };

const SPACES = CATALOG.spaces.map((s) => ({
  id: s.id, name: s.name, floor: s.floor, kind: s.kind,
  capacities: s.capacities, features: s.features, dayRateMinor: s.dayRateMinor,
  setupBufferMinutes: s.setupBufferMinutes, teardownBufferMinutes: s.teardownBufferMinutes,
  slug: s.slug, category: s.category, zone: s.zone, isCirculation: s.isCirculation,
  adjacent: s.adjacent, map: s.map as object,
  ...(s.ceilingCm !== undefined ? { ceilingCm: s.ceilingCm } : {}),
}));

const ASSETS = [
  { id: id(1, "asset"), name: "Standard chair", type: "SEATING" as const, totalQuantity: 400, location: "Storage -1" },
  { id: id(2, "asset"), name: "Round table (8p)", type: "TABLE" as const, totalQuantity: 80, location: "Storage -1" },
  { id: id(3, "asset"), name: "Wireless mic", type: "MICROPHONE" as const, totalQuantity: 12, location: "AV Room 0" },
  { id: id(4, "asset"), name: "LED screen 2x3m", type: "SCREEN" as const, totalQuantity: 6, location: "AV Room 0" },
  { id: id(5, "asset"), name: "Projector 5000lm", type: "PROJECTOR" as const, totalQuantity: 6, location: "AV Room 0" },
  { id: id(6, "asset"), name: "Stage deck 2x1m", type: "STAGE_UNIT" as const, totalQuantity: 10, location: "Storage -1" },
];

const USERS = [
  { id: id(1, "user"), email: "admin@pyramid.al", name: "Ada Admin", role: "ADMIN" as const },
  { id: id(2, "user"), email: "manager@pyramid.al", name: "Mira Manager", role: "MANAGER" as const },
  { id: id(3, "user"), email: "ops@pyramid.al", name: "Otto Ops", role: "OPS" as const },
  { id: id(4, "user"), email: "viewer@pyramid.al", name: "Vera Viewer", role: "VIEWER" as const },
  // F15 — an external event partner. Submits via the portal; sees only their own requests.
  { id: id(5, "user"), email: "partner@acme.al", name: "Pjeter Partner", role: "PARTNER" as const },
];
const DEV_PASSWORD = "Password123!";

const BLUE = id(1, "space");
const GREEN = id(3, "space");
const CHAIRS = id(1, "asset");
const MICS = id(3, "asset");
const W1 = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" }; // planted-conflict window in Blue
const W2 = { start: "2026-07-24T09:00:00Z", end: "2026-07-24T18:00:00Z" };

export const SEED = { SPACES, ASSETS, USERS, DEV_PASSWORD, BLUE, GREEN, CHAIRS, W1, W2 };

async function resetDomain() {
  const tables = ["AuditEntry", "OutboxEvent", "ReservationAsset", "Reservation", "Quote", "Task", "EventRequest", "IdempotencyKey", "Session", "Asset", "Space", "User"];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"public"."${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

async function seedSpaces() {
  for (const s of SPACES) await prisma.space.upsert({ where: { id: s.id }, update: s, create: s });
}
async function seedAssets() {
  for (const a of ASSETS) await prisma.asset.upsert({ where: { id: a.id }, update: a, create: { ...a, status: "ACTIVE" } });
}
async function seedUsers() {
  if (vars.isProd) {
    console.warn("[seed] NODE_ENV=production — skipping user seed");
    return;
  }
  const passwordHash = await hashPassword(DEV_PASSWORD);
  for (const u of USERS) {
    await prisma.user.upsert({ where: { id: u.id }, update: { email: u.email, name: u.name, role: u.role, isActive: true }, create: { ...u, passwordHash, isActive: true } });
  }
}

async function seedEvents(actor: Actor) {
  if ((await prisma.eventRequest.count()) > 0) {
    console.log("[seed] events already present — skipping (use --reset to rebuild)");
    return;
  }

  // E1 — fully planned + APPROVED → SCHEDULED. Occupies Blue Hall at W1 (the planted conflict).
  const e1 = (await requestsService.create(actor, {
    title: "FinTech Startup Conference", organizerName: "Acme Ventures", contactEmail: "events@acme.al",
    expectedAttendees: 180, eventType: "CONFERENCE", preferredDates: [W1], requirements: { layout: "THEATER", avNeeded: true },
  })).data;
  const r1 = (await reservationsService.hold(actor, { requestId: e1.id, spaceId: BLUE, dateRange: W1, assets: [{ assetId: CHAIRS, quantity: 180 }, { assetId: MICS, quantity: 4 }] })).data;
  await quotesService.generate(actor, { requestId: e1.id, reservationId: r1.id, extraLineItems: [{ label: "Catering (180 pax)", qty: 180, unitPriceMinor: 1200 }] });
  await tasksService.persist(actor, e1.id, [
    { title: "Set up theater seating (180)", phase: "SETUP", owner: "ops_team", dueOffsetHours: -4 },
    { title: "AV + sound check", phase: "SETUP", owner: "av_team", dueOffsetHours: -2 },
    { title: "Strike seating + clean", phase: "TEARDOWN", owner: "ops_team", dueOffsetHours: 2 },
  ]);
  await approvalsService.approve(actor, e1.id);

  // E2 — proposed plan in Green Hall at W2 (no conflict), held + quoted.
  const e2 = (await requestsService.create(actor, {
    title: "Annual Tech Summit", organizerName: "Tirana Tech Collective", contactEmail: "hello@ttc.al",
    expectedAttendees: 110, eventType: "CONFERENCE", preferredDates: [W2], requirements: { layout: "THEATER" },
  })).data;
  await reservationsService.hold(actor, { requestId: e2.id, spaceId: GREEN, dateRange: W2, assets: [{ assetId: CHAIRS, quantity: 110 }] });
  await quotesService.generate(actor, { requestId: e2.id });

  // E3 — fresh inquiry (DRAFT), the conflict→alternatives demo target (wants Blue at W1).
  // F15 — submitted by the PARTNER via the portal, so it shows in their "my requests".
  const partner = USERS[4]!;
  await requestsService.create({ id: partner.id, name: partner.name, role: "PARTNER" }, {
    title: "Community Art Exhibition", organizerName: "Open Studio", contactEmail: "studio@open.al",
    expectedAttendees: 160, eventType: "EXHIBITION", preferredDates: [W1, W2], requirements: { layout: "RECEPTION" },
  });

  console.log("[seed] created 3 events (E1 SCHEDULED in Blue@W1 = planted conflict, E2 PROPOSED in Green@W2, E3 DRAFT by PARTNER)");
}

export async function runSeed(opts: { reset?: boolean } = {}): Promise<void> {
  if (opts.reset) {
    if (vars.isProd) throw new Error("refusing to --reset against NODE_ENV=production");
    await resetDomain();
  }
  await seedSpaces();
  await seedAssets();
  await seedUsers();
  const admin = USERS[0]!;
  await seedEvents({ id: admin.id, name: admin.name, role: "ADMIN" });
}

if (require.main === module) {
  void runSeed({ reset: process.argv.includes("--reset") })
    .then(async () => {
      console.log(`[seed] done — ${SPACES.length} spaces, ${ASSETS.length} assets, ${vars.isProd ? 0 : USERS.length} users.`);
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error("[seed] failed:", e);
      await prisma.$disconnect();
      process.exit(1);
    });
}

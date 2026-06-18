/**
 * Demo seed. F12 expands this with staff users (per role) + 2-3 events and a
 * DELIBERATE planted conflict. This scaffold seeds the 4 halls + transitional
 * areas + realistic inventory so the dashboard has data on first boot.
 */
import { prisma } from "../config/prisma";

const SPACES = [
  { name: "Blue Hall",   floor: 0,  kind: "MAIN" as const, capacities: { THEATER: 220, CLASSROOM: 120, BANQUET: 160, RECEPTION: 300 }, features: ["stage", "av_builtin", "step_free"], dayRateMinor: 80000 },
  { name: "Orange Hall", floor: 0,  kind: "MAIN" as const, capacities: { THEATER: 180, CLASSROOM: 100, BANQUET: 140, RECEPTION: 240 }, features: ["av_builtin", "step_free"], dayRateMinor: 70000 },
  { name: "Green Hall",  floor: -1, kind: "MAIN" as const, capacities: { THEATER: 120, CLASSROOM: 70,  BANQUET: 90,  RECEPTION: 160 }, features: ["natural_light"], dayRateMinor: 55000 },
  { name: "Yellow Hall", floor: -1, kind: "MAIN" as const, capacities: { THEATER: 90,  CLASSROOM: 50,  BANQUET: 70,  RECEPTION: 120 }, features: ["step_free"], dayRateMinor: 45000 },
  { name: "Entrance Atrium", floor: 0, kind: "TRANSITIONAL" as const, capacities: { RECEPTION: 250 }, features: ["natural_light", "step_free"], dayRateMinor: 30000 },
  { name: "Lower Corridor",  floor: -1, kind: "TRANSITIONAL" as const, capacities: { RECEPTION: 120 }, features: [], dayRateMinor: 15000 },
];

const ASSETS = [
  { name: "Standard chair",   type: "SEATING" as const,    totalQuantity: 400, location: "Storage -1" },
  { name: "Round table (8p)", type: "TABLE" as const,      totalQuantity: 80,  location: "Storage -1" },
  { name: "Wireless mic",     type: "MICROPHONE" as const, totalQuantity: 12,  location: "AV Room 0" },
  { name: "LED screen 2x3m",  type: "SCREEN" as const,     totalQuantity: 6,   location: "AV Room 0" },
  { name: "Projector 5000lm", type: "PROJECTOR" as const,  totalQuantity: 6,   location: "AV Room 0" },
  { name: "Stage deck 2x1m",  type: "STAGE_UNIT" as const, totalQuantity: 10,  location: "Storage -1" },
];

async function main() {
  for (const s of SPACES) {
    await prisma.space.upsert({ where: { id: s.name }, update: {}, create: { ...s } }).catch(async () => {
      const exists = await prisma.space.findFirst({ where: { name: s.name } });
      if (!exists) await prisma.space.create({ data: s });
    });
  }
  for (const a of ASSETS) {
    const exists = await prisma.asset.findFirst({ where: { name: a.name } });
    if (!exists) await prisma.asset.create({ data: a });
  }
  // TODO(F12-T03/T04): seed staff users per role + 2-3 events + the planted conflict.
  // eslint-disable-next-line no-console
  console.log(`Seeded ${SPACES.length} spaces, ${ASSETS.length} asset lines.`);
  await prisma.$disconnect();
}

void main();

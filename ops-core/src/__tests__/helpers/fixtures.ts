import { prisma } from "./integration";
import { effectiveWindow } from "../../utils/time";
import type { ReservationStatus } from "../../types/api/reservations";

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;

export function seedSpace(over: Partial<{ name: string; floor: number; kind: "MAIN" | "TRANSITIONAL"; capacities: Record<string, number>; dayRateMinor: number; setupBufferMinutes: number; teardownBufferMinutes: number; status: "ACTIVE" | "INACTIVE" }> = {}) {
  return prisma.space.create({
    data: {
      name: over.name ?? `Hall ${uniq()}`,
      floor: over.floor ?? 0,
      kind: over.kind ?? "MAIN",
      capacities: over.capacities ?? { THEATER: 200, BANQUET: 150 },
      dayRateMinor: over.dayRateMinor ?? 80000,
      setupBufferMinutes: over.setupBufferMinutes ?? 240,
      teardownBufferMinutes: over.teardownBufferMinutes ?? 120,
      status: over.status ?? "ACTIVE",
    },
  });
}

export function seedAsset(over: Partial<{ name: string; type: "SEATING" | "TABLE" | "MICROPHONE" | "SCREEN" | "PROJECTOR" | "STAGE_UNIT" | "LIGHTING" | "OTHER"; totalQuantity: number; location: string; status: "ACTIVE" | "MAINTENANCE" | "RETIRED" }> = {}) {
  return prisma.asset.create({
    data: {
      name: over.name ?? `Asset ${uniq()}`,
      type: over.type ?? "SEATING",
      totalQuantity: over.totalQuantity ?? 400,
      location: over.location ?? "Storage -1",
      status: over.status ?? "ACTIVE",
    },
  });
}

export function seedRequest(over: Partial<{ title: string; status: "DRAFT" | "PROPOSED" | "APPROVED" | "SCHEDULED" | "COMPLETED" | "REJECTED"; createdById: string }> = {}) {
  return prisma.eventRequest.create({
    data: {
      title: over.title ?? `Event ${uniq()}`,
      organizerName: "Acme",
      expectedAttendees: 100,
      eventType: "CONFERENCE",
      preferredDates: [{ start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" }],
      status: over.status ?? "DRAFT",
      createdById: over.createdById ?? null,
    },
  });
}

/** Insert a quote row directly (test fixture). Money defaults are self-consistent (net+vat=total). */
export function seedQuote(over: {
  requestId: string;
  status?: "DRAFT" | "SENT" | "ACCEPTED" | "EXPIRED";
  version?: number;
  netMinor?: number;
  vatRate?: number;
  vatMinor?: number;
  totalMinor?: number;
  lineItems?: unknown;
  expiresAt?: Date | null;
}) {
  const netMinor = over.netMinor ?? 100000;
  const vatRate = over.vatRate ?? 0.2;
  const vatMinor = over.vatMinor ?? Math.round(netMinor * vatRate);
  return prisma.quote.create({
    data: {
      requestId: over.requestId,
      lineItems: (over.lineItems ?? [{ label: "Hall", kind: "SPACE", qty: 1, unitPriceMinor: netMinor, subtotalMinor: netMinor }]) as never,
      netMinor,
      vatRate,
      vatMinor,
      totalMinor: over.totalMinor ?? netMinor + vatMinor,
      status: over.status ?? "DRAFT",
      version: over.version ?? 1,
      expiresAt: over.expiresAt !== undefined ? over.expiresAt : new Date(Date.now() + 14 * 86_400_000),
    },
  });
}

/** Insert a task row directly (test fixture). */
export function seedTask(over: {
  requestId: string;
  title?: string;
  phase?: "SETUP" | "TEARDOWN";
  owner?: string | null;
  assigneeId?: string | null;
  dueOffsetHours?: number | null;
  dueAt?: Date | null;
  status?: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
}) {
  return prisma.task.create({
    data: {
      requestId: over.requestId,
      title: over.title ?? `Task ${uniq()}`,
      phase: over.phase ?? "SETUP",
      owner: over.owner ?? null,
      assigneeId: over.assigneeId ?? null,
      dueOffsetHours: over.dueOffsetHours ?? null,
      dueAt: over.dueAt ?? null,
      status: over.status ?? "TODO",
    },
  });
}

/** Insert an asset-movement ledger row directly (F16 test fixture). */
export function seedAssetMovement(over: {
  assetId: string;
  action?: "CHECK_OUT" | "CHECK_IN" | "RELOCATE";
  quantity?: number;
  fromLocation?: string | null;
  toLocation?: string;
  reservationId?: string | null;
  actorId?: string | null;
  note?: string | null;
  at?: Date;
}) {
  return prisma.assetMovement.create({
    data: {
      assetId: over.assetId,
      action: over.action ?? "CHECK_OUT",
      quantity: over.quantity ?? 1,
      fromLocation: over.fromLocation ?? "Storage -1",
      toLocation: over.toLocation ?? "Blue Hall",
      reservationId: over.reservationId ?? null,
      actorId: over.actorId ?? null,
      note: over.note ?? null,
      ...(over.at ? { at: over.at } : {}),
    },
  });
}

/** Insert a reservation row directly with computed effective windows (test fixture). */
export async function seedReservation(args: {
  space: { id: string; setupBufferMinutes: number; teardownBufferMinutes: number };
  requestId: string;
  start: string | Date;
  end: string | Date;
  status?: ReservationStatus;
  expiresAt?: Date | null;
  assets?: Array<{ assetId: string; quantity: number }>;
}) {
  const start = new Date(args.start);
  const end = new Date(args.end);
  const eff = effectiveWindow(start, end, args.space.setupBufferMinutes, args.space.teardownBufferMinutes);
  const status = args.status ?? "CONFIRMED";
  const expiresAt =
    args.expiresAt !== undefined ? args.expiresAt : status === "HELD" ? new Date(Date.now() + 1_800_000) : null;
  return prisma.reservation.create({
    data: {
      requestId: args.requestId,
      spaceId: args.space.id,
      start,
      end,
      effectiveStart: eff.start,
      effectiveEnd: eff.end,
      status,
      expiresAt,
      assets: { create: (args.assets ?? []).map((a) => ({ assetId: a.assetId, quantity: a.quantity })) },
    },
  });
}

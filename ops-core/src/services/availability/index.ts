import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { effectiveWindow, type Interval } from "../../utils/time";

/**
 * Windowed space + asset availability — the read side of the correctness core
 * (CONFLICTS.md). Overlap is always tested half-open on the EFFECTIVE window
 * (padded by setup/teardown buffers) and only counts live holds: CONFIRMED, or
 * HELD whose lease has not lapsed (expiresAt > now). Lapsed holds never block.
 *
 * All overlap filtering happens in SQL against the
 * Reservation[spaceId,status,effectiveStart,effectiveEnd] /
 * ReservationAsset[assetId] indexes — never a per-row JS scan.
 */

type Tx = Prisma.TransactionClient | typeof prisma;

/** Live-reservation status predicate as a Prisma `where` fragment. */
function liveStatus(now: Date): Prisma.ReservationWhereInput {
  return { OR: [{ status: "CONFIRMED" }, { status: "HELD", expiresAt: { gt: now } }] };
}

export interface SpaceAvailabilityResult {
  spaceId: string;
  available: boolean;
  conflictingRequestIds: string[];
}

/**
 * Reservations on `spaceId` whose effective window half-open-overlaps the given
 * effective window. `excludeReservationId` skips a row (e.g. the one being
 * confirmed). Returns the minimal {requestId, start, end} needed by callers.
 */
export async function overlappingSpaceReservations(
  tx: Tx,
  spaceId: string,
  effStart: Date,
  effEnd: Date,
  now: Date,
  excludeReservationId?: string,
): Promise<Array<{ requestId: string; start: Date; end: Date }>> {
  return tx.reservation.findMany({
    where: {
      spaceId,
      ...liveStatus(now),
      effectiveStart: { lt: effEnd },
      effectiveEnd: { gt: effStart },
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    },
    select: { requestId: true, start: true, end: true },
  });
}

/** Buffer-aware availability for one space over an EVENT window [start,end]. */
export async function spaceAvailability(
  spaceId: string,
  start: Date,
  end: Date,
  tx: Tx = prisma,
): Promise<SpaceAvailabilityResult> {
  const space = await tx.space.findUnique({ where: { id: spaceId } });
  if (!space) return { spaceId, available: false, conflictingRequestIds: [] };
  const eff = effectiveWindow(start, end, space.setupBufferMinutes, space.teardownBufferMinutes);
  const rows = await overlappingSpaceReservations(tx, spaceId, eff.start, eff.end, new Date());
  return {
    spaceId,
    available: rows.length === 0,
    conflictingRequestIds: [...new Set(rows.map((r) => r.requestId))],
  };
}

/**
 * Σ of held quantity per asset over the window, as a SINGLE grouped query.
 * `effStart`/`effEnd` is the window to test against each reservation's effective
 * window (callers pass the raw event window for GET /assets, or the new
 * reservation's effective window inside the hold transaction).
 */
export async function assetHeldQuantities(
  tx: Tx,
  assetIds: string[],
  effStart: Date,
  effEnd: Date,
  excludeReservationId?: string,
): Promise<Map<string, number>> {
  const held = new Map<string, number>();
  if (assetIds.length === 0) return held;
  const exclude = excludeReservationId
    ? Prisma.sql`AND r.id <> ${excludeReservationId}`
    : Prisma.empty;
  const rows = await tx.$queryRaw<Array<{ assetId: string; held: number }>>`
    SELECT ra."assetId" AS "assetId", COALESCE(SUM(ra.quantity), 0)::int AS held
    FROM "ReservationAsset" ra
    JOIN "Reservation" r ON r.id = ra."reservationId"
    WHERE ra."assetId" IN (${Prisma.join(assetIds)})
      AND (r.status = 'CONFIRMED' OR (r.status = 'HELD' AND r."expiresAt" > NOW()))
      AND r."effectiveStart" < ${effEnd}
      AND r."effectiveEnd" > ${effStart}
      ${exclude}
    GROUP BY ra."assetId"`;
  for (const row of rows) held.set(row.assetId, Number(row.held));
  return held;
}

export interface AssetLike {
  id: string;
  totalQuantity: number;
  status: string;
}

/**
 * availableQuantity per asset = totalQuantity − Σ overlapping holds.
 * MAINTENANCE / RETIRED report 0.
 */
export async function assetAvailability(
  assets: AssetLike[],
  start: Date,
  end: Date,
  tx: Tx = prisma,
  excludeReservationId?: string,
): Promise<Map<string, number>> {
  const active = assets.filter((a) => a.status === "ACTIVE");
  const held = await assetHeldQuantities(tx, active.map((a) => a.id), start, end, excludeReservationId);
  const result = new Map<string, number>();
  for (const a of assets) {
    if (a.status !== "ACTIVE") result.set(a.id, 0);
    else result.set(a.id, Math.max(0, a.totalQuantity - (held.get(a.id) ?? 0)));
  }
  return result;
}

export type { Interval };

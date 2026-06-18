import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { effectiveWindow, overlaps, toIso, type Interval } from "../../utils/time";
import {
  assetAvailability,
  overlappingSpaceReservations,
} from "../availability";
import type { Conflict } from "../../types/api/conflicts";

type Tx = Prisma.TransactionClient | typeof prisma;

export interface DetectParams {
  spaceId?: string;
  /** The EVENT window (dateRange). The engine pads it by the space buffers. */
  start: Date;
  end: Date;
  requestedAssets?: Array<{ assetId: string; quantity: number }>;
  /** Skip this reservation (e.g. when re-checking the row being confirmed). */
  excludeReservationId?: string;
  tx?: Tx;
}

/**
 * The authoritative, read-only conflict check (CONFLICTS.md). Pure — no writes,
 * no decrement — so it runs identically proactively (GET /conflicts) and inside
 * the F06 hold transaction against the locked state. Deterministic for a given
 * DB state.
 */
export async function detectConflicts(p: DetectParams): Promise<Conflict[]> {
  const tx: Tx = p.tx ?? prisma;
  const now = new Date();
  const conflicts: Conflict[] = [];
  const eventIso = { start: toIso(p.start), end: toIso(p.end) };

  // Effective window for the requested event (used for both space + asset checks).
  let eff: Interval = { start: p.start, end: p.end };
  let spaceName = "The space";
  if (p.spaceId) {
    const space = await tx.space.findUnique({ where: { id: p.spaceId } });
    if (space) {
      spaceName = space.name;
      eff = effectiveWindow(p.start, p.end, space.setupBufferMinutes, space.teardownBufferMinutes);

      const rows = await overlappingSpaceReservations(tx, p.spaceId, eff.start, eff.end, now, p.excludeReservationId);
      if (rows.length) {
        const eventClashes = rows.filter((r) => overlaps({ start: p.start, end: p.end }, { start: r.start, end: r.end }));
        if (eventClashes.length) {
          const ids = [...new Set(eventClashes.map((r) => r.requestId))];
          conflicts.push({
            type: "SPACE_DOUBLE_BOOKED",
            spaceId: p.spaceId,
            conflictingRequestIds: ids,
            window: eventIso,
            detail: `${spaceName} is already reserved for ${ids.join(", ")} in this window.`,
          });
        } else {
          // event windows don't overlap, but the buffer (setup/teardown) zones do
          const ids = [...new Set(rows.map((r) => r.requestId))];
          conflicts.push({
            type: "SETUP_WINDOW_OVERLAP",
            spaceId: p.spaceId,
            conflictingRequestIds: ids,
            window: eventIso,
            detail: `Not enough setup/teardown turnaround around ${spaceName} versus ${ids.join(", ")}.`,
          });
        }
      }
    }
  }

  if (p.requestedAssets?.length) {
    const ids = p.requestedAssets.map((a) => a.assetId);
    const assets = await tx.asset.findMany({ where: { id: { in: ids } } });
    const avail = await assetAvailability(assets, eff.start, eff.end, tx, p.excludeReservationId);
    for (const req of p.requestedAssets) {
      const asset = assets.find((a) => a.id === req.assetId);
      const available = avail.get(req.assetId) ?? 0;
      if (req.quantity > available) {
        const label = asset?.name ?? "units";
        const total = asset?.totalQuantity ?? 0;
        conflicts.push({
          type: "ASSET_OVERALLOCATED",
          assetId: req.assetId,
          requested: req.quantity,
          available,
          window: eventIso,
          detail: `Only ${available} of ${total} ${label} free in this window (requested ${req.quantity}).`,
        });
      }
    }
  }

  return conflicts;
}

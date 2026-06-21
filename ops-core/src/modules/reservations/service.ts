import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { APIError } from "../../errors";
import { ok, type ServiceResponse, type Actor } from "../../types";
import { vars } from "../../config/vars";
import type { Reservation, ReservationInput, ScheduleEntry } from "../../types/api/reservations";
import type { Conflict } from "../../types/api/conflicts";
import { effectiveWindow, isValidRange } from "../../utils/time";
import { isSerializationError } from "../../utils/tx";
import { detectConflicts } from "../../services/conflict";
import { writeAudit, writeSystemAudit } from "../audit/audit.writer";
import { reservationToDto, type ReservationRow } from "./mapper";

const MAX_HOLD_ATTEMPTS = 4;

/** Internal: a conflict found inside the locked transaction — aborts the hold. */
class HoldConflict extends Error {
  constructor(public conflicts: Conflict[]) {
    super("hold_conflict");
  }
}

/** Confirm a HELD reservation inside the caller's transaction (reused by F10 approve). */
export async function confirmReservationTx(
  tx: Prisma.TransactionClient,
  reservation: { id: string; requestId: string; spaceId: string; status: string },
  actor: Actor,
) {
  // Compare-and-set: only a still-HELD row may be confirmed. A row reaped/released
  // between the caller's read and this write → count 0 → 409, never a resurrection.
  const cas = await tx.reservation.updateMany({ where: { id: reservation.id, status: "HELD" }, data: { status: "CONFIRMED", expiresAt: null } });
  if (cas.count === 0) throw APIError.invalidTransition(reservation.status, "CONFIRMED", "reservation.invalid_transition");
  const u = await tx.reservation.findUnique({ where: { id: reservation.id }, include: { assets: true } });
  await writeAudit(tx, { actor, action: "reservation.confirm", entityType: "Reservation", entityId: reservation.id, requestId: reservation.requestId, before: { status: "HELD" }, after: { status: "CONFIRMED" } });
  return u;
}

/** Release a reservation inside the caller's transaction (reused by F10 reject). */
export async function releaseReservationTx(
  tx: Prisma.TransactionClient,
  reservation: { id: string; requestId: string; spaceId: string; status: string },
  actor: Actor,
) {
  // Compare-and-set: skip a row already RELEASED so a concurrent release/reap is a no-op.
  const cas = await tx.reservation.updateMany({ where: { id: reservation.id, status: { not: "RELEASED" } }, data: { status: "RELEASED", expiresAt: null } });
  if (cas.count === 0) return;
  await writeAudit(tx, { actor, action: "reservation.release", entityType: "Reservation", entityId: reservation.id, requestId: reservation.requestId, before: { status: reservation.status }, after: { status: "RELEASED" } });
}

class ReservationsService {
  /**
   * Atomic hold (RESERVATIONS.md): inside a serializable transaction, lock the
   * space + asset rows (FOR UPDATE), re-run detectConflicts against the locked
   * state, and only then insert the HELD reservation + assets + audit.
   * Any conflict aborts the whole transaction → 409 {conflicts}; nothing is
   * half-written. The check and the write are never separate statements.
   */
  async hold(actor: Actor, input: ReservationInput): Promise<ServiceResponse<Reservation>> {
    const start = new Date(input.dateRange.start);
    const end = new Date(input.dateRange.end);
    if (!isValidRange(start, end)) throw APIError.validation({ dateRange: "validation.range" });

    const request = await prisma.eventRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw APIError.notFound();
    const space = await prisma.space.findUnique({ where: { id: input.spaceId } });
    if (!space) throw APIError.notFound();

    const requestedAssets = (input.assets ?? []).map((a) => ({ assetId: a.assetId, quantity: a.quantity }));
    const assetIds = requestedAssets.map((a) => a.assetId);
    const holdMinutes = input.holdMinutes ?? vars.holdMinutesDefault;

    for (let attempt = 0; attempt < MAX_HOLD_ATTEMPTS; attempt++) {
      try {
        const created = await prisma.$transaction(
          async (tx) => {
            // 1. Row locks: serialize any concurrent hold touching this space/assets.
            await tx.$queryRaw`SELECT id FROM "Space" WHERE id = ${input.spaceId} FOR UPDATE`;
            if (assetIds.length) {
              await tx.$queryRaw(Prisma.sql`SELECT id FROM "Asset" WHERE id IN (${Prisma.join(assetIds)}) FOR UPDATE`);
            }
            // 2. Authoritative re-check against the locked, committed state.
            const conflicts = await detectConflicts({ spaceId: input.spaceId, start, end, requestedAssets, tx });
            if (conflicts.length) throw new HoldConflict(conflicts);
            // 3. Insert the hold + assets + audit in this same transaction.
            const eff = effectiveWindow(start, end, space.setupBufferMinutes, space.teardownBufferMinutes);
            const row = await tx.reservation.create({
              data: {
                requestId: input.requestId,
                spaceId: input.spaceId,
                start,
                end,
                effectiveStart: eff.start,
                effectiveEnd: eff.end,
                status: "HELD",
                expiresAt: new Date(Date.now() + holdMinutes * 60_000),
                createdById: actor.id,
                assets: { create: requestedAssets.map((a) => ({ assetId: a.assetId, quantity: a.quantity })) },
              },
              include: { assets: true },
            });
            await writeAudit(tx, {
              actor, action: "reservation.hold", entityType: "Reservation", entityId: row.id, requestId: input.requestId,
              after: { spaceId: row.spaceId, status: "HELD", expiresAt: row.expiresAt },
            });
            // A hold means a plan now exists → move the request DRAFT → PROPOSED.
            if (request.status === "DRAFT") {
              await tx.eventRequest.update({ where: { id: input.requestId }, data: { status: "PROPOSED" } });
              await writeAudit(tx, { actor, action: "request.transition", entityType: "EventRequest", entityId: input.requestId, requestId: input.requestId, before: { status: "DRAFT" }, after: { status: "PROPOSED" } });
            }
            return row;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return ok(reservationToDto(created), "reservation.held");
      } catch (e) {
        if (e instanceof HoldConflict) {
          throw APIError.conflict(e.conflicts, "reservation.conflict");
        }
        if (!isSerializationError(e)) throw e; // a non-serialization failure is a real bug → surface it
        if (attempt < MAX_HOLD_ATTEMPTS - 1) continue; // retry: the winner committed, re-check will 409
        break; // retries exhausted on serialization aborts → fall through to the re-detect tail (429/409), never a raw 500
      }
    }
    // Exhausted retries (all serialization failures). Re-detect once: a real conflict
    // now means the winner took the slot → 409; otherwise it was pure contention →
    // 429 retryable.
    const conflicts = await detectConflicts({ spaceId: input.spaceId, start, end, requestedAssets });
    if (conflicts.length === 0) throw APIError.rateLimited();
    throw APIError.conflict(conflicts, "reservation.conflict");
  }

  async confirm(actor: Actor, id: string): Promise<ServiceResponse<Reservation>> {
    const r = await prisma.reservation.findUnique({ where: { id }, include: { assets: true } });
    if (!r) throw APIError.notFound();
    if (r.status === "CONFIRMED") return ok(reservationToDto(r), "reservation.confirmed"); // idempotent
    if (r.status === "RELEASED") throw APIError.invalidTransition("RELEASED", "CONFIRMED", "reservation.invalid_transition");

    if (r.expiresAt && r.expiresAt.getTime() <= Date.now()) {
      // Symmetric with F10 approve (ADR-0015): a retaken slot → 409 {conflicts} (re-plan);
      // a lease that merely lapsed with nobody contending → 410 hold_expired (re-hold).
      const conflicts = await detectConflicts({
        spaceId: r.spaceId, start: r.start, end: r.end,
        requestedAssets: r.assets.map((a) => ({ assetId: a.assetId, quantity: a.quantity })),
        excludeReservationId: r.id,
      });
      if (conflicts.length === 0) throw APIError.gone("reservation.hold_expired");
      throw APIError.conflict(conflicts, "reservation.expired");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const cas = await tx.reservation.updateMany({ where: { id, status: "HELD" }, data: { status: "CONFIRMED", expiresAt: null } });
      if (cas.count === 0) throw APIError.invalidTransition("RELEASED", "CONFIRMED", "reservation.invalid_transition");
      const u = await tx.reservation.findUnique({ where: { id }, include: { assets: true } });
      await writeAudit(tx, { actor, action: "reservation.confirm", entityType: "Reservation", entityId: id, requestId: r.requestId, before: { status: "HELD" }, after: { status: "CONFIRMED" } });
      return u;
    });
    return ok(reservationToDto(updated!), "reservation.confirmed");
  }

  async release(actor: Actor, id: string): Promise<ServiceResponse<Reservation>> {
    const r = await prisma.reservation.findUnique({ where: { id }, include: { assets: true } });
    if (!r) throw APIError.notFound();
    if (r.status === "RELEASED") return ok(reservationToDto(r), "reservation.released"); // idempotent

    const updated = await prisma.$transaction(async (tx) => {
      const cas = await tx.reservation.updateMany({ where: { id, status: { not: "RELEASED" } }, data: { status: "RELEASED", expiresAt: null } });
      const u = await tx.reservation.findUnique({ where: { id }, include: { assets: true } });
      if (cas.count > 0) {
        await writeAudit(tx, { actor, action: "reservation.release", entityType: "Reservation", entityId: id, requestId: r.requestId, before: { status: r.status }, after: { status: "RELEASED" } });
      }
      return u;
    });
    return ok(reservationToDto(updated!), "reservation.released");
  }

  /** F06-T05 reaper: flip lapsed HELD → RELEASED so abandoned holds free inventory. */
  async reapExpiredHolds(now = new Date()): Promise<number> {
    const expired = await prisma.reservation.findMany({ where: { status: "HELD", expiresAt: { lte: now } }, select: { id: true, requestId: true } });
    let count = 0;
    for (const r of expired) {
      await prisma.$transaction(async (tx) => {
        const res = await tx.reservation.updateMany({ where: { id: r.id, status: "HELD" }, data: { status: "RELEASED", expiresAt: null } });
        if (res.count > 0) {
          await writeSystemAudit(tx, { action: "reservation.release", entityType: "Reservation", entityId: r.id, requestId: r.requestId, before: { status: "HELD" }, after: { status: "RELEASED" }, reason: "hold lease expired" });
          count++;
        }
      });
    }
    return count;
  }

  async getById(id: string): Promise<ReservationRow> {
    const r = await prisma.reservation.findUnique({ where: { id }, include: { assets: true } });
    if (!r) throw APIError.notFound();
    return r;
  }

  /**
   * ADR-0016: live reservation windows overlapping [start,end], for the schedule
   * timelines (Dashboard / Calendar / SpaceDetail). Only live holds count:
   * CONFIRMED, or HELD whose lease has not lapsed. Event-window half-open overlap.
   */
  async schedule(params: { start: Date; end: Date; spaceId?: string; status?: "HELD" | "CONFIRMED" }): Promise<ServiceResponse<ScheduleEntry[]>> {
    const now = new Date();
    const live: Prisma.ReservationWhereInput =
      params.status === "CONFIRMED" ? { status: "CONFIRMED" }
      : params.status === "HELD" ? { status: "HELD", expiresAt: { gt: now } }
      : { OR: [{ status: "CONFIRMED" }, { status: "HELD", expiresAt: { gt: now } }] };
    const rows = await prisma.reservation.findMany({
      where: {
        ...live,
        ...(params.spaceId ? { spaceId: params.spaceId } : {}),
        start: { lt: params.end },
        end: { gt: params.start },
      },
      include: {
        request: { select: { title: true, expectedAttendees: true } },
        space: { select: { setupBufferMinutes: true, teardownBufferMinutes: true } },
      },
      orderBy: { start: "asc" },
    });
    const data: ScheduleEntry[] = rows.map((r) => ({
      id: r.id,
      spaceId: r.spaceId,
      requestId: r.requestId,
      requestTitle: r.request.title,
      attendees: r.request.expectedAttendees,
      status: r.status as "HELD" | "CONFIRMED",
      start: r.start.toISOString(),
      end: r.end.toISOString(),
      setupBufferMinutes: r.space.setupBufferMinutes,
      teardownBufferMinutes: r.space.teardownBufferMinutes,
    }));
    return ok(data, "reservation.schedule.success");
  }
}

export const reservationsService = new ReservationsService();

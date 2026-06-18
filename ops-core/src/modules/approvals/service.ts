import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { APIError } from "../../errors";
import { ok, type ServiceResponse, type Actor } from "../../types";
import type { EventRequest, RequestStatus } from "../../types/api/requests";
import { detectConflicts } from "../../services/conflict";
import { confirmReservationTx, releaseReservationTx } from "../reservations/service";
import { assertTransition } from "../requests/transitions";
import { writeAudit } from "../audit/audit.writer";
import { writeOutbox } from "../events/outbox.writer";
import { eventRequestToDto } from "../requests/mapper";

class ApprovalsService {
  /**
   * Approve (MANAGER+): confirm the request's HELD reservations and move it to
   * SCHEDULED — all in one transaction (DEMO Beat 3). If any hold expired before
   * approval, return 409 {conflicts} and leave everything unchanged (re-plan).
   */
  async approve(actor: Actor, requestId: string): Promise<ServiceResponse<EventRequest>> {
    const request = await prisma.eventRequest.findUnique({ where: { id: requestId } });
    if (!request) throw APIError.notFound();
    if (request.status !== "PROPOSED") {
      throw APIError.invalidTransition(request.status, "APPROVED", "request.invalid_transition");
    }

    const holds = await prisma.reservation.findMany({ where: { requestId, status: "HELD" }, include: { assets: true } });
    const now = new Date();
    for (const h of holds) {
      if (h.expiresAt && h.expiresAt.getTime() <= now.getTime()) {
        const conflicts = await detectConflicts({
          spaceId: h.spaceId, start: h.start, end: h.end,
          requestedAssets: h.assets.map((a) => ({ assetId: a.assetId, quantity: a.quantity })),
          excludeReservationId: h.id,
        });
        throw APIError.conflict(conflicts, "reservation.expired");
      }
    }

    // guard both legal edges before mutating
    assertTransition("PROPOSED", "APPROVED");
    assertTransition("APPROVED", "SCHEDULED");

    const updated = await prisma.$transaction(
      async (tx) => {
        for (const h of holds) await confirmReservationTx(tx, h, actor);
        const u = await tx.eventRequest.update({ where: { id: requestId }, data: { status: "SCHEDULED" } });
        await writeAudit(tx, {
          actor, action: "request.approve", entityType: "EventRequest", entityId: requestId, requestId,
          before: { status: "PROPOSED" }, after: { status: "SCHEDULED" },
        });
        await writeOutbox(tx, "request.approved", { requestId, confirmedReservations: holds.map((h) => h.id) });
        return u;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return ok(eventRequestToDto(updated), "request.approved");
  }

  /** Reject (MANAGER+): reason required → release reservations → REJECTED, audited. */
  async reject(actor: Actor, requestId: string, reason: string): Promise<ServiceResponse<EventRequest>> {
    const request = await prisma.eventRequest.findUnique({ where: { id: requestId } });
    if (!request) throw APIError.notFound();
    assertTransition(request.status as RequestStatus, "REJECTED"); // 409 if terminal

    const reservations = await prisma.reservation.findMany({ where: { requestId, status: { in: ["HELD", "CONFIRMED"] } } });
    const updated = await prisma.$transaction(async (tx) => {
      for (const r of reservations) await releaseReservationTx(tx, r, actor);
      const u = await tx.eventRequest.update({ where: { id: requestId }, data: { status: "REJECTED", rejectionReason: reason } });
      await writeAudit(tx, {
        actor, action: "request.reject", entityType: "EventRequest", entityId: requestId, requestId, reason,
        before: { status: request.status }, after: { status: "REJECTED" },
      });
      return u;
    });
    return ok(eventRequestToDto(updated), "request.rejected");
  }
}

export const approvalsService = new ApprovalsService();

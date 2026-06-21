import { APIError } from "../../errors";
import { ok, type ServiceResponse, type Actor } from "../../types";
import type { EventRequest, RequestStatus } from "../../types/api/requests";
import { detectConflicts } from "../../services/conflict";
import { confirmReservationTx, releaseReservationTx } from "../reservations/service";
import { assertTransition } from "../requests/transitions";
import { writeAudit } from "../audit/audit.writer";
import { writeOutbox } from "../events/outbox.writer";
import { eventRequestToDto } from "../requests/mapper";
import { runSerializable } from "../../utils/tx";

class ApprovalsService {
  /**
   * Approve (MANAGER+): confirm the request's HELD reservations and move it to
   * SCHEDULED — all in one transaction (DEMO Beat 3). If a hold expired: a retaken
   * slot → 409 {conflicts} (re-plan); a merely-lapsed lease → 410 hold_expired
   * (re-hold). Everything is left unchanged on either error. (ADR-0015)
   */
  async approve(actor: Actor, requestId: string): Promise<ServiceResponse<EventRequest>> {
    // guard both legal edges before mutating
    assertTransition("PROPOSED", "APPROVED");
    assertTransition("APPROVED", "SCHEDULED");

    const updated = await runSerializable(async (tx) => {
      // Read + guard + confirm inside ONE serializable transaction: a hold reaped or a
      // request transitioned between the read and the write can no longer slip through.
      const request = await tx.eventRequest.findUnique({ where: { id: requestId } });
      if (!request) throw APIError.notFound();
      if (request.status !== "PROPOSED") {
        throw APIError.invalidTransition(request.status, "APPROVED", "request.invalid_transition");
      }

      const holds = await tx.reservation.findMany({ where: { requestId, status: "HELD" }, include: { assets: true } });
      const now = new Date();
      for (const h of holds) {
        if (h.expiresAt && h.expiresAt.getTime() <= now.getTime()) {
          // The lease lapsed. Re-detect against live state: a real clash means the slot
          // was retaken → 409 {conflicts} so the AI can re-plan; an empty result means the
          // lease merely expired with nobody contending → 410 hold_expired (re-hold), never
          // a degenerate conflict-with-no-conflicts and never a stale confirm. (ADR-0015)
          const conflicts = await detectConflicts({
            spaceId: h.spaceId, start: h.start, end: h.end,
            requestedAssets: h.assets.map((a) => ({ assetId: a.assetId, quantity: a.quantity })),
            excludeReservationId: h.id, tx,
          });
          if (conflicts.length === 0) throw APIError.gone("reservation.hold_expired");
          throw APIError.conflict(conflicts, "reservation.expired");
        }
      }

      for (const h of holds) await confirmReservationTx(tx, h, actor);
      const cas = await tx.eventRequest.updateMany({ where: { id: requestId, status: "PROPOSED" }, data: { status: "SCHEDULED" } });
      if (cas.count === 0) throw APIError.invalidTransition(request.status, "APPROVED", "request.invalid_transition");
      const u = await tx.eventRequest.findUnique({ where: { id: requestId } });
      await writeAudit(tx, {
        actor, action: "request.approve", entityType: "EventRequest", entityId: requestId, requestId,
        before: { status: "PROPOSED" }, after: { status: "SCHEDULED" },
      });
      await writeOutbox(tx, "request.approved", { requestId, confirmedReservations: holds.map((h) => h.id) });
      return u!;
    });
    return ok(eventRequestToDto(updated), "request.approved");
  }

  /** Reject (MANAGER+): reason required → release reservations → REJECTED, audited. */
  async reject(actor: Actor, requestId: string, reason: string): Promise<ServiceResponse<EventRequest>> {
    const updated = await runSerializable(async (tx) => {
      // Re-read + guard + release inside the transaction so a concurrent approve/reject
      // cannot both pass their guards and clobber each other's state.
      const request = await tx.eventRequest.findUnique({ where: { id: requestId } });
      if (!request) throw APIError.notFound();
      assertTransition(request.status as RequestStatus, "REJECTED"); // 409 if terminal

      const reservations = await tx.reservation.findMany({ where: { requestId, status: { in: ["HELD", "CONFIRMED"] } } });
      for (const r of reservations) await releaseReservationTx(tx, r, actor);
      const cas = await tx.eventRequest.updateMany({ where: { id: requestId, status: request.status }, data: { status: "REJECTED", rejectionReason: reason } });
      if (cas.count === 0) throw APIError.invalidTransition(request.status, "REJECTED", "request.invalid_transition");
      const u = await tx.eventRequest.findUnique({ where: { id: requestId } });
      await writeAudit(tx, {
        actor, action: "request.reject", entityType: "EventRequest", entityId: requestId, requestId, reason,
        before: { status: request.status }, after: { status: "REJECTED" },
      });
      return u!;
    });
    return ok(eventRequestToDto(updated), "request.rejected");
  }
}

export const approvalsService = new ApprovalsService();

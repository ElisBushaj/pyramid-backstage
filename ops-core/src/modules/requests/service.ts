import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { APIError } from "../../errors";
import { ok, okList, type ServiceResponse, type ListResponse, type Actor } from "../../types";
import type { EventRequest, EventRequestInput, RequestAggregate } from "../../types/api/requests";
import { writeAudit } from "../audit/audit.writer";
import { writeOutbox } from "../events/outbox.writer";
import { detectConflicts } from "../../services/conflict";
import { reservationToDto } from "../reservations/mapper";
import { quoteToDto } from "../quotes/mapper";
import { taskToDto } from "../tasks/mapper";
import { auditToDto } from "../audit/service";
import { eventRequestToDto } from "./mapper";
import { assertTransition } from "./transitions";

interface ListParams {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

class RequestsService {
  async create(actor: Actor, input: EventRequestInput): Promise<ServiceResponse<EventRequest>> {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.eventRequest.create({
        data: {
          title: input.title,
          organizerName: input.organizerName,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          expectedAttendees: input.expectedAttendees,
          eventType: input.eventType,
          preferredDates: input.preferredDates as unknown as Prisma.InputJsonValue,
          ...(input.requirements ? { requirements: input.requirements as unknown as Prisma.InputJsonValue } : {}),
          status: "DRAFT",
          createdById: actor.id,
        },
      });
      await writeAudit(tx, {
        actor, action: "request.create", entityType: "EventRequest", entityId: created.id, requestId: created.id,
        after: { title: created.title, status: created.status, eventType: created.eventType },
      });
      await writeOutbox(tx, "request.created", { requestId: created.id, title: created.title, eventType: created.eventType });
      return created;
    });
    return ok(eventRequestToDto(row), "request.created.success");
  }

  /** The single payload the operational-plan page renders (REQUESTS.md). */
  async getAggregate(id: string): Promise<ServiceResponse<RequestAggregate>> {
    const request = await prisma.eventRequest.findUnique({ where: { id } });
    if (!request) throw APIError.notFound();

    const reservation = await prisma.reservation.findFirst({
      where: { requestId: id, status: { in: ["HELD", "CONFIRMED"] } },
      include: { assets: true },
      orderBy: { createdAt: "desc" },
    });
    const quote = await prisma.quote.findFirst({ where: { requestId: id }, orderBy: { version: "desc" } });
    const tasks = await prisma.task.findMany({ where: { requestId: id }, orderBy: [{ phase: "asc" }, { createdAt: "asc" }] });
    const audit = await prisma.auditEntry.findMany({ where: { requestId: id }, orderBy: { at: "asc" } });

    const conflicts = reservation
      ? await detectConflicts({
          spaceId: reservation.spaceId,
          start: reservation.start,
          end: reservation.end,
          requestedAssets: reservation.assets.map((a) => ({ assetId: a.assetId, quantity: a.quantity })),
          excludeReservationId: reservation.id,
        })
      : [];

    return ok(
      {
        request: eventRequestToDto(request),
        reservation: reservation ? reservationToDto(reservation) : null,
        quote: quote ? quoteToDto(quote) : null,
        tasks: tasks.map(taskToDto),
        conflicts,
        audit: audit.map(auditToDto),
      },
      "request.aggregate.success",
    );
  }

  async list(p: ListParams): Promise<ListResponse<EventRequest>> {
    const page = Math.max(1, p.page ?? 1);
    const pageSize = Math.min(Math.max(1, p.pageSize ?? 20), 100);
    const where: Prisma.EventRequestWhereInput = {
      ...(p.status ? { status: p.status as EventRequest["status"] } : {}),
      ...(p.q
        ? { OR: [{ title: { contains: p.q, mode: "insensitive" } }, { organizerName: { contains: p.q, mode: "insensitive" } }] }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.eventRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.eventRequest.count({ where }),
    ]);
    return okList(rows.map(eventRequestToDto), total, page, pageSize, "request.list.success");
  }

  /** Edit a request's fields — only while DRAFT; any other status → 409. (F04-T06) */
  async updateDraft(actor: Actor, id: string, input: Partial<EventRequestInput>): Promise<ServiceResponse<EventRequest>> {
    const existing = await prisma.eventRequest.findUnique({ where: { id } });
    if (!existing) throw APIError.notFound();
    if (existing.status !== "DRAFT") {
      throw APIError.invalidTransition(existing.status, "DRAFT", "request.invalid_transition");
    }
    const data: Prisma.EventRequestUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.organizerName !== undefined) data.organizerName = input.organizerName;
    if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail;
    if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone;
    if (input.expectedAttendees !== undefined) data.expectedAttendees = input.expectedAttendees;
    if (input.eventType !== undefined) data.eventType = input.eventType;
    if (input.preferredDates !== undefined) data.preferredDates = input.preferredDates as unknown as Prisma.InputJsonValue;
    if (input.requirements !== undefined) data.requirements = input.requirements as unknown as Prisma.InputJsonValue;

    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.eventRequest.update({ where: { id }, data });
      await writeAudit(tx, {
        actor, action: "request.update", entityType: "EventRequest", entityId: id, requestId: id,
        before: { title: existing.title, expectedAttendees: existing.expectedAttendees },
        after: { title: updated.title, expectedAttendees: updated.expectedAttendees },
      });
      return updated;
    });
    return ok(eventRequestToDto(row), "request.updated");
  }

  /** Used by F10 approve/reject to fetch + guard. Exposed for reuse. */
  async assertExists(id: string) {
    const r = await prisma.eventRequest.findUnique({ where: { id } });
    if (!r) throw APIError.notFound();
    return r;
  }

  // Re-export the guard so callers don't reach into transitions.ts directly.
  assertTransition = assertTransition;
}

export const requestsService = new RequestsService();

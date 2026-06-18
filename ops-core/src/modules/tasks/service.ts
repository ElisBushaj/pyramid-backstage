import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { APIError } from "../../errors";
import { ok, type ServiceResponse, type Actor } from "../../types";
import type { Task, TaskInput, TaskPhase, TaskStatus } from "../../types/api/tasks";
import { writeAudit } from "../audit/audit.writer";
import { taskToDto } from "./mapper";

/**
 * dueAt from the reserved window (TASKS.md): SETUP offsets the event START,
 * TEARDOWN offsets the event END. Null until a reservation exists; the offset is
 * retained so dueAt can be recomputed once a window is held.
 */
function computeDueAt(phase: TaskPhase, offsetHours: number | null | undefined, reservation: { start: Date; end: Date } | null): Date | null {
  if (!reservation || offsetHours === null || offsetHours === undefined) return null;
  const base = phase === "SETUP" ? reservation.start : reservation.end;
  return new Date(base.getTime() + offsetHours * 3_600_000);
}

class TasksService {
  async persist(actor: Actor, requestId: string, tasks: TaskInput[]): Promise<ServiceResponse<Task[]>> {
    const request = await prisma.eventRequest.findUnique({ where: { id: requestId } });
    if (!request) throw APIError.notFound();
    const reservation = await prisma.reservation.findFirst({
      where: { requestId, status: { in: ["HELD", "CONFIRMED"] } },
      orderBy: { createdAt: "desc" },
      select: { start: true, end: true },
    });

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const t of tasks) {
        rows.push(
          await tx.task.create({
            data: {
              requestId,
              title: t.title,
              phase: t.phase,
              owner: t.owner ?? null,
              assigneeId: t.assigneeId ?? null,
              dueOffsetHours: t.dueOffsetHours ?? null,
              dueAt: computeDueAt(t.phase, t.dueOffsetHours, reservation),
              status: "TODO",
            },
          }),
        );
      }
      await writeAudit(tx, {
        actor, action: "request.tasks.persist", entityType: "EventRequest", entityId: requestId, requestId,
        after: { count: rows.length, phases: rows.map((r) => r.phase) },
      });
      return rows;
    });
    return ok(created.map(taskToDto), "tasks.created");
  }

  async list(requestId: string): Promise<ServiceResponse<Task[]>> {
    const request = await prisma.eventRequest.findUnique({ where: { id: requestId } });
    if (!request) throw APIError.notFound();
    const rows = await prisma.task.findMany({ where: { requestId }, orderBy: [{ phase: "asc" }, { createdAt: "asc" }] });
    return ok(rows.map(taskToDto), "tasks.list.success");
  }

  async update(actor: Actor, taskId: string, input: { assigneeId?: string | null; status?: TaskStatus }): Promise<ServiceResponse<Task>> {
    const existing = await prisma.task.findUnique({ where: { id: taskId } });
    if (!existing) throw APIError.notFound();
    const data: Prisma.TaskUpdateInput = {};
    if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;
    if (input.status !== undefined) data.status = input.status;

    const row = await prisma.$transaction(async (tx) => {
      const u = await tx.task.update({ where: { id: taskId }, data });
      await writeAudit(tx, {
        actor, action: "task.update", entityType: "Task", entityId: taskId, requestId: existing.requestId,
        before: { assigneeId: existing.assigneeId, status: existing.status },
        after: { assigneeId: u.assigneeId, status: u.status },
      });
      return u;
    });
    return ok(taskToDto(row), "task.updated");
  }
}

export const tasksService = new TasksService();

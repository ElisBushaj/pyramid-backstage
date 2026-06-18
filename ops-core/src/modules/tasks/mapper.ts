import type { Task } from "../../types/api/tasks";

export interface TaskRow {
  id: string;
  requestId: string;
  title: string;
  phase: string;
  owner: string | null;
  assigneeId: string | null;
  dueOffsetHours: number | null;
  dueAt: Date | null;
  status: string;
}

export function taskToDto(row: TaskRow): Task {
  return {
    id: row.id,
    requestId: row.requestId,
    title: row.title,
    phase: row.phase as Task["phase"],
    owner: row.owner,
    assigneeId: row.assigneeId,
    dueOffsetHours: row.dueOffsetHours,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    status: row.status as Task["status"],
  };
}

/** Mirrors openapi.yaml Task schemas. Frontend mirrors in api/types/tasks.ts. */
export type TaskPhase = "SETUP" | "TEARDOWN";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";

export interface Task {
  id: string;
  requestId: string;
  title: string;
  phase: TaskPhase;
  owner?: string | null;
  assigneeId?: string | null;
  dueOffsetHours?: number | null;
  dueAt?: string | null;
  status: TaskStatus;
}

export interface TaskInput {
  title: string;
  phase: TaskPhase;
  owner?: string;
  assigneeId?: string;
  dueOffsetHours?: number;
}

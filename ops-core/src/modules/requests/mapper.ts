import type { DateRange } from "../../types/api/conflicts";
import type { EventRequest, Requirements } from "../../types/api/requests";

export interface EventRequestRow {
  id: string;
  title: string;
  organizerName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  expectedAttendees: number;
  eventType: string;
  preferredDates: unknown;
  requirements: unknown;
  status: string;
  rejectionReason: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function eventRequestToDto(row: EventRequestRow): EventRequest {
  return {
    id: row.id,
    title: row.title,
    organizerName: row.organizerName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    expectedAttendees: row.expectedAttendees,
    eventType: row.eventType as EventRequest["eventType"],
    preferredDates: (row.preferredDates ?? []) as DateRange[],
    requirements: (row.requirements ?? null) as Requirements | null,
    status: row.status as EventRequest["status"],
    rejectionReason: row.rejectionReason,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

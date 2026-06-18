// Mirrors ops-core/src/types/api/requests.ts (EventRequest + aggregate + dashboard).
import type { Conflict, DateRange } from './_envelope'
import type { Layout } from './spaces'
import type { Reservation } from './reservations'
import type { Quote } from './quotes'
import type { Task } from './tasks'
import type { AuditEntry } from './audit'

export type EventType =
  | 'CONFERENCE'
  | 'EXHIBITION'
  | 'WORKSHOP'
  | 'PERFORMANCE'
  | 'COMMUNITY'
  | 'PRIVATE'
  | 'OTHER'
export type RequestStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'REJECTED'

export interface Requirements {
  layout?: Layout
  avNeeded?: boolean
  cateringNeeded?: boolean
  notes?: string
}

export interface EventRequest {
  id: string
  title: string
  organizerName: string
  contactEmail?: string | null
  contactPhone?: string | null
  expectedAttendees: number
  eventType: EventType
  preferredDates: DateRange[]
  requirements?: Requirements | null
  status: RequestStatus
  rejectionReason?: string | null
  createdById?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface EventRequestInput {
  title: string
  organizerName: string
  contactEmail?: string
  contactPhone?: string
  expectedAttendees: number
  eventType: EventType
  preferredDates: DateRange[]
  requirements?: Requirements
}

export interface RequestAggregate {
  request: EventRequest
  reservation?: Reservation | null
  quote?: Quote | null
  tasks: Task[]
  conflicts: Conflict[]
  audit: AuditEntry[]
}

export interface DashboardKpi {
  value: number
  delta?: number | null
  hint?: string
}

export interface DashboardStats {
  eventsThisWeek: DashboardKpi
  spacesInUse: { inUse: number; total: number }
  lowStockAssets: DashboardKpi
  pendingApprovals: DashboardKpi
}

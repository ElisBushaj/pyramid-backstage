// F18 — mirrors the ai-orchestrator's OWN surface (docs/04-api/AI_CONTRACT.md +
// ai-orchestrator/app/schemas.py). These live on the AI service, NOT in openapi.yaml.
// Embedded Space/Reservation/Quote/Task/Conflict are the SAME shapes as the ops-core mirrors.
import type { Space } from './spaces'
import type { Reservation } from './reservations'
import type { Quote } from './quotes'
import type { Task } from './tasks'
import type { Conflict } from './_envelope'
import type { EventRequestInput } from './requests'

export type ProposedActionType =
  | 'create_request'
  | 'hold_reservation'
  | 'confirm_reservation'
  | 'generate_quote'
  | 'persist_tasks'
  | 'approve_request'
  | 'reject_request'

export interface AIProposedAction {
  type: ProposedActionType
  label: string
  payload: Record<string, unknown>
}

/** The headline artifact of POST /plan — assembled deterministically; numbers injected. */
export interface OperationalPlan {
  requestId: string
  feasible: boolean
  space?: Space | null
  reservation?: Reservation | null
  quote?: Quote | null
  tasks: Task[]
  conflicts: Conflict[]
  alternatives: Array<Record<string, unknown>>
  // Phase C — the AI's own spatial enrichment (mirrors ai-orchestrator/app/schemas.py).
  bundle: Array<Record<string, unknown>>
  warnings: string[]
  mapState: Array<{ slug: string; status: string }>
  narrative: string
}

export interface ChatRequest {
  sessionId: string
  message: string
}

export interface ChatResponse {
  reply: string
  plan?: OperationalPlan | null
  proposedActions: AIProposedAction[]
  requiresApproval: boolean
}

export type PlanRequest = { requestId: string } | EventRequestInput

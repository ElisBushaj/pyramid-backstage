// F18 — the AI client. Talks to the ai-orchestrator (VITE_AI_URL), separate from the
// ops-core client. When VITE_AI_URL is unset or the service is unreachable, calls throw
// AIUnavailable so the UI degrades to its canned/presentational mode (the locked posture).
import type { ChatRequest, ChatResponse, OperationalPlan, PlanRequest } from './types/ai'

const AI_URL = (import.meta.env.VITE_AI_URL as string | undefined)?.replace(/\/$/, '')

export class AIUnavailable extends Error {
  constructor() {
    super('ai-unavailable')
    this.name = 'AIUnavailable'
  }
}

/** True when an AI base URL is configured. Gate queries on this to avoid pointless fetches. */
export const aiConfigured = (): boolean => !!AI_URL

async function aiFetch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (!AI_URL) throw new AIUnavailable()
  let res: Response
  try {
    res = await fetch(`${AI_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch {
    throw new AIUnavailable() // network error / CORS / DNS — treat as unavailable
  }
  if (!res.ok) throw new AIUnavailable()
  return (await res.json()) as T
}

export const aiChat = (req: ChatRequest, signal?: AbortSignal) => aiFetch<ChatResponse>('/chat', req, signal)
export const aiPlan = (req: PlanRequest, signal?: AbortSignal) => aiFetch<OperationalPlan>('/plan', req, signal)

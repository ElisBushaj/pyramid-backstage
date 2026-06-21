import { useState } from 'react'
import { aiChat, AIUnavailable } from '@/api/ai'
import { useT } from '@/i18n/useT'
import type { CopilotState, ChatMessageData, ProposedAction, ConflictHeadsUp } from '@/components/command/CopilotPanel'
import type { OperationalPlan } from '@/api/types/ai'

// F18 — drives a live CopilotPanel: maintains the conversation, calls POST /chat, and
// degrades to a canned reply when the AI is unreachable (AIUnavailable). Returns props
// that spread straight onto <CopilotPanel/>.
export function useCopilot() {
  const t = useT()
  const [sessionId] = useState(() => crypto.randomUUID())
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [input, setInput] = useState('')
  const [state, setState] = useState<CopilotState>('idle')
  const [plan, setPlan] = useState<OperationalPlan | null>(null)
  const [proposedAction, setProposedAction] = useState<ProposedAction | undefined>(undefined)
  const [headsUp, setHeadsUp] = useState<ConflictHeadsUp | undefined>(undefined)
  const [degraded, setDegraded] = useState(false)

  // Core turn — used by both the input box and the Re-plan button.
  async function sendText(text: string) {
    if (!text || state === 'assistant-thinking') return
    setMessages((m) => [...m, { role: 'user', text }])
    setState('assistant-thinking')
    setProposedAction(undefined)
    setHeadsUp(undefined)
    try {
      const res = await aiChat({ sessionId, message: text })
      setMessages((m) => [...m, { role: 'assistant', text: res.reply }])
      if (res.plan) setPlan(res.plan)
      const action = res.proposedActions?.[0]
      if (res.plan && res.plan.feasible === false) {
        // Conflict / infeasible — surface the heads-up with the AI's plain-language reason.
        setHeadsUp({ body: res.plan.narrative })
        setState('conflict-heads-up')
      } else if (action) {
        setProposedAction({ title: action.label, body: res.plan?.narrative ?? t('copilot.proposedBody'), requiresApproval: res.requiresApproval })
        setState('proposed-action')
      } else {
        setState('idle')
      }
    } catch (e) {
      if (e instanceof AIUnavailable) {
        setDegraded(true)
        setMessages((m) => [...m, { role: 'assistant', text: t('copilot.degradedReply') }])
        setState('idle')
      } else {
        setState('error')
      }
    }
  }

  async function send() {
    const text = input.trim()
    if (!text) return
    setInput('')
    await sendText(text)
  }

  // Re-plan around the surfaced conflict by re-submitting with the FIRST alternative the
  // AI offered (a free date or hall) — so the planner tries something that can fit instead
  // of re-asking the same impossible window. Falls back to a generic "find the soonest".
  async function replan() {
    const alt = (plan?.alternatives?.[0] ?? {}) as Record<string, unknown>
    const dr = alt.dateRange as { start?: string } | undefined
    const altDate = dr?.start ? String(dr.start).slice(0, 10) : undefined
    const spaceName = typeof alt.spaceName === 'string' ? alt.spaceName : undefined
    const msg = altDate
      ? `Let's try ${altDate} instead.`
      : spaceName
        ? `Let's try ${spaceName} instead.`
        : 'Please re-plan and find the soonest option that works.'
    await sendText(msg)
  }

  return {
    sessionId,
    messages,
    input,
    state,
    plan,
    proposedAction,
    headsUp,
    degraded,
    setInput,
    send,
    replan,
    dismiss: () => { setProposedAction(undefined); setState('idle') },
    ignore: () => { setHeadsUp(undefined); setState('idle') },
    retry: () => setState('idle'),
  }
}

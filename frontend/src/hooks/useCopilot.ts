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

  async function send() {
    const text = input.trim()
    if (!text || state === 'assistant-thinking') return
    setMessages((m) => [...m, { role: 'user', text }])
    setInput('')
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
    dismiss: () => { setProposedAction(undefined); setState('idle') },
    ignore: () => { setHeadsUp(undefined); setState('idle') },
    retry: () => setState('idle'),
  }
}

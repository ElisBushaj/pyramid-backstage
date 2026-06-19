import { forwardRef } from 'react'
import { AlertTriangle, Send, Sparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { ErrorState } from '@/components/ui/Feedback'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/cn'

/**
 * CopilotPanel (§3.9 / §8.1) — the AI surface. Degrades gracefully: there is no
 * live `POST /chat` here, so callers feed mock/seeded turns and the panel is a
 * pure presentational render. Usable inline (intake) or as a right-side overlay
 * (`onClose` renders a close afffor). Every state the digest enumerates is
 * driven by the `state` prop; rich data (messages, proposed action, conflict
 * heads-up) rides as props so a page can pass real contract data later.
 */

export type CopilotState =
  | 'idle'
  | 'plan-preview'
  | 'user-typing'
  | 'assistant-thinking'
  | 'proposed-action'
  | 'conflict-heads-up'
  | 'error'

export interface ChatMessageData {
  role: 'user' | 'assistant'
  text: string
}

export interface ProposedAction {
  /** Uppercase eyebrow label rendered in accent — defaults to "Proposed action". */
  eyebrow?: string
  title: string
  body: string
  /** When true (default) the amber "REQUIRES APPROVAL" badge shows. */
  requiresApproval?: boolean
  confirmLabel?: string
  dismissLabel?: string
}

export interface ConflictHeadsUp {
  title?: string
  body: string
  replanLabel?: string
  ignoreLabel?: string
}

export interface CopilotPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Which surface to render. Defaults to `idle`. */
  state?: CopilotState
  /** Conversation turns (user/assistant bubbles) rendered top-to-bottom. */
  messages?: ChatMessageData[]
  /** The pending plan card shown in `plan-preview` / `proposed-action`. */
  proposedAction?: ProposedAction
  /** The unprompted clash bubble shown in `conflict-heads-up`. */
  headsUp?: ConflictHeadsUp
  /** Label under the "thinking" dots. Defaults to "Checking availability…". */
  thinkingLabel?: string
  /** Title for the `error` surface. */
  errorTitle?: string
  /** Mono state label in the header, e.g. "idle · plan-preview". */
  stateLabel?: string
  /** Current input value (controlled). When set, the input shows a caret. */
  inputValue?: string
  onInputChange?: (value: string) => void
  onSend?: () => void
  /** Confirm the proposed hold. */
  onConfirm?: () => void
  onDismiss?: () => void
  /** Re-plan around the surfaced conflict. */
  onReplan?: () => void
  onIgnore?: () => void
  onRetry?: () => void
  /** When provided, renders a close button — used by the right-side overlay. */
  onClose?: () => void
  /** Fill the available height (overlay) vs hug content (inline). */
  fullHeight?: boolean
}

const STATE_LABELS: Record<CopilotState, string> = {
  idle: 'idle',
  'plan-preview': 'plan-preview',
  'user-typing': 'typing…',
  'assistant-thinking': 'thinking…',
  'proposed-action': 'proposed-action',
  'conflict-heads-up': 'heads-up',
  error: 'error',
}

const DEFAULT_ACTION: ProposedAction = {
  title: 'Hold Blue Hall',
  body: '22 Jul 2026 · 14:00–18:00 · for FinTech Startup Conf (180 pax). A 15-minute lease will be placed.',
  requiresApproval: true,
}

const DEFAULT_HEADS_UP: ConflictHeadsUp = {
  title: 'Heads up — this clashes',
  body: 'A networking mixer (REQ-0151) just took the Foyer 18:00–20:00, overlapping your teardown. Want me to re-plan?',
}

/** A user/assistant chat bubble with the canvas tail geometry. */
export function ChatMessage({ role, text }: ChatMessageData) {
  const isUser = role === 'user'
  return (
    <div className={cn('mb-3 flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] px-[13px] py-2.5 text-[14px] leading-5',
          isUser
            ? 'rounded-[12px_12px_4px_12px] bg-surface-inverted text-text-inverted'
            : 'rounded-[12px_12px_12px_4px] border border-[#E3E7EC] bg-surface text-text-primary shadow-raised',
        )}
      >
        {text}
      </div>
    </div>
  )
}

/** The staggered three-dot "thinking" indicator (assistant-aligned). */
export function ThinkingIndicator({ label }: { label?: string }) {
  const t = useT()
  const resolvedLabel = label ?? t('copilot.thinkingDefault')
  return (
    <div className="mb-3 flex justify-start">
      <div className="flex items-center gap-[5px] rounded-[12px_12px_12px_4px] border border-[#E3E7EC] bg-surface px-3.5 py-3 shadow-raised">
        {[0, 0.18, 0.36].map((delay) => (
          <span
            key={delay}
            aria-hidden
            className="thinking-dot size-1.5 rounded-pill bg-accent"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
        <span className="ml-1.5 text-[13px] text-text-tertiary">{resolvedLabel}</span>
      </div>
    </div>
  )
}

/** The pending-plan card with the "REQUIRES APPROVAL" gate. */
export function ProposedActionCard({
  action,
  onConfirm,
  onDismiss,
}: {
  action: ProposedAction
  onConfirm?: () => void
  onDismiss?: () => void
}) {
  return (
    <div className="mt-1 rounded-lg border border-[#DCE6FB] bg-surface p-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-[600] uppercase tracking-[0.04em] text-accent">
          {action.eyebrow ?? 'Proposed action'}
        </span>
        {action.requiresApproval !== false ? (
          <Badge tone="warning" className="border-0 px-2 py-0.5 text-[10px] tracking-[0.03em]">
            REQUIRES APPROVAL
          </Badge>
        ) : null}
      </div>
      <h4 className="mb-1 text-[14px] font-[600] text-text-primary">{action.title}</h4>
      <p className="mb-3 text-[13px] leading-[19px] text-text-secondary">{action.body}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={onConfirm}>
          {action.confirmLabel ?? 'Confirm hold'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          {action.dismissLabel ?? 'Dismiss'}
        </Button>
      </div>
    </div>
  )
}

/** The unprompted danger "heads up" bubble (assistant-aligned). */
export function HeadsUpBubble({
  headsUp,
  onReplan,
  onIgnore,
}: {
  headsUp: ConflictHeadsUp
  onReplan?: () => void
  onIgnore?: () => void
}) {
  return (
    <div className="mb-3 flex justify-start">
      <div className="max-w-[88%] rounded-[12px_12px_12px_4px] border border-[rgba(200,55,45,0.28)] bg-danger-subtle px-3.5 py-3">
        <div className="mb-1.5 flex items-center gap-[7px]">
          <AlertTriangle className="size-3.5 shrink-0 text-danger" strokeWidth={1.8} />
          <span className="text-[13px] font-[600] text-[#9E2B23]">
            {headsUp.title ?? 'Heads up — this clashes'}
          </span>
        </div>
        <p className="mb-2.5 text-[13px] leading-[19px] text-[#7A2A23]">{headsUp.body}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="danger" onClick={onReplan}>
            {headsUp.replanLabel ?? 'Re-plan'}
          </Button>
          <Button size="sm" variant="secondary" onClick={onIgnore}>
            {headsUp.ignoreLabel ?? 'Ignore'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export const CopilotPanel = forwardRef<HTMLDivElement, CopilotPanelProps>(
  (
    {
      state = 'idle',
      messages,
      proposedAction,
      headsUp,
      thinkingLabel,
      errorTitle = 'Copilot is offline',
      stateLabel,
      inputValue,
      onInputChange,
      onSend,
      onConfirm,
      onDismiss,
      onReplan,
      onIgnore,
      onRetry,
      onClose,
      fullHeight,
      className,
      ...props
    },
    ref,
  ) => {
    const t = useT()
    const showInput = state === 'idle' || state === 'user-typing'
    const action = proposedAction ?? DEFAULT_ACTION
    const clash = headsUp ?? DEFAULT_HEADS_UP

    return (
      <div
        ref={ref}
        className={cn(
          'flex w-[360px] max-w-full flex-col overflow-hidden rounded-lg border border-[#DCE6FB] bg-[#F7F9FE] shadow-raised',
          fullHeight && 'h-full',
          className,
        )}
        {...props}
      >
        {/* Header bar */}
        <div className="flex items-center gap-[9px] border-b border-[#DCE6FB] bg-accent-muted px-4 py-3">
          <span className="grid size-[22px] shrink-0 place-items-center rounded-sm bg-accent">
            <Sparkles className="size-[13px] text-white" strokeWidth={1.8} />
          </span>
          <span className="text-[14px] font-[600] text-text-primary">{t('shell.copilot')}</span>
          <span className="ml-auto font-mono text-[11px] tabular-nums text-text-tertiary">
            {stateLabel ?? STATE_LABELS[state]}
          </span>
          {onClose ? (
            <IconButton
              aria-label="Close copilot"
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="-mr-1.5"
            >
              <X className="size-4" strokeWidth={1.8} />
            </IconButton>
          ) : null}
        </div>

        {/* Body */}
        <div className={cn('min-h-40 p-4', fullHeight && 'flex-1 overflow-y-auto')}>
          {state === 'error' ? (
            <ErrorState title={errorTitle} onRetry={onRetry} retryLabel="Reconnect" />
          ) : (
            <>
              {messages?.map((m, i) => (
                <ChatMessage key={i} role={m.role} text={m.text} />
              ))}

              {state === 'assistant-thinking' ? <ThinkingIndicator label={thinkingLabel} /> : null}

              {(state === 'plan-preview' || state === 'proposed-action') && (
                <ProposedActionCard action={action} onConfirm={onConfirm} onDismiss={onDismiss} />
              )}

              {state === 'conflict-heads-up' && (
                <HeadsUpBubble headsUp={clash} onReplan={onReplan} onIgnore={onIgnore} />
              )}
            </>
          )}
        </div>

        {/* Input row — idle / typing */}
        {showInput ? (
          <form
            className="flex items-center gap-2 border-t border-[#DCE6FB] p-3"
            onSubmit={(e) => {
              e.preventDefault()
              onSend?.()
            }}
          >
            <Input
              value={inputValue}
              onChange={(e) => onInputChange?.(e.target.value)}
              placeholder={t('copilot.placeholder')}
              className="h-[34px] bg-surface"
              aria-label="Message copilot"
              autoFocus={state === 'user-typing'}
            />
            <IconButton
              aria-label={t('copilot.send')}
              type="submit"
              variant="subtle"
              size="sm"
              disabled={!inputValue?.trim()}
              className="bg-accent text-text-on-accent hover:bg-accent-hover disabled:bg-accent-muted disabled:text-text-disabled"
            >
              <Send className="size-4" strokeWidth={1.8} />
            </IconButton>
          </form>
        ) : null}
      </div>
    )
  },
)
CopilotPanel.displayName = 'CopilotPanel'

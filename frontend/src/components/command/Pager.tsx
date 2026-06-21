import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useT } from '@/i18n/useT'

interface PagerProps {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
}

/**
 * Shared list pager — "showing N–M of T" with prev/next, driven by the envelope
 * meta the client now exposes (XC-3 / ADR-0017). Renders nothing for an empty
 * list; hides the prev/next controls when there's only one page.
 */
export function Pager({ page, pageSize, total, totalPages, onPageChange }: PagerProps) {
  const t = useT()
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-[13px] text-text-secondary">
      <span>{t('ui.pagination.showing', { from, to, total })}</span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="size-4" />
            {t('ui.pagination.prev')}
          </Button>
          <span className="tabular-nums">{t('ui.pagination.page', { page, totalPages })}</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            {t('ui.pagination.next')}
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

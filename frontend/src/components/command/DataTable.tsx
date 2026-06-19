import { type ReactNode, type CSSProperties } from 'react'
import { FileText, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'

/**
 * DataTable — §3.12. Generic, column-config table for requests / assets / audit /
 * users lists. Four states: default · loading · empty · error.
 *
 * Layout is a CSS grid driven by each column's `width` (a grid-template-columns
 * track). Header is uppercase 11px tertiary on surface-subtle; sortable headers
 * carry a " ▾" glyph. Rows are 13px 16px, border-b, hover surface-subtle. Numeric
 * columns right-align. Loading renders 4 `.skeleton` bar rows on the same grid.
 * Empty/error are centered tiles with a primary / secondary action respectively.
 */

export interface DataTableColumn<Row> {
  /** Stable key; also used as the React key when no per-cell key is given. */
  key: string
  header: ReactNode
  /** Cell + header alignment. `right` for numeric columns (uses tabular-nums). */
  align?: 'left' | 'right'
  /** A grid-template-columns track, e.g. `150px`, `1fr`, `minmax(0,1fr)`. */
  width?: string
  /** Marks the header sortable — appends a " ▾" glyph. */
  sortable?: boolean
  /** Cell renderer. Falls back to `String(row[key])` when omitted. */
  render?: (row: Row) => ReactNode
}

export interface DataTableStateConfig {
  icon?: ReactNode
  title: string
  message?: string
  action?: string
  onAction?: () => void
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  /** Per-row React key. Defaults to the array index. */
  rowKey?: (row: Row, index: number) => string | number
  loading?: boolean
  error?: boolean
  /** Render the empty state when `rows` is []. Defaults to true. */
  empty?: boolean
  emptyConfig?: DataTableStateConfig
  errorConfig?: DataTableStateConfig
  /** Skeleton rows to render while loading. */
  loadingRows?: number
  /** Optional per-row click — turns rows into a `cursor-pointer` button-row. */
  onRowClick?: (row: Row) => void
  className?: string
}

function gridTemplate<Row>(columns: DataTableColumn<Row>[]): CSSProperties {
  return { gridTemplateColumns: columns.map((c) => c.width ?? '1fr').join(' ') }
}

function cellAlign(align?: 'left' | 'right'): string {
  return align === 'right' ? 'justify-end text-right tabular-nums' : 'justify-start text-left'
}

function StateTile({
  variant,
  config,
}: {
  variant: 'empty' | 'error'
  config: DataTableStateConfig
}) {
  const isError = variant === 'error'
  const fallbackIcon = isError ? (
    <AlertTriangle size={18} strokeWidth={1.5} />
  ) : (
    <FileText size={18} strokeWidth={1.5} />
  )
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div
        className={cn(
          'flex size-10 items-center justify-center rounded-md',
          isError ? 'bg-danger-subtle text-danger' : 'bg-surface-sunken text-text-tertiary',
        )}
      >
        {config.icon ?? fallbackIcon}
      </div>
      <p className="mt-3.5 text-[15px] font-[600] text-text-primary">{config.title}</p>
      {config.message ? (
        <p className="mt-1.5 max-w-[320px] text-[13px] text-text-tertiary">{config.message}</p>
      ) : null}
      {config.action && config.onAction ? (
        <Button
          size="sm"
          variant={isError ? 'secondary' : 'primary'}
          className="mt-4"
          onClick={config.onAction}
        >
          {config.action}
        </Button>
      ) : null}
    </div>
  )
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = false,
  empty = true,
  emptyConfig,
  errorConfig,
  loadingRows = 4,
  onRowClick,
  className,
}: DataTableProps<Row>) {
  const template = gridTemplate(columns)

  return (
    <div
      className={cn('overflow-hidden rounded-md border border-border-subtle bg-surface', className)}
      role="table"
    >
      {/* Header */}
      <div
        role="row"
        className="grid items-center gap-3 border-b border-border-subtle bg-surface-subtle px-4 py-2.5"
        style={template}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            role="columnheader"
            className={cn(
              'flex items-center text-[11px] font-[500] uppercase tracking-[0.04em] text-text-tertiary',
              cellAlign(col.align),
            )}
          >
            <span>{col.header}</span>
            {col.sortable ? <span aria-hidden className="ml-1">▾</span> : null}
          </div>
        ))}
      </div>

      {/* Body */}
      {error ? (
        <StateTile
          variant="error"
          config={
            errorConfig ?? {
              title: "Couldn't load",
              message: 'The connection to ops-core timed out.',
              action: 'Retry',
            }
          }
        />
      ) : loading ? (
        <div role="rowgroup">
          {Array.from({ length: loadingRows }).map((_, r) => (
            <div
              key={r}
              role="row"
              className="grid items-center gap-3 border-b border-border-subtle px-4 py-3.5 last:border-b-0"
              style={template}
            >
              {columns.map((col, c) => (
                <div key={col.key} className={cn('flex', cellAlign(col.align))}>
                  <div
                    className="skeleton h-3 rounded-sm"
                    style={{ width: c === 0 ? '70%' : '80%' }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : empty && rows.length === 0 ? (
        <StateTile
          variant="empty"
          config={
            emptyConfig ?? {
              title: 'Nothing here yet',
              message: 'New records will appear here.',
            }
          }
        />
      ) : (
        <div role="rowgroup">
          {rows.map((row, i) => {
            const key = rowKey ? rowKey(row, i) : i
            const clickable = Boolean(onRowClick)
            return (
              <div
                key={key}
                role="row"
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onRowClick?.(row) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onRowClick?.(row)
                        }
                      }
                    : undefined
                }
                className={cn(
                  'grid items-center gap-3 border-b border-border-subtle px-4 py-[13px] text-[14px] transition-colors duration-micro ease-std last:border-b-0 hover:bg-surface-subtle',
                  clickable &&
                    'cursor-pointer outline-none focus-visible:bg-surface-subtle focus-visible:shadow-ring-soft',
                )}
                style={template}
              >
                {columns.map((col) => (
                  <div
                    key={col.key}
                    role="cell"
                    className={cn(
                      'flex min-w-0 items-center text-text-secondary',
                      cellAlign(col.align),
                    )}
                  >
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

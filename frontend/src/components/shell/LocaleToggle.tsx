import { useLocaleStore } from '@/stores/locale'
import { cn } from '@/lib/cn'

export function LocaleToggle() {
  const { locale, setLocale } = useLocaleStore()
  return (
    <div className="inline-flex rounded-pill border border-border-subtle bg-surface p-0.5 text-[12px] font-[550]">
      {(['en', 'al'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={cn('rounded-pill px-2.5 py-1 transition-colors', locale === l ? 'bg-surface-inverted text-text-inverted' : 'text-text-tertiary hover:text-text-primary')}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

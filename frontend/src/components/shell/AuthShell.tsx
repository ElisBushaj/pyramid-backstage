import { useT } from '@/i18n/useT'
import { LocaleToggle } from './LocaleToggle'

export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useT()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-subtle px-4">
      <div className="absolute right-4 top-4">
        <LocaleToggle />
      </div>
      <div className="w-full max-w-[380px]">
        <div className="mb-6 text-center">
          <h1 className="text-[20px] font-[600] text-text-primary">{t('brand.name')}</h1>
          <p className="text-[13px] text-text-tertiary">{t('auth.subtitle')}</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface p-6 shadow-raised">{children}</div>
      </div>
    </div>
  )
}

import { useT } from '@/i18n/useT'
import { PyramidLogo } from '@/components/ui/Logo'
import { LocaleToggle } from './LocaleToggle'

/**
 * AuthShell — §1.1. Centered, zero-distraction staff sign-in. Brand block
 * (44px pyramid + full name + "Operations sign-in") over a single raised card,
 * with the audited-access footnote. The card leans on --elev-raised's hairline
 * ring — no extra border.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useT()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-subtle p-10">
      <div className="absolute right-4 top-4">
        <LocaleToggle />
      </div>
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center">
          <PyramidLogo size={44} />
          <h1 className="mb-1 mt-4 text-[20px] font-[600] text-text-primary">{t('brand.name')}</h1>
          <p className="text-[13px] text-text-tertiary">{t('auth.subtitle')}</p>
        </div>
        <div className="rounded-[14px] bg-surface p-6 shadow-raised">{children}</div>
        <p className="mt-5 text-center font-mono text-[12px] text-text-tertiary">{t('auth.footerNote')}</p>
      </div>
    </div>
  )
}

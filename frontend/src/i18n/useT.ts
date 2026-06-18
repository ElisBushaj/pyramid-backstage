import { useMemo } from 'react'
import { useLocaleStore, type Locale } from '@/stores/locale'
import alMessages from './al.json'
import enMessages from './en.json'

type Messages = Record<string, unknown>

const dictionaries: Record<Locale, Messages> = {
  al: alMessages as Messages,
  en: enMessages as Messages,
}

function lookup(messages: Messages, path: string): string | undefined {
  const segments = path.split('.')
  let current: unknown = messages
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'string' ? current : undefined
}

function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in params ? String(params[key]) : match,
  )
}

/**
 * Translator hook. Falls back to English, then to the raw key. Memoized per
 * locale so `t` keeps a stable identity across renders (safe in effect deps).
 */
export function useT() {
  const locale = useLocaleStore((state) => state.locale)

  return useMemo(
    () =>
      function t(path: string, params?: Record<string, string | number>): string {
        const value =
          lookup(dictionaries[locale], path) ?? lookup(dictionaries.en, path)
        if (value === undefined) {
          if (import.meta.env.DEV) {
            console.warn(`[i18n] missing translation: "${path}"`)
          }
          return path
        }
        return interpolate(value, params)
      },
    [locale],
  )
}

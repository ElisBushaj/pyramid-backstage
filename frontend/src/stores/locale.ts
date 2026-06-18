import { create } from 'zustand'

export type Locale = 'al' | 'en'

const SUPPORTED: Locale[] = ['al', 'en']
const STORAGE_KEY = 'pyramid.locale'

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED.includes(value as Locale)
}

/** Resolution order: ?lang query → localStorage → navigator language → 'en'. */
function resolveInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en'

  const queryLang = new URLSearchParams(window.location.search).get('lang')
  if (isLocale(queryLang)) {
    window.localStorage.setItem(STORAGE_KEY, queryLang)
    return queryLang
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (isLocale(stored)) return stored

  const browser = window.navigator.language.toLowerCase().split('-')[0]
  if (isLocale(browser)) return browser

  return 'en'
}

interface LocaleStore {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useLocaleStore = create<LocaleStore>((set) => ({
  locale: resolveInitialLocale(),
  setLocale: (locale) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, locale)
    }
    set({ locale })
  },
}))

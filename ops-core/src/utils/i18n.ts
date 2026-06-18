import al from "../locales/al.json";
import en from "../locales/en.json";
import { MESSAGE_KEYS } from "../types/message-keys";

export type Locale = "al" | "en";
const tables: Record<Locale, Record<string, string>> = { al, en };
const seenUnknown = new Set<string>();

/** Resolve a messageKey to a localized string, interpolating {param} placeholders. */
export function translate(
  key: string,
  locale: Locale = "en",
  params?: Record<string, string | number>,
): string {
  const table = tables[locale] ?? tables.en;
  const resolved = table[key] ?? tables.en[key];
  if (resolved === undefined && !seenUnknown.has(key)) {
    seenUnknown.add(key);
    // eslint-disable-next-line no-console
    if (process.env.NODE_ENV !== "production") console.warn(`[i18n] unknown messageKey: ${key}`);
  }
  let str = resolved ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}

/**
 * CI parity check: both locale files must define exactly the registered
 * `MESSAGE_KEYS` set — no missing, no extra, no drift between al and en.
 */
export function localeKeyParity(): { al: number; en: number; registry: number; mismatch: string[] } {
  const registry = new Set<string>(MESSAGE_KEYS);
  const alKeys = Object.keys(al);
  const enKeys = Object.keys(en);
  const mismatch = [
    ...alKeys.filter((k) => !(k in en)).map((k) => `al-only: ${k}`),
    ...enKeys.filter((k) => !(k in al)).map((k) => `en-only: ${k}`),
    ...enKeys.filter((k) => !registry.has(k)).map((k) => `unregistered: ${k}`),
    ...MESSAGE_KEYS.filter((k) => !(k in en)).map((k) => `missing-en: ${k}`),
    ...MESSAGE_KEYS.filter((k) => !(k in al)).map((k) => `missing-al: ${k}`),
  ];
  return { al: alKeys.length, en: enKeys.length, registry: MESSAGE_KEYS.length, mismatch };
}

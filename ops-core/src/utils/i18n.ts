import al from "../locales/al.json";
import en from "../locales/en.json";

export type Locale = "al" | "en";
const tables: Record<Locale, Record<string, string>> = { al, en };

/** Resolve a messageKey to a localized string, interpolating {param} placeholders. */
export function translate(
  key: string,
  locale: Locale = "en",
  params?: Record<string, string | number>,
): string {
  const table = tables[locale] ?? tables.en;
  let str = table[key] ?? tables.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}

/** CI parity check helper: both locales must define exactly the same keys. */
export function localeKeyCounts(): { al: number; en: number; mismatch: string[] } {
  const alKeys = Object.keys(al);
  const enKeys = Object.keys(en);
  const mismatch = [
    ...alKeys.filter((k) => !(k in en)),
    ...enKeys.filter((k) => !(k in al)),
  ];
  return { al: alKeys.length, en: enKeys.length, mismatch };
}

import { describe, it, expect } from "vitest";
import { translate, localeKeyParity } from "./i18n";
import { MESSAGE_KEYS } from "../types/message-keys";
import al from "../locales/al.json";
import en from "../locales/en.json";

/**
 * i18n invariants (CORE_PATTERNS §i18n): every messageKey resolves per locale,
 * {param} placeholders interpolate, an unknown key degrades to itself, and the
 * two locale files stay in lockstep with the registry. localeKeyParity is the
 * "full-proof" guard — it must fail loudly the instant al/en/registry drift.
 */

describe("localeKeyParity — al.json ≡ en.json ≡ MESSAGE_KEYS", () => {
  it("reports zero mismatches and equal counts across both locales and the registry", () => {
    const p = localeKeyParity();
    expect(p.mismatch).toEqual([]);
    expect(p.al).toBe(p.en);
    expect(p.en).toBe(p.registry);
    expect(p.registry).toBe(MESSAGE_KEYS.length);
  });

  it("the two locale files have IDENTICAL key SETS (not just equal counts)", () => {
    const alKeys = Object.keys(al).sort();
    const enKeys = Object.keys(en).sort();
    expect(alKeys).toEqual(enKeys);
  });

  it("every registered MESSAGE_KEY exists in BOTH locale tables", () => {
    const missing = MESSAGE_KEYS.filter((k) => !(k in al) || !(k in en));
    expect(missing).toEqual([]);
  });

  it("neither locale defines an UNREGISTERED key", () => {
    const registry = new Set<string>(MESSAGE_KEYS);
    const extra = [...Object.keys(al), ...Object.keys(en)].filter((k) => !registry.has(k));
    expect(extra).toEqual([]);
  });

  it("MESSAGE_KEYS has no duplicates", () => {
    expect(new Set(MESSAGE_KEYS).size).toBe(MESSAGE_KEYS.length);
  });

  it("no locale value is empty (every key carries a real translation)", () => {
    const emptyEn = Object.entries(en).filter(([, v]) => !String(v).trim()).map(([k]) => k);
    const emptyAl = Object.entries(al).filter(([, v]) => !String(v).trim()).map(([k]) => k);
    expect({ emptyEn, emptyAl }).toEqual({ emptyEn: [], emptyAl: [] });
  });
});

describe("translate — locale resolution", () => {
  it("returns the localized string for the requested locale", () => {
    expect(translate("auth.login.success", "en")).toBe("Welcome back.");
    expect(translate("auth.login.success", "al")).toBe("Mirë se u ktheve.");
  });

  it("defaults to en when no locale is passed", () => {
    expect(translate("common.ok")).toBe(translate("common.ok", "en"));
    expect(translate("common.ok")).toBe("OK");
  });

  it("falls back to the en table for a key present in en (al keys are complete, so this is the mechanism)", () => {
    // al has every key, but assert the resolved al string is the al one, not the en one.
    expect(translate("common.not_found", "al")).toBe("Nuk u gjet.");
  });

  it("falls back to en when given an unknown locale", () => {
    // @ts-expect-error — exercising the runtime guard for an invalid locale.
    expect(translate("common.ok", "fr")).toBe("OK");
  });
});

describe("translate — interpolation", () => {
  it("substitutes a single {param}", () => {
    // No registered key uses params today, so assert the mechanism on a literal key.
    expect(translate("i18n.test.greet.{name}", "en", { name: "Elis" })).toContain("Elis");
  });

  it("substitutes EVERY occurrence of the same {param}", () => {
    expect(translate("{x} and {x}", "en", { x: "Z" })).toBe("Z and Z");
  });

  it("substitutes multiple distinct params and coerces numbers to strings", () => {
    expect(translate("{a}/{b}", "en", { a: 1, b: 2 })).toBe("1/2");
  });

  it("leaves an unreferenced {param} placeholder untouched", () => {
    expect(translate("{a} {b}", "en", { a: "x" })).toBe("x {b}");
  });

  it("returns the resolved string unchanged when no params are given", () => {
    expect(translate("auth.login.success", "en")).toBe("Welcome back.");
  });
});

describe("translate — unknown key degrades gracefully", () => {
  it("returns the key itself when it is registered nowhere", () => {
    expect(translate("totally.unknown.key.alpha", "en")).toBe("totally.unknown.key.alpha");
  });

  it("still interpolates params into the key-as-fallback", () => {
    expect(translate("i18n.test.unknown.{v}", "en", { v: 7 })).toContain("7");
  });
});

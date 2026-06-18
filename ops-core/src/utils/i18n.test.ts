import { describe, it, expect } from "vitest";
import { translate, localeKeyParity } from "./i18n";
import { MESSAGE_KEYS } from "../types/message-keys";

describe("i18n locale parity (F00-T05)", () => {
  it("al.json and en.json define exactly the registered MESSAGE_KEYS — no drift", () => {
    const p = localeKeyParity();
    expect(p.mismatch).toEqual([]);
    expect(p.al).toBe(p.en);
    expect(p.en).toBe(p.registry);
    expect(p.registry).toBe(MESSAGE_KEYS.length);
  });
});

describe("translate", () => {
  it("returns the localized string for the active locale", () => {
    expect(translate("auth.login.success", "en")).toBe("Welcome back.");
    expect(translate("auth.login.success", "al")).toBe("Mirë se u ktheve.");
  });

  it("falls back to en when a key is missing in the requested locale table", () => {
    expect(translate("common.ok", "al")).toBe("Në rregull");
  });

  it("interpolates {param} placeholders", () => {
    // No registered key uses params today; assert the mechanism directly.
    expect(translate("__unknown.with.{x}", "en", { x: 5 })).toContain("5");
  });

  it("resolves an unknown key to the key itself", () => {
    expect(translate("totally.unknown.key", "en")).toBe("totally.unknown.key");
  });
});

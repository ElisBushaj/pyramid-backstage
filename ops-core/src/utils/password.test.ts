import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

/**
 * Password invariants (CORE_PATTERNS §Auth, ADR-0003): argon2id round-trips, the
 * hash never echoes the plaintext, and verifyPassword is total — a wrong password
 * OR a malformed hash returns false, never throws (a throw on a login path would
 * 500 instead of returning 401).
 */

describe("hashPassword", () => {
  it("produces an argon2id PHC string that is not the plaintext", async () => {
    const h = await hashPassword("plaintext-here");
    expect(h).not.toContain("plaintext-here");
    expect(h.startsWith("$argon2id$")).toBe(true);
  });

  it("uses a random salt — two hashes of the same password differ", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
  });

  it("embeds the OWASP-aligned cost params (m=19456, t=2, p=1)", async () => {
    const h = await hashPassword("x");
    expect(h).toContain("m=19456");
    expect(h).toContain("t=2");
    expect(h).toContain("p=1");
  });
});

describe("verifyPassword — round-trip", () => {
  it("a correct password verifies true", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(h, "correct horse battery staple")).toBe(true);
  });

  it("a wrong password verifies false", async () => {
    const h = await hashPassword("s3cret-password");
    expect(await verifyPassword(h, "wrong-password")).toBe(false);
  });

  it("verification is case-sensitive", async () => {
    const h = await hashPassword("CaseSensitive");
    expect(await verifyPassword(h, "casesensitive")).toBe(false);
  });

  it("round-trips a unicode password", async () => {
    const pw = "pärøllä-密码-🔐";
    const h = await hashPassword(pw);
    expect(await verifyPassword(h, pw)).toBe(true);
    expect(await verifyPassword(h, "pärøllä-密码-🔓")).toBe(false);
  });

  it("round-trips an empty-string password (no special-casing)", async () => {
    const h = await hashPassword("");
    expect(await verifyPassword(h, "")).toBe(true);
    expect(await verifyPassword(h, "x")).toBe(false);
  });
});

describe("verifyPassword — total (never throws on bad input)", () => {
  it("returns false (does not throw) for a non-PHC garbage hash", async () => {
    await expect(verifyPassword("not-a-real-hash", "whatever")).resolves.toBe(false);
  });

  it("returns false for an empty hash string", async () => {
    await expect(verifyPassword("", "whatever")).resolves.toBe(false);
  });

  it("returns false for a truncated / corrupt argon2id hash", async () => {
    const good = await hashPassword("abc");
    const corrupt = good.slice(0, good.length - 5);
    await expect(verifyPassword(corrupt, "abc")).resolves.toBe(false);
  });

  it("returns false for a bcrypt-shaped hash (wrong algorithm)", async () => {
    await expect(
      verifyPassword("$2b$10$abcdefghijklmnopqrstuv", "whatever"),
    ).resolves.toBe(false);
  });
});

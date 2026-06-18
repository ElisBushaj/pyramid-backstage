import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing (F01-T02)", () => {
  it("round-trips: a correct password verifies true", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(h, "correct horse battery staple")).toBe(true);
  });

  it("a wrong password verifies false", async () => {
    const h = await hashPassword("s3cret-password");
    expect(await verifyPassword(h, "wrong-password")).toBe(false);
  });

  it("the stored hash is not the plaintext and is argon2id", async () => {
    const h = await hashPassword("plaintext-here");
    expect(h).not.toContain("plaintext-here");
    expect(h.startsWith("$argon2id$")).toBe(true);
  });
});

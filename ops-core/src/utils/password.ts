import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

// Argon2id with OWASP-aligned parameters. @node-rs/argon2 ships prebuilt
// bindings (ADR-0003) so it installs without a native toolchain.
const OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** Hash a plaintext password with argon2id. The result embeds the salt + params. */
export function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, OPTS);
}

/** Verify a plaintext against a stored argon2id hash. Never throws on mismatch. */
export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hashStr, plain);
  } catch {
    return false;
  }
}

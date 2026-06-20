import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

/** Prisma surfaces serialization failures / deadlocks as P2034 (and P2037). */
export function isSerializationError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2034" || e.code === "P2037");
}

/**
 * Run a serializable transaction, retrying a bounded number of times when the DB
 * aborts it for a serialization conflict (the winner committed; the re-run sees
 * the new state). The body MUST be idempotent across retries — it re-runs from
 * scratch each attempt. Mirrors the inline retry the reservation hold uses.
 */
export async function runSerializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  attempts = 4,
): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
      if (isSerializationError(e) && attempt < attempts - 1) continue;
      throw e;
    }
  }
  throw new Error("runSerializable: exhausted retries"); // unreachable
}

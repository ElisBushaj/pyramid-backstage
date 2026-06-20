import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

/**
 * True when the DB aborted a transaction for a serialization conflict / deadlock.
 * Prisma surfaces these natively as P2034/P2037, but a conflict raised inside a raw
 * `$queryRaw ... FOR UPDATE` (how the hold / scan / approval paths take row locks)
 * comes back through the driver adapter wrapped as P2010 — meta.driverAdapterError
 * "TransactionWriteConflict", message carrying Postgres SQLSTATE 40001 (or 40P01
 * deadlock). Treat all of these as the same retryable conflict so the loser re-runs
 * against the winner's committed state (a clean 409/422), never a 500.
 */
export function isSerializationError(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code === "P2034" || e.code === "P2037") return true;
  const driverName = (e.meta as { driverAdapterError?: { name?: string } } | undefined)?.driverAdapterError?.name;
  if (driverName === "TransactionWriteConflict") return true;
  return e.code === "P2010" && /\b40001\b|\b40P01\b|could not serialize|deadlock detected/i.test(e.message);
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

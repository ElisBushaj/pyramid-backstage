import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// runSerializable wraps prisma.$transaction; stub the prisma module so we can drive
// the retry loop deterministically without a real DB.
const { prismaStub } = vi.hoisted(() => ({
  prismaStub: { $transaction: vi.fn() },
}));
vi.mock("../config/prisma", () => ({ prisma: prismaStub }));

import { isSerializationError, runSerializable } from "./tx";

/** Build a Prisma known-request error with the given code/message/meta. */
function known(code: string, message = "boom", meta?: Record<string, unknown>): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: "test", ...(meta ? { meta } : {}) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isSerializationError — TRUE shapes (retryable serialization aborts)", () => {
  it("P2034 (Prisma-native write conflict / deadlock) → true", () => {
    expect(isSerializationError(known("P2034"))).toBe(true);
  });

  it("P2037 (too many connections during txn) → true", () => {
    expect(isSerializationError(known("P2037"))).toBe(true);
  });

  it("driver-adapter TransactionWriteConflict (any code) → true", () => {
    expect(
      isSerializationError(known("P2010", "raw query failed", { driverAdapterError: { name: "TransactionWriteConflict" } })),
    ).toBe(true);
  });

  it("driver-adapter TransactionWriteConflict even with an unrelated code → true", () => {
    expect(
      isSerializationError(known("P2999", "x", { driverAdapterError: { name: "TransactionWriteConflict" } })),
    ).toBe(true);
  });

  it("P2010 carrying SQLSTATE 40001 (could-not-serialize) → true", () => {
    expect(isSerializationError(known("P2010", "ERROR: could not serialize access ... SQLSTATE 40001"))).toBe(true);
  });

  it("P2010 carrying SQLSTATE 40P01 (deadlock detected) → true", () => {
    expect(isSerializationError(known("P2010", "ERROR: deadlock detected SQLSTATE 40P01"))).toBe(true);
  });

  it("P2010 with the textual 'could not serialize' marker → true", () => {
    expect(isSerializationError(known("P2010", "could not serialize access due to read/write dependencies"))).toBe(true);
  });

  it("P2010 with the textual 'deadlock detected' marker → true", () => {
    expect(isSerializationError(known("P2010", "deadlock detected"))).toBe(true);
  });
});

describe("isSerializationError — FALSE shapes (not a serialization conflict)", () => {
  it("P2002 (unique constraint) → false", () => {
    expect(isSerializationError(known("P2002", "Unique constraint failed", { target: ["slug"] }))).toBe(false);
  });

  it("P2025 (record not found) → false", () => {
    expect(isSerializationError(known("P2025"))).toBe(false);
  });

  it("P2010 with an unrelated message (no serialization marker) → false", () => {
    expect(isSerializationError(known("P2010", "syntax error at or near \"FROM\""))).toBe(false);
  });

  it("a plain Error → false", () => {
    expect(isSerializationError(new Error("could not serialize access SQLSTATE 40001"))).toBe(false);
  });

  it("a non-Prisma object that merely looks like one → false", () => {
    expect(isSerializationError({ code: "P2034", message: "x" })).toBe(false);
  });

  it("null / undefined / string → false", () => {
    expect(isSerializationError(null)).toBe(false);
    expect(isSerializationError(undefined)).toBe(false);
    expect(isSerializationError("P2034")).toBe(false);
  });
});

describe("runSerializable — retry semantics", () => {
  it("runs in a Serializable transaction and returns the body's result", async () => {
    prismaStub.$transaction.mockResolvedValueOnce("done");
    const out = await runSerializable(async () => "done");
    expect(out).toBe("done");
    expect(prismaStub.$transaction).toHaveBeenCalledTimes(1);
    const opts = prismaStub.$transaction.mock.calls[0]![1];
    expect(opts).toMatchObject({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });

  it("retries once on a serialization error, then succeeds", async () => {
    prismaStub.$transaction
      .mockRejectedValueOnce(known("P2034"))
      .mockResolvedValueOnce("second-try");
    const out = await runSerializable(async () => "second-try");
    expect(out).toBe("second-try");
    expect(prismaStub.$transaction).toHaveBeenCalledTimes(2);
  });

  it("retries on a driver-adapter write conflict too", async () => {
    prismaStub.$transaction
      .mockRejectedValueOnce(known("P2010", "x", { driverAdapterError: { name: "TransactionWriteConflict" } }))
      .mockResolvedValueOnce(42);
    expect(await runSerializable(async () => 42)).toBe(42);
    expect(prismaStub.$transaction).toHaveBeenCalledTimes(2);
  });

  it("rethrows a NON-serialization error immediately (no retry)", async () => {
    const err = known("P2002", "Unique constraint failed");
    prismaStub.$transaction.mockRejectedValueOnce(err);
    await expect(runSerializable(async () => "never")).rejects.toBe(err);
    expect(prismaStub.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rethrows the LAST serialization error after exhausting attempts", async () => {
    const err = known("P2034");
    prismaStub.$transaction.mockRejectedValue(err);
    await expect(runSerializable(async () => "x", 3)).rejects.toBe(err);
    expect(prismaStub.$transaction).toHaveBeenCalledTimes(3);
  });

  it("defaults to 4 attempts", async () => {
    prismaStub.$transaction.mockRejectedValue(known("P2034"));
    await expect(runSerializable(async () => "x")).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(prismaStub.$transaction).toHaveBeenCalledTimes(4);
  });

  it("succeeds on the final allowed attempt (boundary)", async () => {
    prismaStub.$transaction
      .mockRejectedValueOnce(known("P2034"))
      .mockRejectedValueOnce(known("P2034"))
      .mockResolvedValueOnce("late");
    expect(await runSerializable(async () => "late", 3)).toBe("late");
    expect(prismaStub.$transaction).toHaveBeenCalledTimes(3);
  });
});

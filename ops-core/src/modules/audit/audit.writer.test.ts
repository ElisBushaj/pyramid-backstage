import { describe, it, expect, vi } from "vitest";
import { writeAudit, writeSystemAudit } from "./audit.writer";
import type { Actor } from "../../types";

const actor: Actor = { id: "u_1", name: "Elis", role: "MANAGER" };

function txStub() {
  return { auditEntry: { create: vi.fn().mockResolvedValue({ id: "a_1" }) } } as any;
}

describe("writeAudit (F09-T02)", () => {
  it("issues exactly one auditEntry.create carrying actor, action, before/after", async () => {
    const tx = txStub();
    await writeAudit(tx, {
      actor,
      action: "request.approve",
      entityType: "EventRequest",
      entityId: "req_1",
      requestId: "req_1",
      before: { status: "PROPOSED" },
      after: { status: "APPROVED" },
    });
    expect(tx.auditEntry.create).toHaveBeenCalledTimes(1);
    const data = tx.auditEntry.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      actorId: "u_1",
      actorName: "Elis",
      action: "request.approve",
      entityType: "EventRequest",
      entityId: "req_1",
      requestId: "req_1",
      before: { status: "PROPOSED" },
      after: { status: "APPROVED" },
    });
  });

  it("returns the created row to the caller (so callers can chain off the audit id)", async () => {
    const tx = txStub();
    const row = await writeAudit(tx, { actor, action: "x.create", entityType: "X", entityId: "x_1" });
    expect(row).toEqual({ id: "a_1" });
  });

  it("throws (loud failure) and writes nothing when there is no actor at all", async () => {
    const tx = txStub();
    await expect(
      writeAudit(tx, { actor: undefined as unknown as Actor, action: "x", entityType: "Y", entityId: "z" }),
    ).rejects.toThrow();
    expect(tx.auditEntry.create).not.toHaveBeenCalled();
  });

  it("throws and writes nothing when the actor has no id (anonymous would be the alternative)", async () => {
    const tx = txStub();
    await expect(
      writeAudit(tx, { actor: { id: "", name: "ghost", role: "OPS" }, action: "x", entityType: "Y", entityId: "z" }),
    ).rejects.toThrow();
    expect(tx.auditEntry.create).not.toHaveBeenCalled();
  });

  it("names the offending action in the loud-failure message (debuggability)", async () => {
    const tx = txStub();
    await expect(
      writeAudit(tx, { actor: undefined as unknown as Actor, action: "reservation.hold", entityType: "Reservation", entityId: "r_1" }),
    ).rejects.toThrow(/reservation\.hold/);
    expect(tx.auditEntry.create).not.toHaveBeenCalled();
  });

  it("passes reason through (required by reject)", async () => {
    const tx = txStub();
    await writeAudit(tx, { actor, action: "request.reject", entityType: "EventRequest", entityId: "req_1", reason: "Date unavailable" });
    expect(tx.auditEntry.create.mock.calls[0]![0].data.reason).toBe("Date unavailable");
  });

  it("normalizes absent requestId/before/after/reason to null/undefined (never leaks `undefined` keys as stray)", async () => {
    const tx = txStub();
    await writeAudit(tx, { actor, action: "space.update", entityType: "Space", entityId: "sp_1" });
    const data = tx.auditEntry.create.mock.calls[0]![0].data;
    expect(data.requestId).toBeNull();
    expect(data.reason).toBeNull();
    // before/after are omitted (undefined) so Prisma stores JSON NULL by default, not the string "undefined".
    expect(data.before).toBeUndefined();
    expect(data.after).toBeUndefined();
  });

  it("explicit null before/after are normalized to undefined (Prisma JSON-null), not the literal null value", async () => {
    const tx = txStub();
    await writeAudit(tx, { actor, action: "x.update", entityType: "X", entityId: "x_1", before: null, after: null, requestId: null });
    const data = tx.auditEntry.create.mock.calls[0]![0].data;
    expect(data.before).toBeUndefined();
    expect(data.after).toBeUndefined();
    expect(data.requestId).toBeNull();
  });

  it("deep-clones before/after to a plain JSON value (no live object reference / Date survives as ISO-able)", async () => {
    const tx = txStub();
    const live = { nested: { a: 1 }, when: new Date("2026-07-22T09:00:00.000Z") };
    await writeAudit(tx, { actor, action: "x.update", entityType: "X", entityId: "x_1", after: live });
    const stored = tx.auditEntry.create.mock.calls[0]![0].data.after;
    // mutating the source afterwards must not change what was captured (it was cloned)
    live.nested.a = 999;
    expect(stored.nested.a).toBe(1);
    // a Date is serialized to an ISO string by JSON round-trip
    expect(stored.when).toBe("2026-07-22T09:00:00.000Z");
  });
});

describe("writeSystemAudit (reaper / system actor)", () => {
  it("writes a non-anonymous system row (actorId null, actorName 'system') without requiring an actor", async () => {
    const tx = txStub();
    await writeSystemAudit(tx, {
      action: "reservation.release",
      entityType: "Reservation",
      entityId: "r_1",
      requestId: "req_1",
      before: { status: "HELD" },
      after: { status: "RELEASED" },
      reason: "hold lease expired",
    });
    expect(tx.auditEntry.create).toHaveBeenCalledTimes(1);
    const data = tx.auditEntry.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      actorId: null,
      actorName: "system",
      action: "reservation.release",
      entityType: "Reservation",
      entityId: "r_1",
      requestId: "req_1",
      reason: "hold lease expired",
    });
    expect(data.before).toEqual({ status: "HELD" });
    expect(data.after).toEqual({ status: "RELEASED" });
  });

  it("normalizes absent requestId/reason to null", async () => {
    const tx = txStub();
    await writeSystemAudit(tx, { action: "x.system", entityType: "X", entityId: "x_1" });
    const data = tx.auditEntry.create.mock.calls[0]![0].data;
    expect(data.requestId).toBeNull();
    expect(data.reason).toBeNull();
  });
});

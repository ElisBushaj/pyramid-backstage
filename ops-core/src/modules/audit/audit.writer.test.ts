import { describe, it, expect, vi } from "vitest";
import { writeAudit } from "./audit.writer";
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

  it("throws (loud failure) and writes nothing when there is no actor", async () => {
    const tx = txStub();
    await expect(writeAudit(tx, { actor: undefined as unknown as Actor, action: "x", entityType: "Y", entityId: "z" })).rejects.toThrow();
    expect(tx.auditEntry.create).not.toHaveBeenCalled();
  });

  it("passes reason through (required by reject)", async () => {
    const tx = txStub();
    await writeAudit(tx, { actor, action: "request.reject", entityType: "EventRequest", entityId: "req_1", reason: "Date unavailable" });
    expect(tx.auditEntry.create.mock.calls[0]![0].data.reason).toBe("Date unavailable");
  });
});

import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { requireRole, requirePermission } from "./auth.middleware";
import { APIError } from "../errors";
import type { Actor } from "../types";

// Focused UNIT test of the role ladder. No DB, no app — exercises requireRole /
// requirePermission directly so the gate's branch logic (401 vs 403, total order,
// every named permission) is provably correct in isolation. The integration
// counterparts (real cookie + real routes) live in src/__tests__/auth.test.ts.

type R = Actor["role"];
// The complete ladder, ascending. PARTNER (rank −1) grants nothing on the staff
// tool surface — ADR-0010 — so it is the strict floor below VIEWER.
const LADDER: R[] = ["PARTNER", "VIEWER", "OPS", "MANAGER", "ADMIN"];
// requireRole is only ever asked to gate the four staff roles (PARTNER is never a
// `min`), but every role — PARTNER included — must be classified against each.
const GATES: R[] = ["VIEWER", "OPS", "MANAGER", "ADMIN"];
const idx = (r: R) => LADDER.indexOf(r);

type Gate = (req: Request, res: Response, next: (err?: unknown) => void) => void;

/** Invoke a gate with an actor of `role` (or unauthenticated) and return what it passed to next(). */
function gateResult(mw: Gate, role: R | null): APIError | undefined {
  const next = vi.fn();
  const req = { actor: role ? { id: "u", name: "n", role } : undefined } as unknown as Request;
  mw(req, {} as Response, next);
  return next.mock.calls[0]?.[0] as APIError | undefined;
}

/** A gate that passes calls next() exactly once with no argument. */
function expectPass(mw: Gate, role: R): void {
  const next = vi.fn();
  const req = { actor: { id: "u", name: "n", role } } as unknown as Request;
  mw(req, {} as Response, next);
  expect(next, `${role} should pass`).toHaveBeenCalledTimes(1);
  expect(next.mock.calls[0]?.[0], `${role} should pass with no error`).toBeUndefined();
}

describe("requireRole — total ladder ADMIN>MANAGER>OPS>VIEWER>PARTNER (F01-T05)", () => {
  it.each(GATES)("requireRole(%s): every role at/above passes, every role below is 403 forbidden", (min) => {
    for (const role of LADDER) {
      if (idx(role) >= idx(min)) {
        expectPass(requireRole(min), role);
      } else {
        const err = gateResult(requireRole(min), role);
        expect(err?.status, `${role} should fail ${min}`).toBe(403);
        expect(err?.error, `${role} forbidden code`).toBe("forbidden");
        expect(err?.messageKey, `${role} forbidden key`).toBe("auth.forbidden");
      }
    }
  });

  it("PARTNER is below VIEWER — gets 403 on the staff floor (requireRole VIEWER)", () => {
    const err = gateResult(requireRole("VIEWER"), "PARTNER");
    expect(err?.status).toBe(403);
    expect(err?.error).toBe("forbidden");
  });

  it("the ladder is strict at each step: a role one rung below its gate is always blocked", () => {
    expect(gateResult(requireRole("VIEWER"), "PARTNER")?.status).toBe(403);
    expect(gateResult(requireRole("OPS"), "VIEWER")?.status).toBe(403);
    expect(gateResult(requireRole("MANAGER"), "OPS")?.status).toBe(403);
    expect(gateResult(requireRole("ADMIN"), "MANAGER")?.status).toBe(403);
  });

  it("ADMIN clears every gate including its own", () => {
    for (const min of GATES) expectPass(requireRole(min), "ADMIN");
  });

  it("an unauthenticated actor is 401 unauthorized, NOT 403 — the distinction is strict", () => {
    for (const min of GATES) {
      const err = gateResult(requireRole(min), null);
      expect(err?.status, `requireRole(${min}) anon`).toBe(401);
      expect(err?.error).toBe("unauthorized");
    }
  });

  it("401 (no actor) and 403 (actor too low) never collapse into one another", () => {
    const anon = gateResult(requireRole("OPS"), null);
    const tooLow = gateResult(requireRole("OPS"), "VIEWER");
    expect(anon?.status).toBe(401);
    expect(tooLow?.status).toBe(403);
    expect(anon?.status).not.toBe(tooLow?.status);
  });
});

describe("requirePermission — declarative per-route gates (F01-T05)", () => {
  it("approve is MANAGER+: PARTNER/VIEWER/OPS → 403, MANAGER/ADMIN pass", () => {
    expect(gateResult(requirePermission.approve, "PARTNER")?.status).toBe(403);
    expect(gateResult(requirePermission.approve, "VIEWER")?.status).toBe(403);
    expect(gateResult(requirePermission.approve, "OPS")?.status).toBe(403);
    expectPass(requirePermission.approve, "MANAGER");
    expectPass(requirePermission.approve, "ADMIN");
  });

  it("manageInventory is OPS+: PARTNER/VIEWER → 403, OPS/MANAGER/ADMIN pass", () => {
    expect(gateResult(requirePermission.manageInventory, "PARTNER")?.status).toBe(403);
    expect(gateResult(requirePermission.manageInventory, "VIEWER")?.status).toBe(403);
    expectPass(requirePermission.manageInventory, "OPS");
    expectPass(requirePermission.manageInventory, "MANAGER");
    expectPass(requirePermission.manageInventory, "ADMIN");
  });

  it("manageSpaces is OPS+: VIEWER → 403, OPS passes", () => {
    expect(gateResult(requirePermission.manageSpaces, "VIEWER")?.status).toBe(403);
    expectPass(requirePermission.manageSpaces, "OPS");
  });

  it("manageUsers is ADMIN-only: MANAGER → 403, only ADMIN passes", () => {
    expect(gateResult(requirePermission.manageUsers, "OPS")?.status).toBe(403);
    expect(gateResult(requirePermission.manageUsers, "MANAGER")?.status).toBe(403);
    expectPass(requirePermission.manageUsers, "ADMIN");
  });

  it("every named permission rejects an unauthenticated caller with 401, not 403", () => {
    for (const gate of [
      requirePermission.approve,
      requirePermission.manageInventory,
      requirePermission.manageSpaces,
      requirePermission.manageUsers,
    ]) {
      expect(gateResult(gate, null)?.status).toBe(401);
    }
  });
});

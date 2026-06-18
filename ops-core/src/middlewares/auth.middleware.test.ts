import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { requireRole, requirePermission } from "./auth.middleware";
import { APIError } from "../errors";
import type { Actor } from "../types";

type R = Actor["role"];
function gateResult(mw: (req: Request, res: Response, next: any) => void, role: R | null) {
  const next = vi.fn();
  const req = { actor: role ? { id: "u", name: "n", role } : undefined } as unknown as Request;
  mw(req, {} as Response, next);
  return next.mock.calls[0]?.[0] as APIError | undefined;
}

describe("requireRole — total ladder ADMIN>MANAGER>OPS>VIEWER (F01-T05)", () => {
  const ladder: R[] = ["VIEWER", "OPS", "MANAGER", "ADMIN"];
  const idx = (r: R) => ladder.indexOf(r);

  it.each(ladder)("requireRole(%s): at/above passes, below is 403", (min) => {
    for (const role of ladder) {
      const err = gateResult(requireRole(min), role);
      if (idx(role) >= idx(min)) {
        expect(err, `${role} should pass ${min}`).toBeUndefined();
      } else {
        expect(err?.status, `${role} should fail ${min}`).toBe(403);
        expect(err?.error).toBe("forbidden");
      }
    }
  });

  it("an anonymous actor is 401, not 403", () => {
    expect(gateResult(requireRole("VIEWER"), null)?.status).toBe(401);
  });

  it("requirePermission.approve is MANAGER+; OPS/VIEWER get 403", () => {
    expect(gateResult(requirePermission.approve, "OPS")?.status).toBe(403);
    expect(gateResult(requirePermission.approve, "MANAGER")).toBeUndefined();
    expect(gateResult(requirePermission.approve, "ADMIN")).toBeUndefined();
  });

  it("requirePermission.manageInventory is OPS+; VIEWER gets 403", () => {
    expect(gateResult(requirePermission.manageInventory, "VIEWER")?.status).toBe(403);
    expect(gateResult(requirePermission.manageInventory, "OPS")).toBeUndefined();
  });
});

import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { ValidationHelpers, handleValidation } from "./validation.utils";
import { APIError } from "../errors";

async function runChain(chain: any, req: Request) {
  await chain.run(req);
}

function reqWith(body: Record<string, unknown>): Request {
  return { body, query: {}, params: {}, cookies: {}, headers: {} } as unknown as Request;
}

describe("ValidationHelpers + handleValidation (F00-T04)", () => {
  it("produces the exact 422 body shape with fields keyed by field → messageKey", async () => {
    const req = reqWith({ name: "" });
    await runChain(ValidationHelpers.requiredString("name"), req);
    await runChain(ValidationHelpers.intMin("attendees", 1), req);

    const next = vi.fn();
    handleValidation(req, {} as Response, next);
    const err = next.mock.calls[0]![0] as APIError;
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(422);
    expect(err.error).toBe("validation");
    expect(err.fields?.name).toBe("validation.required");
    expect(err.fields?.attendees).toBe("validation.min");
  });

  it("passes through (next with no error) when all validators succeed", async () => {
    const req = reqWith({ name: "Acme", attendees: 5 });
    await runChain(ValidationHelpers.requiredString("name"), req);
    await runChain(ValidationHelpers.intMin("attendees", 1), req);
    const next = vi.fn();
    handleValidation(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects an out-of-enum value", async () => {
    const req = reqWith({ eventType: "WEDDING" });
    await runChain(ValidationHelpers.enumOf("eventType", ["CONFERENCE", "WORKSHOP"]), req);
    const next = vi.fn();
    handleValidation(req, {} as Response, next);
    const err = next.mock.calls[0]![0] as APIError;
    expect(err.fields?.eventType).toBe("validation.enum");
  });
});

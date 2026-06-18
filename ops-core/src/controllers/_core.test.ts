import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { controlledResponse, formatError } from "./_core";
import { APIError } from "../errors";
import { ok } from "../types";

function mockRes() {
  const res = {
    statusCode: 200,
    headersSent: false,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: any };
}

class Probe {
  @controlledResponse("post")
  static async created(_req: Request, _res: Response) {
    return ok({ id: "x" }, "space.created");
  }

  @controlledResponse("get")
  static async boom(_req: Request, _res: Response) {
    throw APIError.notFound();
  }
}

describe("@controlledResponse", () => {
  it("serializes a ServiceResponse into the envelope with the verb's status + localized message", async () => {
    const res = mockRes();
    await (Probe.created as any)({ locale: "en" } as Request, res, vi.fn());
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ status: "OK", messageKey: "space.created", data: { id: "x" } });
    expect(res.body.message).toBe("Space created.");
  });

  it("maps a thrown APIError onto the error-contract body", async () => {
    const res = mockRes();
    await (Probe.boom as any)({ locale: "en" } as Request, res, vi.fn());
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ status: 404, error: "not_found", messageKey: "common.not_found" });
  });
});

describe("formatError — every factory maps to its contract row", () => {
  const cases: Array<[APIError, number, string]> = [
    [APIError.unauthorized(), 401, "unauthorized"],
    [APIError.forbidden(), 403, "forbidden"],
    [APIError.notFound(), 404, "not_found"],
    [APIError.badRequest(), 400, "bad_request"],
    [APIError.conflict([]), 409, "conflict"],
    [APIError.invalidTransition("HELD", "CONFIRMED"), 409, "invalid_transition"],
    [APIError.idempotencyKeyMismatch(), 409, "idempotency_key_mismatch"],
    [APIError.validation({ email: "validation.required" }), 422, "validation"],
    [APIError.rateLimited(), 429, "rate_limited"],
    [APIError.internal(), 500, "internal"],
  ];
  it.each(cases)("%o → status %i error %s", (err, status, error) => {
    const res = mockRes();
    formatError(err, { locale: "en" } as Request, res, vi.fn());
    expect(res.statusCode).toBe(status);
    expect(res.body.error).toBe(error);
    expect(res.body.messageKey).toBeTypeOf("string");
  });

  it("carries structured extras (conflicts / from-to / fields)", () => {
    const r1 = mockRes();
    formatError(APIError.conflict([{ type: "SPACE_DOUBLE_BOOKED", window: { start: "a", end: "b" }, detail: "d" }]), { locale: "en" } as Request, r1, vi.fn());
    expect(r1.body.conflicts).toHaveLength(1);

    const r2 = mockRes();
    formatError(APIError.invalidTransition("X", "Y"), { locale: "en" } as Request, r2, vi.fn());
    expect(r2.body).toMatchObject({ from: "X", to: "Y" });

    const r3 = mockRes();
    formatError(APIError.validation({ name: "validation.required" }), { locale: "en" } as Request, r3, vi.fn());
    expect(r3.body.fields).toEqual({ name: "validation.required" });
  });
});

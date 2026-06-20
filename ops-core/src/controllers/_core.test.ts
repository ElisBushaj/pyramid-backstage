import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { controlledResponse, formatError } from "./_core";
import { APIError } from "../errors";
import { ok } from "../types";
import type { Conflict } from "../types/api/conflicts";

/**
 * Response-core invariants (CORE_PATTERNS §Controllers + ERROR_CONTRACT): the
 * decorator sets the right status per verb, serializes the ServiceResponse
 * envelope with a localized message, and funnels every thrown APIError — and any
 * unhandled error — through formatError onto the exact contract body. This is the
 * single choke point the whole API trusts, so every variant is pinned here.
 */

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
      this.headersSent = true;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: any; headersSent: boolean };
}

const reqEn = { locale: "en" } as Request;

// A controller class whose static methods are wrapped by the decorator.
class Probe {
  @controlledResponse("get")
  static async getOk(_req: Request, _res: Response) {
    return ok({ id: "g" }, "space.list.success");
  }
  @controlledResponse("post")
  static async created(_req: Request, _res: Response) {
    return ok({ id: "x" }, "space.created");
  }
  @controlledResponse("patch")
  static async patched(_req: Request, _res: Response) {
    return ok({ id: "p" }, "space.updated");
  }
  @controlledResponse("delete")
  static async deleted(_req: Request, _res: Response) {
    return ok({ ok: true }, "common.ok");
  }
  @controlledResponse("post", 200)
  static async postButOk(_req: Request, _res: Response) {
    return ok({ token: "t" }, "auth.login.success");
  }
  @controlledResponse("get")
  static async rawData(_req: Request, _res: Response) {
    return { plain: "no-envelope" };
  }
  @controlledResponse("post")
  static async withMessage(_req: Request, _res: Response) {
    return ok({ id: "m" }, "space.created", "pre-set message");
  }
  @controlledResponse("get")
  static async boom(_req: Request, _res: Response) {
    throw APIError.notFound();
  }
  @controlledResponse("get")
  static async unhandled(_req: Request, _res: Response) {
    throw new Error("kaboom — not an APIError");
  }
  @controlledResponse("get")
  static async writesItself(_req: Request, res: Response) {
    res.status(204).json({ wrote: "directly" });
    return ok({ ignored: true }, "common.ok");
  }
}

describe("@controlledResponse — status per verb", () => {
  const verbs: Array<[string, any, number]> = [
    ["GET → 200", Probe.getOk, 200],
    ["POST → 201", Probe.created, 201],
    ["PATCH → 200", Probe.patched, 200],
    ["DELETE → 200", Probe.deleted, 200],
  ];

  it.each(verbs)("%s", async (_n, handler, expected) => {
    const res = mockRes();
    await (handler as any)(reqEn, res, vi.fn());
    expect(res.statusCode).toBe(expected);
  });

  it("honours a statusOverride (POST that returns 200, e.g. login)", async () => {
    const res = mockRes();
    await (Probe.postButOk as any)(reqEn, res, vi.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: "OK", messageKey: "auth.login.success" });
  });
});

describe("@controlledResponse — envelope serialization", () => {
  it("serializes a ServiceResponse and localizes the message from the key", async () => {
    const res = mockRes();
    await (Probe.created as any)(reqEn, res, vi.fn());
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ status: "OK", messageKey: "space.created", data: { id: "x" } });
    expect(res.body.message).toBe("Space created.");
  });

  it("localizes the message in the active (al) locale", async () => {
    const res = mockRes();
    await (Probe.created as any)({ locale: "al" } as Request, res, vi.fn());
    expect(res.body.message).toBe("Hapësira u krijua.");
  });

  it("defaults to en when req.locale is absent", async () => {
    const res = mockRes();
    await (Probe.created as any)({} as Request, res, vi.fn());
    expect(res.body.message).toBe("Space created.");
  });

  it("keeps a pre-set message instead of overwriting it", async () => {
    const res = mockRes();
    await (Probe.withMessage as any)(reqEn, res, vi.fn());
    expect(res.body.message).toBe("pre-set message");
  });

  it("passes raw (non-envelope) data straight through", async () => {
    const res = mockRes();
    await (Probe.rawData as any)(reqEn, res, vi.fn());
    expect(res.body).toEqual({ plain: "no-envelope" });
  });

  it("does nothing when the controller already wrote the response (headersSent)", async () => {
    const res = mockRes();
    await (Probe.writesItself as any)(reqEn, res, vi.fn());
    expect(res.statusCode).toBe(204);
    expect(res.body).toEqual({ wrote: "directly" });
  });
});

describe("@controlledResponse — error funnelling", () => {
  it("maps a thrown APIError onto the contract body", async () => {
    const res = mockRes();
    await (Probe.boom as any)(reqEn, res, vi.fn());
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ status: 404, error: "not_found", messageKey: "common.not_found" });
  });

  it("maps an unhandled (non-APIError) throw to 500 internal", async () => {
    const res = mockRes();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await (Probe.unhandled as any)(reqEn, res, vi.fn());
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ status: 500, error: "internal", messageKey: "common.internal" });
    expect(res.body.message).toBeTypeOf("string");
    spy.mockRestore();
  });
});

describe("formatError — every APIError variant maps to its contract row", () => {
  const cases: Array<[string, APIError, number, string]> = [
    ["unauthorized", APIError.unauthorized(), 401, "unauthorized"],
    ["forbidden", APIError.forbidden(), 403, "forbidden"],
    ["notFound", APIError.notFound(), 404, "not_found"],
    ["badRequest", APIError.badRequest(), 400, "bad_request"],
    ["conflict", APIError.conflict([]), 409, "conflict"],
    ["invalidTransition", APIError.invalidTransition("HELD", "CONFIRMED"), 409, "invalid_transition"],
    ["idempotencyKeyMismatch", APIError.idempotencyKeyMismatch(), 409, "idempotency_key_mismatch"],
    ["validation", APIError.validation({ email: "validation.required" }), 422, "validation"],
    ["rateLimited", APIError.rateLimited(), 429, "rate_limited"],
    ["internal", APIError.internal(), 500, "internal"],
  ];

  it.each(cases)("%s → status %i / error %s / has messageKey", (_n, err, status, error) => {
    const res = mockRes();
    formatError(err, reqEn, res, vi.fn());
    expect(res.statusCode).toBe(status);
    expect(res.body.error).toBe(error);
    expect(res.body.messageKey).toBeTypeOf("string");
    expect(res.body.message).toBeTypeOf("string");
    expect(res.body.status).toBe(status);
  });

  it("409 conflict carries the full conflicts[] array", () => {
    const conflicts: Conflict[] = [
      { type: "SPACE_DOUBLE_BOOKED", spaceId: "space_blue", conflictingRequestIds: ["req_5a1"], window: { start: "a", end: "b" }, detail: "d" },
    ];
    const res = mockRes();
    formatError(APIError.conflict(conflicts), reqEn, res, vi.fn());
    expect(res.body.conflicts).toHaveLength(1);
    expect(res.body.conflicts[0]).toMatchObject({ type: "SPACE_DOUBLE_BOOKED" });
  });

  it("409 invalid_transition carries from/to", () => {
    const res = mockRes();
    formatError(APIError.invalidTransition("REJECTED", "APPROVED"), reqEn, res, vi.fn());
    expect(res.body).toMatchObject({ from: "REJECTED", to: "APPROVED" });
  });

  it("422 validation carries the fields map", () => {
    const res = mockRes();
    formatError(APIError.validation({ name: "validation.required" }), reqEn, res, vi.fn());
    expect(res.body.fields).toEqual({ name: "validation.required" });
  });

  it("omits the structured extras for errors that don't use them", () => {
    const res = mockRes();
    formatError(APIError.notFound(), reqEn, res, vi.fn());
    expect(res.body).not.toHaveProperty("conflicts");
    expect(res.body).not.toHaveProperty("from");
    expect(res.body).not.toHaveProperty("fields");
  });

  it("interpolates messageParams into the localized message", () => {
    const res = mockRes();
    formatError(
      new APIError({ status: 400, error: "bad_request", messageKey: "{thing} is bad", messageParams: { thing: "X" } }),
      reqEn,
      res,
      vi.fn(),
    );
    expect(res.body.message).toBe("X is bad");
  });

  it("maps an unknown (non-APIError) error to 500 internal", () => {
    const res = mockRes();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    formatError(new Error("nope"), reqEn, res, vi.fn());
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ status: 500, error: "internal", messageKey: "common.internal" });
    spy.mockRestore();
  });

  it("is a no-op when the response was already sent", () => {
    const res = mockRes();
    res.headersSent = true;
    res.statusCode = 222;
    formatError(APIError.notFound(), reqEn, res, vi.fn());
    expect(res.statusCode).toBe(222);
    expect(res.body).toBeUndefined();
  });

  it("defaults the locale to en when req.locale is missing", () => {
    const res = mockRes();
    formatError(APIError.notFound(), {} as Request, res, vi.fn());
    expect(res.body.message).toBe("Not found.");
  });
});

describe("APIError factories — status / error / messageKey", () => {
  it.each([
    ["unauthorized", APIError.unauthorized(), 401, "unauthorized", "common.unauthorized"],
    ["forbidden", APIError.forbidden(), 403, "forbidden", "common.forbidden"],
    ["notFound (default key)", APIError.notFound(), 404, "not_found", "common.not_found"],
    ["badRequest (default key)", APIError.badRequest(), 400, "bad_request", "common.bad_request"],
    ["idempotencyKeyMismatch", APIError.idempotencyKeyMismatch(), 409, "idempotency_key_mismatch", "common.idempotency_mismatch"],
    ["rateLimited (default key)", APIError.rateLimited(), 429, "rate_limited", "common.rate_limited"],
    ["internal (default key)", APIError.internal(), 500, "internal", "common.internal"],
  ] as Array<[string, APIError, number, string, string]>)(
    "%s",
    (_n, err, status, error, key) => {
      expect(err).toBeInstanceOf(APIError);
      expect(err.status).toBe(status);
      expect(err.error).toBe(error);
      expect(err.messageKey).toBe(key);
    },
  );

  it("notFound / badRequest / rateLimited accept a custom messageKey", () => {
    expect(APIError.notFound("space.list.success").messageKey).toBe("space.list.success");
    expect(APIError.badRequest("validation.failed").messageKey).toBe("validation.failed");
    expect(APIError.rateLimited("auth.rate_limited").messageKey).toBe("auth.rate_limited");
  });

  it("conflict defaults to reservation.conflict and stores the conflicts[]", () => {
    const c = APIError.conflict([{ type: "ASSET_OVERALLOCATED", window: { start: "a", end: "b" }, detail: "d" }]);
    expect(c.status).toBe(409);
    expect(c.error).toBe("conflict");
    expect(c.messageKey).toBe("reservation.conflict");
    expect(c.conflicts).toHaveLength(1);
  });

  it("invalidTransition stores from/to and defaults the key", () => {
    const t = APIError.invalidTransition("DRAFT", "APPROVED");
    expect(t.status).toBe(409);
    expect(t.error).toBe("invalid_transition");
    expect(t.from).toBe("DRAFT");
    expect(t.to).toBe("APPROVED");
    expect(t.messageKey).toBe("common.invalid_transition");
  });

  it("invalidTransition accepts a domain-specific key", () => {
    expect(APIError.invalidTransition("HELD", "CONFIRMED", "reservation.invalid_transition").messageKey).toBe(
      "reservation.invalid_transition",
    );
  });

  it("validation is 422 with the fields map and validation.failed key", () => {
    const v = APIError.validation({ a: "validation.required" });
    expect(v.status).toBe(422);
    expect(v.error).toBe("validation");
    expect(v.messageKey).toBe("validation.failed");
    expect(v.fields).toEqual({ a: "validation.required" });
  });

  it("the raw constructor defaults the error code from the status for EVERY mapped arm", () => {
    const arms: Array<[number, string]> = [
      [400, "bad_request"],
      [401, "unauthorized"],
      [403, "forbidden"],
      [404, "not_found"],
      [409, "conflict"],
      [422, "validation"],
      [429, "rate_limited"],
      [500, "internal"],
      [418, "internal"], // unmapped → internal
    ];
    for (const [status, error] of arms) {
      expect(new APIError({ status, messageKey: "k" }).error, `status ${status}`).toBe(error);
    }
    expect(new APIError({ messageKey: "k" }).status).toBe(500); // status defaults to 500
  });

  it("an explicit error code overrides the status-derived default", () => {
    expect(new APIError({ status: 404, error: "custom_code", messageKey: "k" }).error).toBe("custom_code");
  });

  it("is throwable and an instanceof Error", () => {
    expect(() => {
      throw APIError.forbidden();
    }).toThrow(APIError);
    expect(APIError.forbidden()).toBeInstanceOf(Error);
  });
});

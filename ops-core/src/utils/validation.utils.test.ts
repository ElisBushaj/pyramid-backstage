import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { validationResult, type ValidationChain } from "express-validator";
import { ValidationHelpers, handleValidation } from "./validation.utils";
import { APIError } from "../errors";
import { MESSAGE_KEYS } from "../types/message-keys";

// Pass through the real express-validator everywhere, but allow one test to
// override validationResult so the pathless-error fallback branch is reachable.
vi.mock("express-validator", async (importActual) => {
  const actual = await importActual<typeof import("express-validator")>();
  return { ...actual, validationResult: vi.fn(actual.validationResult) };
});

/**
 * Validation invariants (CORE_PATTERNS §Validation + ERROR_CONTRACT): every
 * field-level failure must surface a REGISTERED messageKey (never express-
 * validator's raw "Invalid value"), and handleValidation must fold them into the
 * `422 validation { fields: field→messageKey }` body. The central fix here is
 * ValidationHelpers.enumOf, whose missing/wrong-type path used to leak the raw
 * string; the dedicated suite below guards it.
 */

const REGISTERED = new Set<string>(MESSAGE_KEYS);

function reqWith(body: Record<string, unknown> = {}, query: Record<string, unknown> = {}, params: Record<string, unknown> = {}): Request {
  return { body, query, params, cookies: {}, headers: {} } as unknown as Request;
}

async function runChain(chain: ValidationChain | ValidationChain[], req: Request) {
  for (const c of Array.isArray(chain) ? chain : [chain]) await c.run(req);
}

/** The express-validator error message for `field` after running `chain`, or undefined. */
async function msgFor(chain: ValidationChain, req: Request, field: string): Promise<string | undefined> {
  await chain.run(req);
  const e = validationResult(req).array().find((x) => (x as { path?: string }).path === field);
  return e ? String(e.msg) : undefined;
}

describe("ValidationHelpers — every message is a REGISTERED messageKey", () => {
  // Each row: a chain + a request that should FAIL it + the field + the expected key.
  const rows: Array<[string, ValidationChain, Request, string, string]> = [
    // requiredString
    ["requiredString missing", ValidationHelpers.requiredString("name"), reqWith({}), "name", "validation.invalid"],
    ["requiredString non-string", ValidationHelpers.requiredString("name"), reqWith({ name: 5 }), "name", "validation.invalid"],
    ["requiredString empty", ValidationHelpers.requiredString("name"), reqWith({ name: "  " }), "name", "validation.required"],
    ["requiredString too long", ValidationHelpers.requiredString("name", "body", 3), reqWith({ name: "abcd" }), "name", "validation.length"],
    // optionalString
    ["optionalString non-string", ValidationHelpers.optionalString("note"), reqWith({ note: 5 }), "note", "validation.invalid"],
    ["optionalString too long", ValidationHelpers.optionalString("note", "body", 2), reqWith({ note: "abc" }), "note", "validation.length"],
    // intMin / intRange
    ["intMin missing", ValidationHelpers.intMin("n", 1), reqWith({}), "n", "validation.min"],
    ["intMin below min", ValidationHelpers.intMin("n", 5), reqWith({ n: 1 }), "n", "validation.min"],
    ["intMin non-int", ValidationHelpers.intMin("n", 1), reqWith({ n: "abc" }), "n", "validation.min"],
    ["intRange missing", ValidationHelpers.intRange("n", 1, 9), reqWith({}), "n", "validation.invalid"],
    ["intRange out of range", ValidationHelpers.intRange("n", 1, 9), reqWith({ n: 99 }), "n", "validation.invalid"],
    ["optionalIntMin below min", ValidationHelpers.optionalIntMin("n", 5), reqWith({ n: 1 }), "n", "validation.min"],
    // email
    ["email missing", ValidationHelpers.email("email"), reqWith({}), "email", "validation.email"],
    ["email malformed", ValidationHelpers.email("email"), reqWith({ email: "nope" }), "email", "validation.email"],
    ["optionalEmail malformed", ValidationHelpers.optionalEmail("email"), reqWith({ email: "nope" }), "email", "validation.email"],
    // enumOf — THE central fix
    ["enumOf missing", ValidationHelpers.enumOf("t", ["A", "B"]), reqWith({}), "t", "validation.enum"],
    ["enumOf non-string", ValidationHelpers.enumOf("t", ["A", "B"]), reqWith({ t: 5 }), "t", "validation.enum"],
    ["enumOf out-of-set", ValidationHelpers.enumOf("t", ["A", "B"]), reqWith({ t: "Z" }), "t", "validation.enum"],
    ["optionalEnumOf out-of-set", ValidationHelpers.optionalEnumOf("t", ["A", "B"]), reqWith({ t: "Z" }), "t", "validation.enum"],
    // isoDate
    ["isoDate required missing", ValidationHelpers.isoDate("d", "query", true), reqWith({}, {}), "d", "validation.datetime"],
    ["isoDate malformed", ValidationHelpers.isoDate("d", "query", true), reqWith({}, { d: "not-a-date" }), "d", "validation.datetime"],
    // arrayMin
    ["arrayMin missing", ValidationHelpers.arrayMin("xs", 1), reqWith({}), "xs", "validation.array"],
    ["arrayMin too short", ValidationHelpers.arrayMin("xs", 2), reqWith({ xs: [1] }), "xs", "validation.array"],
    ["arrayMin non-array", ValidationHelpers.arrayMin("xs", 1), reqWith({ xs: "no" }), "xs", "validation.array"],
    // object
    ["object missing", ValidationHelpers.object("o"), reqWith({}), "o", "validation.object"],
    ["object non-object", ValidationHelpers.object("o"), reqWith({ o: "x" }), "o", "validation.object"],
    ["optional object non-object", ValidationHelpers.object("o", "body", true), reqWith({ o: "x" }), "o", "validation.object"],
    // boolean
    ["boolean non-boolean", ValidationHelpers.boolean("b"), reqWith({ b: "maybe" }), "b", "validation.invalid"],
    // uuidParam
    ["uuidParam missing", ValidationHelpers.uuidParam("id"), reqWith({}, {}, {}), "id", "validation.uuid"],
    ["uuidParam non-uuid", ValidationHelpers.uuidParam("id"), reqWith({}, {}, { id: "123" }), "id", "validation.uuid"],
  ];

  it.each(rows)("%s → %s (registered)", async (_name, chain, req, field, expected) => {
    const msg = await msgFor(chain, req, field);
    expect(msg, `${_name} should fail`).toBeDefined();
    expect(msg).toBe(expected);
    expect(REGISTERED.has(msg!), `${msg} must be a registered messageKey`).toBe(true);
  });

  it("NEVER leaks express-validator's raw 'Invalid value' for any helper", async () => {
    for (const [name, chain, req, field] of rows) {
      const msg = await msgFor(chain, req, field);
      expect(msg, `${name} leaked a raw string`).not.toBe("Invalid value");
    }
  });
});

describe("ValidationHelpers — happy paths pass + sanitizers run", () => {
  it("requiredString trims and accepts a valid string", async () => {
    const req = reqWith({ name: "  Acme  " });
    await runChain(ValidationHelpers.requiredString("name"), req);
    expect(validationResult(req).isEmpty()).toBe(true);
    expect(req.body.name).toBe("Acme");
  });

  it("optionalString skips a null value (values: 'null')", async () => {
    const req = reqWith({ note: null });
    await runChain(ValidationHelpers.optionalString("note"), req);
    expect(validationResult(req).isEmpty()).toBe(true);
  });

  it("intMin coerces a numeric string to an int", async () => {
    const req = reqWith({ n: "42" });
    await runChain(ValidationHelpers.intMin("n", 1), req);
    expect(validationResult(req).isEmpty()).toBe(true);
    expect(req.body.n).toBe(42);
  });

  it("email lowercases a valid address without gmail dot-stripping", async () => {
    const req = reqWith({ email: "John.Doe@Gmail.com" });
    await runChain(ValidationHelpers.email("email"), req);
    expect(validationResult(req).isEmpty()).toBe(true);
    // Dots are PRESERVED (no normalizeEmail) so stored == login address.
    expect(req.body.email).toBe("john.doe@gmail.com");
  });

  it("boolean is optional (absent passes) and coerces a present value", async () => {
    const absent = reqWith({});
    await runChain(ValidationHelpers.boolean("b"), absent);
    expect(validationResult(absent).isEmpty()).toBe(true);

    const present = reqWith({ b: "true" });
    await runChain(ValidationHelpers.boolean("b"), present);
    expect(present.body.b).toBe(true);
  });

  it("enumOf accepts an in-set value", async () => {
    const req = reqWith({ t: "A" });
    await runChain(ValidationHelpers.enumOf("t", ["A", "B"]), req);
    expect(validationResult(req).isEmpty()).toBe(true);
  });

  it("optionalEnumOf skips an absent value", async () => {
    const req = reqWith({});
    await runChain(ValidationHelpers.optionalEnumOf("t", ["A", "B"]), req);
    expect(validationResult(req).isEmpty()).toBe(true);
  });

  it("uuidParam accepts a real UUID", async () => {
    const req = reqWith({}, {}, { id: "3f6b0e1a-2c4d-4a5b-8c9d-0e1f2a3b4c5d" });
    await runChain(ValidationHelpers.uuidParam("id"), req);
    expect(validationResult(req).isEmpty()).toBe(true);
  });

  it("isoDate is optional by default (absent passes)", async () => {
    const req = reqWith({}, {});
    await runChain(ValidationHelpers.isoDate("d"), req);
    expect(validationResult(req).isEmpty()).toBe(true);
  });
});

describe("handleValidation — folds errors into the 422 contract body", () => {
  it("collects each field → messageKey and throws APIError.validation (422)", async () => {
    const req = reqWith({ name: "" });
    await runChain(
      [ValidationHelpers.requiredString("name"), ValidationHelpers.intMin("attendees", 1)],
      req,
    );
    const next = vi.fn();
    handleValidation(req, {} as Response, next);

    const err = next.mock.calls[0]![0] as APIError;
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(422);
    expect(err.error).toBe("validation");
    expect(err.messageKey).toBe("validation.failed");
    expect(err.fields).toEqual({ name: "validation.required", attendees: "validation.min" });
  });

  it("the 422 fields body for a missing enum carries the registered key (regression for the central fix)", async () => {
    const req = reqWith({});
    await runChain(ValidationHelpers.enumOf("eventType", ["CONFERENCE", "WORKSHOP"]), req);
    const next = vi.fn();
    handleValidation(req, {} as Response, next);
    const err = next.mock.calls[0]![0] as APIError;
    expect(err.fields?.eventType).toBe("validation.enum");
    expect(err.fields?.eventType).not.toBe("Invalid value");
  });

  it("keeps the FIRST error per field when a field fails twice", async () => {
    // Two chains on the same field; first failure should win.
    const req = reqWith({ n: "abc" });
    await runChain([ValidationHelpers.intMin("n", 1), ValidationHelpers.intRange("n", 1, 9)], req);
    const next = vi.fn();
    handleValidation(req, {} as Response, next);
    const err = next.mock.calls[0]![0] as APIError;
    expect(err.fields?.n).toBe("validation.min");
  });

  it("calls next() with no argument when every validator passes", async () => {
    const req = reqWith({ name: "Acme", attendees: 5 });
    await runChain([ValidationHelpers.requiredString("name"), ValidationHelpers.intMin("attendees", 1)], req);
    const next = vi.fn();
    handleValidation(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(next.mock.calls[0]!.length).toBe(0);
  });

  it("buckets a pathless error (no field) under the '_' fallback key", () => {
    // An alternative/_error-style express-validator entry carries no `path`.
    vi.mocked(validationResult).mockReturnValueOnce({
      isEmpty: () => false,
      array: () => [{ msg: "validation.invalid" } as never],
    } as never);
    const next = vi.fn();
    handleValidation(reqWith({}), {} as Response, next);
    const err = next.mock.calls[0]![0] as APIError;
    expect(err.fields).toEqual({ _: "validation.invalid" });
  });

  it("every value in the fields body is a registered messageKey", async () => {
    const req = reqWith({ name: "", t: "Z" }, {}, { id: "bad" });
    await runChain(
      [
        ValidationHelpers.requiredString("name"),
        ValidationHelpers.enumOf("t", ["A", "B"]),
        ValidationHelpers.uuidParam("id"),
      ],
      req,
    );
    const next = vi.fn();
    handleValidation(req, {} as Response, next);
    const err = next.mock.calls[0]![0] as APIError;
    for (const key of Object.values(err.fields ?? {})) {
      expect(REGISTERED.has(key), `${key} unregistered`).toBe(true);
    }
  });
});

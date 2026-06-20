import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import Ajv from "ajv";
import { APIError } from "../errors";
import { formatError } from "../controllers/_core";

const openapiPath = path.resolve(__dirname, "..", "..", "openapi.yaml");
const doc = parse(fs.readFileSync(openapiPath, "utf8")) as any;

// OpenAPI 3.1 ≈ JSON Schema 2020-12. ajv default dialect differs, so run loose:
// unknown formats (email/date-time/uuid) and the `example`/`default` keywords are ignored.
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
ajv.addSchema(doc, "openapi.yaml");

/** Collect the JSON-pointer of every node carrying an `example`. */
function collectExampleNodes(node: any, pointer: string, out: Array<{ pointer: string; example: unknown }>) {
  if (node === null || typeof node !== "object") return;
  if ("example" in node && (("type" in node) || ("enum" in node) || ("$ref" in node) || ("allOf" in node))) {
    out.push({ pointer, example: node.example });
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "example") continue;
    collectExampleNodes(v, `${pointer}/${escape(k)}`, out);
  }
}
const escape = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");

describe("contract: openapi.yaml examples validate against their schemas (F00-T07)", () => {
  const nodes: Array<{ pointer: string; example: unknown }> = [];
  collectExampleNodes(doc.components.schemas, "/components/schemas", nodes);

  it("finds a non-trivial set of examples to check", () => {
    expect(nodes.length).toBeGreaterThan(10);
  });

  it.each(nodes.map((n) => [n.pointer, n] as const))("example at %s validates", (_p, n) => {
    const validate = ajv.getSchema(`openapi.yaml#${n.pointer}`);
    expect(validate, `no schema at ${n.pointer}`).toBeTypeOf("function");
    const val_ = validate as (d: unknown) => boolean;
    const okk = val_(n.example);
    expect(okk, JSON.stringify((validate as any).errors)).toBe(true);
  });
});

describe("contract: enum casing is UPPER_SNAKE and matches the TS mirrors", () => {
  // Mirrors the unions in src/types/api/*. A drift here means the YAML and the
  // hand-mirrored types disagree — which the type-sharing contract forbids.
  const expected: Record<string, string[]> = {
    Layout: ["THEATER", "CLASSROOM", "BANQUET", "RECEPTION", "CABARET", "BOARDROOM", "CUSTOM"],
    SpaceKind: ["MAIN", "TRANSITIONAL"],
    AssetType: ["SEATING", "TABLE", "MICROPHONE", "SCREEN", "PROJECTOR", "STAGE_UNIT", "LIGHTING", "OTHER"],
    AssetStatus: ["ACTIVE", "MAINTENANCE", "RETIRED"],
    EventType: ["CONFERENCE", "EXHIBITION", "WORKSHOP", "PERFORMANCE", "COMMUNITY", "PRIVATE", "OTHER"],
    RequestStatus: ["DRAFT", "PROPOSED", "APPROVED", "SCHEDULED", "COMPLETED", "REJECTED"],
    ReservationStatus: ["HELD", "CONFIRMED", "RELEASED"],
    QuoteStatus: ["DRAFT", "SENT", "ACCEPTED", "EXPIRED"],
    TaskPhase: ["SETUP", "TEARDOWN"],
    TaskStatus: ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"],
    LineItemKind: ["SPACE", "ASSET", "SERVICE"],
    ConflictType: ["SPACE_DOUBLE_BOOKED", "ASSET_OVERALLOCATED", "SETUP_WINDOW_OVERLAP"],
    Role: ["ADMIN", "MANAGER", "OPS", "VIEWER", "PARTNER"],
  };

  it.each(Object.entries(expected))("%s matches the contract exactly", (name, values) => {
    expect(doc.components.schemas[name]?.enum).toEqual(values);
    for (const v of values) expect(v).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });
});

describe("contract: the runtime error contract matches openapi.yaml's Error schemas", () => {
  // The bodies formatError actually emits must validate against the spec the
  // frontend + AI mirror. This wires the live error layer to the published shapes
  // so a drift (e.g. dropping `fields` or `conflicts`) fails the build.
  function bodyFor(err: APIError): Record<string, unknown> {
    let captured: unknown;
    const res = {
      headersSent: false,
      status() { return res; },
      json(p: unknown) { captured = p; return res; },
    } as unknown as Response;
    formatError(err, { locale: "en" } as Request, res, vi.fn());
    return captured as Record<string, unknown>;
  }

  const ref = (name: string) => `openapi.yaml#/components/schemas/${name}`;

  it("base Error body (401/403/404/400/429/500) validates against #/Error", () => {
    const validate = ajv.getSchema(ref("Error"))!;
    for (const err of [
      APIError.unauthorized(),
      APIError.forbidden(),
      APIError.notFound(),
      APIError.badRequest(),
      APIError.rateLimited(),
      APIError.internal(),
    ]) {
      const body = bodyFor(err);
      expect(validate(body), `${err.error}: ${JSON.stringify((validate as any).errors)}`).toBe(true);
      expect(body).toMatchObject({ status: err.status, error: err.error, messageKey: err.messageKey });
    }
  });

  it("409 conflict body validates against #/ConflictError (carries conflicts[])", () => {
    const validate = ajv.getSchema(ref("ConflictError"))!;
    const body = bodyFor(
      APIError.conflict([
        { type: "SPACE_DOUBLE_BOOKED", spaceId: "space_blue", conflictingRequestIds: ["req_5a1"], window: { start: "2026-07-22T07:00:00Z", end: "2026-07-22T20:00:00Z" }, detail: "x" },
      ]),
    );
    expect(validate(body), JSON.stringify((validate as any).errors)).toBe(true);
    expect((body as any).conflicts).toHaveLength(1);
  });

  it("409 invalid_transition body validates against #/InvalidTransitionError (from/to)", () => {
    const validate = ajv.getSchema(ref("InvalidTransitionError"))!;
    const body = bodyFor(APIError.invalidTransition("REJECTED", "APPROVED"));
    expect(validate(body), JSON.stringify((validate as any).errors)).toBe(true);
    expect(body).toMatchObject({ from: "REJECTED", to: "APPROVED", error: "invalid_transition" });
  });

  it("422 validation body validates against #/ValidationError (fields map)", () => {
    const validate = ajv.getSchema(ref("ValidationError"))!;
    const body = bodyFor(APIError.validation({ expectedAttendees: "validation.required" }));
    expect(validate(body), JSON.stringify((validate as any).errors)).toBe(true);
    expect((body as any).fields).toEqual({ expectedAttendees: "validation.required" });
  });

  it("the structured-error machine codes appear as literal examples in the spec", () => {
    // The three errors with dedicated schemas pin their machine `error` string as
    // an example; ops-core's factories emit exactly these.
    expect(doc.components.schemas.ConflictError.allOf[1].properties.error.example).toBe("conflict");
    expect(doc.components.schemas.InvalidTransitionError.allOf[1].properties.error.example).toBe("invalid_transition");
    expect(doc.components.schemas.ValidationError.allOf[1].properties.error.example).toBe("validation");
  });

  it("the base-Error cases (401/403/404/429) each have a reusable response component", () => {
    for (const r of ["Unauthorized", "Forbidden", "NotFound", "RateLimited", "Validation", "Conflict", "InvalidTransition"]) {
      expect(doc.components.responses[r], `missing reusable response: ${r}`).toBeTruthy();
    }
  });

  it("the structured error schemas require their extra field (conflicts / fields)", () => {
    expect(doc.components.schemas.ConflictError.allOf[1].required).toContain("conflicts");
    expect(doc.components.schemas.Error.required).toEqual(expect.arrayContaining(["status", "error", "messageKey"]));
  });
});

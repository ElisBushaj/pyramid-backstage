import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import Ajv from "ajv";

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
    Role: ["ADMIN", "MANAGER", "OPS", "VIEWER"],
  };

  it.each(Object.entries(expected))("%s matches the contract exactly", (name, values) => {
    expect(doc.components.schemas[name]?.enum).toEqual(values);
    for (const v of values) expect(v).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });
});

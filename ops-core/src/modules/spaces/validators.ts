import { body, query, type ValidationChain } from "express-validator";
import { ValidationHelpers } from "../../utils/validation.utils";

const LAYOUTS = ["THEATER", "CLASSROOM", "BANQUET", "RECEPTION", "CABARET", "BOARDROOM", "CUSTOM"];
const KINDS = ["MAIN", "TRANSITIONAL"];

const capacitiesValidator = (chain: ValidationChain) =>
  chain.isObject().withMessage("validation.object").bail().custom((caps: Record<string, unknown>) => {
    const entries = Object.entries(caps ?? {});
    if (entries.length === 0) throw new Error("validation.required");
    for (const [k, v] of entries) {
      if (!LAYOUTS.includes(k)) throw new Error("validation.enum");
      if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) throw new Error("validation.min");
    }
    return true;
  });

export const listSpacesValidators: ValidationChain[] = [
  ValidationHelpers.optionalIntMin("minCapacity", 1, "query"),
  ValidationHelpers.optionalEnumOf("layout", LAYOUTS, "query"),
  ValidationHelpers.isoDate("start", "query"),
  ValidationHelpers.isoDate("end", "query"),
];

export const spaceAvailabilityValidators: ValidationChain[] = [
  ValidationHelpers.isoDate("start", "query", true),
  ValidationHelpers.isoDate("end", "query", true),
];

export const createSpaceValidators: ValidationChain[] = [
  ValidationHelpers.requiredString("name", "body", 120),
  body("floor").isInt().withMessage("validation.int").toInt(),
  ValidationHelpers.optionalEnumOf("kind", KINDS),
  capacitiesValidator(body("capacities")),
  ValidationHelpers.intMin("dayRateMinor", 0),
  body("features").optional().isArray().withMessage("validation.array"),
  ValidationHelpers.optionalIntMin("setupBufferMinutes", 0),
  ValidationHelpers.optionalIntMin("teardownBufferMinutes", 0),
];

export const updateSpaceValidators: ValidationChain[] = [
  body("name").optional().isString().bail().isLength({ min: 1, max: 120 }).withMessage("validation.length"),
  body("floor").optional().isInt().withMessage("validation.int").toInt(),
  ValidationHelpers.optionalEnumOf("kind", KINDS),
  body("capacities").optional().custom((caps: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(caps ?? {})) {
      if (!LAYOUTS.includes(k)) throw new Error("validation.enum");
      if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) throw new Error("validation.min");
    }
    return true;
  }),
  ValidationHelpers.optionalIntMin("dayRateMinor", 0),
  body("features").optional().isArray().withMessage("validation.array"),
  ValidationHelpers.optionalIntMin("setupBufferMinutes", 0),
  ValidationHelpers.optionalIntMin("teardownBufferMinutes", 0),
];

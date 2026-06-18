import { body, type ValidationChain } from "express-validator";
import { ValidationHelpers } from "../../utils/validation.utils";

const TYPES = ["SEATING", "TABLE", "MICROPHONE", "SCREEN", "PROJECTOR", "STAGE_UNIT", "LIGHTING", "OTHER"];
const STATUSES = ["ACTIVE", "MAINTENANCE", "RETIRED"];

export const listAssetsValidators: ValidationChain[] = [
  ValidationHelpers.optionalEnumOf("type", TYPES, "query"),
  ValidationHelpers.optionalIntMin("quantity", 1, "query"),
  ValidationHelpers.isoDate("start", "query"),
  ValidationHelpers.isoDate("end", "query"),
];

export const createAssetValidators: ValidationChain[] = [
  ValidationHelpers.requiredString("name", "body", 120),
  ValidationHelpers.enumOf("type", TYPES),
  ValidationHelpers.intMin("totalQuantity", 0),
  ValidationHelpers.requiredString("location", "body", 120),
  ValidationHelpers.optionalEnumOf("status", STATUSES),
];

export const updateAssetValidators: ValidationChain[] = [
  body("name").optional().isString().bail().isLength({ min: 1, max: 120 }).withMessage("validation.length"),
  ValidationHelpers.optionalEnumOf("type", TYPES),
  ValidationHelpers.optionalIntMin("totalQuantity", 0),
  body("location").optional().isString().bail().isLength({ min: 1, max: 120 }).withMessage("validation.length"),
  ValidationHelpers.optionalEnumOf("status", STATUSES),
];

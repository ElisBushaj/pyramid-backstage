import { Router } from "express";
import { requireRole } from "../../middlewares/auth.middleware";
import { withIdempotency } from "../../middlewares/idempotency.middleware";
import { handleValidation } from "../../utils/validation.utils";
import { QuotesController } from "./controller";
import { createQuoteValidators } from "./validators";

const router = Router();

// Generating a financial document requires OPS+ (SECURITY.md): a VIEWER is read-only.
router.post("/", requireRole("OPS"), withIdempotency(), createQuoteValidators, handleValidation, QuotesController.generate);

export default router;

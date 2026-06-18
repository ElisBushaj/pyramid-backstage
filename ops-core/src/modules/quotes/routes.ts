import { Router } from "express";
import { withIdempotency } from "../../middlewares/idempotency.middleware";
import { handleValidation } from "../../utils/validation.utils";
import { QuotesController } from "./controller";
import { createQuoteValidators } from "./validators";

const router = Router();

router.post("/", withIdempotency(), createQuoteValidators, handleValidation, QuotesController.generate);

export default router;

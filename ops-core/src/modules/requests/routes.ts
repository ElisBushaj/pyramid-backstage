import { Router } from "express";
import { withIdempotency } from "../../middlewares/idempotency.middleware";
import { handleValidation } from "../../utils/validation.utils";
import { RequestsController } from "./controller";
import { createRequestValidators, listRequestsValidators, updateRequestValidators } from "./validators";

const router = Router();

router.get("/", listRequestsValidators, handleValidation, RequestsController.list);
router.post("/", withIdempotency(), createRequestValidators, handleValidation, RequestsController.create);
router.get("/:id", RequestsController.getAggregate);
router.patch("/:id", withIdempotency(), updateRequestValidators, handleValidation, RequestsController.update);

// F08 mounts /:id/tasks here; F10 mounts /:id/approve + /:id/reject here.

export default router;

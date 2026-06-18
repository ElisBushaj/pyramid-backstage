import { Router } from "express";
import { requireRole } from "../../middlewares/auth.middleware";
import { withIdempotency } from "../../middlewares/idempotency.middleware";
import { handleValidation } from "../../utils/validation.utils";
import { SpacesController } from "./controller";
import {
  createSpaceValidators,
  listSpacesValidators,
  spaceAvailabilityValidators,
  updateSpaceValidators,
} from "./validators";

const router = Router();

router.get("/", listSpacesValidators, handleValidation, SpacesController.list);
router.get("/:id/availability", spaceAvailabilityValidators, handleValidation, SpacesController.availability);
router.post("/", requireRole("OPS"), withIdempotency(), createSpaceValidators, handleValidation, SpacesController.create);
router.patch("/:id", requireRole("OPS"), withIdempotency(), updateSpaceValidators, handleValidation, SpacesController.update);

export default router;

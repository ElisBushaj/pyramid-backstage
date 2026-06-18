import { Router } from "express";
import { requireRole } from "../../middlewares/auth.middleware";
import { withIdempotency } from "../../middlewares/idempotency.middleware";
import { handleValidation } from "../../utils/validation.utils";
import { AssetsController } from "./controller";
import { createAssetValidators, listAssetsValidators, updateAssetValidators } from "./validators";

const router = Router();

router.get("/", listAssetsValidators, handleValidation, AssetsController.list);
router.post("/", requireRole("OPS"), withIdempotency(), createAssetValidators, handleValidation, AssetsController.create);
router.patch("/:id", requireRole("OPS"), withIdempotency(), updateAssetValidators, handleValidation, AssetsController.update);

export default router;

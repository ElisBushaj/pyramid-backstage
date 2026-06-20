import { Router } from "express";
import { requireRole } from "../../middlewares/auth.middleware";
import { withIdempotency } from "../../middlewares/idempotency.middleware";
import { handleValidation } from "../../utils/validation.utils";
import { AssetsController } from "./controller";
import { createAssetValidators, listAssetsValidators, scanAssetValidators, updateAssetValidators } from "./validators";

const router = Router();

router.get("/", listAssetsValidators, handleValidation, AssetsController.list);
router.post("/", requireRole("OPS"), withIdempotency(), createAssetValidators, handleValidation, AssetsController.create);
router.patch("/:id", requireRole("OPS"), withIdempotency(), updateAssetValidators, handleValidation, AssetsController.update);
// F16 — QR/NFC scan (OPS+) records a movement + updates live location; movements are the ledger.
router.post("/:id/scan", requireRole("OPS"), withIdempotency(), scanAssetValidators, handleValidation, AssetsController.scan);
router.get("/:id/movements", AssetsController.movements);

export default router;

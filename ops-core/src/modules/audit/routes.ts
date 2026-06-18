import { Router } from "express";
import { handleValidation } from "../../utils/validation.utils";
import { AuditController } from "./controller";
import { listAuditValidators } from "./validators";

const router = Router();

// VIEWER+ may read the ledger (the /private tier already requires auth).
router.get("/", listAuditValidators, handleValidation, AuditController.list);

export default router;

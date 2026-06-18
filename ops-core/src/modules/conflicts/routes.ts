import { Router } from "express";
import { handleValidation } from "../../utils/validation.utils";
import { ConflictsController } from "./controller";
import { checkConflictsValidators } from "./validators";

const router = Router();

router.get("/", checkConflictsValidators, handleValidation, ConflictsController.check);

export default router;

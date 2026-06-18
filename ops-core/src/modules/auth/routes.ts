import { Router } from "express";
import { AuthController } from "./controller";

// Private auth routes (mounted under /private/auth, behind requireAuth+requireCsrf).
const router = Router();

router.post("/logout", AuthController.logout);
router.get("/me", AuthController.me);

export default router;

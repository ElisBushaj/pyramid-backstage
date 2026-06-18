import { Router } from "express";
import { handleValidation } from "../../utils/validation.utils";
import { loginRateLimiter } from "../../middlewares/rate-limit.middleware";
import { AuthController } from "./controller";
import { loginValidators } from "./validators";

// Public auth routes (mounted under /public/auth — no session required).
const router = Router();

router.post("/login", loginRateLimiter(), loginValidators, handleValidation, AuthController.login);

export default router;

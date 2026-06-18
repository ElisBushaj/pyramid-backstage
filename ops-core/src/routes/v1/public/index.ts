import { Router } from "express";
import authPublicRoutes from "../../../modules/auth/public.routes";

const router = Router();

// Unauthenticated routes.
router.use("/auth", authPublicRoutes);

export default router;

import { Router } from "express";
import publicRoutes from "./v1/public";
import privateRoutes from "./v1/private";
import adminRoutes from "./v1/admin";

const router = Router();

router.use("/public", publicRoutes);
router.use("/private", privateRoutes);
router.use("/admin", adminRoutes);

export default router;

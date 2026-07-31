import { Router, type IRouter } from "express";

import healthRouter from "./health";
import authRoutes from "./auth.routes";

const router: IRouter = Router();

router.use(healthRouter);

router.use("/auth", authRoutes);

export default router;
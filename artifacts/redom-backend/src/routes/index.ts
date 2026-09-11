import {
  Router,
  type IRouter,
} from "express";

import healthRouter
  from "./health";

import authRoutes
  from "./auth.routes";

import sessionRoutes
  from "./session.routes";

import aiRoutes
  from "./ai.routes";

import feedRoutes
  from "./feed.routes";

const router: IRouter =
  Router();

router.use(
  healthRouter,
);

router.use(
  "/auth",
  authRoutes,
);

router.use(
  "/sessions",
  sessionRoutes,
);

router.use(
  "/ai",
  aiRoutes,
);

router.use(
  "/feed",
  feedRoutes,
);

export default router;

import { Router, type IRouter } from "express";

import { sql } from "drizzle-orm";
import { db } from "../database/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "redom-backend",
  });
});

router.get("/readyz", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);

    res.status(200).json({
      status: "ready",
      database: "ok",
    });
  } catch {
    res.status(503).json({
      status: "not_ready",
      database: "unavailable",
    });
  }
});

export default router;

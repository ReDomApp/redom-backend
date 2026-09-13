import { Router, type IRouter } from "express";
import { getReDomKnowledge, getReDomKnowledgeVersion } from "../services/redomKnowledge";

const router: IRouter = Router();

/**
 * Backend-owned product knowledge for present and future ReDom AI clients.
 * This endpoint exposes product/policy knowledge only; live account state
 * remains available exclusively through the appropriate authenticated APIs.
 */
router.get("/knowledge", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({
    ok: true,
    source: "redom-backend",
    ...getReDomKnowledgeVersion(),
    knowledge: getReDomKnowledge(),
  });
});

export default router;

import { Router, type IRouter } from "express";
import { getReDomKnowledge, getReDomKnowledgeVersion } from "../services/redomKnowledge";
import { getReDomSystemMap, getReDomSystemMapVersion } from "../services/redomSystemMap";
import { getReDomMessagingKnowledge, REDOM_MESSAGING_KNOWLEDGE_VERSION } from "../services/messagingKnowledge";

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
    ...getReDomSystemMapVersion(),
    messagingKnowledgeVersion: REDOM_MESSAGING_KNOWLEDGE_VERSION,
    knowledge: getReDomKnowledge(),
    systemMap: getReDomSystemMap(),
    messaging: getReDomMessagingKnowledge(),
  });
});

export default router;

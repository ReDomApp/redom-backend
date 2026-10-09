import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import profileShareRouter from "./routes/profile-share.routes";
import { logger } from "./lib/logger";
import { apiRateLimit } from "./middleware/rate-limit.middleware";
import { recordOpsIncident } from "./services/operations/daily-ops-intelligence.service";

const app: Express = express();
app.set("trust proxy", 1);
app.use(pinoHttp({ logger, serializers: { req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; }, res(res) { return { statusCode: res.statusCode }; } } }));
app.use(cors({ origin: true, credentials: true }));
app.use("/redom-backend/support/email/webhook", express.raw({ type: "application/json", limit: "2mb" }));
app.use("/redom-backend/payments/webhook", express.raw({ type: "application/json", limit: "2mb" }));
app.use("/redom-backend/payments/stripe/webhook", express.raw({ type: "application/json", limit: "2mb" }));
app.use("/support/email/webhook", express.raw({ type: "application/json", limit: "2mb" }));
app.use("/ops/email/webhook", express.raw({ type: "application/json", limit: "2mb" }));
app.use("/redom-backend/ops/email/webhook", express.raw({ type: "application/json", limit: "2mb" }));
// Encrypted media is base64 encoded before transport. Keep a bounded JSON envelope above the 10 MB binary media limit.
app.use(express.json({ limit: "16mb" }));
app.use(express.urlencoded({ extended: true, limit: "16mb" }));
app.use(profileShareRouter);
app.use("/redom-backend", profileShareRouter);
app.use("/redom-backend", apiRateLimit, router);
app.use("/", apiRateLimit, router);
app.use("/redom-backend", (_req, res) => { res.status(404).json({ success: false, message: "Route not found." }); });
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => { logger.error({ error }, "Unhandled API error"); const route = String(req.baseUrl ?? "") + String(req.route?.path ?? "unmatched-route"); void recordOpsIncident({ key: "http-500:" + req.method + ":" + route, title: "Unhandled backend API error", subsystem: "http-api", severity: "high", description: "An unhandled exception reached the Express error handler.", evidence: { method: req.method, route, status: 500, errorType: error instanceof Error ? error.name : typeof error } }).catch(() => undefined); if (res.headersSent) return; res.status(500).json({ success: false, message: "Internal server error." }); });
export default app;

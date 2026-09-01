import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Render and other managed hosts terminate TLS/proxy traffic before Express.
// Trust the first proxy so req.ip reflects the client address used by fraud
// checks and login history instead of the platform proxy address.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/redom-backend", router);

app.use("/redom-backend", (_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    logger.error({ error }, "Unhandled API error");

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  },
);

export default app;

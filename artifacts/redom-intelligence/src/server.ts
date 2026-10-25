import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { completeChat, readInferenceConfig } from "./inference.js";
import { validateChatRequest } from "./validation.js";
import { isAuthorizedBearer, parseServiceKeys, SlidingWindowLimiter } from "./security.js";

const serviceKeys = parseServiceKeys(process.env.SERVICE_API_KEYS);
const maxBodyBytes = 1_048_576;
const limiter = new SlidingWindowLimiter(
  Number.isFinite(Number(process.env.RATE_LIMIT_PER_MINUTE))
    ? Math.min(Math.max(Number(process.env.RATE_LIMIT_PER_MINUTE ?? 60), 1), 600)
    : 60,
  60_000,
);
const portValue = Number(process.env.PORT ?? "8088");
const port = Number.isInteger(portValue) && portValue >= 1 && portValue <= 65_535 ? portValue : 8088;

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}

function errorPayload(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const declaredLength = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw Object.assign(new Error("Request body too large."), { statusCode: 413 });
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw Object.assign(new Error("Request body too large."), { statusCode: 413 });
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { statusCode: 400 });
  }
}

const server = createServer(async (req, res) => {
  const requestId = randomUUID();
  const path = (req.url ?? "/").split("?")[0] ?? "/";

  if (req.method === "GET" && path === "/health/live") {
    json(res, 200, { status: "ok", service: "redom-intelligence-core" });
    return;
  }
  if (req.method === "GET" && path === "/health/ready") {
    const ready = serviceKeys.length > 0 && readInferenceConfig() !== null;
    json(res, ready ? 200 : 503, { status: ready ? "ready" : "not_ready", service: "redom-intelligence-core" });
    return;
  }

  if (!isAuthorizedBearer(req.headers.authorization, serviceKeys)) {
    json(res, 401, errorPayload("UNAUTHORIZED", "A valid service bearer token is required."));
    return;
  }
  const keyFingerprint = createHash("sha256").update(req.headers.authorization!.slice(7).trim()).digest("hex");
  if (!limiter.consume(keyFingerprint)) {
    json(res, 429, errorPayload("RATE_LIMITED", "Request rate limit exceeded."));
    return;
  }

  if (req.method === "GET" && path === "/v1/models") {
    const config = readInferenceConfig();
    if (!config) {
      json(res, 503, errorPayload("ENGINE_NOT_CONFIGURED", "The model engine is not configured."));
      return;
    }
    json(res, 200, { object: "list", data: [{ id: config.model, object: "model", owned_by: "redom" }] });
    return;
  }

  if (req.method === "POST" && path === "/v1/chat/completions") {
    const config = readInferenceConfig();
    if (!config) {
      json(res, 503, errorPayload("ENGINE_NOT_CONFIGURED", "The model engine is not configured."));
      return;
    }
    try {
      const body = await readJson(req);
      const chat = validateChatRequest(body, config.model);
      if (!chat) {
        json(res, 400, errorPayload("INVALID_REQUEST", "Request fields are invalid or the requested model is unavailable."));
        return;
      }
      const completion = await completeChat(chat, config);
      json(res, 200, completion);
    } catch (error) {
      const statusCode = error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode: unknown }).statusCode)
        : 500;
      const code = error && typeof error === "object" && "errorCode" in error
        ? String((error as { errorCode: unknown }).errorCode)
        : "INTERNAL_ERROR";
      const message = error instanceof Error ? error.message : "Unexpected internal error.";
      json(res, statusCode >= 400 && statusCode <= 599 ? statusCode : 500, errorPayload(code, message));
    }
    return;
  }

  json(res, 404, errorPayload("NOT_FOUND", `No route for request ${requestId}.`));
});

server.listen(port, "0.0.0.0", () => {
  // Intentionally log only service/port; never log prompts, completions, keys, or config.
  process.stdout.write(`ReDom Intelligence Core listening on port ${port}\n`);
});

function shutdown(signal: string): void {
  process.stdout.write(`Received ${signal}; shutting down.\n`);
  server.close((error) => {
    if (error) process.exitCode = 1;
    process.exit();
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

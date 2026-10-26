import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { completeChat, isInferenceReady } from "./inference.js";
import { getConfiguredModels } from "./model-registry.js";
import { validateChatRequest } from "./validation.js";
import { isAuthorizedBearer, parseServiceKeys, SlidingWindowLimiter } from "./security.js";

const serviceKeys = parseServiceKeys(process.env.SERVICE_API_KEYS);
const maxBodyBytes = 1_048_576;
const limitPerMinute = Number(process.env.RATE_LIMIT_PER_MINUTE ?? "60");
const limiter = new SlidingWindowLimiter(Number.isFinite(limitPerMinute) ? Math.min(Math.max(limitPerMinute, 1), 600) : 60, 60_000);
const unauthenticatedLimiter = new SlidingWindowLimiter(120, 60_000, 20_000);
const concurrencyValue = Number(process.env.MAX_CONCURRENT_INFERENCE ?? "8");
const maxConcurrentInference = Number.isInteger(concurrencyValue) ? Math.min(Math.max(concurrencyValue, 1), 128) : 8;
let activeInferenceRequests = 0;
const portValue = Number(process.env.PORT ?? "8088");
const port = Number.isInteger(portValue) && portValue >= 1 && portValue <= 65_535 ? portValue : 8088;

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  });
  res.end(JSON.stringify(payload));
}
function errorPayload(code: string, message: string): { error: { code: string; message: string } } { return { error: { code, message } }; }
async function readJson(req: IncomingMessage): Promise<unknown> {
  const contentType = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw Object.assign(new Error("Content-Type must be application/json."), { statusCode: 415, errorCode: "UNSUPPORTED_MEDIA_TYPE" });
  const declaredLength = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) throw Object.assign(new Error("Request body too large."), { statusCode: 413, errorCode: "BODY_TOO_LARGE" });
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += buffer.length;
    if (size > maxBodyBytes) throw Object.assign(new Error("Request body too large."), { statusCode: 413, errorCode: "BODY_TOO_LARGE" });
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw Object.assign(new Error("Request body must be valid JSON."), { statusCode: 400, errorCode: "INVALID_JSON" }); }
}
const server = createServer(async (req, res) => {
  const requestId = randomUUID(), path = (req.url ?? "/").split("?")[0] ?? "/";
  res.setHeader("x-request-id", requestId);
  req.setTimeout(210_000, () => { if (!res.headersSent) json(res, 408, errorPayload("REQUEST_TIMEOUT", "Request timed out.")); req.destroy(); });
  if (req.method === "GET" && path === "/health/live") { json(res, 200, { status: "ok", service: "redom-intelligence-core" }); return; }
  if (req.method === "GET" && path === "/health/ready") {
    const models = getConfiguredModels();
    const ready = serviceKeys.length > 0 && models.length > 0 && (await Promise.all(models.map((model) => isInferenceReady(model.inference)))).every(Boolean);
    json(res, ready ? 200 : 503, { status: ready ? "ready" : "not_ready", service: "redom-intelligence-core", configured_models: models.length }); return;
  }
  const peer = req.socket.remoteAddress ?? "unknown";
  if (!unauthenticatedLimiter.consume(peer)) { json(res, 429, errorPayload("RATE_LIMITED", "Request rate limit exceeded.")); return; }
  if (!isAuthorizedBearer(req.headers.authorization, serviceKeys)) { json(res, 401, errorPayload("UNAUTHORIZED", "A valid service bearer token is required.")); return; }
  const keyFingerprint = createHash("sha256").update(req.headers.authorization!.slice(7).trim()).digest("hex");
  if (!limiter.consume(keyFingerprint)) { json(res, 429, errorPayload("RATE_LIMITED", "Request rate limit exceeded.")); return; }
  if (req.method === "GET" && path === "/v1/models") {
    const models = getConfiguredModels();
    if (!models.length) { json(res, 503, errorPayload("ENGINE_NOT_CONFIGURED", "No model engine is configured.")); return; }
    json(res, 200, { object: "list", data: models.map((model) => ({ id: model.id, object: "model", owned_by: "redom", name: model.name, description: model.description, capabilities: model.capabilities })) }); return;
  }
  if (req.method === "POST" && path === "/v1/chat/completions") {
    if (activeInferenceRequests >= maxConcurrentInference) {
      json(res, 503, errorPayload("INFERENCE_CAPACITY_EXCEEDED", "Inference capacity is temporarily full; retry later."));
      return;
    }
    activeInferenceRequests += 1;
    try {
      const body = await readJson(req);
      const requestedId = body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).model === "string" ? String((body as Record<string, unknown>).model) : undefined;
      const models = getConfiguredModels();
      const model = requestedId ? models.find((candidate) => candidate.id === requestedId) : models.length === 1 ? models[0] : undefined;
      if (!model) { json(res, 400, errorPayload("INVALID_REQUEST", "Request fields are invalid or the requested model is unavailable.")); return; }
      const chat = validateChatRequest(body, model.id);
      if (!chat) { json(res, 400, errorPayload("INVALID_REQUEST", "Request fields are invalid or the requested model is unavailable.")); return; }
      json(res, 200, await completeChat(chat, model.inference, model.id));
    } catch (error) {
      const statusCode = error && typeof error === "object" && "statusCode" in error ? Number((error as { statusCode: unknown }).statusCode) : 500;
      const code = error && typeof error === "object" && "errorCode" in error ? String((error as { errorCode: unknown }).errorCode) : "INTERNAL_ERROR";
      const message = error instanceof Error ? error.message : "Unexpected internal error.";
      json(res, statusCode >= 400 && statusCode <= 599 ? statusCode : 500, errorPayload(code, message));
    } finally {
      activeInferenceRequests = Math.max(0, activeInferenceRequests - 1);
    }
    return;
  }
  json(res, 404, errorPayload("NOT_FOUND", "Route not found."));
});
server.listen(port, "0.0.0.0", () => process.stdout.write(`ReDom Intelligence Core listening on port ${port}\n`));
function shutdown(signal: string): void {
  process.stdout.write(`Received ${signal}; shutting down.\n`);
  server.close((error) => { if (error) process.exitCode = 1; process.exit(); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

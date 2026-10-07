import express from "express";
import pino from "pino";
import { normalizeMessage } from "./message.js";
import { MailQueue } from "./queue.js";
import type { SendEmailRequest } from "./types.js";

const logger = pino({ name: "redom-mail" });
const app = express();
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT ?? 8080);
const apiKey = process.env.MAIL_API_KEY;
const fromDomain = (process.env.SMTP_FROM_DOMAIN ?? "wnncompany.com").toLowerCase();
const requireDkim = process.env.REQUIRE_DKIM !== "false";
const dkimPrivateKeyPath = process.env.DKIM_PRIVATE_KEY_PATH;
const queue = new MailQueue({
  host: process.env.SMTP_HOSTNAME ?? "mail.wnncompany.com",
  heloName: process.env.SMTP_HELO_NAME ?? "mail.wnncompany.com",
  connectTimeoutMs: Number(process.env.SMTP_CONNECT_TIMEOUT_MS ?? 15000),
  commandTimeoutMs: Number(process.env.SMTP_COMMAND_TIMEOUT_MS ?? 15000),
  maxMessageBytes: Number(process.env.SMTP_MAX_MESSAGE_BYTES ?? 10485760),
  dkim: dkimPrivateKeyPath ? { domain: fromDomain, selector: process.env.DKIM_SELECTOR ?? "mail2026", privateKeyPath: dkimPrivateKeyPath } : undefined,
});

function authenticate(req: express.Request): boolean {
  if (!apiKey) return false;
  const supplied = req.header("authorization")?.replace(/^Bearer\\s+/i, "");
  return supplied === apiKey;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "redom-mail", domain: "wnncompany.com" });
});

app.get("/v1/domains", (_req, res) => {
  res.json({
    domain: "wnncompany.com",
    status: dkimPrivateKeyPath ? "ready-for-dns-verification" : "configuration-required",
    authentication: ["SPF", "DKIM", "DMARC", "PTR", "TLS"],
  });
});

app.post("/v1/emails", (req, res) => {
  if (!authenticate(req)) {
    res.status(401).json({ error: { code: "unauthorized", message: "Invalid API key" } });
    return;
  }

  try {
    if (requireDkim && !dkimPrivateKeyPath) {
      res.status(503).json({ error: { code: "mail_not_ready", message: "DKIM signing is not configured" } });
      return;
    }
    const message = normalizeMessage(req.body as SendEmailRequest);
    if (!message.from.email.endsWith("@" + fromDomain)) {
      res.status(403).json({ error: { code: "sender_not_allowed", message: "Sender must use @" + fromDomain } });
      return;
    }
    queue.enqueue(message);
    logger.info({ id: message.id, recipients: message.recipients.length }, "email queued");
    res.status(202).json({
      id: message.id,
      object: "email",
      status: "queued",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    res.status(400).json({ error: { code: "invalid_request", message } });
  }
});

app.listen(port, () => {
  logger.info({ port }, "ReDom Mail API listening");
});

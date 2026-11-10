import { readFileSync } from "node:fs";
import { createHash, createDecipheriv } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer as createSmtpServer } from "smtp-server";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";

const required = ["DATABASE_URL", "SMTP_TLS_CERT_PATH", "SMTP_TLS_KEY_PATH"];
for (const name of required) {
  if (!process.env[name]) throw new Error(name + " is required by the Aurelink SMTP gateway.");
}
const encryptionSecret = process.env.AURELINK_COMMUNICATIONS_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET;
if (!encryptionSecret || encryptionSecret.length < 32) throw new Error("The shared Aurelink communications encryption secret (or backend JWT_ACCESS_SECRET fallback) is required.");
const cert = readFileSync(process.env.SMTP_TLS_CERT_PATH);
const key = readFileSync(process.env.SMTP_TLS_KEY_PATH);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.DATABASE_SSL === "disable" ? { ssl: false } : {}),
  max: Number(process.env.DATABASE_POOL_MAX || 12),
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});
const encryptionKey = createHash("sha256").update(encryptionSecret).digest();

function decryptProviderKey(value) {
  const [iv, tag, ciphertext] = String(value || "").split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Stored provider credential is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
function domainAllowed(address, authorizedDomain) {
  const domain = String(address || "").trim().toLowerCase().split("@").pop();
  const allowed = String(authorizedDomain || "").trim().toLowerCase();
  return Boolean(domain && allowed && (domain === allowed || domain.endsWith("." + allowed)));
}
function smtpError(message, responseCode = 550) {
  const error = new Error(message);
  error.responseCode = responseCode;
  return error;
}
const authFailures = new Map();
function authFailureAllowed(ip) {
  const entry = authFailures.get(ip);
  if (!entry) return true;
  if (Date.now() - entry.startedAt > 15 * 60_000) {
    authFailures.delete(ip);
    return true;
  }
  return entry.count < 12;
}
function recordAuthFailure(ip) {
  const now = Date.now();
  const entry = authFailures.get(ip);
  if (!entry || now - entry.startedAt > 15 * 60_000) authFailures.set(ip, { startedAt: now, count: 1 });
  else entry.count += 1;
}
function authIp(session) {
  return String(session.remoteAddress || session.clientHostname || "unknown");
}

async function resolveCredential(password) {
  const supplied = String(password || "");
  if (supplied.length < 32 || supplied.length > 160) return null;
  const prefix = supplied.slice(0, 16);
  const result = await pool.query(
    `SELECT c.id,c.workspace_id,c.password_hash,c.provider_key_encrypted,d.domain
       FROM aurelink_smtp_credentials c
       JOIN aurelink_email_domains d
         ON d.id=c.email_domain_id AND d.workspace_id=c.workspace_id
      WHERE c.token_prefix=$1
        AND c.username='aurelink'
        AND c.status='active'
        AND c.provider_key_id IS NOT NULL
        AND c.provider_key_encrypted IS NOT NULL
        AND d.provider='resend'
        AND d.status='verified'
      LIMIT 1`,
    [prefix],
  );
  const row = result.rows[0];
  if (!row || !row.password_hash || !await bcrypt.compare(supplied, row.password_hash)) return null;
  const providerKey = decryptProviderKey(row.provider_key_encrypted);
  await pool.query("UPDATE aurelink_smtp_credentials SET last_used_at=NOW() WHERE id=$1", [row.id]);
  return { credentialId: row.id, workspaceId: row.workspace_id, domain: row.domain, providerKey };
}

function makeSmtpOptions({ secure, requireTLS }) {
  return {
    secure,
    requireTLS,
    key,
    cert,
    minVersion: "TLSv1.2",
    authMethods: ["PLAIN", "LOGIN"],
    authOptional: false,
    disabledCommands: ["EXPN", "VRFY"],
    maxClients: Number(process.env.SMTP_MAX_CLIENTS || 200),
    maxAllowedUnauthenticatedCommands: 8,
    maxMessageSize: Number(process.env.SMTP_MAX_MESSAGE_BYTES || 15 * 1024 * 1024),
    logger: false,
    onAuth(auth, session, callback) {
      const ip = authIp(session);
      if (!authFailureAllowed(ip)) return callback(smtpError("Too many authentication failures. Try again later.", 454));
      if (String(auth.username || "").toLowerCase() !== "aurelink") {
        recordAuthFailure(ip);
        return callback(smtpError("Invalid Aurelink SMTP credentials.", 535));
      }
      resolveCredential(auth.password).then((credential) => {
        if (!credential) {
          recordAuthFailure(ip);
          return callback(smtpError("Invalid Aurelink SMTP credentials.", 535));
        }
        authFailures.delete(ip);
        return callback(null, { user: credential });
      }).catch((error) => {
        console.error("SMTP authentication lookup failed:", error?.message || "unknown error");
        return callback(smtpError("SMTP authentication is temporarily unavailable.", 454));
      });
    },
    onMailFrom(address, session, callback) {
      const user = session.user;
      if (!user || !domainAllowed(address.address, user.domain)) {
        return callback(smtpError("The sender address must belong to your verified Aurelink sending domain.", 553));
      }
      return callback();
    },
    onRcptTo(address, session, callback) {
      if (!session.user) return callback(smtpError("Authenticate before sending.", 530));
      return callback();
    },
    onData(stream, session, callback) {
      const chunks = [];
      let total = 0;
      stream.on("data", (chunk) => {
        total += chunk.length;
        if (total <= Number(process.env.SMTP_MAX_MESSAGE_BYTES || 15 * 1024 * 1024)) chunks.push(chunk);
      });
      stream.on("error", () => callback(smtpError("Unable to read the submitted message.", 451)));
      stream.on("end", async () => {
        try {
          if (total > Number(process.env.SMTP_MAX_MESSAGE_BYTES || 15 * 1024 * 1024)) {
            return callback(smtpError("Message exceeds Aurelink's SMTP size limit.", 552));
          }
          const raw = Buffer.concat(chunks);
          const parsed = await simpleParser(raw, { skipHtmlToText: true, skipTextToHtml: true });
          const fromAddresses = parsed.from?.value?.map((entry) => entry.address).filter(Boolean) || [];
          if (!fromAddresses.length || fromAddresses.some((address) => !domainAllowed(address, session.user.domain))) {
            return callback(smtpError("The From address must belong to your verified Aurelink sending domain.", 553));
          }
          const mailFrom = session.envelope.mailFrom?.address;
          if (!mailFrom || !domainAllowed(mailFrom, session.user.domain)) {
            return callback(smtpError("The envelope sender must belong to your verified Aurelink sending domain.", 553));
          }
          const recipients = (session.envelope.rcptTo || []).map((entry) => entry.address).filter(Boolean);
          if (!recipients.length) return callback(smtpError("At least one recipient is required.", 554));

          const transport = nodemailer.createTransport({
            host: "smtp.resend.com",
            port: 465,
            secure: true,
            auth: { user: "resend", pass: session.user.providerKey },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 60000,
            tls: { minVersion: "TLSv1.2" },
          });
          try {
            await transport.sendMail({ envelope: { from: mailFrom, to: recipients }, raw });
          } finally {
            transport.close();
          }
          return callback();
        } catch (error) {
          const message = String(error?.message || "Upstream email delivery failed.").slice(0, 240);
          console.error("SMTP upstream delivery failed:", { credentialId: session.user?.credentialId, message });
          return callback(smtpError("Aurelink could not submit this message to its delivery provider. " + message, 451));
        }
      });
    },
  };
}

const implicitTlsServer = createSmtpServer(makeSmtpOptions({ secure: true, requireTLS: false }));
const startTlsServer = createSmtpServer(makeSmtpOptions({ secure: false, requireTLS: true }));
const healthServer = createHttpServer(async (req, res) => {
  if (req.url !== "/healthz") {
    res.writeHead(404).end();
    return;
  }
  try {
    await pool.query("SELECT 1");
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, service: "aurelink-smtp-gateway" }));
  } catch {
    res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ ok: false }));
  }
});
const listen = (server, port) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "0.0.0.0", () => {
    server.removeListener("error", reject);
    resolve();
  });
});
const port465 = Number(process.env.SMTP_PORT_SSL || 465);
const port587 = Number(process.env.SMTP_PORT_STARTTLS || 587);
const healthPort = Number(process.env.HEALTH_PORT || 8080);

await pool.query("SELECT 1");
await Promise.all([
  listen(implicitTlsServer, port465),
  listen(startTlsServer, port587),
  listen(healthServer, healthPort),
]);
console.log("Aurelink SMTP gateway listening on 465 (implicit TLS), 587 (STARTTLS), and health port " + healthPort);

async function shutdown(signal) {
  console.log("Aurelink SMTP gateway shutting down:", signal);
  await Promise.all([
    new Promise((resolve) => implicitTlsServer.close(resolve)),
    new Promise((resolve) => startTlsServer.close(resolve)),
    new Promise((resolve) => healthServer.close(resolve)),
  ]);
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

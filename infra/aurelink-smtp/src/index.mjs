import { SMTPServer } from "smtp-server";
import nodemailer from "nodemailer";
import pg from "pg";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const port = Number(process.env.SMTP_PORT || 587);
const implicitTlsPort = Number(process.env.SMTP_TLS_PORT || 465);
const mtaSubmissionPort = process.env.SMTP_MTA_PORT ? Number(process.env.SMTP_MTA_PORT) : null;
const maxBytes = Number(process.env.AURELINK_SMTP_MAX_MESSAGE_BYTES || 10485760);
const maxRecipients = Number(process.env.AURELINK_SMTP_MAX_RECIPIENTS || 20);
const perMinuteLimit = Number(process.env.AURELINK_SMTP_PER_MINUTE_LIMIT || 30);
const dailyLimit = Number(process.env.AURELINK_SMTP_DAILY_LIMIT || 500);
const primary = process.env.AURELINK_SMTP_PRIMARY_PROVIDER || "resend";
const fallback = process.env.AURELINK_SMTP_FALLBACK_PROVIDER || "brevo";
const apiKey = process.env.AURELINK_RESEND_API_KEY || process.env.RESEND_API_KEY;
const brevoLogin = process.env.AURELINK_BREVO_SMTP_LOGIN;
const brevoKey = process.env.AURELINK_BREVO_SMTP_KEY;

function passwordMatches(password, encoded) {
  const [scheme, salt, digest] = String(encoded || "").split("$");
  if (scheme !== "scrypt" || !salt || !digest) return false;
  const expected = Buffer.from(digest, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function clientMessageId(raw) {
  const match = raw.toString("utf8").match(/^Message-ID:\s*<?([^>\r\n]+)>?/im);
  return match?.[1]?.trim() || null;
}
function messageId(raw) {
  return clientMessageId(raw) || createHash("sha256").update(raw).digest("hex");
}
function withBrevoCorrelationHeader(raw, key) {
  const source = raw.toString("utf8");
  const separator = source.indexOf("\r\n\r\n");
  if (separator < 0) return raw;
  const header = "X-Mailin-custom: aurelink:" + key + "\r\n";
  return Buffer.from(source.slice(0,separator + 2) + header + source.slice(separator + 2),"utf8");
}
function providerMessageId(info) {
  const response = String(info?.response || "");
  return response.match(/(?:queued as|message[- ]id[:=])\s*<?([A-Za-z0-9._-]+)>?/i)?.[1] || null;
}
function smtpTransport(provider) {
  if (provider === "resend") {
    if (!apiKey) throw new Error("Resend SMTP is not configured.");
    return nodemailer.createTransport({ host: "smtp.resend.com", port: 465, secure: true, auth: { user: "resend", pass: apiKey }, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 30000 });
  }
  if (provider === "brevo") {
    if (!brevoLogin || !brevoKey) throw new Error("Brevo SMTP is not configured. The Brevo SMTP login and SMTP key are required; the REST API key will not work here.");
    return nodemailer.createTransport({ host: "smtp-relay.brevo.com", port: 587, secure: false, requireTLS: true, auth: { user: brevoLogin, pass: brevoKey }, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 30000 });
  }
  throw new Error("Unsupported Aurelink SMTP provider.");
}
async function deliver(provider, envelope, raw) {
  const transport = smtpTransport(provider);
  try { return await transport.sendMail({ envelope, raw }); }
  finally { transport.close(); }
}
async function handleMessage(session, raw, callback) {
  const auth = session.aurelink;
  if (!auth?.workspaceId || !auth?.credentialId) return callback(new Error("535 Authentication required."));
  const from = String(session.envelope?.mailFrom?.address || "").toLowerCase();
  const recipients = (session.envelope?.rcptTo || []).map(item => String(item.address || "").toLowerCase());
  if (!from.includes("@") || !recipients.length || recipients.length > maxRecipients) return callback(new Error("550 Invalid envelope or recipient limit exceeded."));
  const domain = from.split("@").pop();
  const clientId = clientMessageId(raw);
  const messageKey = messageId(raw);
  const duplicate = await pool.query("SELECT provider,provider_message_id,status FROM aurelink_smtp_messages WHERE workspace_id=$1 AND message_key=$2", [auth.workspaceId, messageKey]);
  if (duplicate.rows[0]?.status === "accepted") return callback(null, "250 Message already accepted.");
  const resendDomain = await pool.query(
    "SELECT id FROM aurelink_email_domains WHERE workspace_id=$1 AND provider='resend' AND LOWER(domain)=LOWER($2) AND status='verified' LIMIT 1",
    [auth.workspaceId, domain]
  );
  if (!resendDomain.rows[0]) return callback(new Error("550 Sender domain must be verified with Resend before primary SMTP delivery."));
  const brevoSender = await pool.query(
    "SELECT s.email,s.sender_name,s.domain FROM aurelink_email_senders s JOIN aurelink_email_domains d ON d.workspace_id=s.workspace_id AND d.provider='brevo' AND LOWER(d.domain)=LOWER(s.domain) AND d.status='verified' WHERE s.workspace_id=$1 AND s.provider='brevo' AND s.status='verified' ORDER BY CASE WHEN LOWER(SPLIT_PART(s.email,'@',1))=LOWER(SPLIT_PART($2,'@',1)) THEN 0 ELSE 1 END,s.created_at ASC LIMIT 1",
    [auth.workspaceId, from]
  );
  const usage = await pool.query(
    "SELECT COUNT(*) FILTER (WHERE created_at>NOW()-INTERVAL '1 minute')::int AS minute_count,COUNT(*) FILTER (WHERE created_at>=date_trunc('day',NOW()))::int AS day_count FROM aurelink_smtp_messages WHERE credential_id=$1",
    [auth.credentialId]
  );
  if (Number(usage.rows[0]?.minute_count || 0) >= perMinuteLimit || Number(usage.rows[0]?.day_count || 0) >= dailyLimit) return callback(new Error("452 Aurelink SMTP sending limit reached."));
  let provider = primary;
  let result;
  let firstError;
  try { result = await deliver(primary, { from, to: recipients }, raw); }
  catch (error) {
    firstError = error;
    try {
      if (!fallback || fallback === primary) throw error;
      if (fallback === "brevo") {
        const sender = brevoSender.rows[0];
        if (!sender?.email) throw new Error("No verified Brevo fallback sender is configured for this Aurelink workspace.");
        const originalFrom = from;
        const rewritten = raw.toString("utf8");
        const fromHeader = new RegExp("^From:[^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*","im");
        const fallbackFrom = "From: " + (sender.sender_name ? '"' + String(sender.sender_name).replace(/["\\\\]/g,"") + '" ' : "") + "<" + sender.email + ">";
        let fallbackRaw = fromHeader.test(rewritten) ? rewritten.replace(fromHeader,fallbackFrom) : fallbackFrom + "\\r\\n" + rewritten;
        if (!/^Reply-To:/im.test(fallbackRaw)) fallbackRaw = fallbackRaw.replace(/\\r\\n\\r\\n/,"\\r\\nReply-To: " + originalFrom + "\\r\\n\\r\\n");
        provider = fallback;
        result = await deliver(fallback, { from: sender.email, to: recipients }, withBrevoCorrelationHeader(Buffer.from(fallbackRaw,"utf8"),messageKey));
      } else {
        provider = fallback;
        result = await deliver(fallback, { from, to: recipients }, raw);
      }
    } catch (fallbackError) {
      const detail = String(fallbackError instanceof Error ? fallbackError.message : error).slice(0,500);
      await pool.query(
        "INSERT INTO aurelink_smtp_messages(workspace_id,credential_id,message_key,client_message_id,envelope_from,recipients,provider,status,error) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'failed',$8) ON CONFLICT(workspace_id,message_key) DO UPDATE SET status='failed',error=EXCLUDED.error,updated_at=NOW()",
        [auth.workspaceId,auth.credentialId,messageKey,clientId,from,JSON.stringify(recipients),provider,detail]
      );
      return callback(new Error("451 Primary and fallback SMTP providers could not accept this message."));
    }
  }
  await pool.query(
    "INSERT INTO aurelink_smtp_messages(workspace_id,credential_id,message_key,client_message_id,envelope_from,recipients,provider,provider_message_id,status) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,'accepted') ON CONFLICT(workspace_id,message_key) DO UPDATE SET provider=EXCLUDED.provider,provider_message_id=EXCLUDED.provider_message_id,status='accepted',error=NULL,updated_at=NOW()",
    [auth.workspaceId,auth.credentialId,messageKey,clientId,from,JSON.stringify(recipients),provider,providerMessageId(result)]
  );
  if (firstError) console.warn("[Aurelink SMTP] primary failed; fallback accepted message", String(firstError).slice(0,200));
  callback(null, "250 Message accepted by " + provider + ".");
}
async function authenticate(auth, session, callback) {
  try {
    const username = String(auth.username || "");
    const password = String(auth.password || "");
    const result = await pool.query(
      "SELECT c.id,c.workspace_id,c.password_hash,w.status AS workspace_status FROM aurelink_smtp_credentials c JOIN aurelink_communications_workspaces w ON w.id=c.workspace_id WHERE c.username=$1 AND c.status='active' LIMIT 1",
      [username]
    );
    const row = result.rows[0];
    if (!row || row.workspace_status !== "active" || !passwordMatches(password,row.password_hash)) return callback(new Error("Invalid Aurelink SMTP credentials."));
    await pool.query("UPDATE aurelink_smtp_credentials SET last_used_at=NOW(),updated_at=NOW() WHERE id=$1",[row.id]);
    session.aurelink = { workspaceId: String(row.workspace_id), credentialId: String(row.id) };
    callback(null, { user: username });
  } catch { callback(new Error("SMTP authentication temporarily unavailable.")); }
}
const key = process.env.SMTP_TLS_KEY;
const cert = process.env.SMTP_TLS_CERT;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (!key || !cert) throw new Error("SMTP_TLS_KEY and SMTP_TLS_CERT are required. The relay refuses plaintext SMTP.");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT is invalid.");
function createSmtpServer(implicitTls) {
  const server = new SMTPServer({
    secure: implicitTls,
    key: key.includes("BEGIN") ? key : fs.readFileSync(key,"utf8"),
    cert: cert.includes("BEGIN") ? cert : fs.readFileSync(cert,"utf8"),
    authMethods: ["PLAIN","LOGIN"],
    authOptional: false,
    allowInsecureAuth: false,
    requireTLS: !implicitTls,
    size: maxBytes,
    rejectOversized: true,
    maxRecipients,
    maxClients: Number(process.env.AURELINK_SMTP_MAX_CONNECTIONS || 100),
    onAuth: authenticate,
    onData(stream, session, callback) {
      const chunks = [];
      let size = 0;
      let settled = false;
      const done = (error, message) => { if (settled) return; settled = true; callback(error, message); };
      stream.on("data", chunk => {
        size += chunk.length;
        chunks.push(chunk);
      });
      stream.on("error", () => done(new Error("451 Unable to read SMTP message.")));
      stream.on("end", () => {
        if (settled) return;
        if (stream.sizeExceeded || size > maxBytes) return done(new Error("552 Message exceeds Aurelink SMTP size limit."));
        void handleMessage(session,Buffer.concat(chunks),done).catch(error => {
          console.error("[Aurelink SMTP delivery]",error instanceof Error?error.message:"unknown error");
          done(new Error("451 Aurelink could not queue or deliver this message."));
        });
      });
    }
  });
  server.on("error", error => console.error("[Aurelink SMTP server]",error));
  return server;
}
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(implicitTlsPort) || implicitTlsPort < 1 || implicitTlsPort > 65535 || port === implicitTlsPort) throw new Error("SMTP_PORT and SMTP_TLS_PORT must be valid, distinct TCP ports.");
const listeners = [
  { server:createSmtpServer(false), port, label:"STARTTLS" },
  { server:createSmtpServer(true), port:implicitTlsPort, label:"implicit TLS" }
];
if (mtaSubmissionPort !== null) {
  if (!Number.isInteger(mtaSubmissionPort) || mtaSubmissionPort < 1 || mtaSubmissionPort > 65535 || listeners.some(item=>item.port===mtaSubmissionPort)) throw new Error("SMTP_MTA_PORT must be a valid unused TCP port.");
  listeners.push({server:createSmtpServer(false),port:mtaSubmissionPort,label:"STARTTLS (optional port 25 submission)"});
}
for (const item of listeners) {
  item.server.listen(item.port,"0.0.0.0",()=>console.log(`Aurelink SMTP submission listening on 0.0.0.0:${item.port} (${item.label}; authentication required)`));
}
process.on("SIGTERM",()=>{for(const item of listeners)item.server.close(()=>{void pool.end();});});
process.on("SIGINT",()=>{for(const item of listeners)item.server.close(()=>{void pool.end();});});

import { SMTPServer } from "smtp-server";
import nodemailer from "nodemailer";
import pg from "pg";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const port = Number(process.env.SMTP_PORT || 587);
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
function messageId(raw) {
  const match = raw.toString("utf8").match(/^Message-ID:\s*<?([^>\r\n]+)>?/im);
  return match?.[1]?.trim() || createHash("sha256").update(raw).digest("hex");
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
  const messageKey = messageId(raw);
  const duplicate = await pool.query("SELECT provider,provider_message_id,status FROM aurelink_smtp_messages WHERE workspace_id=$1 AND message_key=$2", [auth.workspaceId, messageKey]);
  if (duplicate.rows[0]?.status === "accepted") return callback(null, "250 Message already accepted.");
  const allowed = await pool.query(
    "SELECT COUNT(DISTINCT provider)::int AS count FROM aurelink_email_domains WHERE workspace_id=$1 AND domain=$2 AND status='verified' AND provider IN ('resend','brevo')",
    [auth.workspaceId, domain]
  );
  if (Number(allowed.rows[0]?.count || 0) < 2) return callback(new Error("550 Sender domain must be verified with both Resend and Brevo before SMTP relay use."));
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
      provider = fallback;
      result = await deliver(fallback, { from, to: recipients }, raw);
    } catch (fallbackError) {
      const detail = String(fallbackError instanceof Error ? fallbackError.message : error).slice(0,500);
      await pool.query(
        "INSERT INTO aurelink_smtp_messages(workspace_id,credential_id,message_key,envelope_from,recipients,provider,status,error) VALUES($1,$2,$3,$4,$5::jsonb,$6,'failed',$7) ON CONFLICT(workspace_id,message_key) DO UPDATE SET status='failed',error=EXCLUDED.error,updated_at=NOW()",
        [auth.workspaceId,auth.credentialId,messageKey,from,JSON.stringify(recipients),provider,detail]
      );
      return callback(new Error("451 Primary and fallback SMTP providers could not accept this message."));
    }
  }
  await pool.query(
    "INSERT INTO aurelink_smtp_messages(workspace_id,credential_id,message_key,envelope_from,recipients,provider,provider_message_id,status) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,'accepted') ON CONFLICT(workspace_id,message_key) DO UPDATE SET provider=EXCLUDED.provider,provider_message_id=EXCLUDED.provider_message_id,status='accepted',updated_at=NOW()",
    [auth.workspaceId,auth.credentialId,messageKey,from,JSON.stringify(recipients),provider,String(result?.messageId || "accepted")]
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
const server = new SMTPServer({
  secure: false,
  key: key.includes("BEGIN") ? key : fs.readFileSync(key,"utf8"),
  cert: cert.includes("BEGIN") ? cert : fs.readFileSync(cert,"utf8"),
  authMethods: ["PLAIN","LOGIN"],
  authOptional: false,
  allowInsecureAuth: false,
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
server.listen(port,"0.0.0.0",() => console.log(`Aurelink SMTP submission listening on 0.0.0.0:${port} (STARTTLS required)`));
process.on("SIGTERM",()=>{server.close(()=>{void pool.end();});});
process.on("SIGINT",()=>{server.close(()=>{void pool.end();});});

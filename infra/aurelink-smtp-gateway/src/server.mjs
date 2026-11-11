import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash, createDecipheriv, randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { SMTPServer } from "smtp-server";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";

const required = ["DATABASE_URL"];
for (const name of required) {
  if (!process.env[name]) throw new Error(name + " is required by the Aurelink SMTP gateway.");
}
const encryptionSecret = process.env.AURELINK_COMMUNICATIONS_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET;
if (!encryptionSecret || encryptionSecret.length < 32) throw new Error("The shared Aurelink communications encryption secret (or backend JWT_ACCESS_SECRET fallback) is required.");

const smtpHostname = String(process.env.SMTP_HOSTNAME || "smtp.aurelink.org").toLowerCase();
if (!/^[a-z0-9.-]+$/.test(smtpHostname) || !smtpHostname.includes(".")) throw new Error("SMTP_HOSTNAME must be a valid public hostname.");
const dataDir = process.env.ACME_DATA_DIR || "/data";
const webrootDir = `${dataDir}/acme-webroot`;
const configDir = `${dataDir}/letsencrypt`;
const workDir = `${dataDir}/letsencrypt-work`;
const logsDir = `${dataDir}/letsencrypt-logs`;
const certPath = `${configDir}/live/${smtpHostname}/fullchain.pem`;
const keyPath = `${configDir}/live/${smtpHostname}/privkey.pem`;
const acmeEmail = process.env.ACME_EMAIL || "";
const acmeRetryMs = Math.max(60_000, Number(process.env.ACME_RETRY_INTERVAL_MS || 600_000));
const acmeRenewMs = Math.max(60 * 60_000, Number(process.env.ACME_RENEW_INTERVAL_MS || 43_200_000));
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
    `SELECT c.id,c.workspace_id,w.user_id,c.password_hash,c.provider_key_encrypted,d.domain
       FROM aurelink_smtp_credentials c
       JOIN aurelink_email_domains d
         ON d.id=c.email_domain_id AND d.workspace_id=c.workspace_id
       JOIN aurelink_communications_workspaces w ON w.id=c.workspace_id AND w.status='active'
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
  return { credentialId: row.id, workspaceId: row.workspace_id, userId: row.user_id, domain: row.domain, providerKey };
}


async function reserveSmtpUsage(user, raw, parsed, recipients, envelopeFrom) {
  const client = await pool.connect();
  const messageId = randomUUID();
  const units = recipients.length;
  try {
    await client.query("BEGIN");
    const contentHash = createHash("sha256").update(raw).digest("hex");
    await client.query(
      "INSERT INTO aurelink_messages(id,workspace_id,channel,direction,category,provider,recipient,sender,subject,content_hash,status,segments,metadata) VALUES($1,$2,'email','outbound','transactional','resend',$3,$4,$5,$6,'queued',1,$7::jsonb)",
      [messageId,user.workspaceId,JSON.stringify(recipients),envelopeFrom,String(parsed.subject || ""),contentHash,JSON.stringify({transport:"smtp",credentialId:user.credentialId,recipientCount:units,clientMessageId:parsed.messageId || null})]
    );

    await client.query(
      "INSERT INTO aurelink_email_billing_accounts(workspace_id,user_id) SELECT id,user_id FROM aurelink_communications_workspaces WHERE id=$1 ON CONFLICT(workspace_id) DO NOTHING",
      [user.workspaceId]
    );
    const account=(await client.query("SELECT billing_mode FROM aurelink_email_billing_accounts WHERE workspace_id=$1 FOR UPDATE",[user.workspaceId])).rows[0];
    const billingMode=String(account?.billing_mode||"payg");
    const subscriptionResult = await client.query(
      `SELECT id,monthly_email_allowance,used_emails,reserved_emails,allow_prepaid_fallback
         FROM aurelink_email_subscriptions
        WHERE workspace_id=$1 AND status='active'
          AND billing_period_start<=NOW() AND billing_period_end>NOW()
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [user.workspaceId]
    );
    const subscription = subscriptionResult.rows[0];
    let source = null;
    let usageDate = null;
    if (subscription) {
      const remaining = BigInt(String(subscription.monthly_email_allowance)) - BigInt(String(subscription.used_emails)) - BigInt(String(subscription.reserved_emails));
      if (remaining >= BigInt(units)) {
        await client.query("UPDATE aurelink_email_subscriptions SET reserved_emails=reserved_emails+$2,updated_at=NOW() WHERE id=$1",[subscription.id,units]);
        source = "subscription";
      } else if (!subscription.allow_prepaid_fallback) {
        throw smtpError("The monthly Aurelink Mail allowance is exhausted. Upgrade the package, enable prepaid fallback, or wait for renewal.",452);
      }
    }
    if (!subscription && billingMode === "subscription") {
      throw smtpError("Your Aurelink Mail subscription is not active. Renew it or switch the workspace to Pay-as-you-go.",452);
    }
    if (!subscription && billingMode === "free") {
      const limitResult=await client.query("SELECT daily_limit FROM aurelink_email_plan_catalog WHERE plan_code='free' AND active=TRUE");
      const dailyLimit=Number(limitResult.rows[0]?.daily_limit||100);
      await client.query("INSERT INTO aurelink_email_free_daily_usage(workspace_id,usage_date) VALUES($1,CURRENT_DATE) ON CONFLICT(workspace_id,usage_date) DO NOTHING",[user.workspaceId]);
      const daily=(await client.query("SELECT usage_date,used_emails,reserved_emails FROM aurelink_email_free_daily_usage WHERE workspace_id=$1 AND usage_date=CURRENT_DATE FOR UPDATE",[user.workspaceId])).rows[0];
      const remaining=BigInt(dailyLimit)-BigInt(String(daily.used_emails))-BigInt(String(daily.reserved_emails));
      if(remaining>=BigInt(units)){
        await client.query("UPDATE aurelink_email_free_daily_usage SET reserved_emails=reserved_emails+$2,updated_at=NOW() WHERE workspace_id=$1 AND usage_date=CURRENT_DATE",[user.workspaceId,units]);
        source="free";
        usageDate=String(daily.usage_date);
      }
    }

    if (!source) {
      await client.query("INSERT INTO aurelink_email_credit_wallets(workspace_id,user_id) VALUES($1,$2) ON CONFLICT(workspace_id) DO NOTHING",[user.workspaceId,user.userId]);
      const credit = (await client.query("SELECT balance_emails FROM aurelink_email_credit_wallets WHERE workspace_id=$1 FOR UPDATE",[user.workspaceId])).rows[0];
      const creditBalance = BigInt(String(credit?.balance_emails || "0"));
      if (creditBalance >= BigInt(units)) {
        const next = creditBalance - BigInt(units);
        await client.query("UPDATE aurelink_email_credit_wallets SET balance_emails=$2,updated_at=NOW() WHERE workspace_id=$1",[user.workspaceId,next.toString()]);
        const reference = "AL-EMAIL-USE-" + messageId;
        await client.query(
          "INSERT INTO aurelink_email_credit_ledger(workspace_id,user_id,entry_type,direction,amount_emails,balance_after,reference,description,metadata) VALUES($1,$2,'usage','debit',$3,$4,$5,'Aurelink prepaid SMTP email usage',$6::jsonb)",
          [user.workspaceId,user.userId,units,next.toString(),reference,JSON.stringify({messageId,credentialId:user.credentialId,recipients:units})]
        );
        source = "prepaid";
      } else if (subscription || billingMode === "free") {
        throw smtpError("The monthly/daily Aurelink Mail allowance and prepaid email credits are insufficient.",452);
      }
    }

    let reference = null;
    let unitPriceMinor = null;
    let amountMinor = null;
    if (!source) {
      const priceResult = await client.query(
        "SELECT id,unit_price_minor,currency FROM aurelink_communications_price_catalog WHERE service='smtp_message' AND active=TRUE AND country_code='*' AND (provider='resend' OR provider='*') AND (category='transactional' OR category='*') AND (workspace_id=$1 OR workspace_id IS NULL) AND effective_from<=NOW() AND (effective_until IS NULL OR effective_until>NOW()) ORDER BY (provider='resend')::int DESC,(category='transactional')::int DESC,COALESCE((workspace_id=$1)::int,0) DESC,effective_from DESC LIMIT 1",
        [user.workspaceId]
      );
      const price = priceResult.rows[0];
      if (!price || Number(price.unit_price_minor) <= 0 || String(price.currency) !== "USD") throw smtpError("Aurelink SMTP usage pricing is not configured for this workspace.",451);
      unitPriceMinor = Number(price.unit_price_minor);
      amountMinor = (BigInt(String(price.unit_price_minor)) * BigInt(units)).toString();
      await client.query("INSERT INTO aurelink_wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[user.userId]);
      const wallet = (await client.query("SELECT balance_minor FROM aurelink_wallets WHERE user_id=$1 FOR UPDATE",[user.userId])).rows[0];
      const balance = BigInt(String(wallet?.balance_minor || "0"));
      if (balance < BigInt(amountMinor)) throw smtpError("Insufficient Aurelink wallet balance. Top up before sending.",452);
      const nextBalance = balance - BigInt(amountMinor);
      reference = "AL-COMM-" + messageId;
      await client.query("UPDATE aurelink_wallets SET balance_minor=$2,updated_at=NOW() WHERE user_id=$1",[user.userId,nextBalance.toString()]);
      await client.query("INSERT INTO aurelink_wallet_ledger(user_id,entry_type,direction,amount_minor,balance_after_minor,currency,reference,description,metadata) VALUES($1,'purchase','debit',$2,$3,'USD',$4,'Aurelink SMTP usage reservation',$5::jsonb)",[user.userId,amountMinor,nextBalance.toString(),reference,JSON.stringify({messageId,credentialId:user.credentialId,recipients:units})]);
      await client.query("INSERT INTO aurelink_communications_billing_ledger(user_id,workspace_id,message_id,entry_type,status,price_id,units,unit_price_minor,amount_minor,currency,wallet_reference,metadata) VALUES($1,$2,$3,'charge','reserved',$4,$5,$6,$7,'USD',$8,$9::jsonb)",[user.userId,user.workspaceId,messageId,price.id,units,unitPriceMinor,amountMinor,reference,JSON.stringify({service:"smtp_message",provider:"resend",credentialId:user.credentialId})]);
      source = "wallet";
    }

    await client.query(
      "INSERT INTO aurelink_email_usage_reservations(message_id,user_id,workspace_id,source,subscription_id,units,unit_price_minor,amount_minor,wallet_reference,status,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reserved',$10::jsonb)",
      [messageId,user.userId,user.workspaceId,source,source==="subscription"?subscription.id:null,units,unitPriceMinor,amountMinor,reference,JSON.stringify({transport:"smtp",provider:"resend",credentialId:user.credentialId,usageDate,clientMessageId:String(parsed.messageId||"")})]
    );
    await client.query(
      "INSERT INTO aurelink_communications_usage(workspace_id,message_id,channel,provider,category,units,status,unit_price_minor,wallet_debit_reference) VALUES($1,$2,'email','resend','transactional',$3,'queued',$4,$5)",
      [user.workspaceId,messageId,units,unitPriceMinor,reference]
    );
    await client.query("COMMIT");
    return {messageId,reference,amountMinor,unitPriceMinor,units,source,clientMessageId:String(parsed.messageId||"")};
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

async function captureSmtpUsage(user, reservation, info, mailFrom, recipients) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const usage = (await client.query("SELECT * FROM aurelink_email_usage_reservations WHERE message_id=$1 FOR UPDATE",[reservation.messageId])).rows[0];
    if (!usage) throw new Error("Aurelink SMTP billing reservation is missing.");
    if (usage.status === "reserved") {
      if (usage.source === "subscription") {
        const updated = await client.query("UPDATE aurelink_email_subscriptions SET reserved_emails=reserved_emails-$2,used_emails=used_emails+$2,updated_at=NOW() WHERE id=$1 AND reserved_emails >= $2",[usage.subscription_id,usage.units]);
        if (!updated.rowCount) throw new Error("Aurelink email subscription reservation mismatch.");
      } else if (usage.source === "free") {
        const updated=await client.query("UPDATE aurelink_email_free_daily_usage SET reserved_emails=reserved_emails-$3,used_emails=used_emails+$3,updated_at=NOW() WHERE workspace_id=$1 AND usage_date=$2::date AND reserved_emails >= $3",[usage.workspace_id,usage.metadata?.usageDate,usage.units]);
        if (!updated.rowCount) throw new Error("Aurelink Free daily reservation mismatch.");
      } else if (usage.source === "wallet") {
        await client.query("UPDATE aurelink_communications_billing_ledger SET status='posted',updated_at=NOW() WHERE message_id=$1 AND entry_type='charge' AND status='reserved'",[reservation.messageId]);
      }
      await client.query("UPDATE aurelink_email_usage_reservations SET status='captured',updated_at=NOW() WHERE message_id=$1 AND status='reserved'",[reservation.messageId]);
    }
    await client.query("UPDATE aurelink_messages SET status='accepted',provider_message_id=$2,accepted_at=NOW(),updated_at=NOW() WHERE id=$1",[reservation.messageId,String(info.serverMessageId || "") || null]);
    await client.query("UPDATE aurelink_communications_usage SET status='accepted',provider_message_id=$2,updated_at=NOW() WHERE message_id=$1",[reservation.messageId,String(info.serverMessageId || "") || null]);
    await client.query("INSERT INTO aurelink_smtp_messages(workspace_id,credential_id,message_key,client_message_id,envelope_from,recipients,provider,provider_message_id,status) VALUES($1,$2,$3,$4,$5,$6::jsonb,'resend',$7,'accepted') ON CONFLICT(workspace_id,client_message_id) WHERE client_message_id IS NOT NULL DO UPDATE SET credential_id=EXCLUDED.credential_id,message_key=EXCLUDED.message_key,provider_message_id=EXCLUDED.provider_message_id,status='accepted',error=NULL,updated_at=NOW()",[user.workspaceId,user.credentialId,reservation.messageId,reservation.clientMessageId,mailFrom,JSON.stringify(recipients),String(info.serverMessageId || "") || null]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const metadata=(await pool.query("SELECT metadata FROM aurelink_email_usage_reservations WHERE message_id=$1",[reservation.messageId]).catch(()=>({rows:[]}))).rows[0]?.metadata||{};
    await markSmtpUnknown(user,reservation,error?.message || "SMTP billing capture failed after provider acceptance",mailFrom,recipients,String(metadata.clientMessageId||""),String(info.serverMessageId||"")||null,true);
    console.error("SMTP billing capture requires reconciliation:",{messageId:reservation.messageId,error:error?.message || "unknown error"});
  } finally { client.release(); }
}

async function refundSmtpUsage(user, reservation, reason) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const usage = (await client.query("SELECT * FROM aurelink_email_usage_reservations WHERE message_id=$1 FOR UPDATE",[reservation.messageId])).rows[0];
    if (usage && usage.status === "reserved") {
      if (usage.source === "subscription") {
        const updated = await client.query("UPDATE aurelink_email_subscriptions SET reserved_emails=reserved_emails-$2,updated_at=NOW() WHERE id=$1 AND reserved_emails >= $2",[usage.subscription_id,usage.units]);
        if (!updated.rowCount) throw new Error("Aurelink email subscription reservation mismatch.");
      } else if (usage.source === "free") {
        const updated=await client.query("UPDATE aurelink_email_free_daily_usage SET reserved_emails=reserved_emails-$3,updated_at=NOW() WHERE workspace_id=$1 AND usage_date=$2::date AND reserved_emails >= $3",[usage.workspace_id,usage.metadata?.usageDate,usage.units]);
        if (!updated.rowCount) throw new Error("Aurelink Free daily reservation mismatch.");
      } else if (usage.source === "prepaid") {
        const wallet = (await client.query("UPDATE aurelink_email_credit_wallets SET balance_emails=balance_emails+$2,updated_at=NOW() WHERE workspace_id=$1 RETURNING balance_emails",[user.workspaceId,usage.units])).rows[0];
        if (!wallet) throw new Error("Aurelink prepaid email credit wallet is missing.");
        await client.query("INSERT INTO aurelink_email_credit_ledger(workspace_id,user_id,entry_type,direction,amount_emails,balance_after,reference,description,metadata) VALUES($1,$2,'refund','credit',$3,$4,$5,'Refund for rejected Aurelink SMTP submission',$6::jsonb) ON CONFLICT(reference) DO NOTHING",[user.workspaceId,user.userId,usage.units,wallet.balance_emails,"AL-EMAIL-REFUND-"+reservation.messageId,JSON.stringify({messageId:reservation.messageId,reason})]);
      } else if (usage.source === "wallet") {
        const charge = (await client.query("SELECT status,amount_minor,wallet_reference FROM aurelink_communications_billing_ledger WHERE message_id=$1 AND entry_type='charge' FOR UPDATE",[reservation.messageId])).rows[0];
        if (charge && charge.status !== "refunded") {
          const refundReference = String(charge.wallet_reference) + "-R";
          await client.query("INSERT INTO aurelink_wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[user.userId]);
          const wallet = (await client.query("SELECT balance_minor FROM aurelink_wallets WHERE user_id=$1 FOR UPDATE",[user.userId])).rows[0];
          const nextBalance = BigInt(String(wallet.balance_minor)) + BigInt(String(charge.amount_minor));
          await client.query("UPDATE aurelink_wallets SET balance_minor=$2,updated_at=NOW() WHERE user_id=$1",[user.userId,nextBalance.toString()]);
          await client.query("INSERT INTO aurelink_wallet_ledger(user_id,entry_type,direction,amount_minor,balance_after_minor,currency,reference,description,metadata) VALUES($1,'refund','credit',$2,$3,'USD',$4,'Refund for failed Aurelink SMTP delivery',$5::jsonb) ON CONFLICT(reference) DO NOTHING",[user.userId,String(charge.amount_minor),nextBalance.toString(),refundReference,JSON.stringify({messageId:reservation.messageId,reason})]);
          await client.query("INSERT INTO aurelink_communications_billing_ledger(user_id,workspace_id,message_id,entry_type,status,units,unit_price_minor,amount_minor,currency,wallet_reference,metadata) VALUES($1,$2,$3,'refund','posted',$4,$5,$6,'USD',$7,$8::jsonb) ON CONFLICT(message_id,entry_type) DO NOTHING",[user.userId,user.workspaceId,reservation.messageId,Number(usage.units),Number(usage.unit_price_minor),String(charge.amount_minor),refundReference,JSON.stringify({reason})]);
          await client.query("UPDATE aurelink_communications_billing_ledger SET status='refunded',updated_at=NOW() WHERE message_id=$1 AND entry_type='charge'",[reservation.messageId]);
        }
      }
      await client.query("UPDATE aurelink_email_usage_reservations SET status='refunded',updated_at=NOW() WHERE message_id=$1 AND status='reserved'",[reservation.messageId]);
    }
    await client.query("UPDATE aurelink_messages SET status='failed',provider_error=$2,updated_at=NOW() WHERE id=$1",[reservation.messageId,String(reason || "SMTP provider rejected message").slice(0,500)]);
    await client.query("UPDATE aurelink_communications_usage SET status='failed',updated_at=NOW() WHERE message_id=$1",[reservation.messageId]);
    await client.query("UPDATE aurelink_smtp_messages SET status='failed',error=$2,updated_at=NOW() WHERE workspace_id=$1 AND message_key=$3",[user.workspaceId,String(reason || "SMTP provider rejected message").slice(0,500),reservation.messageId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("SMTP usage refund requires reconciliation:",{messageId:reservation.messageId,error:error?.message || "unknown error"});
  } finally { client.release(); }
}

async function markSmtpUnknown(user, reservation, reason, mailFrom, recipients, clientMessageId, providerMessageId = null, providerAccepted = false) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE aurelink_email_usage_reservations SET status='unknown',updated_at=NOW() WHERE message_id=$1 AND status='reserved'",[reservation.messageId]);
    await client.query("UPDATE aurelink_messages SET status='unknown',provider_message_id=COALESCE($3,provider_message_id),provider_status=CASE WHEN $4 THEN 'provider_accepted_billing_reconciliation_required' WHEN $3 IS NULL THEN 'provider_outcome_unknown' ELSE 'provider_accepted_billing_reconciliation_required' END,provider_error=$2,updated_at=NOW() WHERE id=$1",[reservation.messageId,String(reason || "SMTP provider outcome is unknown").slice(0,500),providerMessageId,providerAccepted]);
    await client.query("UPDATE aurelink_communications_usage SET status='queued',updated_at=NOW() WHERE message_id=$1",[reservation.messageId]);
    await client.query(
      "INSERT INTO aurelink_smtp_messages(workspace_id,credential_id,message_key,client_message_id,envelope_from,recipients,provider,provider_message_id,status,error) VALUES($1,$2,$3,$4,$5,$6::jsonb,'resend',$7,'unknown',$8) ON CONFLICT(workspace_id,client_message_id) WHERE client_message_id IS NOT NULL DO UPDATE SET credential_id=EXCLUDED.credential_id,message_key=EXCLUDED.message_key,provider_message_id=COALESCE(EXCLUDED.provider_message_id,aurelink_smtp_messages.provider_message_id),status='unknown',error=EXCLUDED.error,updated_at=NOW()",
      [user.workspaceId,user.credentialId,reservation.messageId,clientMessageId,mailFrom,JSON.stringify(recipients),providerMessageId,String(reason || "Provider outcome unknown").slice(0,500)]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("SMTP unknown outcome could not be recorded:",{messageId:reservation.messageId,error:error?.message || "unknown error"});
  } finally { client.release(); }
}

function makeSmtpOptions({ secure, requireTLS, key, cert }) {
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
          const clientMessageId=String(parsed.messageId || "").trim().slice(0,255);
          if(!clientMessageId)return callback(smtpError("A stable Message-ID header is required for safe Aurelink SMTP billing and retry protection.",554));
          const prior=(await pool.query("SELECT status FROM aurelink_smtp_messages WHERE workspace_id=$1 AND client_message_id=$2 LIMIT 1",[session.user.workspaceId,clientMessageId])).rows[0];
          if(prior&&["unknown","accepted","delivered"].includes(String(prior.status)))return callback();

          const reservation = await reserveSmtpUsage(session.user, raw, parsed, recipients, mailFrom);
          const transport = nodemailer.createTransport({
            host: "smtp.resend.com",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: { user: "resend", pass: session.user.providerKey },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 60000,
            tls: { minVersion: "TLSv1.2" },
          });
          try {
            const info = await transport.sendMail({ envelope: { from: mailFrom, to: recipients }, raw });
            await captureSmtpUsage(session.user, reservation, info, mailFrom, recipients);
          } catch (providerError) {
            const responseCode=Number(providerError?.responseCode||0);
            if(responseCode>=400&&responseCode<600){
              await refundSmtpUsage(session.user,reservation,providerError?.message || "Upstream provider rejected SMTP message");
            }else{
              await markSmtpUnknown(session.user,reservation,providerError?.message || "SMTP provider outcome is unknown",mailFrom,recipients,clientMessageId);
            }
            throw providerError;
          } finally {
            transport.close();
          }
          return callback();
        } catch (error) {
          const message = String(error?.message || "Upstream email delivery failed.").slice(0, 240);
          console.error("SMTP upstream delivery failed:", { credentialId: session.user?.credentialId, message });
          return callback(smtpError("Aurelink could not submit this message. " + message, Number(error?.responseCode) || 451));
        }
      });
    },
  };
}

let implicitTlsServer = null;
let startTlsServer = null;
let smtpReady = false;
let acmeBusy = false;
let lastAcmeError = null;
let challengeServer;
let healthServer;

const port465 = Number(process.env.SMTP_PORT_SSL || 465);
const port587 = Number(process.env.SMTP_PORT_STARTTLS || 587);
const healthPort = Number(process.env.HEALTH_PORT || 8080);
const challengePort = Number(process.env.ACME_HTTP_PORT || 8081);

function sendText(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

async function ensureAcmeDirectories() {
  await Promise.all([
    mkdir(webrootDir, { recursive: true }),
    mkdir(configDir, { recursive: true }),
    mkdir(workDir, { recursive: true }),
    mkdir(logsDir, { recursive: true }),
  ]);
}

challengeServer = createHttpServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  const prefix = "/.well-known/acme-challenge/";
  if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");
  if (!pathname.startsWith(prefix)) return sendText(res, 404, "Not found");
  const token = pathname.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(token)) return sendText(res, 400, "Invalid challenge token");
  try {
    const body = await readFile(`${webrootDir}/.well-known/acme-challenge/${token}`);
    res.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    sendText(res, 404, "Challenge not found");
  }
});

healthServer = createHttpServer(async (req, res) => {
  if (req.url !== "/healthz") return sendText(res, 404, "Not found");
  try {
    await pool.query("SELECT 1");
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({
      ok: true,
      service: "aurelink-smtp-gateway",
      smtpReady,
      hostname: smtpHostname,
      certificate: smtpReady ? "loaded" : "waiting_for_dns_and_certificate",
      acmeError: lastAcmeError,
    }));
  } catch {
    res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, database: "unavailable" }));
  }
});

const listen = (server, port) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "0.0.0.0", () => {
    server.removeListener("error", reject);
    resolve();
  });
});

function runCertbot(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("certbot", [
      "--config-dir", configDir,
      "--work-dir", workDir,
      "--logs-dir", logsDir,
      ...args,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (output.trim()) console.log("[certbot]", output.trim().slice(-6000));
      if (code === 0) resolve();
      else reject(new Error("Certbot exited with code " + code));
    });
  });
}

async function loadCertificate() {
  const [cert, key] = await Promise.all([readFile(certPath), readFile(keyPath)]);
  return { cert, key };
}

async function startSmtpServers() {
  if (smtpReady) return;
  const { cert, key } = await loadCertificate();
  implicitTlsServer = new SMTPServer(makeSmtpOptions({ secure: true, requireTLS: false, key, cert }));
  startTlsServer = new SMTPServer(makeSmtpOptions({ secure: false, requireTLS: true, key, cert }));
  await Promise.all([
    listen(implicitTlsServer, port465),
    listen(startTlsServer, port587),
  ]);
  smtpReady = true;
  lastAcmeError = null;
  console.log(`Aurelink SMTP is ready for ${smtpHostname} on ports 465 and 587.`);
}

async function issueInitialCertificate() {
  const args = [
    "certonly", "--webroot", "--webroot-path", webrootDir,
    "--cert-name", smtpHostname, "-d", smtpHostname,
    "--agree-tos", "--non-interactive", "--no-eff-email",
  ];
  if (acmeEmail) args.push("--email", acmeEmail);
  else args.push("--register-unsafely-without-email");
  await runCertbot(args);
}

async function acquireOrRenewCertificate() {
  if (acmeBusy) return;
  acmeBusy = true;
  try {
    await ensureAcmeDirectories();
    if (!existsSync(certPath) || !existsSync(keyPath)) {
      console.log(`No TLS certificate found. Requesting a Let's Encrypt certificate for ${smtpHostname}.`);
      await issueInitialCertificate();
      await startSmtpServers();
      return;
    }

    const before = (await stat(certPath)).mtimeMs;
    await runCertbot(["renew", "--cert-name", smtpHostname, "--non-interactive"]);
    const after = (await stat(certPath)).mtimeMs;
    if (after > before + 1000) {
      console.log("Let's Encrypt renewed the SMTP certificate; restarting to load the new certificate.");
      process.exit(1);
    }
    if (!smtpReady) await startSmtpServers();
  } catch (error) {
    lastAcmeError = String(error?.message || error).slice(0, 500);
    console.error("Aurelink TLS certificate operation failed:", lastAcmeError);
    if (smtpReady) {
      // Keep the currently valid certificate and SMTP listeners running.
      return;
    }
  } finally {
    acmeBusy = false;
  }
}

await ensureAcmeDirectories();
await pool.query("SELECT 1");
await Promise.all([
  listen(challengeServer, challengePort),
  listen(healthServer, healthPort),
]);
console.log(`Aurelink gateway control plane listening on HTTP ${challengePort} (ACME) and ${healthPort} (health).`);
await acquireOrRenewCertificate();
function scheduleAcmeCheck() {
  const delay = smtpReady ? acmeRenewMs : acmeRetryMs;
  const timer = setTimeout(async () => {
    await acquireOrRenewCertificate();
    scheduleAcmeCheck();
  }, delay);
  timer.unref();
}
scheduleAcmeCheck();

async function shutdown(signal) {
  console.log("Aurelink SMTP gateway shutting down:", signal);
  const servers = [implicitTlsServer, startTlsServer, challengeServer, healthServer].filter(Boolean);
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

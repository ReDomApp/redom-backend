import crypto from "node:crypto";
import { pool } from "../../database/db";
import { logger } from "../../lib/logger";
import { nonVoipClient, nvRecord } from "./nonvoip.client";
import { walletCredit, walletDebit } from "./aurelink-wallet.service";

const PAYSTACK = "https://api.paystack.co";
const INTERVAL = Math.max(30_000, Number(process.env.AURELINK_RENEWAL_POLL_MS || 60_000));
const BATCH = Math.max(1, Math.min(50, Number(process.env.AURELINK_RENEWAL_BATCH_SIZE || 20)));
let timer: ReturnType<typeof setInterval> | undefined;
let busy = false;

type Row = Record<string, any>;
function secret() { const v = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET; if (!v) throw new Error("PAYSTACK_SECRET_KEY is not configured"); return v; }
async function paystack<T>(method: "GET"|"POST", path: string, body?: unknown): Promise<T> {
  const response = await fetch(PAYSTACK + path, { method, headers: { Authorization: "Bearer " + secret(), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  const payload = await response.json() as { status?: boolean; message?: string; data?: T };
  if (!response.ok || payload.status !== true || !payload.data) throw new Error("Paystack request failed: " + String(payload.message || response.status));
  return payload.data;
}
function baseUrl() { return (process.env.AURELINK_API_URL || process.env.API_BASE_URL || "https://redom-backend.onrender.com/redom-backend").replace(/\/$/, ""); }
async function sendEmail(to: string, subject: string, html: string, textBody: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AURELINK_RECEIPT_FROM?.trim();
  if (!key || !from) throw new Error("Aurelink email delivery is not configured (RESEND_API_KEY/AURELINK_RECEIPT_FROM).");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, html, text: textBody }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Aurelink email delivery rejected the message.");
}
async function initializeTopup(attempt: Row): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const reference = "ALRN-" + crypto.randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase();
  const userResult = await pool.query("SELECT id,account_id,email FROM aurelink_users WHERE id=$1 AND account_status='active' AND email_verified=TRUE LIMIT 1", [attempt.aurelink_user_id]);
  const user = userResult.rows[0] as Row | undefined;
  if (!user?.email || !user.account_id) throw new Error("Aurelink customer account or verified email is unavailable.");
  const orderResult = await pool.query("SELECT id,aurelink_order_id,phone_number,provider_order_id FROM aurelink_provider_orders WHERE id=$1 AND aurelink_user_id=$2 AND product_kind='dedicated'", [attempt.order_id, attempt.aurelink_user_id]);
  const order = orderResult.rows[0] as Row | undefined;
  if (!order) throw new Error("Aurelink dedicated order ownership check failed.");
  const checkout = await paystack<{ authorization_url: string; reference: string }>("POST", "/transaction/initialize", {
    email: String(user.email), amount: String(attempt.amount_minor), currency: String(attempt.currency),
    reference, callback_url: baseUrl() ? baseUrl()+"/payments/callback" : undefined,
    metadata: { service: "aurelink", purpose: "dedicated_renewal_wallet_topup", aurelink_user_id: String(user.id), aurelink_account_id: String(user.account_id), aurelink_order_id: String(order.aurelink_order_id), renewal_attempt_id: String(attempt.id), amount_minor: String(attempt.amount_minor), currency: String(attempt.currency) }
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO aurelink_renewal_topup_tokens(aurelink_user_id,account_id,order_id,renewal_attempt_id,token_hash,expires_at,amount_minor,currency,paystack_reference,checkout_url)
      VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '24 hours',$6,$7,$8,$9)`,
      [user.id,user.account_id,order.id,attempt.id,tokenHash,attempt.amount_minor,attempt.currency,checkout.reference,checkout.authorization_url]);
    await client.query("UPDATE aurelink_dedicated_renewal_attempts SET status='awaiting_topup',updated_at=NOW() WHERE id=$1 AND status<>'succeeded'", [attempt.id]);
    await client.query("COMMIT");
  } catch(e) { await client.query("ROLLBACK").catch(()=>undefined); throw e; } finally { client.release(); }
  const link = baseUrl() + "/payments/aurelink/renewal/topup/" + token;
  const html = "<h2>Aurelink dedicated number renewal</h2><p>Your Aurelink wallet needs funds before your dedicated number can renew.</p><p>Account: "+String(user.account_id)+"</p><p>Number: "+String(order.phone_number||"—")+"</p><p>Renewal amount: "+(Number(attempt.amount_minor)/100).toFixed(2)+" "+String(attempt.currency)+"</p><p><a href=\""+link+"\">Continue secure top-up</a></p><p>This secure link expires in 24 hours and can be used once. Payment credits only your Aurelink wallet.</p>";
  try { await sendEmail(String(user.email), "Action required: fund your Aurelink renewal", html, "Aurelink account "+user.account_id+" needs "+(Number(attempt.amount_minor)/100).toFixed(2)+" "+attempt.currency+" for number "+order.phone_number+". Secure link (expires in 24 hours): "+link); } catch (error) { await pool.query("UPDATE aurelink_renewal_topup_tokens SET revoked_at=NOW() WHERE token_hash=$1 AND consumed_at IS NULL", [tokenHash]); throw error; }
}
async function ensureAttempts(): Promise<void> {
  await pool.query(`INSERT INTO aurelink_dedicated_renewal_attempts(order_id,aurelink_user_id,scheduled_expiry_at,amount_minor,currency,next_attempt_at)
    SELECT o.id,o.aurelink_user_id,o.expires_at,o.retail_amount_minor,o.currency,NOW()
    FROM aurelink_provider_orders o
    WHERE o.product_kind='dedicated' AND o.auto_renew=TRUE AND o.status='active'
      AND o.expires_at IS NOT NULL AND o.expires_at<=NOW()+INTERVAL '24 hours'
      AND o.retail_amount_minor>0 AND o.aurelink_user_id IS NOT NULL
    ON CONFLICT(order_id,scheduled_expiry_at) DO NOTHING`);
}
async function processAttempt(attempt: Row): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query("SELECT * FROM aurelink_dedicated_renewal_attempts WHERE id=$1 FOR UPDATE", [attempt.id]);
    if (!locked.rows[0] || ["succeeded","processing"].includes(String(locked.rows[0].status))) { await client.query("COMMIT"); return; }
    const current = locked.rows[0] as Row;
    const balance = await client.query("SELECT balance_minor FROM aurelink_wallets WHERE user_id=$1 FOR UPDATE", [current.aurelink_user_id]);
    const available = BigInt(String(balance.rows[0]?.balance_minor || "0"));
    if (available < BigInt(String(current.amount_minor))) {
      await client.query("UPDATE aurelink_dedicated_renewal_attempts SET status='awaiting_topup',updated_at=NOW() WHERE id=$1", [current.id]);
      await client.query("COMMIT");
      const exists = await pool.query("SELECT 1 FROM aurelink_renewal_topup_tokens WHERE renewal_attempt_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>NOW()", [current.id]);
      if (!exists.rows[0]) await initializeTopup(current);
      return;
    }
    await client.query("UPDATE aurelink_dedicated_renewal_attempts SET status='processing',attempt_count=attempt_count+1,updated_at=NOW() WHERE id=$1", [current.id]);
    await client.query("COMMIT");
  } catch(e) { await client.query("ROLLBACK").catch(()=>undefined); throw e; } finally { client.release(); }

  const orderResult = await pool.query("SELECT * FROM aurelink_provider_orders WHERE id=$1 AND aurelink_user_id=$2 AND product_kind='dedicated'", [attempt.order_id, attempt.aurelink_user_id]);
  const order = orderResult.rows[0] as Row | undefined;
  if (!order) throw new Error("Dedicated order ownership check failed.");
  try {
    const providerResult = await nonVoipClient.renew(String(order.provider_order_id), String(attempt.idempotency_key));
    const data = nvRecord(providerResult);
    const expiryValue = data.expires_at ?? data.expiration ?? data.expiry;
    const newExpiry = expiryValue ? new Date(String(expiryValue)) : null;
    if (!newExpiry || !Number.isFinite(newExpiry.getTime()) || newExpiry.getTime() <= new Date(String(order.expires_at)).getTime()) {
      await pool.query("UPDATE aurelink_dedicated_renewal_attempts SET status='reconciliation_required',failure_code='UNCONFIRMED_EXPIRY',failure_message='Provider response did not confirm a later expiry.',provider_response=$2::jsonb,updated_at=NOW() WHERE id=$1", [attempt.id,JSON.stringify(providerResult)]);
      return;
    }
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      const latest = await tx.query("SELECT status FROM aurelink_dedicated_renewal_attempts WHERE id=$1 FOR UPDATE", [attempt.id]);
      if (String(latest.rows[0]?.status) !== "processing") { await tx.query("ROLLBACK"); return; }
      const debitRef = "aurelink-renewal:"+String(attempt.id);
      await walletDebit(tx,{userId:String(attempt.aurelink_user_id),amountMinor:String(attempt.amount_minor),reference:debitRef,type:"renewal",description:"Aurelink dedicated number renewal",orderId:String(attempt.order_id),metadata:{attemptId:String(attempt.id),providerOrderId:String(order.provider_order_id)}});
      await tx.query("UPDATE aurelink_provider_orders SET expires_at=$2,updated_at=NOW(),last_provider_check_at=NOW(),provider_payload=provider_payload||$3::jsonb WHERE id=$1 AND aurelink_user_id=$4", [attempt.order_id,newExpiry,JSON.stringify({lastRenewal:providerResult}),attempt.aurelink_user_id]);
      await tx.query("UPDATE aurelink_dedicated_renewal_attempts SET status='succeeded',provider_expiry_at=$2,provider_response=$3::jsonb,wallet_debit_reference=$4,completed_at=NOW(),updated_at=NOW() WHERE id=$1", [attempt.id,newExpiry,JSON.stringify(providerResult),debitRef]);
      await tx.query("COMMIT");
    } catch(e) { await tx.query("ROLLBACK").catch(()=>undefined); throw e; } finally { tx.release(); }
  } catch(e) {
    await pool.query("UPDATE aurelink_dedicated_renewal_attempts SET status='failed',failure_code='PROVIDER_RENEWAL_FAILED',failure_message=$2,next_attempt_at=NOW()+INTERVAL '15 minutes',updated_at=NOW() WHERE id=$1 AND status='processing'", [attempt.id,e instanceof Error?e.message:"Provider renewal failed."]);
    throw e;
  }
}
export async function runAurelinkDedicatedRenewals(): Promise<void> {
  if (busy) return; busy=true;
  try {
    await ensureAttempts();
    const due=await pool.query("SELECT * FROM aurelink_dedicated_renewal_attempts WHERE status IN ('scheduled','failed','awaiting_topup') AND next_attempt_at<=NOW() ORDER BY next_attempt_at LIMIT $1", [BATCH]);
    for (const attempt of due.rows as Row[]) { try { await processAttempt(attempt); } catch(e) { logger.error({attemptId:attempt.id,error:e instanceof Error?e.message:"unknown"},"Aurelink dedicated renewal attempt failed"); } }
  } catch(e) { logger.error({error:e instanceof Error?e.message:"unknown"},"Aurelink dedicated renewal worker failed"); }
  finally { busy=false; }
}
export function startAurelinkDedicatedRenewalWorker(): void {
  if (timer) return;
  timer=setInterval(()=>void runAurelinkDedicatedRenewals(),INTERVAL); timer.unref?.(); void runAurelinkDedicatedRenewals();
  logger.info({intervalMs:INTERVAL,batchSize:BATCH},"Aurelink dedicated renewal worker started");
}
export function stopAurelinkDedicatedRenewalWorker(): void { if(timer)clearInterval(timer); timer=undefined; }

export async function redirectRenewalTopup(rawToken: string): Promise<string|null> {
  const hash=crypto.createHash("sha256").update(rawToken).digest("hex");
  const result=await pool.query("SELECT checkout_url FROM aurelink_renewal_topup_tokens WHERE token_hash=$1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1",[hash]);
  return result.rows[0]?.checkout_url ? String(result.rows[0].checkout_url) : null;
}
export async function handleAurelinkRenewalWebhook(rawBody: Buffer, signature: string|undefined, payload: any): Promise<boolean> {
  const expected=crypto.createHmac("sha512",secret()).update(rawBody).digest("hex");
  if(!signature||signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature)))throw new Error("Invalid Paystack signature.");
  const reference=String(payload?.data?.reference||"");
  if(!reference)return false;
  const found=await pool.query("SELECT id FROM aurelink_renewal_topup_tokens WHERE paystack_reference=$1 LIMIT 1",[reference]);
  if(!found.rows[0])return false;
  const verified=await paystack<{id:number;status:string;reference:string;amount:number;currency:string;requested_amount?:number}>("GET","/transaction/verify/"+encodeURIComponent(reference));
  if(verified.status!=="success")throw new Error("Paystack has not confirmed a successful renewal top-up.");
  const client=await pool.connect();
  let ownerEmail="";
  let tokenRowId="";
  try {
    await client.query("BEGIN");
    const tokenResult=await client.query("SELECT t.*,u.email,u.account_id FROM aurelink_renewal_topup_tokens t JOIN aurelink_users u ON u.id=t.aurelink_user_id WHERE t.id=$1 FOR UPDATE",[found.rows[0].id]);
    const token=tokenResult.rows[0] as Row|undefined;
    if(!token)throw new Error("Renewal top-up token not found.");
    tokenRowId=String(token.id);
    if(token.consumed_at) { ownerEmail=token.wallet_confirmation_sent_at ? "" : String(token.email||""); await client.query("COMMIT"); } else {
    if(token.revoked_at||new Date(token.expires_at).getTime()<=Date.now())throw new Error("Renewal top-up token expired or revoked.");
    if(String(token.paystack_reference)!==String(verified.reference)||String(token.amount_minor)!==String(verified.requested_amount??verified.amount)||String(token.currency)!==String(verified.currency))throw new Error("Paystack amount, currency, or reference mismatch.");
    const attempt=await client.query("SELECT * FROM aurelink_dedicated_renewal_attempts WHERE id=$1 AND order_id=$2 AND aurelink_user_id=$3 FOR UPDATE",[token.renewal_attempt_id,token.order_id,token.aurelink_user_id]);
    if(!attempt.rows[0])throw new Error("Renewal ownership binding failed.");
    await walletCredit(client,{userId:String(token.aurelink_user_id),amountMinor:String(token.amount_minor),reference:"aurelink-renewal-topup:"+String(token.id),type:"topup",description:"Aurelink wallet credit for dedicated number renewal",orderId:String(token.order_id),paymentReference:reference,metadata:{paystackTransactionId:String(verified.id),renewalAttemptId:String(token.renewal_attempt_id),accountId:String(token.account_id)}});
    await client.query("UPDATE aurelink_renewal_topup_tokens SET consumed_at=NOW(),paystack_transaction_id=$2,gateway_status='success',receipt_payload=$3::jsonb WHERE id=$1",[token.id,String(verified.id),JSON.stringify(verified)]);
    await client.query("UPDATE aurelink_dedicated_renewal_attempts SET status='scheduled',next_attempt_at=NOW(),updated_at=NOW() WHERE id=$1",[token.renewal_attempt_id]);
    ownerEmail=String(token.email||"");
    await client.query("COMMIT");
  } catch(e) { await client.query("ROLLBACK").catch(()=>undefined); throw e; } finally { client.release(); }
  if(ownerEmail) { await sendEmail(ownerEmail,"Aurelink wallet credited","<h2>Wallet top-up confirmed</h2><p>Your Paystack payment has been verified and credited to your Aurelink wallet. Your dedicated-number renewal will now be retried.</p>","Your Paystack payment has been verified and credited to your Aurelink wallet. Your dedicated-number renewal will now be retried."); await pool.query("UPDATE aurelink_renewal_topup_tokens SET wallet_confirmation_sent_at=NOW() WHERE id=$1 AND wallet_confirmation_sent_at IS NULL",[tokenRowId]); }
  return true;
}

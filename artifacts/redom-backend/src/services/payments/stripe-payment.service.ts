import axios from "axios";
import crypto from "node:crypto";
import { env } from "../../config/env";
import { pool } from "../../database/db";
import { sendPaymentEmailForReference } from "./payment.service";

const API = "https://api.stripe.com/v1";
const APP_CALLBACK = "redom://payment/callback";
const BACKEND_CALLBACK = "https://redom-backend.onrender.com/redom-backend/payments/stripe/callback";

type StripeSession = {
  id: string;
  url?: string | null;
  status?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | { id?: string } | null;
  metadata?: Record<string,string>;
  customer_details?: { email?: string | null };
  payment_status?: string | null;
};

function authHeaders() {
  return { Authorization: "Bearer " + env.stripe.secretKey };
}

async function stripeRequest<T>(method: "get"|"post", path: string, data?: URLSearchParams): Promise<T> {
  const response = await axios.request<T>({
    method,
    url: API + path,
    data,
    headers: { ...authHeaders(), ...(data ? {"Content-Type":"application/x-www-form-urlencoded"} : {}) },
    timeout: 20000,
  });
  return response.data;
}

function form(fields: Record<string,string|number|undefined|null>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key,value] of Object.entries(fields)) if (value !== undefined && value !== null) body.append(key,String(value));
  return body;
}

function safeCurrency(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function paymentIntentId(session: StripeSession): string | null {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent?.id ? String(session.payment_intent.id) : null;
}

export async function createStripeStarsCheckout(input: {
  userId: string;
  reference: string;
  redomTransactionId: string;
  amountMinor: number;
  currency: string;
  email: string;
  stars: number;
  packageKey: string;
  countryCode: string;
}): Promise<{sessionId:string; checkoutUrl:string}> {
  const metadata: Record<string,string> = {
    provider: "stripe",
    purpose: "stars_purchase",
    reference: input.reference,
    redomTransactionId: input.redomTransactionId,
    userId: input.userId,
    stars: String(input.stars),
    packageKey: input.packageKey,
    countryCode: input.countryCode,
    currency: input.currency.toUpperCase(),
  };
  const body = form({
    mode: "payment",
    "line_items[0][price_data][currency]": input.currency.toLowerCase(),
    "line_items[0][price_data][product_data][name]": `ReDom Stars • ${input.stars} Stars`,
    "line_items[0][price_data][product_data][description]": "Digital ReDom Stars",
    "line_items[0][price_data][unit_amount]": input.amountMinor,
    "line_items[0][quantity]": 1,
    customer_email: input.email,
    success_url: BACKEND_CALLBACK + "?session_id={CHECKOUT_SESSION_ID}&reference=" + encodeURIComponent(input.reference),
    cancel_url: APP_CALLBACK + "?reference=" + encodeURIComponent(input.reference) + "&status=cancelled",
    "payment_intent_data[metadata][provider]": metadata.provider,
    "payment_intent_data[metadata][purpose]": metadata.purpose,
    "payment_intent_data[metadata][reference]": metadata.reference,
    "payment_intent_data[metadata][redomTransactionId]": metadata.redomTransactionId,
    "payment_intent_data[metadata][userId]": metadata.userId,
    "payment_intent_data[metadata][stars]": metadata.stars,
    "payment_intent_data[metadata][packageKey]": metadata.packageKey,
    "payment_intent_data[metadata][countryCode]": metadata.countryCode,
    "payment_intent_data[metadata][currency]": metadata.currency,
    "metadata[provider]": metadata.provider,
    "metadata[purpose]": metadata.purpose,
    "metadata[reference]": metadata.reference,
    "metadata[redomTransactionId]": metadata.redomTransactionId,
    "metadata[userId]": metadata.userId,
    "metadata[stars]": metadata.stars,
    "metadata[packageKey]": metadata.packageKey,
    "metadata[countryCode]": metadata.countryCode,
    "metadata[currency]": metadata.currency,
  });
  const session = await stripeRequest<StripeSession>("post","/checkout/sessions",body);
  if (!session.id || !session.url) throw new Error("Stripe did not return a hosted checkout URL.");
  await pool.query(
    "UPDATE payment_transactions SET checkout_url=$1, gateway_status=$2, metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{stripeCheckoutSessionId}',to_jsonb($3::text),true), updated_at=now() WHERE reference=$4",
    [session.url, "checkout_created", session.id, input.reference],
  );
  return { sessionId: session.id, checkoutUrl: session.url };
}

async function markStripePaid(session: StripeSession): Promise<void> {
  const reference = String(session.metadata?.reference ?? "").trim();
  if (!reference) throw new Error("Stripe Checkout session is missing ReDom payment reference.");
  const tx = await pool.query("SELECT * FROM payment_transactions WHERE reference=$1 FOR UPDATE", [reference]);
  if (!tx.rows[0]) throw new Error("ReDom payment transaction not found for Stripe session.");
  const row = tx.rows[0];
  const expectedAmount = BigInt(String(row.amount_minor));
  const actualAmount = BigInt(String(session.amount_total ?? -1));
  if (actualAmount !== expectedAmount) throw new Error("Stripe amount did not match the ReDom payment amount.");
  if (safeCurrency(session.currency) !== safeCurrency(row.currency)) throw new Error("Stripe currency did not match the ReDom payment currency.");
  if (String(session.payment_status) !== "paid") return;

  let metadata: any = {};
  try { metadata = row.metadata ? (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata) : {}; } catch { metadata = {}; }
  const pi = paymentIntentId(session);
  metadata.paymentDetails = {
    ...(metadata.paymentDetails ?? {}),
    provider: "stripe",
    providerReference: pi ?? session.id,
    checkoutSessionId: session.id,
    channel: "card",
    providerAmountMinor: session.amount_total,
    requestedAmountMinor: session.amount_total,
    currency: String(session.currency ?? row.currency).toUpperCase(),
  };
  await pool.query(
    "UPDATE payment_transactions SET status='paid', gateway_status='succeeded', external_transaction_id=$1, paid_at=now(), metadata=$2::jsonb, updated_at=now() WHERE id=$3",
    [pi ?? session.id, JSON.stringify(metadata), row.id],
  );

  if (String(row.purpose) === "stars_purchase") {
    const stars = Number(metadata?.stars ?? 0);
    if (!Number.isInteger(stars) || stars <= 0) throw new Error("Invalid Stars fulfillment metadata.");
    await pool.query("INSERT INTO redom_stars_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[row.user_id]);
    const balance = await pool.query("SELECT balance FROM redom_stars_accounts WHERE user_id=$1 FOR UPDATE",[row.user_id]);
    const current = BigInt(String(balance.rows[0]?.balance ?? "0"));
    const next = current + BigInt(stars);
    await pool.query("UPDATE redom_stars_accounts SET balance=$1,updated_at=now() WHERE user_id=$2",[next.toString(),row.user_id]);
    const duplicate = await pool.query("SELECT 1 FROM redom_stars_transactions WHERE payment_transaction_id=$1 AND type='purchase' LIMIT 1",[row.id]);
    if (!duplicate.rows[0]) {
      await pool.query(
        "INSERT INTO redom_stars_transactions(user_id,payment_transaction_id,type,stars,balance_after,package_key,country_code,currency,amount_minor,reference) VALUES($1,$2,'purchase',$3,$4,$5,$6,$7,$8,$9)",
        [row.user_id,row.id,stars,next.toString(),metadata.packageKey ?? null,metadata.countryCode ?? row.country_code ?? null,row.currency,row.amount_minor,reference],
      );
    }
  }
  await sendPaymentEmailForReference(reference);
}

export async function verifyStripePayment(userId: string, reference: string) {
  const tx = await pool.query("SELECT id,user_id,metadata FROM payment_transactions WHERE reference=$1 LIMIT 1",[reference]);
  if (!tx.rows[0] || String(tx.rows[0].user_id)!==userId) throw new Error("Payment transaction not found.");
  let metadata:any = {};
  try { metadata = tx.rows[0].metadata ? (typeof tx.rows[0].metadata === "string" ? JSON.parse(tx.rows[0].metadata) : tx.rows[0].metadata) : {}; } catch {}
  const sessionId = metadata?.stripeCheckoutSessionId ? String(metadata.stripeCheckoutSessionId) : "";
  if (!sessionId) throw new Error("Stripe checkout session not found.");
  const session = await stripeRequest<StripeSession>("get","/checkout/sessions/"+encodeURIComponent(sessionId));
  await markStripePaid(session);
  const result = await pool.query("SELECT id,redom_transaction_id,reference,status,amount_minor,currency,purpose,refund_status FROM payment_transactions WHERE id=$1",[tx.rows[0].id]);
  const row=result.rows[0];
  return {
    transactionId:String(row.id), redomTransactionId:row.redom_transaction_id ? String(row.redom_transaction_id):null,
    reference:String(row.reference), status:String(row.status), amountMinor:String(row.amount_minor),
    currency:String(row.currency), purpose:String(row.purpose), refundStatus:row.refund_status ? String(row.refund_status):null,
  };
}

async function markStripeFailed(reference: string, message: string, gatewayStatus = "failed"): Promise<void> {
  await pool.query(
    "UPDATE payment_transactions SET status=CASE WHEN status='paid' THEN status ELSE 'failed' END, gateway_status=$1, failure_message=$2, updated_at=now() WHERE reference=$3",
    [gatewayStatus,message.slice(0,500),reference],
  );
  await sendPaymentEmailForReference(reference);
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
  const supplied = String(signature ?? "");
  const match = supplied.match(/(?:^|,)\\s*t=(\\d+)(?:,|$).*?(?:^|,)\\s*v1=([a-f0-9]+)(?:,|$)/i);
  if (!match) throw new Error("Invalid Stripe webhook signature.");
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now()/1000 - timestamp) > 300) throw new Error("Expired Stripe webhook signature.");
  const expected = crypto.createHmac("sha256",env.stripe.webhookSecret).update(String(timestamp)+"."+rawBody.toString("utf8")).digest("hex");
  const provided = match[2];
  if (expected.length !== provided.length || !crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(provided))) throw new Error("Invalid Stripe webhook signature.");

  const payload:any = JSON.parse(rawBody.toString("utf8"));
  const eventId = String(payload?.id ?? "");
  if (!eventId) throw new Error("Stripe webhook event ID is missing.");
  const eventKey = "stripe:"+eventId;
  const inserted = await pool.query(
    "INSERT INTO payment_webhook_events(event_key,event_type,reference,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(event_key) DO NOTHING RETURNING id",
    [eventKey,String(payload?.type ?? ""),payload?.data?.object?.metadata?.reference ? String(payload.data.object.metadata.reference):null,JSON.stringify(payload)],
  );
  if (!inserted.rows[0]) {
    const existing = await pool.query("SELECT processed FROM payment_webhook_events WHERE event_key=$1 LIMIT 1",[eventKey]);
    if (existing.rows[0]?.processed) return;
  }

  const type = String(payload?.type ?? "");
  const object = payload?.data?.object ?? {};
  try {
    if (["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(type)) {
      await markStripePaid(object as StripeSession);
    } else if (type === "checkout.session.async_payment_failed") {
      const reference = String(object?.metadata?.reference ?? "");
      if (reference) await markStripeFailed(reference,"Stripe reported that the payment could not be completed.","failed");
    } else if (type === "checkout.session.expired") {
      const reference = String(object?.metadata?.reference ?? "");
      if (reference) await markStripeFailed(reference,"Stripe Checkout session expired.","abandoned");
    } else if (type === "payment_intent.payment_failed") {
      const reference = String(object?.metadata?.reference ?? "");
      const message = String(object?.last_payment_error?.message ?? "Stripe payment failed.");
      if (reference) await markStripeFailed(reference,message,"failed");
    } else if (type === "payment_intent.succeeded") {
      const reference = String(object?.metadata?.reference ?? "");
      if (reference) {
        const sessionResult = await pool.query("SELECT metadata FROM payment_transactions WHERE reference=$1 LIMIT 1",[reference]);
        let m:any={}; try{m=sessionResult.rows[0]?.metadata ? (typeof sessionResult.rows[0].metadata==="string"?JSON.parse(sessionResult.rows[0].metadata):sessionResult.rows[0].metadata):{}}catch{}
        const sessionId=m?.stripeCheckoutSessionId;
        if(sessionId){
          const session=await stripeRequest<StripeSession>("get","/checkout/sessions/"+encodeURIComponent(String(sessionId)));
          await markStripePaid(session);
        }
      }
    }
    await pool.query("UPDATE payment_webhook_events SET processed=true,processed_at=now(),processing_error=NULL WHERE event_key=$1",[eventKey]);
  } catch(error) {
    await pool.query("UPDATE payment_webhook_events SET processing_error=$1 WHERE event_key=$2",[error instanceof Error?error.message:String(error),"stripe:"+eventId]);
    throw error;
  }
}

export async function stripeCallbackRedirect(reference: string, sessionId: string|undefined, status: string|undefined): Promise<string> {
  if (sessionId) {
    try {
      const session=await stripeRequest<StripeSession>("get","/checkout/sessions/"+encodeURIComponent(sessionId));
      if (String(session.metadata?.reference ?? "")===reference && String(session.payment_status ?? "")==="paid") await markStripePaid(session);
    } catch {}
  }
  return APP_CALLBACK+"?reference="+encodeURIComponent(reference)+(status ? "&status="+encodeURIComponent(status):"");
}

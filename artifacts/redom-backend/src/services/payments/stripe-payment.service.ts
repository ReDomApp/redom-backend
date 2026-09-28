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
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | { id?: string } | null;
  payment_method_types?: string[] | null;
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

function makeStripeTransactionId(): string {
  const length = 13 + crypto.randomInt(0, 4);
  const first = String(crypto.randomInt(1, 4));
  let digits = first;
  while (digits.length < length) digits += String(crypto.randomInt(0, 10));
  return "RS-" + digits;
}

async function uniqueStripeTransactionId(client: { query: Function }): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const candidate = makeStripeTransactionId();
    const existing = await client.query("SELECT 1 FROM payment_transactions WHERE redom_transaction_id=$1 LIMIT 1",[candidate]);
    if (!existing.rows[0]) return candidate;
  }
  throw new Error("Unable to allocate a unique ReDom Stripe transaction ID.");
}

function metadataFrom(row: any): any {
  try {
    return row?.metadata
      ? (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata)
      : {};
  } catch {
    return {};
  }
}

async function createStripeStarsCheckoutAttempt(input: {
  userId: string;
  reference: string;
  amountMinor: number;
  currency: string;
  email: string;
  stars: number;
  packageKey: string;
  countryCode: string;
  attemptNumber: number;
}): Promise<{sessionId:string; checkoutUrl:string; paymentMethodTypes:string[]}> {
  const metadata: Record<string,string> = {
    provider: "stripe",
    purpose: "stars_purchase",
    reference: input.reference,
    userId: input.userId,
    stars: String(input.stars),
    packageKey: input.packageKey,
    countryCode: input.countryCode,
    currency: input.currency.toUpperCase(),
    attemptNumber: String(input.attemptNumber),
  };

  const body = form({
    mode: "payment",
    client_reference_id: input.reference,
    "line_items[0][price_data][currency]": input.currency.toLowerCase(),
    "line_items[0][price_data][product_data][name]": `ReDom Stars • ${input.stars} Stars`,
    "line_items[0][price_data][product_data][description]": "Digital ReDom Stars",
    "line_items[0][price_data][unit_amount]": input.amountMinor,
    "line_items[0][quantity]": 1,
    customer_email: input.email,
    success_url: BACKEND_CALLBACK + "?session_id={CHECKOUT_SESSION_ID}&reference=" + encodeURIComponent(input.reference),
    cancel_url: BACKEND_CALLBACK + "?reference=" + encodeURIComponent(input.reference) + "&status=cancelled",
    "payment_intent_data[metadata][provider]": metadata.provider,
    "payment_intent_data[metadata][purpose]": metadata.purpose,
    "payment_intent_data[metadata][reference]": metadata.reference,
    "payment_intent_data[metadata][userId]": metadata.userId,
    "payment_intent_data[metadata][stars]": metadata.stars,
    "payment_intent_data[metadata][packageKey]": metadata.packageKey,
    "payment_intent_data[metadata][countryCode]": metadata.countryCode,
    "payment_intent_data[metadata][currency]": metadata.currency,
    "payment_intent_data[metadata][attemptNumber]": metadata.attemptNumber,
    "metadata[provider]": metadata.provider,
    "metadata[purpose]": metadata.purpose,
    "metadata[reference]": metadata.reference,
    "metadata[userId]": metadata.userId,
    "metadata[stars]": metadata.stars,
    "metadata[packageKey]": metadata.packageKey,
    "metadata[countryCode]": metadata.countryCode,
    "metadata[currency]": metadata.currency,
    "metadata[attemptNumber]": metadata.attemptNumber,
  });

  const session = await stripeRequest<StripeSession>("post","/checkout/sessions",body);
  if (!session.id || !session.url) throw new Error("Stripe did not return a hosted checkout URL.");

  await pool.query(
    `INSERT INTO stripe_stars_checkout_attempts
      (user_id,reference,stripe_session_id,stripe_payment_intent_id,package_key,stars,country_code,currency,amount_minor,customer_email,attempt_number,status,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open',$12::jsonb)`,
    [
      input.userId,input.reference,session.id,paymentIntentId(session),input.packageKey,input.stars,
      input.countryCode,input.currency,input.amountMinor,input.email,input.attemptNumber,JSON.stringify(metadata)
    ],
  );

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
    paymentMethodTypes: Array.isArray(session.payment_method_types) ? session.payment_method_types.map(String) : [],
  };
}

export async function createDeferredStripeStarsCheckout(input: {
  userId: string;
  reference: string;
  retryReference?: string | null;
  amountMinor: number;
  currency: string;
  email: string;
  stars: number;
  packageKey: string;
  countryCode: string;
}): Promise<{sessionId:string; checkoutUrl:string; paymentMethodTypes:string[]; attemptNumber:number}> {
  let attemptNumber = 1;
  if (input.retryReference) {
    const previous = await pool.query(
      "SELECT * FROM stripe_stars_checkout_attempts WHERE reference=$1 AND user_id=$2 LIMIT 1",
      [input.retryReference,input.userId],
    );
    if (!previous.rows[0]) throw new Error("The previous Stripe payment attempt could not be found.");
    if (Number(previous.rows[0].attempt_number) !== 1 || String(previous.rows[0].status) !== "failed") {
      throw new Error("A second Stripe payment attempt is not available for this payment.");
    }
    if (
      String(previous.rows[0].package_key) !== input.packageKey ||
      String(previous.rows[0].country_code) !== input.countryCode ||
      String(previous.rows[0].currency) !== input.currency ||
      String(previous.rows[0].amount_minor) !== String(input.amountMinor)
    ) {
      throw new Error("The retry details no longer match the original Stripe payment attempt.");
    }
    attemptNumber = 2;
  }

  const reference = input.reference;
  const created = await createStripeStarsCheckoutAttempt({
    ...input,
    reference,
    attemptNumber,
  });

  return { ...created, attemptNumber };
}

async function insertStripePaymentTransaction(
  client: { query: Function },
  attempt: any,
  session: StripeSession,
  finalStatus: "paid"|"failed",
  failureMessage?: string | null,
  providerTransactionId?: string | null,
): Promise<{id:string;redomTransactionId:string;reference:string}> {
  const existing = await client.query("SELECT id,redom_transaction_id,status FROM payment_transactions WHERE reference=$1 FOR UPDATE",[String(attempt.reference)]);
  if (existing.rows[0]) {
    return {
      id:String(existing.rows[0].id),
      redomTransactionId:String(existing.rows[0].redom_transaction_id ?? ""),
      reference:String(attempt.reference),
    };
  }

  const redomTransactionId = await uniqueStripeTransactionId(client);
  const pi = providerTransactionId ?? paymentIntentId(session);
  const totalPaymentAttempts = Math.max(
    Number(attempt.attempt_number ?? 1),
    Number(attempt.failure_count ?? 0) + (finalStatus === "failed" ? 1 : 0),
  );
  const metadata = {
    provider: "stripe",
    purpose: "stars_purchase",
    reference: String(attempt.reference),
    stars: Number(attempt.stars),
    packageKey: String(attempt.package_key),
    countryCode: String(attempt.country_code),
    currency: String(attempt.currency).toUpperCase(),
    customerEmail: String(attempt.customer_email),
    attemptNumber: totalPaymentAttempts,
    finalAttempt: finalStatus === "failed" && totalPaymentAttempts >= 2,
    stripeCheckoutSessionId: String(attempt.stripe_session_id ?? session.id),
    stripePaymentIntentId: pi,
    paymentDetails: {
      provider: "stripe",
      providerReference: pi ?? session.id,
      checkoutSessionId: String(attempt.stripe_session_id ?? session.id),
      channel: Array.isArray(session.payment_method_types) && session.payment_method_types.length ? session.payment_method_types.join(",") : "stripe_checkout",
      providerAmountMinor: session.amount_total,
      requestedAmountMinor: Number(attempt.amount_minor),
      currency: String(session.currency ?? attempt.currency).toUpperCase(),
      paymentMethodTypes: Array.isArray(session.payment_method_types) ? session.payment_method_types : [],
    },
    ...(failureMessage ? { failureReason: failureMessage } : {}),
  };

  const inserted = await client.query(
    `INSERT INTO payment_transactions
      (user_id,reference,redom_transaction_id,amount_minor,currency,purpose,status,metadata,country_code,customer_email,payment_provider,provider_transaction_id,gateway_status,failure_message,paid_at)
     VALUES($1,$2,$3,$4,$5,'stars_purchase',$6,$7::jsonb,$8,$9,'stripe',$10,$11,$12,$13)
     RETURNING id`,
    [
      attempt.user_id,attempt.reference,redomTransactionId,attempt.amount_minor,attempt.currency,
      finalStatus === "paid" ? "paid" : "failed",JSON.stringify(metadata),attempt.country_code,attempt.customer_email,
      pi,finalStatus === "paid" ? "succeeded" : "failed",failureMessage ? String(failureMessage).slice(0,500) : null,
      finalStatus === "paid" ? new Date() : null,
    ],
  );

  return { id:String(inserted.rows[0].id),redomTransactionId,reference:String(attempt.reference) };
}

async function fulfillStripeStarsAttempt(session: StripeSession): Promise<void> {
  const reference = String(session.metadata?.reference ?? "").trim();
  if (!reference) throw new Error("Stripe Checkout session is missing ReDom payment reference.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM stripe_stars_checkout_attempts WHERE reference=$1 FOR UPDATE",[reference]);
    const attempt = result.rows[0];
    if (!attempt) throw new Error("Stripe Stars checkout attempt not found.");
    if (String(session.metadata?.userId ?? attempt.user_id) !== String(attempt.user_id)) throw new Error("Stripe customer account did not match the ReDom checkout attempt.");
    const expectedAmount = BigInt(String(attempt.amount_minor));
    const actualAmount = BigInt(String(session.amount_total ?? -1));
    if (actualAmount !== expectedAmount) throw new Error("Stripe amount did not match the ReDom Stars amount.");
    if (safeCurrency(session.currency) !== safeCurrency(attempt.currency)) throw new Error("Stripe currency did not match the ReDom Stars currency.");
    if (String(session.payment_status) !== "paid") {
      await client.query("ROLLBACK");
      return;
    }
    if (String(attempt.status) === "completed") {
      await client.query("COMMIT");
      return;
    }
    if (Number(attempt.attempt_number) > 2) throw new Error("Stripe Stars payment attempt limit exceeded.");

    const payment = await insertStripePaymentTransaction(client,attempt,session,"paid");
    await client.query(
      "UPDATE stripe_stars_checkout_attempts SET status='completed',stripe_payment_intent_id=$1,metadata=jsonb_set(metadata,'{stripePaymentMethodTypes}',$2::jsonb,true),updated_at=now(),completed_at=now() WHERE id=$3",
      [
        paymentIntentId(session),
        JSON.stringify(Array.isArray(session.payment_method_types) ? session.payment_method_types : []),
        attempt.id
      ],
    );

    await client.query("INSERT INTO redom_stars_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[attempt.user_id]);
    const balance = await client.query("SELECT balance FROM redom_stars_accounts WHERE user_id=$1 FOR UPDATE",[attempt.user_id]);
    const existingStar = await client.query("SELECT 1 FROM redom_stars_transactions WHERE payment_transaction_id=$1 AND type='purchase' LIMIT 1",[payment.id]);
    if (!existingStar.rows[0]) {
      const current = BigInt(String(balance.rows[0]?.balance ?? "0"));
      const next = current + BigInt(String(attempt.stars));
      await client.query("UPDATE redom_stars_accounts SET balance=$1,updated_at=now() WHERE user_id=$2",[next.toString(),attempt.user_id]);
      await client.query(
        "INSERT INTO redom_stars_transactions(user_id,payment_transaction_id,type,stars,balance_after,package_key,country_code,currency,amount_minor,reference) VALUES($1,$2,'purchase',$3,$4,$5,$6,$7,$8,$9)",
        [attempt.user_id,payment.id,attempt.stars,next.toString(),attempt.package_key,attempt.country_code,attempt.currency,attempt.amount_minor,attempt.reference],
      );
    }

    await client.query("COMMIT");
    await sendPaymentEmailForReference(String(attempt.reference));
  } catch (error) {
    await client.query("ROLLBACK").catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function finalizeFailedStripeAttempt(
  reference: string,
  message: string,
  providerTransactionId?: string | null,
  session?: StripeSession,
): Promise<{finalFailure:boolean;transactionId:string|null;redomTransactionId:string|null}> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM stripe_stars_checkout_attempts WHERE reference=$1 FOR UPDATE",[reference]);
    const attempt = result.rows[0];
    if (!attempt) throw new Error("Stripe Stars checkout attempt not found.");

    if (String(attempt.status) === "completed") {
      await client.query("COMMIT");
      return {finalFailure:false,transactionId:null,redomTransactionId:null};
    }

    const safeMessage = String(message || "Stripe payment failed.").slice(0,500);
    const previousFailures = Number(attempt.failure_count ?? 0);
    const failureCount = previousFailures + 1;
    const finalFailure = Number(attempt.attempt_number) >= 2 || failureCount >= 2;

    if (!finalFailure) {
      await client.query(
        "UPDATE stripe_stars_checkout_attempts SET status='failed',failure_count=$1,failure_message=$2,stripe_payment_intent_id=COALESCE($3,stripe_payment_intent_id),updated_at=now() WHERE id=$4",
        [failureCount,safeMessage,providerTransactionId ?? null,attempt.id],
      );
      await client.query("COMMIT");
      return {finalFailure:false,transactionId:null,redomTransactionId:null};
    }

    const providerId = providerTransactionId ?? String(attempt.stripe_payment_intent_id ?? attempt.stripe_session_id ?? "");
    const stripeSession: StripeSession = session ?? {
      id:String(attempt.stripe_session_id ?? ""),
      amount_total:Number(attempt.amount_minor),
      currency:String(attempt.currency),
      payment_intent:providerId,
      payment_status:"unpaid",
      metadata:{reference,userId:String(attempt.user_id),stars:String(attempt.stars),packageKey:String(attempt.package_key),countryCode:String(attempt.country_code),currency:String(attempt.currency),attemptNumber:"2"},
    };
    const payment = await insertStripePaymentTransaction(client,attempt,stripeSession,"failed",safeMessage,providerId);
    await client.query(
      "UPDATE stripe_stars_checkout_attempts SET status='failed_final',failure_count=$1,failure_message=$2,stripe_payment_intent_id=COALESCE($3,stripe_payment_intent_id),updated_at=now(),completed_at=now() WHERE id=$4",
      [failureCount,safeMessage,providerId || null,attempt.id],
    );
    await client.query("COMMIT");
    await sendPaymentEmailForReference(String(attempt.reference));
    return {finalFailure:true,transactionId:payment.id,redomTransactionId:payment.redomTransactionId};
  } catch(error) {
    await client.query("ROLLBACK").catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function markStripeAbandoned(reference: string): Promise<void> {
  await pool.query(
    "UPDATE stripe_stars_checkout_attempts SET status=CASE WHEN status IN ('completed','failed_final') THEN status ELSE 'abandoned' END,updated_at=now() WHERE reference=$1",
    [reference],
  );
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
  // Legacy compatibility for already-created Stripe payment_transactions.
  const metadata: Record<string,string> = {
    provider:"stripe",purpose:"stars_purchase",reference:input.reference,redomTransactionId:input.redomTransactionId,
    userId:input.userId,stars:String(input.stars),packageKey:input.packageKey,countryCode:input.countryCode,currency:input.currency.toUpperCase(),
  };
  const body=form({
    mode:"payment",client_reference_id:input.reference,
    "line_items[0][price_data][currency]":input.currency.toLowerCase(),
    "line_items[0][price_data][product_data][name]":`ReDom Stars • ${input.stars} Stars`,
    "line_items[0][price_data][product_data][description]":"Digital ReDom Stars",
    "line_items[0][price_data][unit_amount]":input.amountMinor,"line_items[0][quantity]":1,customer_email:input.email,
    success_url:BACKEND_CALLBACK+"?session_id={CHECKOUT_SESSION_ID}&reference="+encodeURIComponent(input.reference),
    cancel_url:BACKEND_CALLBACK+"?reference="+encodeURIComponent(input.reference)+"&status=cancelled",
    "payment_intent_data[metadata][provider]":metadata.provider,"payment_intent_data[metadata][purpose]":metadata.purpose,
    "payment_intent_data[metadata][reference]":metadata.reference,"payment_intent_data[metadata][redomTransactionId]":metadata.redomTransactionId,
    "payment_intent_data[metadata][userId]":metadata.userId,"payment_intent_data[metadata][stars]":metadata.stars,
    "payment_intent_data[metadata][packageKey]":metadata.packageKey,"payment_intent_data[metadata][countryCode]":metadata.countryCode,
    "payment_intent_data[metadata][currency]":metadata.currency,
    "metadata[provider]":metadata.provider,"metadata[purpose]":metadata.purpose,"metadata[reference]":metadata.reference,
    "metadata[redomTransactionId]":metadata.redomTransactionId,"metadata[userId]":metadata.userId,"metadata[stars]":metadata.stars,
    "metadata[packageKey]":metadata.packageKey,"metadata[countryCode]":metadata.countryCode,"metadata[currency]":metadata.currency,
  });
  const session=await stripeRequest<StripeSession>("post","/checkout/sessions",body);
  if(!session.id||!session.url)throw new Error("Stripe did not return a hosted checkout URL.");
  await pool.query(
    "UPDATE payment_transactions SET checkout_url=$1,gateway_status='checkout_created',metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{stripeCheckoutSessionId}',to_jsonb($2::text),true),updated_at=now() WHERE reference=$3",
    [session.url,session.id,input.reference],
  );
  return {sessionId:session.id,checkoutUrl:session.url};
}

async function markLegacyStripePaid(session: StripeSession): Promise<void> {
  const reference=String(session.metadata?.reference??"").trim();
  if(!reference)throw new Error("Stripe Checkout session is missing ReDom payment reference.");
  const tx=await pool.query("SELECT * FROM payment_transactions WHERE reference=$1 FOR UPDATE",[reference]);
  if(!tx.rows[0])throw new Error("Legacy ReDom Stripe payment transaction not found.");
  const row=tx.rows[0];
  const expectedAmount=BigInt(String(row.amount_minor));
  const actualAmount=BigInt(String(session.amount_total??-1));
  if(actualAmount!==expectedAmount)throw new Error("Stripe amount did not match the ReDom payment amount.");
  if(safeCurrency(session.currency)!==safeCurrency(row.currency))throw new Error("Stripe currency did not match the ReDom payment currency.");
  if(String(session.payment_status)!=="paid")return;
  if(String(row.status)==="paid")return;

  const metadata=metadataFrom(row);
  const pi=paymentIntentId(session);
  metadata.paymentDetails={...(metadata.paymentDetails??{}),provider:"stripe",providerReference:pi??session.id,checkoutSessionId:session.id,channel:"stripe_checkout",providerAmountMinor:session.amount_total,requestedAmountMinor:session.amount_total,currency:String(session.currency??row.currency).toUpperCase(),paymentMethodTypes:Array.isArray(session.payment_method_types)?session.payment_method_types:[]};
  await pool.query(
    "UPDATE payment_transactions SET status='paid',payment_provider='stripe',provider_transaction_id=$1,gateway_status='succeeded',paid_at=now(),metadata=$2::jsonb,updated_at=now() WHERE id=$3",
    [pi??session.id,JSON.stringify(metadata),row.id],
  );
  if(String(row.purpose)==="stars_purchase"){
    const stars=Number(metadata?.stars??0);
    if(!Number.isInteger(stars)||stars<=0)throw new Error("Invalid Stars fulfillment metadata.");
    await pool.query("INSERT INTO redom_stars_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[row.user_id]);
    const balance=await pool.query("SELECT balance FROM redom_stars_accounts WHERE user_id=$1 FOR UPDATE",[row.user_id]);
    const duplicate=await pool.query("SELECT 1 FROM redom_stars_transactions WHERE payment_transaction_id=$1 AND type='purchase' LIMIT 1",[row.id]);
    if(!duplicate.rows[0]){
      const current=BigInt(String(balance.rows[0]?.balance??"0"));const next=current+BigInt(stars);
      await pool.query("UPDATE redom_stars_accounts SET balance=$1,updated_at=now() WHERE user_id=$2",[next.toString(),row.user_id]);
      await pool.query("INSERT INTO redom_stars_transactions(user_id,payment_transaction_id,type,stars,balance_after,package_key,country_code,currency,amount_minor,reference) VALUES($1,$2,'purchase',$3,$4,$5,$6,$7,$8,$9)",[row.user_id,row.id,stars,next.toString(),metadata.packageKey??null,metadata.countryCode??row.country_code??null,row.currency,row.amount_minor,reference]);
    }
  }
  await sendPaymentEmailForReference(reference);
}

export async function verifyStripePayment(userId:string,reference:string){
  const tx=await pool.query("SELECT id,user_id,metadata FROM payment_transactions WHERE reference=$1 LIMIT 1",[reference]);
  if(!tx.rows[0]||String(tx.rows[0].user_id)!==userId)throw new Error("Payment transaction not found.");
  const metadata=metadataFrom(tx.rows[0]);
  const sessionId=metadata?.stripeCheckoutSessionId?String(metadata.stripeCheckoutSessionId):"";
  if(!sessionId)throw new Error("Stripe checkout session not found.");
  const session=await stripeRequest<StripeSession>("get","/checkout/sessions/"+encodeURIComponent(sessionId));
  await markLegacyStripePaid(session);
  const result=await pool.query("SELECT id,redom_transaction_id,reference,status,amount_minor,currency,purpose,refund_status FROM payment_transactions WHERE id=$1",[tx.rows[0].id]);
  const row=result.rows[0];
  return {transactionId:String(row.id),redomTransactionId:row.redom_transaction_id?String(row.redom_transaction_id):null,reference:String(row.reference),status:String(row.status),amountMinor:String(row.amount_minor),currency:String(row.currency),purpose:String(row.purpose),refundStatus:row.refund_status?String(row.refund_status):null,finalFailure:String(row.status)==="failed"};
}

export async function verifyStripeStarsCheckout(userId:string,reference:string){
  const tx=await pool.query("SELECT id,user_id,metadata,status,redom_transaction_id,amount_minor,currency,purpose,refund_status FROM payment_transactions WHERE reference=$1 AND user_id=$2 LIMIT 1",[reference,userId]);
  if(tx.rows[0]){
    const row=tx.rows[0];
    if(String(row.status)==="paid"){
      return {transactionId:String(row.id),redomTransactionId:row.redom_transaction_id?String(row.redom_transaction_id):null,reference:String(reference),status:"paid",amountMinor:String(row.amount_minor),currency:String(row.currency),purpose:String(row.purpose),refundStatus:row.refund_status?String(row.refund_status):null,finalFailure:false};
    }
    return {transactionId:String(row.id),redomTransactionId:row.redom_transaction_id?String(row.redom_transaction_id):null,reference:String(reference),status:String(row.status),amountMinor:String(row.amount_minor),currency:String(row.currency),purpose:String(row.purpose),refundStatus:row.refund_status?String(row.refund_status):null,finalFailure:String(row.status)==="failed"};
  }

  const attemptResult=await pool.query("SELECT * FROM stripe_stars_checkout_attempts WHERE reference=$1 AND user_id=$2 LIMIT 1",[reference,userId]);
  if(!attemptResult.rows[0])throw new Error("Stripe Stars checkout attempt not found.");
  const attempt=attemptResult.rows[0];
  const session=await stripeRequest<StripeSession>("get","/checkout/sessions/"+encodeURIComponent(String(attempt.stripe_session_id)));

  if(String(session.payment_status)==="paid"){
    await fulfillStripeStarsAttempt(session);
    return verifyStripeStarsCheckout(userId,reference);
  }

  if(String(session.status)==="expired"){
    await markStripeAbandoned(reference);
  }

  const latest=await pool.query("SELECT status,failure_message,stripe_payment_intent_id,attempt_number FROM stripe_stars_checkout_attempts WHERE reference=$1 LIMIT 1",[reference]);
  const row=latest.rows[0];
  const status=String(row?.status??"open");
  return {
    transactionId:null,
    redomTransactionId:null,
    reference:String(reference),
    status:status==="completed"?"paid":status==="failed_final"?"failed":status==="failed"?"failed":"processing",
    amountMinor:String(attempt.amount_minor),
    currency:String(attempt.currency),
    purpose:"stars_purchase",
    refundStatus:null,
    finalFailure:status==="failed_final",
    retryAvailable:status==="failed",
    attemptNumber:Number(row?.attempt_number??attempt.attempt_number),
    failureReason:row?.failure_message?String(row.failure_message):null,
    stripeCheckoutSessionId:String(attempt.stripe_session_id),
    stripePaymentIntentId:row?.stripe_payment_intent_id?String(row.stripe_payment_intent_id):paymentIntentId(session),
    paymentMethodTypes:Array.isArray(session.payment_method_types)?session.payment_method_types:[],
  };
}

async function markStripeFailed(reference:string,message:string,gatewayStatus="failed",providerTransactionId?:string|null,session?:StripeSession){
  const attempt=await pool.query("SELECT stripe_session_id FROM stripe_stars_checkout_attempts WHERE reference=$1 LIMIT 1",[reference]);
  if(attempt.rows[0]){
    return finalizeFailedStripeAttempt(reference,message,providerTransactionId,session);
  }
  const legacy=await pool.query("SELECT 1 FROM payment_transactions WHERE reference=$1 LIMIT 1",[reference]);
  if(legacy.rows[0]){
    await pool.query("UPDATE payment_transactions SET status=CASE WHEN status='paid' THEN status ELSE 'failed' END,gateway_status=$1,failure_message=$2,updated_at=now() WHERE reference=$3",[gatewayStatus,String(message).slice(0,500),reference]);
    await sendPaymentEmailForReference(reference);
  }
  return {finalFailure:false,transactionId:null,redomTransactionId:null};
}

export async function handleStripeWebhook(rawBody:Buffer,signature:string|undefined):Promise<void>{
  const supplied=String(signature??"");
  const match=supplied.match(/(?:^|,)\s*t=(\d+)(?:,|$).*?(?:^|,)\s*v1=([a-f0-9]+)(?:,|$)/i);
  if(!match)throw new Error("Invalid Stripe webhook signature.");
  const timestamp=Number(match[1]);
  if(!Number.isFinite(timestamp)||Math.abs(Date.now()/1000-timestamp)>300)throw new Error("Expired Stripe webhook signature.");
  const expected=crypto.createHmac("sha256",env.stripe.webhookSecret).update(String(timestamp)+"."+rawBody.toString("utf8")).digest("hex");
  const provided=match[2];
  if(expected.length!==provided.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))throw new Error("Invalid Stripe webhook signature.");

  const payload:any=JSON.parse(rawBody.toString("utf8"));
  const eventId=String(payload?.id??"");
  if(!eventId)throw new Error("Stripe webhook event ID is missing.");
  const eventKey="stripe:"+eventId;
  const inserted=await pool.query(
    "INSERT INTO payment_webhook_events(event_key,event_type,reference,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(event_key) DO NOTHING RETURNING id",
    [eventKey,String(payload?.type??""),payload?.data?.object?.metadata?.reference?String(payload.data.object.metadata.reference):null,JSON.stringify(payload)],
  );
  if(!inserted.rows[0]){
    const existing=await pool.query("SELECT processed FROM payment_webhook_events WHERE event_key=$1 LIMIT 1",[eventKey]);
    if(existing.rows[0]?.processed)return;
  }

  const type=String(payload?.type??"");
  const object=payload?.data?.object??{};
  try{
    if(["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(type)){
      await fulfillStripeStarsAttempt(object as StripeSession).catch(async(error)=>{
        const attempt=await pool.query("SELECT 1 FROM stripe_stars_checkout_attempts WHERE reference=$1 LIMIT 1",[String(object?.metadata?.reference??"")]);
        if(attempt.rows[0])throw error;
        await markLegacyStripePaid(object as StripeSession);
      });
    }else if(type==="checkout.session.async_payment_failed"){
      const reference=String(object?.metadata?.reference??"");
      if(reference)await markStripeFailed(reference,"Stripe reported that the payment could not be completed.","failed",paymentIntentId(object as StripeSession),object as StripeSession);
    }else if(type==="checkout.session.expired"){
      const reference=String(object?.metadata?.reference??"");
      if(reference)await markStripeAbandoned(reference);
    }else if(type==="payment_intent.payment_failed"){
      const reference=String(object?.metadata?.reference??"");
      const message=String(object?.last_payment_error?.message??"Stripe payment failed.");
      if(reference)await markStripeFailed(reference,message,"failed",String(object?.id??"")||null);
    }else if(type==="payment_intent.succeeded"){
      const reference=String(object?.metadata?.reference??"");
      if(reference){
        const attempt=await pool.query("SELECT stripe_session_id FROM stripe_stars_checkout_attempts WHERE reference=$1 LIMIT 1",[reference]);
        if(attempt.rows[0]){
          const session=await stripeRequest<StripeSession>("get","/checkout/sessions/"+encodeURIComponent(String(attempt.rows[0].stripe_session_id)));
          await fulfillStripeStarsAttempt(session);
        }else{
          await pool.query("UPDATE payment_transactions SET provider_transaction_id=$1,payment_provider='stripe',gateway_status='succeeded',updated_at=now() WHERE reference=$2",[String(object.id??""),reference]);
        }
      }
    }
    await pool.query("UPDATE payment_webhook_events SET processed=true,processed_at=now(),processing_error=NULL WHERE event_key=$1",[eventKey]);
  }catch(error){
    await pool.query("UPDATE payment_webhook_events SET processing_error=$1 WHERE event_key=$2",[error instanceof Error?error.message:String(error),eventKey]);
    throw error;
  }
}

export async function stripeCallbackRedirect(reference:string,sessionId:string|undefined,status:string|undefined):Promise<string>{
  try{
    if(sessionId){
      const session=await stripeRequest<StripeSession>("get","/checkout/sessions/"+encodeURIComponent(sessionId));
      if(String(session.metadata?.reference??"")===reference){
        if(String(session.payment_status)==="paid"){
          const attempt=await pool.query("SELECT 1 FROM stripe_stars_checkout_attempts WHERE reference=$1 LIMIT 1",[reference]);
          if(attempt.rows[0])await fulfillStripeStarsAttempt(session);
          else await markLegacyStripePaid(session);
        }else if(status==="cancelled"||String(session.status)==="expired"){
          await markStripeAbandoned(reference);
        }
      }
    }else if(status==="cancelled"){
      await markStripeAbandoned(reference);
    }
  }catch(error){
    console.error("Stripe callback processing failed:",error);
  }
  return APP_CALLBACK+"?reference="+encodeURIComponent(reference)+(status ? "&status="+encodeURIComponent(status):"");
}

import axios from "axios";
import crypto from "node:crypto";
import { env } from "../../config/env";
import { pool } from "../../database/db";
import { sendPaymentEmailForReference } from "./payment.service";
import { finalizeStarsTrialSetup, markStarsTrialSetupAbandoned } from "./stripe-stars-trial.service";
import { getStripeCardMethodForUser, finalizeStripeCardSetup, finalizeStripeCardSetupCheckout } from "./stripe-saved-payment.service";
import { walletCredit } from "../aurelink/aurelink-wallet.service";

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
  subscription?: string | { id?: string } | null;
  customer?: string | { id?: string } | null;
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

type StripePaymentIntent = {
  id:string;
  client_secret?:string|null;
  status:string;
  amount:number;
  currency:string;
  customer?:string|null;
  payment_method?:string|null;
  metadata?:Record<string,string>;
  last_payment_error?:{message?:string|null;decline_code?:string|null;code?:string|null}|null;
};

export async function createSavedStripeStarsPayment(input:{
  userId:string;
  reference:string;
  amountMinor:number;
  currency:string;
  email:string;
  stars:number;
  packageKey:string;
  countryCode:string;
  paymentMethodId:string;
}):Promise<{reference:string;paymentIntentId:string;clientSecret:string|null;status:string;brand:string|null;last4:string|null}> {
  const method=await getStripeCardMethodForUser(input.userId,input.paymentMethodId);
  const provider=method.provider;
  if(String(method.row.status||"active")!=="active"||!Boolean(method.row.active)||!Boolean(method.row.reusable)){
    throw new Error("The saved ReDom Pay payment method is no longer active.");
  }
  if(!provider.stripePaymentMethodId)throw new Error("The saved ReDom Pay payment method is unavailable.");
  if(!provider.stripeCustomerId)throw new Error("The saved ReDom Pay customer is unavailable.");

  const metadata:Record<string,string>={
    provider:"stripe",purpose:"stars_purchase",reference:input.reference,userId:input.userId,
    stars:String(input.stars),packageKey:input.packageKey,countryCode:input.countryCode,
    currency:input.currency.toUpperCase(),savedPaymentMethodId:input.paymentMethodId,
  };

  const intent=await stripeRequest<StripePaymentIntent>("post","/payment_intents",form({
    amount:input.amountMinor,
    currency:input.currency.toLowerCase(),
    customer:provider.stripeCustomerId,
    payment_method:provider.stripePaymentMethodId,
    confirmation_method:"automatic",
    confirm:"true",
    "payment_method_types[0]":"card",
    description:`ReDom Stars • ${input.stars} Stars`,
    receipt_email:input.email,
    "metadata[provider]":metadata.provider,
    "metadata[purpose]":metadata.purpose,
    "metadata[reference]":metadata.reference,
    "metadata[userId]":metadata.userId,
    "metadata[stars]":metadata.stars,
    "metadata[packageKey]":metadata.packageKey,
    "metadata[countryCode]":metadata.countryCode,
    "metadata[currency]":metadata.currency,
    "metadata[savedPaymentMethodId]":metadata.savedPaymentMethodId,
  }));
  if(!intent.id||!intent.client_secret)throw new Error("Stripe did not return a secure payment client secret.");

  await pool.query(
    `INSERT INTO stripe_stars_checkout_attempts
      (user_id,reference,stripe_session_id,stripe_payment_intent_id,package_key,stars,country_code,currency,amount_minor,customer_email,attempt_number,status,metadata)
     VALUES($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,1,$10,$11::jsonb)`,
    [input.userId,input.reference,intent.id,input.packageKey,input.stars,input.countryCode,input.currency,input.amountMinor,input.email,
      intent.status==="succeeded"?"completed":intent.status==="requires_action"?"requires_action":"open",JSON.stringify(metadata)],
  );

  if(intent.status==="succeeded"){
    await fulfillStripeStarsAttempt({
      id:intent.id,
      amount_total:intent.amount,
      currency:intent.currency,
      payment_intent:intent.id,
      payment_method_types:["card"],
      metadata,
      payment_status:"paid",
    });
  }

  return {reference:input.reference,paymentIntentId:intent.id,clientSecret:intent.client_secret,status:intent.status,brand:provider.brand,last4:provider.last4};
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
    Number(attempt.failure_count ?? 0) + (finalStatus === "paid" ? 1 : 0),
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
  await pool.query(
    "UPDATE payment_transactions SET status='abandoned',gateway_status='abandoned',updated_at=now() WHERE reference=$1 AND status='initialized'",
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

export async function createAurelinkStripeCheckout(input: { userId: string; quoteId: string }): Promise<{ reference: string; checkoutUrl: string; amountMinor: string; currency: string; purpose: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const quoteResult = await client.query(
      "SELECT id,product_kind,retail_amount_minor,currency,expires_at FROM aurelink_quotes WHERE id=$1 AND user_id=$2 AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",
      [input.quoteId, input.userId],
    );
    const quote = quoteResult.rows[0];
    if (!quote) throw new Error("AURELINK quote expired or was not found.");
    const purpose = String(quote.product_kind) === "activation" ? "aurelink_otp"
      : String(quote.product_kind) === "rental" ? "aurelink_rental" : "";
    if (!purpose) throw new Error("This AURELINK product cannot be checked out.");
    const amountMinor = BigInt(String(quote.retail_amount_minor));
    if (amountMinor <= 0n) throw new Error("Invalid AURELINK checkout amount.");
    const currency = String(quote.currency ?? "USD").toUpperCase();
    if (currency !== "USD") throw new Error("AURELINK Stripe checkout currently supports USD quotes only.");
    const existing = await client.query(
      "SELECT reference,checkout_url,amount_minor,currency,purpose,status FROM payment_transactions WHERE user_id=$1 AND purpose=$2 AND metadata->>'quoteId'=$3 AND status IN ('initialized','paid') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [input.userId, purpose, input.quoteId],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (String(row.status) === "initialized" && row.checkout_url) {
        await client.query("COMMIT");
        return { reference: String(row.reference), checkoutUrl: String(row.checkout_url), amountMinor: String(row.amount_minor), currency: String(row.currency), purpose: String(row.purpose) };
      }
      throw new Error("A payment already exists for this quote. Check its status before retrying.");
    }
    const userResult = await client.query("SELECT email FROM users WHERE id=$1 LIMIT 1", [input.userId]);
    const email = String(userResult.rows[0]?.email ?? "").trim();
    if (!email) throw new Error("A verified email address is required for checkout.");
    const reference = "AURELINK-" + crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    const metadata = { provider: "stripe", purpose, reference, userId: input.userId, quoteId: input.quoteId, productKind: String(quote.product_kind) };
    await client.query(
      "INSERT INTO payment_transactions (user_id,reference,amount_minor,currency,purpose,status,metadata,payment_provider,customer_email) VALUES ($1,$2,$3,$4,$5,'initialized',$6::jsonb,'stripe',$7)",
      [input.userId, reference, amountMinor.toString(), currency, purpose, JSON.stringify(metadata), email],
    );
    const body = form({
      mode: "payment",
      client_reference_id: reference,
      "line_items[0][price_data][currency]": currency.toLowerCase(),
      "line_items[0][price_data][product_data][name]": String(quote.product_kind) === "rental" ? "AURELINK mobile number rental" : "AURELINK SMS activation",
      "line_items[0][price_data][product_data][description]": "AURELINK telecom service",
      "line_items[0][price_data][unit_amount]": amountMinor.toString(),
      "line_items[0][quantity]": 1,
      customer_email: email,
      success_url: BACKEND_CALLBACK + "?session_id={CHECKOUT_SESSION_ID}&reference=" + encodeURIComponent(reference),
      cancel_url: BACKEND_CALLBACK + "?reference=" + encodeURIComponent(reference) + "&status=cancelled",
      "metadata[provider]": metadata.provider,
      "metadata[purpose]": metadata.purpose,
      "metadata[reference]": metadata.reference,
      "metadata[userId]": metadata.userId,
      "metadata[quoteId]": metadata.quoteId,
      "metadata[productKind]": metadata.productKind,
      "payment_intent_data[metadata][provider]": metadata.provider,
      "payment_intent_data[metadata][purpose]": metadata.purpose,
      "payment_intent_data[metadata][reference]": metadata.reference,
      "payment_intent_data[metadata][userId]": metadata.userId,
      "payment_intent_data[metadata][quoteId]": metadata.quoteId,
      "payment_intent_data[metadata][productKind]": metadata.productKind,
    });
    const session = await stripeRequest<StripeSession>("post", "/checkout/sessions", body);
    if (!session.id || !session.url) throw new Error("Stripe did not return a hosted checkout URL.");
    await client.query(
      "UPDATE payment_transactions SET checkout_url=$1,gateway_status='checkout_created',metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{stripeCheckoutSessionId}',to_jsonb($2::text),true),updated_at=now() WHERE reference=$3",
      [session.url, session.id, reference],
    );
    await client.query("UPDATE aurelink_quotes SET expires_at=GREATEST(expires_at,NOW()+INTERVAL '24 hours') WHERE id=$1", [input.quoteId]);
    await client.query("COMMIT");
    return { reference, checkoutUrl: session.url, amountMinor: amountMinor.toString(), currency, purpose };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createAurelinkWalletTopupCheckout(input:{userId:string;amountMinor:number}):Promise<{reference:string;checkoutUrl:string;amountMinor:number;currency:string}>{
  if(!Number.isInteger(input.amountMinor)||input.amountMinor<500||input.amountMinor>500000)throw new Error("Wallet top-ups must be between $5 and $5,000 USD.");
  const user=await pool.query("SELECT email FROM users WHERE id=$1 LIMIT 1",[input.userId]);
  const email=String(user.rows[0]?.email??"").trim();
  if(!email)throw new Error("A verified email address is required for wallet top-up.");
  const reference="AURELINK-WALLET-"+crypto.randomUUID().replace(/-/g,"").slice(0,20);
  const metadata={provider:"stripe",purpose:"aurelink_wallet_topup",reference,userId:input.userId};
  await pool.query("INSERT INTO payment_transactions(user_id,reference,amount_minor,currency,purpose,status,metadata,payment_provider,customer_email) VALUES($1,$2,$3,'USD','aurelink_wallet_topup','initialized',$4::jsonb,'stripe',$5)",[input.userId,reference,input.amountMinor,JSON.stringify(metadata),email]);
  try{
    const body=form({mode:"payment",client_reference_id:reference,"line_items[0][price_data][currency]":"usd","line_items[0][price_data][product_data][name]":"Aurelink wallet credit","line_items[0][price_data][product_data][description]":"Wallet top-up for Aurelink number purchases","line_items[0][price_data][unit_amount]":input.amountMinor,"line_items[0][quantity]":1,customer_email:email,success_url:BACKEND_CALLBACK+"?session_id={CHECKOUT_SESSION_ID}&reference="+encodeURIComponent(reference),cancel_url:BACKEND_CALLBACK+"?reference="+encodeURIComponent(reference)+"&status=cancelled","metadata[provider]":metadata.provider,"metadata[purpose]":metadata.purpose,"metadata[reference]":reference,"metadata[userId]":input.userId,"payment_intent_data[metadata][provider]":metadata.provider,"payment_intent_data[metadata][purpose]":metadata.purpose,"payment_intent_data[metadata][reference]":reference,"payment_intent_data[metadata][userId]":input.userId});
    const session=await stripeRequest<StripeSession>("post","/checkout/sessions",body);
    if(!session.id||!session.url)throw new Error("Stripe did not return a hosted checkout URL.");
    await pool.query("UPDATE payment_transactions SET checkout_url=$1,gateway_status='checkout_created',metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{stripeCheckoutSessionId}',to_jsonb($2::text),true),updated_at=now() WHERE reference=$3",[session.url,session.id,reference]);
    await pool.query("INSERT INTO aurelink_wallet_topups(reference,user_id,amount_minor,currency) VALUES($1,$2,$3,'USD')",[reference,input.userId,input.amountMinor]);
    return {reference,checkoutUrl:session.url,amountMinor:input.amountMinor,currency:"USD"};
  }catch(error){
    await pool.query("UPDATE payment_transactions SET status='failed',failure_message=$1,updated_at=now() WHERE reference=$2",[error instanceof Error?error.message:"Stripe checkout failed",reference]).catch(()=>undefined);
    throw error;
  }
}


type StripeSubscription = { id:string; status?:string; customer?:string|{id?:string}; current_period_start?:number; current_period_end?:number };

function stripeObjectId(value:unknown):string|null {
  if(typeof value==="string")return value;
  if(value&&typeof value==="object"&&"id" in value)return String((value as {id?:unknown}).id||"")||null;
  return null;
}

export async function createAurelinkEmailBillingCheckout(input:{
  userId:string;workspaceId:string;purchaseType:"subscription"|"email_credits";planOptionId?:string;creditPackId?:string;
}):Promise<{reference:string;checkoutUrl:string;amountMinor:number;currency:"USD";purchaseType:"subscription"|"email_credits"}>{
  const user=(await pool.query("SELECT email,account_status FROM aurelink_users WHERE id=$1 LIMIT 1",[input.userId])).rows[0];
  if(!user||user.account_status!=="active"||!String(user.email||"").trim())throw new Error("An active Aurelink account with a verified email is required.");
  const membership=await pool.query(
    "SELECT w.id FROM aurelink_communications_workspaces w LEFT JOIN aurelink_communications_members m ON m.workspace_id=w.id AND m.accepted_user_id=$1 AND m.status='active' WHERE w.id=$2 AND w.status='active' AND (w.user_id=$1 OR m.accepted_user_id=$1) LIMIT 1",
    [input.userId,input.workspaceId]
  );
  if(!membership.rows[0])throw new Error("Aurelink workspace not found or access denied.");
  let amountMinor:number,planOptionId:string|null=null,creditPackId:string|null=null,emailCredits:string|null=null,productName:string,mode:"payment"|"subscription";
  if(input.purchaseType==="subscription"){
    if(!input.planOptionId)throw new Error("Select an exact monthly email plan configuration.");
    const option=(await pool.query(
      "SELECT o.id,o.monthly_email_allowance,o.monthly_price_minor,p.display_name,p.plan_code FROM aurelink_email_plan_options o JOIN aurelink_email_plan_catalog p ON p.id=o.plan_id WHERE o.id=$1 AND o.active=TRUE AND p.active=TRUE AND o.effective_from<=NOW() AND (o.effective_until IS NULL OR o.effective_until>NOW())",
      [input.planOptionId]
    )).rows[0];
    if(!option)throw new Error("The selected monthly email configuration is unavailable.");
    amountMinor=Number(option.monthly_price_minor);planOptionId=String(option.id);productName="Aurelink Mail "+String(option.display_name)+" — "+Number(option.monthly_email_allowance).toLocaleString("en-US")+" emails/month";mode="subscription";
    const active=await pool.query("SELECT id FROM aurelink_email_subscriptions WHERE workspace_id=$1 AND status IN ('active','past_due','pending_payment') LIMIT 1",[input.workspaceId]);
    if(active.rows[0])throw new Error("This workspace already has an active or pending monthly email subscription. Change or cancel it before starting another checkout.");
    const pending=await pool.query("SELECT reference FROM aurelink_email_billing_payments WHERE workspace_id=$1 AND purchase_type='subscription' AND status='pending' LIMIT 1",[input.workspaceId]);
    if(pending.rows[0])throw new Error("A monthly email checkout is already pending for this workspace. Complete or cancel it before starting another.");
  }else{
    if(!input.creditPackId)throw new Error("Select a prepaid email credit pack.");
    const pack=(await pool.query("SELECT id,email_credits,price_minor FROM aurelink_email_credit_packs WHERE id=$1 AND active=TRUE",[input.creditPackId])).rows[0];
    if(!pack)throw new Error("The selected prepaid email credit pack is unavailable.");
    amountMinor=Number(pack.price_minor);creditPackId=String(pack.id);emailCredits=String(pack.email_credits);productName="Aurelink Mail prepaid email credits — "+BigInt(emailCredits).toLocaleString("en-US")+" emails";mode="payment";
  }
  if(!Number.isSafeInteger(amountMinor)||amountMinor<50)throw new Error("The configured Aurelink Mail price is invalid.");
  const successBase=String(process.env.AURELINK_EMAIL_BILLING_SUCCESS_URL||"").trim();
  const cancelBase=String(process.env.AURELINK_EMAIL_BILLING_CANCEL_URL||"").trim();
  if(!successBase||!cancelBase)throw new Error("Configure AURELINK_EMAIL_BILLING_SUCCESS_URL and AURELINK_EMAIL_BILLING_CANCEL_URL before enabling email checkout.");
  const reference="AURELINK-MAIL-"+crypto.randomUUID().replace(/-/g,"").slice(0,24);
  await pool.query(
    "INSERT INTO aurelink_email_billing_payments(reference,user_id,workspace_id,purchase_type,plan_option_id,credit_pack_id,email_credits,amount_minor,currency,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'USD','pending')",
    [reference,input.userId,input.workspaceId,input.purchaseType,planOptionId,creditPackId,emailCredits,amountMinor]
  );
  const successUrl=new URL(successBase);successUrl.searchParams.set("reference",reference);successUrl.searchParams.set("session_id","{CHECKOUT_SESSION_ID}");successUrl.searchParams.set("status","success");
  const cancelUrl=new URL(cancelBase);cancelUrl.searchParams.set("reference",reference);cancelUrl.searchParams.set("status","cancelled");
  const metadata={provider:"stripe",purpose:"aurelink_email_"+(input.purchaseType==="subscription"?"subscription":"credits"),reference,userId:input.userId,workspaceId:input.workspaceId,planOptionId:planOptionId||"",creditPackId:creditPackId||"",emailCredits:emailCredits||""};
  try{
    const fields:Record<string,string|number|undefined|null>={
      mode,client_reference_id:reference,customer_email:String(user.email),
      "line_items[0][price_data][currency]":"usd",
      "line_items[0][price_data][product_data][name]":productName,
      "line_items[0][price_data][unit_amount]":amountMinor,
      "line_items[0][quantity]":1,
      success_url:successUrl.toString(),cancel_url:cancelUrl.toString(),
      "metadata[provider]":metadata.provider,"metadata[purpose]":metadata.purpose,"metadata[reference]":reference,
      "metadata[userId]":input.userId,"metadata[workspaceId]":input.workspaceId,
      "metadata[planOptionId]":metadata.planOptionId,"metadata[creditPackId]":metadata.creditPackId,"metadata[emailCredits]":metadata.emailCredits,
    };
    if(mode==="subscription"){
      fields["line_items[0][price_data][recurring][interval]"]="month";
      fields["subscription_data[metadata][provider]"]=metadata.provider;
      fields["subscription_data[metadata][purpose]"]=metadata.purpose;
      fields["subscription_data[metadata][reference]"]=reference;
      fields["subscription_data[metadata][userId]"]=input.userId;
      fields["subscription_data[metadata][workspaceId]"]=input.workspaceId;
      fields["subscription_data[metadata][planOptionId]"]=String(planOptionId);
    }else{
      fields["payment_intent_data[metadata][provider]"]=metadata.provider;
      fields["payment_intent_data[metadata][purpose]"]=metadata.purpose;
      fields["payment_intent_data[metadata][reference]"]=reference;
      fields["payment_intent_data[metadata][userId]"]=input.userId;
      fields["payment_intent_data[metadata][workspaceId]"]=input.workspaceId;
      fields["payment_intent_data[metadata][emailCredits]"]=String(emailCredits);
    }
    const session=await stripeRequest<StripeSession>("post","/checkout/sessions",form(fields));
    if(!session.id||!session.url)throw new Error("Stripe did not return a hosted email checkout URL.");
    await pool.query("UPDATE aurelink_email_billing_payments SET stripe_checkout_session_id=$1,updated_at=NOW() WHERE reference=$2",[session.id,reference]);
    return {reference,checkoutUrl:session.url,amountMinor,currency:"USD",purchaseType:input.purchaseType};
  }catch(error){
    await pool.query("UPDATE aurelink_email_billing_payments SET status='failed',updated_at=NOW() WHERE reference=$1",[reference]).catch(()=>undefined);
    throw error;
  }
}

export async function fulfillAurelinkEmailBillingCheckout(session:StripeSession):Promise<void>{
  const reference=String(session.metadata?.reference||"");
  if(!reference||!String(session.metadata?.purpose||"").startsWith("aurelink_email_"))return;
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const payment=(await client.query("SELECT * FROM aurelink_email_billing_payments WHERE reference=$1 FOR UPDATE",[reference])).rows[0];
    if(!payment)throw new Error("Aurelink Mail payment reference not found.");
    if(payment.status==="paid"){await client.query("COMMIT");return;}
    if(String(session.payment_status||"")!=="paid"){await client.query("COMMIT");return;}
    if(BigInt(String(session.amount_total??-1))!==BigInt(String(payment.amount_minor))||String(session.currency||"").toUpperCase()!==String(payment.currency).toUpperCase())throw new Error("Stripe amount or currency did not match the Aurelink Mail checkout.");
    const paymentIntent=stripeObjectId(session.payment_intent);
    if(payment.purchase_type==="email_credits"){
      const workspace=(await client.query("SELECT user_id FROM aurelink_communications_workspaces WHERE id=$1 FOR UPDATE",[payment.workspace_id])).rows[0];
      if(!workspace)throw new Error("Aurelink Mail workspace no longer exists.");
      await client.query("INSERT INTO aurelink_email_credit_wallets(workspace_id,user_id) VALUES($1,$2) ON CONFLICT(workspace_id) DO NOTHING",[payment.workspace_id,workspace.user_id]);
      const wallet=(await client.query("SELECT balance_emails FROM aurelink_email_credit_wallets WHERE workspace_id=$1 FOR UPDATE",[payment.workspace_id])).rows[0];
      const credits=BigInt(String(payment.email_credits));
      const next=BigInt(String(wallet.balance_emails))+credits;
      await client.query("UPDATE aurelink_email_credit_wallets SET balance_emails=$2,updated_at=NOW() WHERE workspace_id=$1",[payment.workspace_id,next.toString()]);
      await client.query(
        "INSERT INTO aurelink_email_credit_ledger(workspace_id,user_id,entry_type,direction,amount_emails,balance_after,reference,payment_reference,description,metadata) VALUES($1,$2,'purchase','credit',$3,$4,$5,$6,'Stripe purchase of Aurelink Mail prepaid email credits',$7::jsonb) ON CONFLICT(reference) DO NOTHING",
        [payment.workspace_id,payment.user_id,credits.toString(),next.toString(),"AL-EMAIL-CREDIT-PURCHASE-"+reference,reference,JSON.stringify({stripePaymentIntent:paymentIntent,checkoutSessionId:session.id})]
      );
    }else{
      const subscriptionId=stripeObjectId(session.subscription);
      if(!subscriptionId)throw new Error("Stripe did not return the subscription ID for Aurelink Mail.");
      const remote=await stripeRequest<StripeSubscription>("get","/subscriptions/"+encodeURIComponent(subscriptionId));
      const start=Number(remote.current_period_start),end=Number(remote.current_period_end);
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error("Stripe subscription billing period is unavailable.");
      const option=(await client.query("SELECT monthly_email_allowance FROM aurelink_email_plan_options WHERE id=$1 FOR SHARE",[payment.plan_option_id])).rows[0];
      if(!option)throw new Error("The purchased Aurelink Mail plan option no longer exists.");
      await client.query("UPDATE aurelink_email_subscriptions SET status='expired',cancelled_at=COALESCE(cancelled_at,NOW()),updated_at=NOW() WHERE workspace_id=$1 AND status IN ('active','past_due','pending_payment')",[payment.workspace_id]);
      await client.query(
        "INSERT INTO aurelink_email_subscriptions(user_id,workspace_id,plan_option_id,status,monthly_email_allowance,used_emails,reserved_emails,billing_period_start,billing_period_end,stripe_customer_id,stripe_subscription_id,payment_reference,activated_at) VALUES($1,$2,$3,'active',$4,0,0,to_timestamp($5),to_timestamp($6),$7,$8,$9,NOW())",
        [payment.user_id,payment.workspace_id,payment.plan_option_id,option.monthly_email_allowance,start,end,stripeObjectId(remote.customer)||stripeObjectId(session.customer),subscriptionId,reference]
      );
      await client.query("INSERT INTO aurelink_email_billing_accounts(workspace_id,user_id,billing_mode) VALUES($1,$2,'subscription') ON CONFLICT(workspace_id) DO UPDATE SET billing_mode='subscription',updated_at=NOW()",[payment.workspace_id,payment.user_id]);
      await client.query("UPDATE aurelink_email_billing_payments SET stripe_subscription_id=$2 WHERE reference=$1",[reference,subscriptionId]);
    }
    await client.query("UPDATE aurelink_email_billing_payments SET status='paid',stripe_payment_intent_id=$2,paid_at=NOW(),updated_at=NOW() WHERE reference=$1",[reference,paymentIntent]);
    await client.query("INSERT INTO aurelink_email_billing_audit(workspace_id,actor_user_id,action,details) VALUES($1,$2,'email_billing_payment_fulfilled',$3::jsonb)",[payment.workspace_id,payment.user_id,JSON.stringify({reference,purchaseType:payment.purchase_type,amountMinor:payment.amount_minor})]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
}

export async function cancelAurelinkEmailSubscription(userId:string,workspaceId:string):Promise<{subscriptionId:string;cancelAtPeriodEnd:boolean;periodEnd:Date}>{
  const row=(await pool.query(
    "SELECT s.id,s.stripe_subscription_id,s.billing_period_end FROM aurelink_email_subscriptions s WHERE s.workspace_id=$1 AND s.user_id=$2 AND s.status='active' AND s.cancel_at_period_end=FALSE ORDER BY s.created_at DESC LIMIT 1",
    [workspaceId,userId]
  )).rows[0];
  if(!row?.stripe_subscription_id)throw new Error("An active cancellable Aurelink Mail subscription was not found.");
  const remote=await stripeRequest<StripeSubscription>("post","/subscriptions/"+encodeURIComponent(String(row.stripe_subscription_id)),form({cancel_at_period_end:"true"}));
  if(remote.status!=="active"&&remote.status!=="trialing")throw new Error("Stripe did not confirm the subscription cancellation schedule.");
  await pool.query("UPDATE aurelink_email_subscriptions SET cancel_at_period_end=TRUE,cancelled_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='active'",[row.id]);
  return {subscriptionId:String(row.stripe_subscription_id),cancelAtPeriodEnd:true,periodEnd:new Date(row.billing_period_end)};
}

export async function verifyAurelinkEmailBillingCheckout(userId:string,reference:string):Promise<{status:string;purchaseType:string;creditsAdded?:string}>{
  const payment=(await pool.query("SELECT * FROM aurelink_email_billing_payments WHERE reference=$1 AND user_id=$2 LIMIT 1",[reference,userId])).rows[0];
  if(!payment)throw new Error("Aurelink Mail payment reference not found.");
  if(payment.status==="paid")return {status:"paid",purchaseType:String(payment.purchase_type),creditsAdded:payment.purchase_type==="email_credits"?String(payment.email_credits):undefined};
  if(!payment.stripe_checkout_session_id)return {status:String(payment.status),purchaseType:String(payment.purchase_type)};
  const session=await stripeRequest<StripeSession>("get","/checkout/sessions/"+encodeURIComponent(String(payment.stripe_checkout_session_id)));
  if(String(session.metadata?.reference||"")!==reference)throw new Error("Stripe checkout session does not match the Aurelink payment reference.");
  if(String(session.payment_status||"")==="paid")await fulfillAurelinkEmailBillingCheckout(session);
  const refreshed=(await pool.query("SELECT status FROM aurelink_email_billing_payments WHERE reference=$1 AND user_id=$2",[reference,userId])).rows[0];
  return {status:String(refreshed?.status||"pending"),purchaseType:String(payment.purchase_type),creditsAdded:payment.purchase_type==="email_credits"&&refreshed?.status==="paid"?String(payment.email_credits):undefined};
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
  if(String(row.purpose)==="aurelink_wallet_topup"){
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const topup=await client.query("SELECT * FROM aurelink_wallet_topups WHERE reference=$1 AND user_id=$2 FOR UPDATE",[reference,row.user_id]);
      if(!topup.rows[0])throw new Error("Aurelink wallet top-up record is missing.");
      if(!topup.rows[0].credited_at){
        await walletCredit(client,{userId:String(row.user_id),amountMinor:String(row.amount_minor),reference:"topup:"+reference,type:"topup",description:"Stripe wallet top-up",paymentReference:reference,metadata:{stripePaymentIntent:pi??session.id}});
        await client.query("UPDATE aurelink_wallet_topups SET credited_at=NOW() WHERE reference=$1",[reference]);
      }
      await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
  }
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
  let session:StripeSession|null=null;
  if(attempt.stripe_session_id){
    session=await stripeRequest<StripeSession>("get","/checkout/sessions/"+encodeURIComponent(String(attempt.stripe_session_id)));
  }else if(attempt.stripe_payment_intent_id){
    const pi=await stripeRequest<StripePaymentIntent>("get","/payment_intents/"+encodeURIComponent(String(attempt.stripe_payment_intent_id)));
    session={
      id:String(attempt.stripe_payment_intent_id),
      amount_total:Number(pi.amount),
      currency:String(pi.currency),
      payment_intent:String(pi.id),
      payment_method_types:["card"],
      metadata:pi.metadata,
      payment_status:pi.status==="succeeded"?"paid":"unpaid",
    };
  }

  if(session&&String(session.payment_status)==="paid"){
    await fulfillStripeStarsAttempt(session);
    return verifyStripeStarsCheckout(userId,reference);
  }

  if(session&&String(session.status)==="expired"){
    await markStripeAbandoned(reference);
  }

  const latest=await pool.query("SELECT status,failure_message,stripe_payment_intent_id,attempt_number FROM stripe_stars_checkout_attempts WHERE reference=$1 LIMIT 1",[reference]);
  const row=latest.rows[0];
  const status=String(row?.status??"open");
  return {
    transactionId:null,
    redomTransactionId:null,
    reference:String(reference),
    status:status==="completed"?"paid":status==="failed_final"?"failed":status==="failed"?"failed":status==="abandoned"?"abandoned":status==="requires_action"?"processing":"processing",
    amountMinor:String(attempt.amount_minor),
    currency:String(attempt.currency),
    purpose:"stars_purchase",
    refundStatus:null,
    finalFailure:status==="failed_final",
    retryAvailable:status==="failed",
    attemptNumber:Number(row?.attempt_number??attempt.attempt_number),
    failureReason:row?.failure_message?String(row.failure_message):null,
    stripeCheckoutSessionId:attempt.stripe_session_id?String(attempt.stripe_session_id):undefined,
    stripePaymentIntentId:row?.stripe_payment_intent_id?String(row.stripe_payment_intent_id):undefined,
    paymentMethodTypes:["card"],
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

async function reconcileAurelinkEmailStripeEvent(type:string,object:any):Promise<void>{
  if(type==="invoice.paid"||type==="invoice.payment_failed"){
    const subscriptionId=stripeObjectId(object?.subscription);
    if(!subscriptionId)return;
    if(type==="invoice.payment_failed"){
      await pool.query("UPDATE aurelink_email_subscriptions SET status='past_due',updated_at=NOW() WHERE stripe_subscription_id=$1 AND status='active'",[subscriptionId]);
      return;
    }
    const period=object?.lines?.data?.[0]?.period||{};
    const start=Number(period.start??object?.period_start),end=Number(period.end??object?.period_end);
    if(Number.isFinite(start)&&Number.isFinite(end)&&end>start){
      await pool.query(
        "UPDATE aurelink_email_subscriptions SET status='active',used_emails=CASE WHEN billing_period_start<to_timestamp($2) THEN 0 ELSE used_emails END,billing_period_start=to_timestamp($2),billing_period_end=to_timestamp($3),updated_at=NOW() WHERE stripe_subscription_id=$1",
        [subscriptionId,start,end]
      );
    }else{
      await pool.query("UPDATE aurelink_email_subscriptions SET status='active',updated_at=NOW() WHERE stripe_subscription_id=$1",[subscriptionId]);
    }
    return;
  }
  if(type==="customer.subscription.deleted"||type==="customer.subscription.updated"){
    const subscriptionId=String(object?.id||"");
    if(!subscriptionId)return;
    const status=type==="customer.subscription.deleted"?"expired":
      ["active","trialing"].includes(String(object?.status))?"active":
      ["past_due","unpaid","paused"].includes(String(object?.status))?"past_due":
      ["canceled","incomplete_expired"].includes(String(object?.status))?"expired":null;
    if(!status)return;
    const start=Number(object?.current_period_start),end=Number(object?.current_period_end);
    if(Number.isFinite(start)&&Number.isFinite(end)&&end>start){
      await pool.query(
        "UPDATE aurelink_email_subscriptions SET status=$2,billing_period_start=to_timestamp($3),billing_period_end=to_timestamp($4),updated_at=NOW() WHERE stripe_subscription_id=$1",
        [subscriptionId,status,start,end]
      );
    }else{
      await pool.query("UPDATE aurelink_email_subscriptions SET status=$2,updated_at=NOW() WHERE stripe_subscription_id=$1",[subscriptionId,status]);
    }
  }
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
      const purpose=String(object?.metadata?.purpose??"");
      if(purpose==="aurelink_email_subscription"||purpose==="aurelink_email_credits"){
        await fulfillAurelinkEmailBillingCheckout(object as StripeSession);
      }else if(purpose==="stars_trial_setup"){
        const reference=String(object?.metadata?.reference??"");
        if(reference) await finalizeStarsTrialSetup(reference);
      }else if(purpose==="redom_saved_card_expo_fallback"){
        const userId=String(object?.metadata?.reDomUserId??"");
        if(userId && String(object?.status??"") === "complete" && object?.setup_intent){
          await finalizeStripeCardSetupCheckout(userId,String(object.id));
        }
      }else{
        await fulfillStripeStarsAttempt(object as StripeSession).catch(async(error)=>{
          const attempt=await pool.query("SELECT 1 FROM stripe_stars_checkout_attempts WHERE reference=$1 LIMIT 1",[String(object?.metadata?.reference??"")]);
          if(attempt.rows[0])throw error;
          await markLegacyStripePaid(object as StripeSession);
        });
      }
    }else if(type==="setup_intent.succeeded"){
      const userId=String(object?.metadata?.reDomUserId??"");
      const setupIntentId=String(object?.id??"");
      if(userId && setupIntentId) await finalizeStripeCardSetup(userId,setupIntentId);
    }else if(type==="checkout.session.async_payment_failed"){
      const reference=String(object?.metadata?.reference??"");
      if(String(object?.metadata?.purpose||"").startsWith("aurelink_email_")&&reference)await pool.query("UPDATE aurelink_email_billing_payments SET status='failed',updated_at=NOW() WHERE reference=$1 AND status='pending'",[reference]);
      else if(reference)await markStripeFailed(reference,"Stripe reported that the payment could not be completed.","failed",paymentIntentId(object as StripeSession),object as StripeSession);
    }else if(type==="checkout.session.expired"){
      const reference=String(object?.metadata?.reference??"");
      if(reference){
        if(String(object?.metadata?.purpose??"")==="stars_trial_setup") await markStarsTrialSetupAbandoned(reference);
        else if(String(object?.metadata?.purpose||"").startsWith("aurelink_email_")) await pool.query("UPDATE aurelink_email_billing_payments SET status='cancelled',updated_at=NOW() WHERE reference=$1 AND status='pending'",[reference]);
        else await markStripeAbandoned(reference);
      }
    }else if(["invoice.paid","invoice.payment_failed","customer.subscription.deleted","customer.subscription.updated"].includes(type)){
      await reconcileAurelinkEmailStripeEvent(type,object);
    }else if(type==="payment_intent.payment_failed"){
      const reference=String(object?.metadata?.reference??"");
      const message=String(object?.last_payment_error?.message??"Stripe payment failed.");
      if(reference)await markStripeFailed(reference,message,"failed",String(object?.id??"")||null);
    }else if(type==="payment_intent.succeeded"){
      const reference=String(object?.metadata?.reference??"");
      if(reference){
        const attempt=await pool.query("SELECT * FROM stripe_stars_checkout_attempts WHERE reference=$1 LIMIT 1",[reference]);
        if(attempt.rows[0]){
          if(attempt.rows[0].stripe_session_id){
            const session=await stripeRequest<StripeSession>("get","/checkout/sessions/"+encodeURIComponent(String(attempt.rows[0].stripe_session_id)));
            await fulfillStripeStarsAttempt(session);
          }else{
            const session:StripeSession={
              id:String(object.id??""),
              amount_total:Number(object.amount??attempt.rows[0].amount_minor),
              currency:String(object.currency??attempt.rows[0].currency),
              payment_intent:String(object.id??""),
              payment_method_types:["card"],
              metadata:object.metadata??{},
              payment_status:"paid",
            };
            await fulfillStripeStarsAttempt(session);
          }
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
        if(String(session.metadata?.purpose??"")==="stars_trial_setup"){
          // Do not finalize here. The app must return immediately and enter
          // Processing payment while the authenticated verification endpoint
          // completes the authoritative trial setup.
        }else if(String(session.metadata?.purpose||"").startsWith("aurelink_email_")&&String(session.payment_status)==="paid"){
          await fulfillAurelinkEmailBillingCheckout(session);
        }else if(String(session.metadata?.purpose||"").startsWith("aurelink_email_")&&status==="cancelled"){
          await pool.query("UPDATE aurelink_email_billing_payments SET status='cancelled',updated_at=NOW() WHERE reference=$1 AND status='pending'",[reference]);
        }else if(String(session.payment_status)==="paid"){
          const attempt=await pool.query("SELECT 1 FROM stripe_stars_checkout_attempts WHERE reference=$1 LIMIT 1",[reference]);
          if(!attempt.rows[0])await markLegacyStripePaid(session);
        }else if(status==="cancelled"||String(session.status)==="expired"){
          if(String(session.metadata?.purpose??"")==="stars_trial_setup") await markStarsTrialSetupAbandoned(reference);
          else await markStripeAbandoned(reference);
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

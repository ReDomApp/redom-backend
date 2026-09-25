import axios from "axios";
import crypto from "node:crypto";
import { env } from "../../config/env";
import { applyStarsRefundWebhook } from "../refund/refund.service";
import { pool } from "../../database/db";
import { sendPaymentConfirmationEmail } from "./paymentEmail.service";

const API = "https://api.paystack.co";
const STANDARD_NGN = 4500;

type PaystackResponse<T> = { status: boolean; message: string; data: T };
type InitializeData = { authorization_url: string; access_code: string; reference: string };
type VerifyData = { id: number; status: string; reference: string; amount: number; requested_amount?: number | null; currency: string; paid_at?: string | null; metadata?: unknown; channel?: string | null; message?: string | null; gateway_response?: string | null; authorization?: any; customer?: { email?: string }; plan?: any };
type RefundData = { id?: number; status?: string; amount?: number; currency?: string; expected_at?: string | null; refunded_at?: string | null; transaction?: { id?: number; reference?: string }; message?: string };
type PaymentContext = { transactionId: string; redomTransactionId?: string | null; reference: string; status: string; amountMinor: string; currency: string; purpose: string; paymentMethodSaved?: boolean; refundStatus?: string | null };

async function saveReusableAuthorization(transactionId: string, verified: VerifyData, userId: string, currency: string, customerEmail: string | null): Promise<boolean> {
  if (!verified.authorization?.reusable || !verified.authorization?.authorization_code || !verified.authorization?.signature || !customerEmail) return false;
  try {
    const authorizationCode = String(verified.authorization.authorization_code);
    const signature = String(verified.authorization.signature);
    await pool.query(
      `INSERT INTO redom_payment_methods(user_id,provider,authorization_code_encrypted,authorization_signature,customer_email,brand,card_type,last4,exp_month,exp_year,bank,country_code,currency,reusable)
       VALUES($1,'paystack',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
       ON CONFLICT DO UPDATE SET active=true,reusable=true,updated_at=now()`,
      [userId, encryptAuthorizationCode(authorizationCode), signature, customerEmail, verified.authorization.brand ?? null, verified.authorization.card_type ?? null, verified.authorization.last4 ?? null, verified.authorization.exp_month ? Number(verified.authorization.exp_month) : null, verified.authorization.exp_year ? Number(verified.authorization.exp_year) : null, verified.authorization.bank ?? null, verified.authorization.country_code ?? null, currency],
    );
    return true;
  } catch {
    return false;
  }
}

async function requestAutomaticRefund(reference: string, verified: VerifyData, transactionId: string, force = false): Promise<boolean> {
  // Automatic refunds are reserved for explicitly requested setup flows.
  // Never refund a normal Stars purchase merely because local fulfillment fails.
  if (!force || verified.status !== "success" || !verified.id || verified.amount <= 0) return false;
  try {
    const refund = await paystack<RefundData>("post", "/refund", {
      transaction: String(verified.id),
      amount: verified.amount,
      currency: verified.currency,
      customer_note: "Automatic refund for a payment that did not complete.",
      merchant_note: "Automatic ReDom refund for failed transaction " + reference,
    });
    await pool.query(
      "UPDATE payment_transactions SET refund_status=$1, refund_id=$2, refund_amount_minor=$3, refund_requested_at=now(), refund_expected_at=$4, refund_processed_at=$5, refund_error=NULL, updated_at=now() WHERE id=$6",
      [refund.status || "pending", refund.id ? String(refund.id) : null, refund.amount != null ? String(refund.amount) : String(verified.amount), refund.expected_at ? new Date(refund.expected_at) : null, refund.refunded_at ? new Date(refund.refunded_at) : null, transactionId],
    );
    const tx = await pool.query("SELECT user_id, currency, customer_email FROM payment_transactions WHERE id=$1 LIMIT 1", [transactionId]);
    const saved = tx.rows[0] ? await saveReusableAuthorization(transactionId, verified, String(tx.rows[0].user_id), String(tx.rows[0].currency || verified.currency), tx.rows[0].customer_email ? String(tx.rows[0].customer_email) : (verified.customer?.email ? String(verified.customer.email) : null)) : false;
    return saved;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query("UPDATE payment_transactions SET refund_status='failed', refund_requested_at=now(), refund_error=$1, updated_at=now() WHERE id=$2", [message.slice(0, 500), transactionId]);
    return false;
  }
}

async function sendPaymentEmailIfNeeded(transactionId: string): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT pt.id, pt.redom_transaction_id, pt.reference, pt.amount_minor, pt.currency, pt.status, pt.paid_at, pt.metadata, pt.customer_email, pt.customer_email_status, pt.refund_status, pt.refund_id, pt.refund_expected_at, pt.refund_processed_at, pt.refund_error, u.email, u.first_name, u.last_name, pp.name AS plan_name, pp.interval, vs.expires_at FROM payment_transactions pt JOIN users u ON u.id = pt.user_id LEFT JOIN payment_plans pp ON pp.id = pt.plan_id LEFT JOIN verification_subscriptions vs ON vs.id = pt.subscription_id WHERE pt.id = $1 LIMIT 1", [transactionId]);
    const row = result.rows[0];
    const terminalStatuses = new Set(["paid", "failed", "abandoned", "reversed"]);
    if (!terminalStatuses.has(String(row?.status))) return;
    if (!(row?.customer_email || row?.email) || row.customer_email_status === "sent" || row.customer_email_status === "sending") return;
    const claimed = await client.query("UPDATE payment_transactions SET customer_email_status='sending', customer_email_error=NULL, updated_at=now() WHERE id=$1 AND customer_email_status IN ('pending','failed') RETURNING id", [transactionId]);
    if (!claimed.rows[0]) return;
    try {
      const paidAt = row.paid_at ? new Date(row.paid_at) : new Date();
      let emailMetadata: any = {};
      try { emailMetadata = row.metadata ? (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata) : {}; } catch { emailMetadata = {}; }
      await sendPaymentConfirmationEmail({
        to: String(row.customer_email || row.email),
        firstName: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || null,
        planName: row.plan_name ? String(row.plan_name) : (() => { try { const m = row.metadata ? (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata) : {}; return m?.purpose === "stars_purchase" ? `ReDom Stars • ${Number(m?.stars ?? 0)} Stars` : "ReDom subscription"; } catch { return "ReDom payment"; } })(),
        amountMinor: String(row.amount_minor),
        currency: String(row.currency),
        interval: row.interval ? String(row.interval) : "monthly",
        reference: String(row.reference),
        redomTransactionId: row.redom_transaction_id ? String(row.redom_transaction_id) : null,
        paidAt,
        details: emailMetadata?.paymentDetails ?? undefined,
        nextBillingAt: row.expires_at ? new Date(row.expires_at) : null,
        outcome: String(row.status) === "paid" ? "paid" : "failed",
        refund: row.refund_status ? { status: String(row.refund_status), id: row.refund_id ? String(row.refund_id) : null, expectedAt: row.refund_expected_at ? new Date(row.refund_expected_at) : null, processedAt: row.refund_processed_at ? new Date(row.refund_processed_at) : null, error: row.refund_error ? String(row.refund_error) : null } : null,
      });
      await client.query("UPDATE payment_transactions SET customer_email_status='sent', customer_email_sent_at=now(), customer_email_error=NULL, updated_at=now() WHERE id=$1", [transactionId]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await client.query("UPDATE payment_transactions SET customer_email_status='failed', customer_email_error=$1, updated_at=now() WHERE id=$2", [message.slice(0, 500), transactionId]);
    }
  } finally {
    client.release();
  }
}

function encryptAuthorizationCode(value: string): string {
  const key = crypto.createHash("sha256").update(env.authentication.sessionSecret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function makeReference(): string { return "rd_" + Date.now() + "_" + crypto.randomBytes(6).toString("hex"); }

function makeRedomTransactionId(): string {
  const max = 10_000_000_000_000n;
  const value = BigInt("0x" + crypto.randomBytes(7).toString("hex")) % max;
  return "R-" + value.toString().padStart(13, "0");
}

async function createUniqueRedomTransactionId(client: import("pg").PoolClient): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = makeRedomTransactionId();
    const existing = await client.query("SELECT 1 FROM payment_transactions WHERE redom_transaction_id = $1 LIMIT 1", [id]);
    if (!existing.rows[0]) return id;
  }
  throw new Error("Unable to generate a unique ReDom transaction ID.");
}
function minorAmount(subscriptionType: string, currency: string): number {
  if (currency === "NGN" && subscriptionType === "standard") return STANDARD_NGN * 100;
  throw new Error("This subscription is not currently available for online renewal.");
}

async function paystack<T>(method: "get" | "post", path: string, data?: unknown): Promise<T> {
  const response = await axios.request<PaystackResponse<T>>({
    method, url: API + path, data,
    headers: { Authorization: "Bearer " + env.payments.paystack.secretKey, "Content-Type": "application/json", "Cache-Control": "no-cache" },
    timeout: 20000,
  });
  if (!response.data?.status) throw new Error(response.data?.message || "Payment request failed.");
  return response.data.data;
}

async function ensurePlan(client: import("pg").PoolClient, planKey: string, name: string, amountMinor: number, currency: string): Promise<{ id: string; code: string }> {
  const existing = await client.query("SELECT id, external_plan_code FROM payment_plans WHERE plan_key = $1 AND active = true LIMIT 1", [planKey]);
  if (existing.rows[0]?.external_plan_code) return { id: String(existing.rows[0].id), code: String(existing.rows[0].external_plan_code) };
  if (existing.rows[0]) {
    const plan = await paystack<{ plan_code: string }>("post", "/plan", { name, amount: amountMinor, interval: "monthly", currency, send_invoices: true, send_sms: false });
    await client.query("UPDATE payment_plans SET external_plan_code = $1, updated_at = now() WHERE id = $2", [plan.plan_code, existing.rows[0].id]);
    return { id: String(existing.rows[0].id), code: plan.plan_code };
  }
  const inserted = await client.query(
    "INSERT INTO payment_plans (plan_key, name, amount_minor, currency, interval) VALUES ($1,$2,$3,$4,'monthly') RETURNING id",
    [planKey, name, amountMinor, currency],
  );
  const plan = await paystack<{ plan_code: string }>("post", "/plan", { name, amount: amountMinor, interval: "monthly", currency, send_invoices: true, send_sms: false });
  await client.query("UPDATE payment_plans SET external_plan_code = $1, updated_at = now() WHERE id = $2", [plan.plan_code, inserted.rows[0].id]);
  return { id: String(inserted.rows[0].id), code: plan.plan_code };
}

export async function initializeSubscriptionRenewal(userId: string, subscriptionId: string): Promise<{ authorizationUrl: string; reference: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sub = await client.query(
      "SELECT vs.id, vs.subscription_type, vs.subscription_status, u.email, u.first_name, u.last_name FROM verification_subscriptions vs JOIN users u ON u.id = vs.user_id WHERE vs.id = $1 AND vs.user_id = $2 LIMIT 1",
      [subscriptionId, userId],
    );
    if (!sub.rows[0]) throw new Error("Subscription not found.");
    if (!sub.rows[0].email) throw new Error("A verified email address is required before payment.");
    const currency = "NGN";
    const amount = minorAmount(String(sub.rows[0].subscription_type), currency);
    const plan = await ensurePlan(client, "verification_" + String(sub.rows[0].subscription_type) + "_" + currency, "ReDom " + String(sub.rows[0].subscription_type) + " monthly", amount, currency);
    const ref = makeReference();
    const checkout = await paystack<InitializeData>("post", "/transaction/initialize", {
      email: String(sub.rows[0].email),
      amount: String(amount),
      currency,
      plan: plan.code,
      reference: ref,
      callback_url: "https://redom-backend.onrender.com/redom-backend/payments/callback",
      metadata: JSON.stringify({ user_id: userId, subscription_id: subscriptionId, purpose: "subscription_renewal" }),
    });
    await client.query(
      "INSERT INTO payment_transactions (user_id, subscription_id, plan_id, reference, amount_minor, currency, purpose, status, checkout_url, access_code, metadata) VALUES ($1,$2,$3,$4,$5,$6,'subscription_renewal','initialized',$7,$8,$9::jsonb)",
      [userId, subscriptionId, plan.id, checkout.reference, amount, currency, checkout.authorization_url, checkout.access_code, JSON.stringify({ subscriptionId, purpose: "subscription_renewal" })],
    );
    await client.query("UPDATE verification_subscriptions SET payment_reference = $1, updated_at = now() WHERE id = $2", [checkout.reference, subscriptionId]);
    await client.query("COMMIT");
    return { authorizationUrl: checkout.authorization_url, reference: checkout.reference };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function applyVerifiedPayment(referenceValue: string, verified: VerifyData): Promise<PaymentContext> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tx = await client.query("SELECT * FROM payment_transactions WHERE reference = $1 FOR UPDATE", [referenceValue]);
    if (!tx.rows[0]) throw new Error("Payment transaction not found.");
    const row = tx.rows[0];
    // Paystack bank-transfer payments can include a customer-paid transfer
    // fee in data.amount. Paystack exposes the merchant/product amount as
    // requested_amount. Validate against that amount, while preserving the
    // gross provider amount for audit.
    const providerRequestedAmount = verified.requested_amount ?? verified.amount;
    if (String(row.amount_minor) !== String(providerRequestedAmount) || String(row.currency) !== String(verified.currency)) {
      throw new Error("Payment amount or currency did not match the authorized transaction.");
    }
    if (verified.status !== "success") {
      await client.query("UPDATE payment_transactions SET status = $1, gateway_status = $2, failure_message = $3, updated_at = now() WHERE id = $4", [verified.status, verified.status, (verified.message || verified.gateway_response || "Payment did not complete.").slice(0, 500), row.id]);
      await client.query("COMMIT");
      return { transactionId: String(row.id), redomTransactionId: row.redom_transaction_id ? String(row.redom_transaction_id) : null, reference: referenceValue, status: verified.status, amountMinor: String(row.amount_minor), currency: String(row.currency), purpose: String(row.purpose) };
    }
    if (row.status === "paid") {
      await client.query("COMMIT");
      return { transactionId: String(row.id), redomTransactionId: row.redom_transaction_id ? String(row.redom_transaction_id) : null, reference: referenceValue, status: "paid", amountMinor: String(row.amount_minor), currency: String(row.currency), purpose: String(row.purpose) };
    }
    const paymentDetails = {
      providerReference: String(verified.reference),
      channel: verified.channel ?? verified.authorization?.channel ?? null,
      type: verified.authorization?.card_type || verified.authorization?.brand || null,
      providerAmountMinor: verified.amount,
      requestedAmountMinor: providerRequestedAmount,
      bank: verified.authorization?.bank || verified.authorization?.sender_bank || null,
      account: verified.authorization?.sender_bank_account_number || (verified.authorization?.last4 ? "••••" + String(verified.authorization.last4) : null),
      countryCode: verified.authorization?.country_code ?? null,
    };
    let metadata: any = {};
    try { metadata = row.metadata ? (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata) : {}; } catch { metadata = {}; }
    metadata.paymentDetails = paymentDetails;
    const redomTransactionId = row.redom_transaction_id ? String(row.redom_transaction_id) : await createUniqueRedomTransactionId(client);
    metadata.redomTransactionId = redomTransactionId;
    await client.query("UPDATE payment_transactions SET status='paid', external_transaction_id=$1, gateway_status=$2, paid_at=$3, metadata=$4::jsonb, redom_transaction_id=$5, updated_at=now() WHERE id=$6", [String(verified.id), verified.status, verified.paid_at ? new Date(verified.paid_at) : new Date(), JSON.stringify(metadata), redomTransactionId, row.id]);
    if (String(row.purpose) !== "payment_method_setup") {
      await saveReusableAuthorization(String(row.id), verified, String(row.user_id), String(row.currency), row.customer_email ? String(row.customer_email) : (verified.customer?.email ? String(verified.customer.email) : null));
    }
    if (String(row.purpose) === "stars_purchase") {
      const stars = Number(metadata?.stars ?? 0);
      const packageKey = metadata?.packageKey ? String(metadata.packageKey) : null;
      const countryCode = metadata?.countryCode ? String(metadata.countryCode) : row.country_code ? String(row.country_code) : null;
      if (!Number.isInteger(stars) || stars <= 0) throw new Error("Invalid Stars fulfillment metadata.");
      await client.query("INSERT INTO redom_stars_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING", [row.user_id]);
      const balance = await client.query("SELECT balance FROM redom_stars_accounts WHERE user_id=$1 FOR UPDATE", [row.user_id]);
      const currentBalance = BigInt(String(balance.rows[0]?.balance ?? "0"));
      const nextBalance = currentBalance + BigInt(stars);
      await client.query("UPDATE redom_stars_accounts SET balance=$1, updated_at=now() WHERE user_id=$2", [nextBalance.toString(), row.user_id]);
      const duplicate = await client.query("SELECT 1 FROM redom_stars_transactions WHERE payment_transaction_id=$1 AND type='purchase' LIMIT 1", [row.id]);
      if (!duplicate.rows[0]) {
        await client.query(
          "INSERT INTO redom_stars_transactions(user_id,payment_transaction_id,type,stars,balance_after,package_key,country_code,currency,amount_minor,reference) VALUES($1,$2,'purchase',$3,$4,$5,$6,$7,$8,$9)",
          [row.user_id, row.id, stars, nextBalance.toString(), packageKey, countryCode, row.currency, row.amount_minor, referenceValue],
        );
      }
    }
    if (row.subscription_id) {
      await client.query(
        "UPDATE verification_subscriptions SET subscription_status='active', auto_renew=true, started_at=COALESCE(started_at, now()), renewed_at=now(), expires_at=CASE WHEN expires_at IS NULL OR expires_at < now() THEN now() + interval '1 month' ELSE expires_at + interval '1 month' END, payment_reference=$1, updated_at=now() WHERE id=$2",
        [referenceValue, row.subscription_id],
      );
    }
    await client.query("COMMIT");
    return { transactionId: String(row.id), reference: referenceValue, status: "paid", amountMinor: String(row.amount_minor), currency: String(row.currency), purpose: String(row.purpose) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function verifyWithProvider(referenceValue: string): Promise<VerifyData> {
  return paystack<VerifyData>("get", "/transaction/verify/" + encodeURIComponent(referenceValue));
}

export async function sendPaymentEmailForReference(referenceValue: string): Promise<void> {
  const result = await pool.query("SELECT id FROM payment_transactions WHERE reference = $1 LIMIT 1", [referenceValue]);
  if (result.rows[0]?.id) await sendPaymentEmailIfNeeded(String(result.rows[0].id));
}

export async function recordPaymentFailureAndEmail(referenceValue: string, message: string): Promise<void> {
  const result = await pool.query(
    "UPDATE payment_transactions SET status='failed', gateway_status=COALESCE(gateway_status,'failed'), failure_message=$1, updated_at=now() WHERE reference=$2 RETURNING id",
    [message.slice(0, 500), referenceValue],
  );
  if (result.rows[0]?.id) await sendPaymentEmailIfNeeded(String(result.rows[0].id));
}

async function recordProviderSuccessReconciliationRequired(referenceValue: string, message: string): Promise<void> {
  await pool.query(
    "UPDATE payment_transactions SET status='pending', gateway_status='success', failure_message=$1, updated_at=now() WHERE reference=$2 AND status <> 'paid'",
    [message.slice(0, 500), referenceValue],
  );
}

export async function verifyPayment(userId: string, referenceValue: string): Promise<PaymentContext> {
  const tx = await pool.query("SELECT user_id, id FROM payment_transactions WHERE reference = $1", [referenceValue]);
  if (!tx.rows[0] || String(tx.rows[0].user_id) !== userId) throw new Error("Payment transaction not found.");
  const verified = await verifyWithProvider(referenceValue);
  try {
    const payment = await applyVerifiedPayment(referenceValue, verified);
    if (payment.purpose === "payment_method_setup" && payment.status === "paid") {
      const saved = await requestAutomaticRefund(referenceValue, verified, payment.transactionId, true);
      const refund = await pool.query("SELECT refund_status FROM payment_transactions WHERE id=$1 LIMIT 1", [payment.transactionId]);
      payment.paymentMethodSaved = saved;
      payment.refundStatus = refund.rows[0]?.refund_status ? String(refund.rows[0].refund_status) : null;
    }
    await sendPaymentEmailIfNeeded(payment.transactionId);
    return payment;
  } catch (error) {
    // A successful provider charge remains available for reconciliation.
    // Never auto-refund it because local verification/fulfillment failed.
    if (verified.status === "success") {
      await recordProviderSuccessReconciliationRequired(
        referenceValue,
        error instanceof Error ? error.message : "Paystack marked this payment successful; ReDom is retrying fulfillment.",
      );
    } else {
      await recordPaymentFailureAndEmail(referenceValue, error instanceof Error ? error.message : "Payment verification failed.");
    }
    throw error;
  }
}

export async function verifyPaymentFromCallback(referenceValue: string): Promise<PaymentContext> {
  const verified = await verifyWithProvider(referenceValue);
  const tx = await pool.query("SELECT id FROM payment_transactions WHERE reference=$1 LIMIT 1", [referenceValue]);
  try {
    const payment = await applyVerifiedPayment(referenceValue, verified);
    if ((payment.status !== "paid" || payment.purpose === "payment_method_setup") && tx.rows[0]?.id) {
      const saved = await requestAutomaticRefund(referenceValue, verified, String(tx.rows[0].id), payment.purpose === "payment_method_setup");
      if (payment.purpose === "payment_method_setup") {
        payment.paymentMethodSaved = saved;
        const refund = await pool.query("SELECT refund_status FROM payment_transactions WHERE id=$1 LIMIT 1", [String(tx.rows[0].id)]);
        payment.refundStatus = refund.rows[0]?.refund_status ? String(refund.rows[0].refund_status) : null;
      }
    }
    if (tx.rows[0]?.id) await sendPaymentEmailIfNeeded(String(tx.rows[0].id));
    return payment;
  } catch (error) {
    if (verified.status === "success") {
      await recordProviderSuccessReconciliationRequired(
        referenceValue,
        error instanceof Error ? error.message : "Paystack marked this payment successful; ReDom is retrying fulfillment.",
      );
    } else {
      await recordPaymentFailureAndEmail(referenceValue, error instanceof Error ? error.message : "Payment verification failed.");
    }
    throw error;
  }
}

export async function handlePaymentWebhook(rawBody: Buffer, signature: string | undefined, payload: any): Promise<void> {
  const expected = crypto.createHmac("sha512", env.payments.paystack.secretKey).update(rawBody).digest("hex");
  const supplied = signature ?? "";
  if (!supplied || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) throw new Error("Invalid payment webhook signature.");
  const event = String(payload?.event ?? "");
  const data = payload?.data ?? {};
  const eventKey = event + ":" + String(data.id ?? data.reference ?? data.subscription_code ?? crypto.createHash("sha256").update(rawBody).digest("hex"));
  const inserted = await pool.query(
    "INSERT INTO payment_webhook_events (event_key,event_type,reference,payload) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (event_key) DO NOTHING RETURNING id",
    [eventKey, event, data.reference ? String(data.reference) : null, JSON.stringify(payload)],
  );
  if (!inserted.rows[0]) return;
  try {
    if (event.startsWith("refund.") && data.transaction_reference) { await applyStarsRefundWebhook(event, data); }
    if (event === "charge.success" && data.reference) {
      const verified = await verifyWithProvider(String(data.reference));
      const tx = await pool.query("SELECT id, purpose FROM payment_transactions WHERE reference=$1 LIMIT 1", [String(data.reference)]);
      try {
        const payment = await applyVerifiedPayment(String(data.reference), verified);
        if (payment.purpose === "payment_method_setup" && tx.rows[0]?.id) {
          await requestAutomaticRefund(String(data.reference), verified, String(tx.rows[0].id), true);
        }
        if (tx.rows[0]?.id) await sendPaymentEmailIfNeeded(String(tx.rows[0].id));
      } catch (error) {
        // Paystack will retry charge.success after a non-2xx response.
        // Do not refund successful Stars payments during local failures.
        throw error;
      }
    }
    if (event === "subscription.create" && data.subscription_code) {
      const email = data.customer?.email ? String(data.customer.email).toLowerCase() : null;
      const planCode = data.plan?.plan_code ? String(data.plan.plan_code) : data.plan?.code ? String(data.plan.code) : null;
      if (email) {
        await pool.query(
          "INSERT INTO payment_subscriptions (user_id, verification_subscription_id, plan_id, external_subscription_code, external_customer_code, external_email_token, status) SELECT u.id, tx.subscription_id, pp.id, $1, $2, $3, 'active' FROM users u LEFT JOIN LATERAL (SELECT subscription_id, plan_id FROM payment_transactions WHERE user_id=u.id AND status='paid' ORDER BY created_at DESC LIMIT 1) tx ON true LEFT JOIN payment_plans pp ON pp.external_plan_code=$4 WHERE lower(u.email)=lower($5) ON CONFLICT (external_subscription_code) DO UPDATE SET status='active', updated_at=now()",
          [String(data.subscription_code), data.customer?.customer_code ? String(data.customer.customer_code) : null, data.email_token ? String(data.email_token) : null, planCode, email],
        );
      }
    }
    if (event === "subscription.disable" && data.subscription_code) {
      await pool.query("UPDATE payment_subscriptions SET status='disabled', disabled_at=now(), updated_at=now() WHERE external_subscription_code=$1", [String(data.subscription_code)]);
      await pool.query("UPDATE verification_subscriptions vs SET subscription_status='expired', auto_renew=false, updated_at=now() FROM payment_subscriptions ps WHERE ps.verification_subscription_id=vs.id AND ps.external_subscription_code=$1", [String(data.subscription_code)]);
    }
    await pool.query("UPDATE payment_webhook_events SET processed=true, processed_at=now() WHERE event_key=$1", [eventKey]);
  } catch (error) {
    await pool.query("UPDATE payment_webhook_events SET processing_error=$1 WHERE event_key=$2", [error instanceof Error ? error.message : String(error), eventKey]);
    throw error;
  }
}

export function getPublicPaymentKey(): string { return env.payments.paystack.publicKey; }

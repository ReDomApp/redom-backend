import axios from "axios";
import crypto from "node:crypto";
import { env } from "../../config/env";
import { pool } from "../../database/db";
import { sendPaymentConfirmationEmail } from "./paymentEmail.service";

const API = "https://api.paystack.co";
const STANDARD_NGN = 4500;

type PaystackResponse<T> = { status: boolean; message: string; data: T };
type InitializeData = { authorization_url: string; access_code: string; reference: string };
type VerifyData = { id: number; status: string; reference: string; amount: number; currency: string; paid_at?: string | null; metadata?: unknown; customer?: { email?: string }; plan?: any };
type PaymentContext = { transactionId: string; reference: string; status: string; amountMinor: string; currency: string; purpose: string };

async function sendPaymentEmailIfNeeded(transactionId: string): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT pt.id, pt.reference, pt.amount_minor, pt.currency, pt.paid_at, pt.customer_email_status, u.email, u.first_name, pp.name AS plan_name, pp.interval, vs.expires_at FROM payment_transactions pt JOIN users u ON u.id = pt.user_id LEFT JOIN payment_plans pp ON pp.id = pt.plan_id LEFT JOIN verification_subscriptions vs ON vs.id = pt.subscription_id WHERE pt.id = $1 LIMIT 1", [transactionId]);
    const row = result.rows[0];
    if (!row?.email || row.customer_email_status === "sent" || row.customer_email_status === "sending") return;
    const claimed = await client.query("UPDATE payment_transactions SET customer_email_status='sending', customer_email_error=NULL, updated_at=now() WHERE id=$1 AND status='paid' AND customer_email_status IN ('pending','failed') RETURNING id", [transactionId]);
    if (!claimed.rows[0]) return;
    try {
      const paidAt = row.paid_at ? new Date(row.paid_at) : new Date();
      await sendPaymentConfirmationEmail({
        to: String(row.email),
        firstName: row.first_name ? String(row.first_name) : null,
        planName: row.plan_name ? String(row.plan_name) : "ReDom subscription",
        amountMinor: String(row.amount_minor),
        currency: String(row.currency),
        interval: row.interval ? String(row.interval) : "monthly",
        reference: String(row.reference),
        paidAt,
        nextBillingAt: row.expires_at ? new Date(row.expires_at) : null,
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

function makeReference(): string { return "rd_" + Date.now() + "_" + crypto.randomBytes(6).toString("hex"); }
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
    if (String(row.amount_minor) !== String(verified.amount) || String(row.currency) !== String(verified.currency)) {
      throw new Error("Payment amount or currency did not match the authorized transaction.");
    }
    if (verified.status !== "success") {
      await client.query("UPDATE payment_transactions SET status = $1, gateway_status = $2, updated_at = now() WHERE id = $3", [verified.status, verified.status, row.id]);
      await client.query("COMMIT");
      return { transactionId: String(row.id), reference: referenceValue, status: verified.status, amountMinor: String(row.amount_minor), currency: String(row.currency), purpose: String(row.purpose) };
    }
    if (row.status === "paid") {
      await client.query("COMMIT");
      return { transactionId: String(row.id), reference: referenceValue, status: "paid", amountMinor: String(row.amount_minor), currency: String(row.currency), purpose: String(row.purpose) };
    }
    await client.query("UPDATE payment_transactions SET status='paid', external_transaction_id=$1, gateway_status=$2, paid_at=$3, updated_at=now() WHERE id=$4", [String(verified.id), verified.status, verified.paid_at ? new Date(verified.paid_at) : new Date(), row.id]);
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

export async function verifyPayment(userId: string, referenceValue: string): Promise<PaymentContext> {
  const tx = await pool.query("SELECT user_id FROM payment_transactions WHERE reference = $1", [referenceValue]);
  if (!tx.rows[0] || String(tx.rows[0].user_id) !== userId) throw new Error("Payment transaction not found.");
  const verified = await verifyWithProvider(referenceValue);
  return applyVerifiedPayment(referenceValue, verified);
}

export async function verifyPaymentFromCallback(referenceValue: string): Promise<PaymentContext> {
  const verified = await verifyWithProvider(referenceValue);
  return applyVerifiedPayment(referenceValue, verified);
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
    if (event === "charge.success" && data.reference) {
      const verified = await verifyWithProvider(String(data.reference));
      await applyVerifiedPayment(String(data.reference), verified);
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

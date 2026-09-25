import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../database/db";

const router = Router();

router.get("/overview", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });

  const orders = await pool.query(
    `SELECT mt.transaction_id, ml.title, mt.quantity, mt.total_price, mt.currency,
            mt.payment_status, mt.order_status, mt.tracking_number, mt.courier_name,
            mt.estimated_delivery_date, mt.created_at, mt.updated_at
       FROM marketplace_transactions mt
       JOIN marketplace_listings ml ON ml.id = mt.listing_id
       JOIN user_profiles up ON up.id = mt.buyer_user_id
      WHERE up.user_id = $1
      ORDER BY mt.created_at DESC
      LIMIT 100`,
    [userId],
  );

  const payments = await pool.query(
    `SELECT id, reference, redom_transaction_id, amount_minor, currency, purpose, status,
            created_at, paid_at, metadata
       FROM payment_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
    [userId],
  );

  const mappedOrders = orders.rows.map((row) => ({
    transactionId: String(row.transaction_id),
    title: String(row.title),
    quantity: Number(row.quantity),
    totalPrice: String(row.total_price),
    currency: String(row.currency),
    paymentStatus: String(row.payment_status),
    orderStatus: String(row.order_status),
    trackingNumber: row.tracking_number ? String(row.tracking_number) : null,
    courierName: row.courier_name ? String(row.courier_name) : null,
    estimatedDeliveryDate: row.estimated_delivery_date ? new Date(row.estimated_delivery_date).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));

  const mappedPayments = payments.rows.map((row) => ({
    id: String(row.id),
    reference: String(row.reference),
    redomTransactionId: row.redom_transaction_id ? String(row.redom_transaction_id) : null,
    amountMinor: String(row.amount_minor),
    currency: String(row.currency),
    purpose: String(row.purpose),
    status: String(row.status),
    createdAt: new Date(row.created_at).toISOString(),
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    metadata: row.metadata ?? null,
  }));

  return res.json({ success: true, orders: mappedOrders, payments: mappedPayments });
});

router.get("/transactions/:transactionId", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  const transactionId = String(req.params.transactionId || "");
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
  if (!transactionId) return res.status(400).json({ success: false, message: "Transaction ID is required." });

  const result = await pool.query(
    `SELECT pt.id, pt.reference, pt.redom_transaction_id, pt.amount_minor, pt.currency, pt.purpose,
            pt.status, pt.refund_status, pt.created_at, pt.paid_at, pt.metadata, pt.failure_message,
            pp.name AS plan_name
       FROM payment_transactions pt
       LEFT JOIN payment_plans pp ON pp.id = pt.plan_id
      WHERE pt.id = $1 AND pt.user_id = $2
      LIMIT 1`,
    [transactionId, userId],
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ success: false, message: "Transaction not found." });

  let metadata: any = {};
  try { metadata = row.metadata ? (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata) : {}; } catch { metadata = {}; }
  const paymentDetails = metadata?.paymentDetails ?? {};
  const stars = Number(metadata?.stars ?? 0);
  const productName =
    row.plan_name ? String(row.plan_name) :
    row.purpose === "stars_purchase" && Number.isFinite(stars) && stars > 0 ? `ReDom Stars • ${stars.toLocaleString()} Stars` :
    row.purpose === "payment_method_setup" ? "Payment method verification" :
    row.purpose === "subscription_renewal" ? "ReDom subscription renewal" :
    String(row.purpose || "ReDom payment").replaceAll("_", " ");
  const providerAmountMinor = paymentDetails?.providerAmountMinor != null ? Number(paymentDetails.providerAmountMinor) : null;
  const totalAmountMinor = Number.isFinite(providerAmountMinor) && providerAmountMinor! > 0 ? String(providerAmountMinor) : String(row.amount_minor);
  const providerReference = paymentDetails?.providerReference ? String(paymentDetails.providerReference) : String(row.reference);

  return res.json({
    success: true,
    transaction: {
      id: String(row.id),
      reference: String(row.reference),
      redomTransactionId: row.redom_transaction_id ? String(row.redom_transaction_id) : null,
      amountMinor: String(row.amount_minor),
      totalAmountMinor,
      currency: String(row.currency),
      purpose: String(row.purpose),
      productName,
      status: String(row.status),
      refundStatus: row.refund_status ? String(row.refund_status) : null,
      createdAt: new Date(row.created_at).toISOString(),
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      providerReference,
      failureMessage: row.failure_message ? String(row.failure_message) : null,
      metadata,
    },
  });
});

router.get("/subscriptions", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
  const result = await pool.query(
    `SELECT id, subscription_type, subscription_status, billing_cycle,
            auto_renew, started_at, renewed_at, expires_at,
            cancelled_at, created_at, updated_at
       FROM verification_subscriptions
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId],
  );
  return res.json({
    success: true,
    subscriptions: result.rows.map((row) => ({
      id: String(row.id),
      subscriptionType: String(row.subscription_type),
      subscriptionStatus: String(row.subscription_status),
      billingCycle: String(row.billing_cycle),
      autoRenew: Boolean(row.auto_renew),
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      renewedAt: row.renewed_at ? new Date(row.renewed_at).toISOString() : null,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
  });
});

const supportedCurrencies = ["DZD","ARS","AUD","BDT","BOB","BRL","GBP","CAD","CLP","CNY","COP","CRC","CZK","DKK","EUR","GHS","HKD","HUF","IDR","INR","JPY","KES","KRW","MAD","MXN","NGN","NZD","NOK","PEN","PHP","PKR","PLN","RON","RUB","SAR","SEK","SGD","THB","TRY","TZS","UGX","USD","VND","ZAR"] as const;
const settingsSchema = z.object({
  currency: z.enum(supportedCurrencies).optional(),
  pinEnabled: z.boolean().optional(),
  biometricEnabled: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one setting is required.");

router.get("/settings", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
  const result = await pool.query(
    `SELECT currency, pin_enabled, biometric_enabled, currency_changed_at FROM payment_settings WHERE user_id = $1`,
    [userId],
  );
  if (!result.rows[0]) {
    const created = await pool.query(
      `INSERT INTO payment_settings (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
       RETURNING currency, pin_enabled, biometric_enabled, currency_changed_at`,
      [userId],
    );
    return res.json({ success: true, settings: created.rows[0] });
  }
  return res.json({ success: true, settings: result.rows[0] });
});

router.patch("/settings", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid payment settings." });
  const value = parsed.data;
  const current = await pool.query(`SELECT currency, pin_enabled, biometric_enabled, currency_changed_at FROM payment_settings WHERE user_id = $1`, [userId]);
  const base = current.rows[0] ?? { currency: "NGN", pin_enabled: false, biometric_enabled: false, currency_changed_at: null };
  const currencyChanged = value.currency !== undefined && value.currency !== base.currency;
  if (currencyChanged && base.currency_changed_at) {
    const changedAt = new Date(base.currency_changed_at).getTime();
    const availableAt = changedAt + 72 * 60 * 60 * 1000;
    if (Date.now() < availableAt) {
      const remainingHours = Math.max(1, Math.ceil((availableAt - Date.now()) / (60 * 60 * 1000)));
      return res.status(429).json({ success: false, message: `You can only change your currency once every 72 hours. Try again in about ${remainingHours} hour(s).`, currencyChangeAvailableAt: new Date(availableAt).toISOString() });
    }
  }
  const next = {
    currency: value.currency ?? base.currency,
    pin_enabled: value.pinEnabled ?? base.pin_enabled,
    biometric_enabled: value.biometricEnabled ?? base.biometric_enabled,
    currency_changed_at: currencyChanged ? new Date() : base.currency_changed_at,
  };
  const result = await pool.query(
    `INSERT INTO payment_settings (user_id, currency, pin_enabled, biometric_enabled, currency_changed_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET currency = EXCLUDED.currency,
       pin_enabled = EXCLUDED.pin_enabled, biometric_enabled = EXCLUDED.biometric_enabled,
       currency_changed_at = EXCLUDED.currency_changed_at, updated_at = now()
     RETURNING currency, pin_enabled, biometric_enabled`,
    [userId, next.currency, next.pin_enabled, next.biometric_enabled, next.currency_changed_at],
  );
  return res.json({ success: true, settings: result.rows[0] });
});

router.get("/stars/activity", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
  await pool.query("INSERT INTO redom_stars_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING", [userId]);
  const balance = await pool.query("SELECT balance FROM redom_stars_accounts WHERE user_id=$1", [userId]);
  const activity = await pool.query(
    `SELECT id,type,stars,balance_after,package_key,country_code,currency,amount_minor,reference,created_at
       FROM redom_stars_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [userId],
  );
  return res.json({
    success: true,
    balance: Number(balance.rows[0]?.balance ?? 0),
    activity: activity.rows.map((row) => ({
      id:String(row.id), type:String(row.type), stars:Number(row.stars), balanceAfter:Number(row.balance_after),
      packageKey:row.package_key ? String(row.package_key) : null, countryCode:row.country_code ? String(row.country_code) : null,
      currency:row.currency ? String(row.currency) : null, amountMinor:row.amount_minor == null ? null : Number(row.amount_minor),
      reference:row.reference ? String(row.reference) : null, createdAt:new Date(row.created_at).toISOString(),
    })),
  });
});

export default router;

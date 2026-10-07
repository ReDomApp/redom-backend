import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../database/db";
import { getStripeStarsCountries } from "../services/payments/stripe-country.service";

const router = Router();

router.get("/verified-plans", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });

  try {
    const [countryResult, settingsResult, supportedCountries] = await Promise.all([
      pool.query(
        `SELECT country FROM login_history
         WHERE user_id = $1 AND country IS NOT NULL
         ORDER BY login_time DESC
         LIMIT 1`,
        [userId],
      ),
      pool.query(
        `SELECT currency FROM payment_settings WHERE user_id = $1 LIMIT 1`,
        [userId],
      ),
      getStripeStarsCountries(),
    ]);
    const detectedCountry = String(countryResult.rows[0]?.country || "").trim();
    const configuredCurrency = String(settingsResult.rows[0]?.currency || "").toUpperCase();
    const country = supportedCountries.find(item =>
      item.isoCode === detectedCountry.toUpperCase()
      || item.name.toLowerCase() === detectedCountry.toLowerCase()
    ) || null;
    const pricedCountry = configuredCurrency
      ? supportedCountries.find(item => item.currency === configuredCurrency) || country
      : country;
    const countryCode = pricedCountry?.isoCode || "US";
    const currency = pricedCountry?.currency || configuredCurrency || "USD";
    const rate = pricedCountry?.rate && pricedCountry.rate > 0 ? pricedCountry.rate : 1;

    const configuredRecognized = await pool.query(
      `SELECT amount_minor, currency
         FROM payment_plans
        WHERE active = true
          AND (
            plan_key IN ('redom_verified_recognized','verified_recognized','recognized','redom_recognized')
            OR lower(name) IN ('redom recognized','recognized','redom verified recognized')
          )
        ORDER BY updated_at DESC
        LIMIT 1`,
    );

    const recognizedUsd = configuredRecognized.rows[0]?.amount_minor != null
      && String(configuredRecognized.rows[0]?.currency || "").toUpperCase() === "USD"
      ? Number(configuredRecognized.rows[0].amount_minor) / 100
      : 109;

    const trialResult = await pool.query(
      `SELECT 1
         FROM verification_subscriptions
        WHERE user_id = $1
          AND subscription_status IN ('active','pending')
        LIMIT 1`,
      [userId],
    );
    const trialAvailable = trialResult.rowCount === 0;

    const connections = await pool.query(
      `WITH connection_ids AS (
         SELECT friend_user_id AS id FROM friends WHERE user_id = $1 AND friendship_status = 'active'
         UNION
         SELECT user_id AS id FROM friends WHERE friend_user_id = $1 AND friendship_status = 'active'
         UNION
         SELECT follower_id AS id FROM followers WHERE user_id = $1
         UNION
         SELECT user_id AS id FROM followers WHERE follower_id = $1
         UNION
         SELECT following_id AS id FROM following WHERE user_id = $1
         UNION
         SELECT user_id AS id FROM following WHERE following_id = $1
       )
       SELECT u.id,u.first_name,u.last_name,u.username,p.profile_photo,p.verified
         FROM connection_ids c
         JOIN users u ON u.id = c.id
         LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE u.account_status = 'active'
          AND (p.profile_photo IS NOT NULL OR COALESCE(p.verified,false) = true)
        ORDER BY COALESCE(p.verified,false) DESC,
                 (p.profile_photo IS NOT NULL) DESC,
                 u.first_name ASC,u.last_name ASC
        LIMIT 8`,
      [userId],
    );

    const localPrice = (usd:number) => {
      const local = Math.round(usd * rate * 100) / 100;
      if (currency === "USD") return "From $" + (Number.isInteger(usd) ? usd.toFixed(0) : usd.toFixed(2)) + "/month per profile";
      const decimals = ["JPY","KRW","VND"].includes(currency) ? 0 : 2;
      return "From " + currency + local.toLocaleString("en-US",{minimumFractionDigits:decimals,maximumFractionDigits:decimals}) + "/month per profile";
    };

    const plans = [
      { key:"standard", name:"Standard", baseUsdMonthly:5, localAmount:Math.round(5*rate*100)/100, reelsPerMonth:null },
      { key:"plus", name:"Plus", baseUsdMonthly:18, localAmount:Math.round(18*rate*100)/100, reelsPerMonth:4 },
      { key:"recognized", name:"ReDom Recognized", baseUsdMonthly:recognizedUsd, localAmount:Math.round(recognizedUsd*rate*100)/100, reelsPerMonth:6 },
    ].map(plan => ({
      ...plan,
      localCurrency: currency,
      localPrice: localPrice(plan.baseUsdMonthly),
      trialAvailable,
    }));

    return res.json({
      success: true,
      countryCode,
      currency,
      plans,
      socialProof: connections.rows.map(row => ({
        userId:String(row.id),
        firstName:String(row.first_name || ""),
        lastName:String(row.last_name || ""),
        username:String(row.username || ""),
        profilePhoto:row.profile_photo ? String(row.profile_photo) : null,
        verified:Boolean(row.verified),
      })),
    });
  } catch (error) {
    console.error("Verified plans request failed", error);
    return res.status(500).json({ success:false, message:"Unable to load ReDom Verified plans right now." });
  }
});

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

const parseMetadata = (value: unknown): any => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
};

function paymentProductName(row: any, metadata: any): string {
  const stars = Number(metadata?.stars ?? 0);
  if (row.plan_name) return String(row.plan_name);
  if (row.purpose === "stars_purchase" && Number.isFinite(stars) && stars > 0) return `ReDom Stars`;
  if (row.purpose === "payment_method_setup") return "Payment method verification";
  if (row.purpose === "subscription_renewal") return "ReDom Subscription";
  if (row.purpose === "subscription") return "ReDom Subscription";
  if (row.purpose === "donation" || row.purpose === "donations") return "ReDom Donation";
  if (row.purpose === "money_transfer" || row.purpose === "transfer" || row.purpose === "p2p_transfer") return "Money transfer";
  return String(row.purpose || "ReDom payment").replaceAll("_", " ");
}

function paymentCategory(row: any, metadata: any): "money_transfer"|"orders"|"donations"|"cards"|"other" {
  const purpose = String(row.purpose || "").toLowerCase();
  const d = metadata?.paymentDetails ?? {};
  const channel = String(d.channel ?? metadata?.preferredChannel ?? "").toLowerCase();
  if (purpose === "donation" || purpose === "donations" || channel.includes("donat")) return "donations";
  if (purpose === "money_transfer" || purpose === "transfer" || purpose === "p2p_transfer" || channel.includes("bank") || channel.includes("transfer")) return "money_transfer";
  if (purpose === "order" || purpose === "marketplace_order") return "orders";
  if (channel.includes("card") || d.last4 || d.cardType || d.card_type || metadata?.paymentMethodId) return "cards";
  return "other";
}

function paymentTransferMethod(metadata: any): string | null {
  const d = metadata?.paymentDetails ?? {};
  const channel = String(d.channel ?? metadata?.preferredChannel ?? "").toLowerCase();
  if (!channel) return null;
  if (channel.includes("bank") || channel.includes("transfer")) return "Bank transfer";
  if (channel.includes("card")) return "Card";
  return String(d.channel ?? metadata?.preferredChannel);
}

router.get("/redom-pay/transactions", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });

  const payments = await pool.query(
    `SELECT pt.id, pt.reference, pt.redom_transaction_id, pt.amount_minor, pt.currency, pt.purpose,
            pt.status, pt.refund_status, pt.created_at, pt.paid_at, pt.metadata, pt.failure_message,
            pp.name AS plan_name
       FROM payment_transactions pt
       LEFT JOIN payment_plans pp ON pp.id = pt.plan_id
      WHERE pt.user_id = $1
      ORDER BY pt.created_at DESC
      LIMIT 200`,
    [userId],
  );
  const orders = await pool.query(
    `SELECT mt.id, mt.transaction_id, ml.title, mt.total_price, mt.currency, mt.payment_method,
            mt.payment_provider, mt.payment_status, mt.order_status, mt.created_at, mt.paid_at, mt.completed_at
       FROM marketplace_transactions mt
       JOIN marketplace_listings ml ON ml.id = mt.listing_id
       JOIN user_profiles up ON up.id = mt.buyer_user_id
      WHERE up.user_id = $1
      ORDER BY mt.created_at DESC
      LIMIT 200`,
    [userId],
  );

  const mappedPayments = payments.rows.map((row) => {
    const metadata = parseMetadata(row.metadata);
    const category = paymentCategory(row, metadata);
    return {
      transactionKey: `payment:${String(row.id)}`,
      kind: "payment",
      category,
      transferMethod: category === "money_transfer" ? paymentTransferMethod(metadata) : null,
      id: String(row.id),
      redomTransactionId: row.redom_transaction_id ? String(row.redom_transaction_id) : null,
      reference: String(row.reference),
      productName: paymentProductName(row, metadata),
      status: String(row.status),
      refundStatus: row.refund_status ? String(row.refund_status) : null,
      amountMinor: String(row.amount_minor),
      currency: String(row.currency),
      createdAt: new Date(row.created_at).toISOString(),
      effectiveAt: row.paid_at ? new Date(row.paid_at).toISOString() : new Date(row.created_at).toISOString(),
      metadata,
    };
  });

  const mappedOrders = orders.rows.map((row) => ({
    transactionKey: `order:${String(row.id)}`,
    kind: "order",
    category: "orders",
    transferMethod: row.payment_method ? String(row.payment_method) : null,
    id: String(row.id),
    redomTransactionId: null,
    reference: String(row.transaction_id),
    productName: String(row.title),
    status: String(row.payment_status || row.order_status || "pending"),
    refundStatus: null,
    amountMinor: String(Math.round(Number(row.total_price) * 100)),
    currency: String(row.currency),
    createdAt: new Date(row.created_at).toISOString(),
    effectiveAt: row.paid_at ? new Date(row.paid_at).toISOString() : new Date(row.created_at).toISOString(),
    metadata: {
      orderStatus: String(row.order_status),
      paymentStatus: String(row.payment_status),
      paymentMethod: row.payment_method ? String(row.payment_method) : null,
      paymentProvider: row.payment_provider ? String(row.payment_provider) : null,
    },
  }));

  return res.json({ success: true, transactions: [...mappedPayments, ...mappedOrders].sort((a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime()) });
});

router.get("/redom-pay/transactions/:transactionKey", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  const key = decodeURIComponent(String(req.params.transactionKey || ""));
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
  const split = key.indexOf(":");
  if (split <= 0) return res.status(400).json({ success: false, message: "Invalid transaction reference." });
  const kind = key.slice(0, split);
  const id = key.slice(split + 1);

  if (kind === "payment") {
    const result = await pool.query(
      `SELECT pt.id, pt.reference, pt.redom_transaction_id, pt.amount_minor, pt.currency, pt.purpose,
              pt.status, pt.refund_status, pt.created_at, pt.paid_at, pt.metadata, pt.failure_message,
              pp.name AS plan_name
         FROM payment_transactions pt
         LEFT JOIN payment_plans pp ON pp.id = pt.plan_id
        WHERE pt.id = $1 AND pt.user_id = $2
        LIMIT 1`,
      [id, userId],
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ success: false, message: "Transaction not found." });
    const metadata = parseMetadata(row.metadata);
    const paymentDetails = metadata?.paymentDetails ?? {};
    const amountMinor = String(row.amount_minor);
    const discountMinor = Number.isFinite(Number(metadata?.discountMinor)) ? String(Math.max(0, Number(metadata.discountMinor))) : "0";
    const discountPercent = Number.isFinite(Number(metadata?.discountPercent)) ? Number(metadata.discountPercent) : 0;
    const subtotalMinor = Number.isFinite(Number(metadata?.subtotalMinor)) ? String(metadata.subtotalMinor) : String(Number(amountMinor) + Number(discountMinor));
    const productName = paymentProductName(row, metadata);
    const status = row.refund_status === "processed" ? "refunded" : row.refund_status === "failed" ? "refund_failed" : row.status;
    return res.json({
      success: true,
      transaction: {
        transactionKey: key,
        kind: "payment",
        redomTransactionId: row.redom_transaction_id ? String(row.redom_transaction_id) : null,
        reference: String(row.reference),
        productName,
        status,
        refundStatus: row.refund_status ? String(row.refund_status) : null,
        amountMinor,
        subtotalMinor,
        discountMinor,
        discountPercent,
        totalMinor: amountMinor,
        currency: String(row.currency),
        createdAt: new Date(row.created_at).toISOString(),
        effectiveAt: row.paid_at ? new Date(row.paid_at).toISOString() : new Date(row.created_at).toISOString(),
        providerReference: paymentDetails?.providerReference ? String(paymentDetails.providerReference) : String(row.reference),
        paymentMethod: paymentDetails?.channel ? String(paymentDetails.channel) : null,
        transferMethod: paymentCategory(row, metadata) === "money_transfer" ? paymentTransferMethod(metadata) : null,
        failureMessage: row.failure_message ? String(row.failure_message) : null,
        metadata,
      },
    });
  }

  if (kind === "order") {
    const result = await pool.query(
      `SELECT mt.id, mt.transaction_id, ml.title, mt.total_price, mt.currency, mt.payment_method,
              mt.payment_provider, mt.payment_status, mt.order_status, mt.created_at, mt.paid_at, mt.completed_at, mt.transaction_reference
         FROM marketplace_transactions mt
         JOIN marketplace_listings ml ON ml.id = mt.listing_id
         JOIN user_profiles up ON up.id = mt.buyer_user_id
        WHERE mt.id = $1 AND up.user_id = $2
        LIMIT 1`,
      [id, userId],
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ success: false, message: "Transaction not found." });
    const amountMinor = String(Math.round(Number(row.total_price) * 100));
    return res.json({
      success: true,
      transaction: {
        transactionKey: key,
        kind: "order",
        redomTransactionId: null,
        reference: String(row.transaction_id),
        productName: String(row.title),
        status: String(row.payment_status || row.order_status || "pending"),
        refundStatus: null,
        amountMinor,
        subtotalMinor: amountMinor,
        discountMinor: "0",
        discountPercent: 0,
        totalMinor: amountMinor,
        currency: String(row.currency),
        createdAt: new Date(row.created_at).toISOString(),
        effectiveAt: row.paid_at ? new Date(row.paid_at).toISOString() : new Date(row.created_at).toISOString(),
        providerReference: row.transaction_reference ? String(row.transaction_reference) : null,
        paymentMethod: row.payment_method ? String(row.payment_method) : null,
        transferMethod: row.payment_method ? String(row.payment_method) : null,
        failureMessage: null,
        metadata: { orderStatus: String(row.order_status), paymentStatus: String(row.payment_status), paymentMethod: row.payment_method, paymentProvider: row.payment_provider },
      },
    });
  }

  return res.status(400).json({ success: false, message: "Unsupported transaction type." });
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

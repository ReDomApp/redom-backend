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

  return res.json({
    success: true,
    orders: orders.rows.map((row) => ({
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
    })),
  });
});

router.get("/subscriptions", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
  const result = await pool.query(
    `SELECT id, subscription_type, subscription_status, billing_cycle,
            payment_provider, auto_renew, started_at, renewed_at, expires_at,
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
      paymentProvider: row.payment_provider ? String(row.payment_provider) : null,
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

const settingsSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  pinEnabled: z.boolean().optional(),
  biometricEnabled: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one setting is required.");

router.get("/settings", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
  const result = await pool.query(
    `SELECT currency, pin_enabled, biometric_enabled FROM payment_settings WHERE user_id = $1`,
    [userId],
  );
  if (!result.rows[0]) {
    const created = await pool.query(
      `INSERT INTO payment_settings (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
       RETURNING currency, pin_enabled, biometric_enabled`,
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
  const current = await pool.query(`SELECT currency, pin_enabled, biometric_enabled FROM payment_settings WHERE user_id = $1`, [userId]);
  const base = current.rows[0] ?? { currency: "USD", pin_enabled: false, biometric_enabled: false };
  const next = {
    currency: value.currency ?? base.currency,
    pin_enabled: value.pinEnabled ?? base.pin_enabled,
    biometric_enabled: value.biometricEnabled ?? base.biometric_enabled,
  };
  const result = await pool.query(
    `INSERT INTO payment_settings (user_id, currency, pin_enabled, biometric_enabled)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET currency = EXCLUDED.currency,
       pin_enabled = EXCLUDED.pin_enabled, biometric_enabled = EXCLUDED.biometric_enabled,
       updated_at = now()
     RETURNING currency, pin_enabled, biometric_enabled`,
    [userId, next.currency, next.pin_enabled, next.biometric_enabled],
  );
  return res.json({ success: true, settings: result.rows[0] });
});

router.get("/stars/activity", authMiddleware, async (_req, res) => {
  return res.json({ success: true, activity: [] });
});

export default router;

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../database/db";
import { authMiddleware } from "../middleware/auth.middleware";
import { logger } from "../lib/logger";
import { SmsPoolError, SmsPoolPayload, smsPoolClient } from "../services/aurelink/smspool.client";

const router = Router();
const USD_MINOR = 100;
const quoteTtlMinutes = 10;

function allowedServices(): Set<string> {
  return new Set((process.env.AURELINK_ALLOWED_SERVICES ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}
function isServiceAllowed(service: string): boolean {
  const normalized = service.trim().toLowerCase();
  if (!normalized || /bank|crypto|exchange|government|telecom|carrier/.test(normalized)) return false;
  if (normalized === "whatsapp" && process.env.SMSPOOL_WHATSAPP_APPROVED !== "true") return false;
  return allowedServices().has(normalized);
}
function adminAllowed(req: Request): boolean {
  const ids = (process.env.AURELINK_ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return Boolean(req.user?.userId && ids.includes(req.user.userId));
}
function providerFailure(res: Response, error: unknown): Response {
  if (error instanceof SmsPoolError) {
    const status = error.providerType === "NOT_CONFIGURED" ? 503
      : error.providerType === "OUT_OF_STOCK" ? 409
      : error.providerType === "BALANCE_ERROR" ? 402
      : error.providerType === "PRICE_NOT_FOUND" ? 409
      : error.status === 429 ? 429 : 502;
    logger.warn({ provider: "smspool", status, providerType: error.providerType }, "AURELINK provider request failed");
    return res.status(status).json({ success: false, message: error.message, code: error.providerType ?? "SMSPOOL_ERROR" });
  }
  logger.error({ errorType: error instanceof Error ? error.name : typeof error }, "AURELINK request failed");
  return res.status(500).json({ success: false, message: "AURELINK request failed." });
}
function object(value: SmsPoolPayload): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function pricesIn(value: unknown, output: number[] = []): number[] {
  if (Array.isArray(value)) { for (const item of value) pricesIn(item, output); return output; }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/^(price|cost|lowest_price|min_price|minimum_price)$/i.test(key)) {
      const n = typeof child === "number" ? child : typeof child === "string" ? Number(child) : NaN;
      if (Number.isFinite(n) && n > 0) output.push(n);
    } else if (child && typeof child === "object") pricesIn(child, output);
  }
  return output;
}
async function verifyPaidPayment(userId: string, reference: string, purpose: "aurelink_otp" | "aurelink_rental", amountMinor: number): Promise<boolean> {
  const result = await pool.query(
    "SELECT id FROM payment_transactions WHERE reference=$1 AND user_id=$2 AND status='paid' AND purpose=$3 AND currency='USD' AND amount_minor >= $4 LIMIT 1",
    [reference, userId, purpose, String(amountMinor)],
  );
  return result.rowCount === 1;
}
async function ownedOrder(userId: string, orderId: string, kind?: string) {
  const result = await pool.query(
    "SELECT * FROM aurelink_provider_orders WHERE user_id=$1 AND provider_order_id=$2 AND ($3::text IS NULL OR product_kind=$3) LIMIT 1",
    [userId, orderId, kind ?? null],
  );
  return result.rows[0] ?? null;
}

router.get("/aurelink/status", authMiddleware, (_req, res) => {
  res.json({
    success: true,
    provider: "smspool",
    configured: Boolean(process.env.SMSPOOL_API_KEY?.trim()),
    allowedServices: [...allowedServices()],
    whatsappApproved: process.env.SMSPOOL_WHATSAPP_APPROVED === "true",
    features: { oneTimeSms: true, rentals: true, carrierLookup: true, esim: true, voiceAndFlash: true },
    note: "eSIM products are data-only; they do not provide a phone number.",
  });
});

router.get("/aurelink/provider/balance", authMiddleware, async (req, res) => {
  if (!adminAllowed(req)) return res.status(403).json({ success: false, message: "Administrator access required." });
  try { return res.json({ success: true, balance: await smsPoolClient.balance() }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/services", authMiddleware, async (_req, res) => {
  try { return res.json({ success: true, services: await smsPoolClient.services() }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/countries", authMiddleware, async (_req, res) => {
  try { return res.json({ success: true, countries: await smsPoolClient.countries() }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/pools", authMiddleware, async (_req, res) => {
  try { return res.json({ success: true, pools: await smsPoolClient.pools() }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/pricing", authMiddleware, async (req, res) => {
  const parsed = z.object({ country: z.string().min(1).max(8), service: z.string().min(1).max(100), pool: z.string().max(32).optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Valid country and service are required." });
  if (!isServiceAllowed(parsed.data.service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try {
    const pricing = await smsPoolClient.pricing({ country: parsed.data.country, service: parsed.data.service, pool: parsed.data.pool });
    const prices = pricesIn(pricing);
    return res.json({ success: true, pricing, lowestDetectedPrice: prices.length ? Math.min(...prices) : null, currency: "USD" });
  } catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/stock", authMiddleware, async (req, res) => {
  const parsed = z.object({ country: z.string().min(1).max(8), service: z.string().min(1).max(100), pool: z.string().max(32).optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Valid country and service are required." });
  if (!isServiceAllowed(parsed.data.service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try { return res.json({ success: true, stock: await smsPoolClient.stock(parsed.data) }); }
  catch (error) { return providerFailure(res, error); }
});

router.post("/aurelink/quotes", authMiddleware, async (req, res) => {
  const parsed = z.object({
    kind: z.enum(["activation", "rental"]),
    country: z.string().min(1).max(8),
    service: z.string().min(1).max(100),
    pool: z.string().max(32).optional(),
  }).safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid quote request." });
  if (!isServiceAllowed(parsed.data.service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try {
    const providerPricing = await smsPoolClient.pricing({ country: parsed.data.country, service: parsed.data.service, pool: parsed.data.pool });
    const prices = pricesIn(providerPricing);
    if (!prices.length) return res.status(502).json({ success: false, message: "SMSPool returned pricing that could not be normalized. No quote was created." });
    const providerMaxPrice = Math.min(...prices);
    const markupPercent = Math.max(0, Number(process.env.AURELINK_MARKUP_PERCENT ?? "35"));
    const fixedFeeMinor = Math.max(0, Math.round(Number(process.env.AURELINK_FIXED_FEE_USD_CENTS ?? "20")));
    const retailAmountMinor = Math.ceil(providerMaxPrice * USD_MINOR * (1 + markupPercent / 100)) + fixedFeeMinor;
    const result = await pool.query(
      "INSERT INTO aurelink_quotes (user_id,product_kind,country,service,provider_max_price,retail_amount_minor,currency,provider_pricing,expires_at) VALUES ($1,$2,$3,$4,$5,$6,'USD',$7::jsonb,NOW()+($8::text||' minutes')::interval) RETURNING id,product_kind,country,service,provider_max_price,retail_amount_minor,currency,expires_at",
      [req.user.userId, parsed.data.kind, parsed.data.country, parsed.data.service, providerMaxPrice, retailAmountMinor, JSON.stringify(providerPricing), String(quoteTtlMinutes)],
    );
    return res.json({ success: true, quote: result.rows[0], retailPriceUsd: (retailAmountMinor / USD_MINOR).toFixed(2), pricingSource: "live SMSPool API", expiresInSeconds: quoteTtlMinutes * 60 });
  } catch (error) { return providerFailure(res, error); }
});

router.post("/aurelink/activations", authMiddleware, async (req, res) => {
  const parsed = z.object({ quoteId: z.string().uuid(), paymentReference: z.string().min(8).max(100), pool: z.string().max(32).optional(), pricingOption: z.union([z.literal(0), z.literal(1)]).optional() }).safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Valid quote and payment reference are required." });
  const client = await pool.connect();
  let quote: Record<string, unknown> | undefined;
  try {
    await client.query("BEGIN");
    const quoteResult = await client.query(
      "SELECT * FROM aurelink_quotes WHERE id=$1 AND user_id=$2 AND product_kind='activation' AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",
      [parsed.data.quoteId, req.user.userId],
    );
    quote = quoteResult.rows[0] as Record<string, unknown> | undefined;
    if (!quote) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Quote expired, consumed, or not found." }); }
    const paid = await client.query(
      "SELECT id FROM payment_transactions WHERE reference=$1 AND user_id=$2 AND status='paid' AND purpose='aurelink_otp' AND currency='USD' AND amount_minor >= $3 LIMIT 1",
      [parsed.data.paymentReference, req.user.userId, String(quote["retail_amount_minor"])],
    );
    if (paid.rowCount !== 1) { await client.query("ROLLBACK"); return res.status(402).json({ success: false, message: "A verified, paid AURELINK OTP transaction covering this quote is required." }); }
    await client.query("UPDATE aurelink_quotes SET consumed_at=NOW() WHERE id=$1", [parsed.data.quoteId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    return providerFailure(res, error);
  }
  client.release();

  try {
    const service = String(quote["service"]);
    const country = String(quote["country"]);
    const maxPrice = Number(quote["provider_max_price"]);
    const provider = await smsPoolClient.purchaseSms({ country, service, maxPrice, pool: parsed.data.pool, pricingOption: parsed.data.pricingOption });
    const data = object(provider);
    const providerOrderId = String(data["order_id"] ?? data["orderid"] ?? "");
    const phoneNumber = String(data["number"] ?? data["phonenumber"] ?? "");
    if (!providerOrderId || !phoneNumber) throw new SmsPoolError("SMSPool returned an incomplete activation response.", { providerType: "INVALID_PROVIDER_RESPONSE" });
    const actualCost = Number(data["cost"] ?? maxPrice);
    if (!Number.isFinite(actualCost) || actualCost > maxPrice) {
      await smsPoolClient.cancelSms(providerOrderId).catch(() => undefined);
      throw new SmsPoolError("Provider cost exceeded the quoted maximum; the order was cancelled.", { providerType: "PRICE_GUARD" });
    }
    await pool.query(
      "INSERT INTO aurelink_provider_orders (user_id,quote_id,product_kind,provider_order_id,phone_number,country,service,status,provider_cost,provider_payload) VALUES ($1,$2,'activation',$3,$4,$5,$6,'pending',$7,$8::jsonb)",
      [req.user.userId, parsed.data.quoteId, providerOrderId, phoneNumber, country, service, actualCost, JSON.stringify(provider)],
    );
    return res.status(201).json({ success: true, order: { orderId: providerOrderId, phoneNumber, country, service, providerCostUsd: actualCost, status: data["status"] ?? "pending", expiresIn: data["expires_in"] ?? null } });
  } catch (error) {
    await pool.query("UPDATE aurelink_quotes SET consumed_at=NULL WHERE id=$1 AND user_id=$2", [parsed.data.quoteId, req.user.userId]).catch(() => undefined);
    return providerFailure(res, error);
  }
});

router.get("/aurelink/activations/:orderId/messages", authMiddleware, async (req, res) => {
  const orderId = z.string().min(1).max(160).safeParse(req.params.orderId);
  if (!orderId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid order ID." });
  try {
    const order = await ownedOrder(req.user.userId, orderId.data, "activation");
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    const message = object(await smsPoolClient.checkSms(orderId.data));
    if (message["status"] === 3) await pool.query("UPDATE aurelink_provider_orders SET status='completed',updated_at=NOW(),provider_payload=provider_payload || $2::jsonb WHERE id=$1", [order["id"], JSON.stringify({ smsReceived: true })]);
    if (message["status"] === 6) await pool.query("UPDATE aurelink_provider_orders SET status='refunded',updated_at=NOW() WHERE id=$1", [order["id"]]);
    return res.json({ success: true, message: { status: message["status"], sms: message["sms"] ?? null, fullSms: message["full_sms"] ?? null, expiresAt: message["expiration"] ?? null, timeLeft: message["time_left"] ?? null } });
  } catch (error) { return providerFailure(res, error); }
});
router.post("/aurelink/activations/:orderId/cancel", authMiddleware, async (req, res) => {
  const orderId = z.string().min(1).max(160).safeParse(req.params.orderId);
  if (!orderId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid order ID." });
  try {
    const order = await ownedOrder(req.user.userId, orderId.data, "activation");
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    const result = await smsPoolClient.cancelSms(orderId.data);
    await pool.query("UPDATE aurelink_provider_orders SET status='cancelled',updated_at=NOW(),provider_payload=provider_payload || $2::jsonb WHERE id=$1", [order["id"], JSON.stringify({ cancellation: result })]);
    return res.json({ success: true, cancellation: result });
  } catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/orders", authMiddleware, async (req, res) => {
  if (!req.user?.userId) return res.status(401).json({ success: false, message: "Authentication required." });
  try {
    const result = await pool.query(
      "SELECT id,product_kind,provider_order_id,phone_number,country,service,status,provider_cost,currency,created_at,updated_at FROM aurelink_provider_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [req.user.userId],
    );
    return res.json({ success: true, orders: result.rows });
  } catch (error) { return providerFailure(res, error); }
});

router.post("/aurelink/rentals", authMiddleware, async (req, res) => {
  const parsed = z.object({
    country: z.string().min(1).max(8), service: z.string().min(1).max(100),
    paymentReference: z.string().min(8).max(100), maxProviderPrice: z.number().positive().max(5000),
    months: z.number().int().min(1).max(12).default(1),
  }).safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental request." });
  if (!isServiceAllowed(parsed.data.service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  const markupPercent = Math.max(0, Number(process.env.AURELINK_MARKUP_PERCENT ?? "35"));
  const fixedFeeMinor = Math.max(0, Math.round(Number(process.env.AURELINK_FIXED_FEE_USD_CENTS ?? "20")));
  const retailAmountMinor = Math.ceil(parsed.data.maxProviderPrice * USD_MINOR * (1 + markupPercent / 100)) + fixedFeeMinor;
  try {
    if (!await verifyPaidPayment(req.user.userId, parsed.data.paymentReference, "aurelink_rental", retailAmountMinor)) {
      return res.status(402).json({ success: false, message: "A verified, paid AURELINK rental transaction covering this price is required." });
    }
    const provider = await smsPoolClient.purchaseRental({ country: parsed.data.country, service: parsed.data.service, max_price: parsed.data.maxProviderPrice, months: parsed.data.months });
    const data = object(provider);
    const providerOrderId = String(data["rental_id"] ?? data["order_id"] ?? data["id"] ?? "");
    const phoneNumber = String(data["number"] ?? data["phonenumber"] ?? "");
    if (!providerOrderId || !phoneNumber) throw new SmsPoolError("SMSPool returned an incomplete rental response.", { providerType: "INVALID_PROVIDER_RESPONSE" });
    const actualCost = Number(data["cost"] ?? parsed.data.maxProviderPrice);
    if (!Number.isFinite(actualCost) || actualCost > parsed.data.maxProviderPrice) {
      await smsPoolClient.cancelRental(providerOrderId).catch(() => undefined);
      throw new SmsPoolError("Rental cost exceeded the supplied maximum; the rental cancellation was requested.", { providerType: "PRICE_GUARD" });
    }
    await pool.query(
      "INSERT INTO aurelink_provider_orders (user_id,product_kind,provider_order_id,phone_number,country,service,status,provider_cost,provider_payload) VALUES ($1,'rental',$2,$3,$4,$5,'active',$6,$7::jsonb)",
      [req.user.userId, providerOrderId, phoneNumber, parsed.data.country, parsed.data.service, actualCost, JSON.stringify(provider)],
    );
    return res.status(201).json({ success: true, rental: { rentalId: providerOrderId, phoneNumber, country: parsed.data.country, service: parsed.data.service, providerCostUsd: actualCost, details: provider } });
  } catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/rentals/:rentalId/messages", authMiddleware, async (req, res) => {
  const rentalId = z.string().min(1).max(160).safeParse(req.params.rentalId);
  if (!rentalId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental ID." });
  try {
    const rental = await ownedOrder(req.user.userId, rentalId.data, "rental");
    if (!rental) return res.status(404).json({ success: false, message: "Rental not found." });
    return res.json({ success: true, messages: await smsPoolClient.rentalMessages(rentalId.data) });
  } catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/rentals/:rentalId/status", authMiddleware, async (req, res) => {
  const rentalId = z.string().min(1).max(160).safeParse(req.params.rentalId);
  if (!rentalId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental ID." });
  try {
    const rental = await ownedOrder(req.user.userId, rentalId.data, "rental");
    if (!rental) return res.status(404).json({ success: false, message: "Rental not found." });
    return res.json({ success: true, status: await smsPoolClient.rentalStatus(rentalId.data) });
  } catch (error) { return providerFailure(res, error); }
});
router.post("/aurelink/rentals/:rentalId/renew", authMiddleware, async (req, res) => {
  const rentalId = z.string().min(1).max(160).safeParse(req.params.rentalId);
  const parsed = z.object({ months: z.number().int().min(1).max(12) }).safeParse(req.body);
  if (!rentalId.success || !parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental renewal request." });
  try {
    if (!await ownedOrder(req.user.userId, rentalId.data, "rental")) return res.status(404).json({ success: false, message: "Rental not found." });
    return res.json({ success: true, renewal: await smsPoolClient.renewRental(rentalId.data, parsed.data.months) });
  } catch (error) { return providerFailure(res, error); }
});
router.post("/aurelink/rentals/:rentalId/cancel", authMiddleware, async (req, res) => {
  const rentalId = z.string().min(1).max(160).safeParse(req.params.rentalId);
  if (!rentalId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental ID." });
  try {
    const rental = await ownedOrder(req.user.userId, rentalId.data, "rental");
    if (!rental) return res.status(404).json({ success: false, message: "Rental not found." });
    const result = await smsPoolClient.cancelRental(rentalId.data);
    await pool.query("UPDATE aurelink_provider_orders SET status='cancelled',updated_at=NOW(),provider_payload=provider_payload || $2::jsonb WHERE id=$1", [rental["id"], JSON.stringify({ cancellation: result })]);
    return res.json({ success: true, cancellation: result });
  } catch (error) { return providerFailure(res, error); }
});

router.post("/aurelink/carrier-lookup", authMiddleware, async (req, res) => {
  const parsed = z.object({ phoneNumber: z.string().min(5).max(32).regex(/^\+?[0-9 ()-]+$/) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "A valid phone number is required." });
  try { return res.json({ success: true, lookup: await smsPoolClient.carrierLookup(parsed.data.phoneNumber.replace(/[ ()-]/g, "")) }); }
  catch (error) { return providerFailure(res, error); }
});

router.get("/aurelink/esim/plans", authMiddleware, async (req, res) => {
  try { return res.json({ success: true, plans: await smsPoolClient.esimPlans({ country: typeof req.query.country === "string" ? req.query.country : undefined }) }); }
  catch (error) { return providerFailure(res, error); }
});
router.post("/aurelink/esim/purchase", authMiddleware, async (_req, res) => {
  return res.status(501).json({ success: false, message: "eSIM purchases are disabled until the SMSPool plan catalog and payment reconciliation are verified. SMSPool eSIMs are data-only and do not include a phone number." });
});

export default router;

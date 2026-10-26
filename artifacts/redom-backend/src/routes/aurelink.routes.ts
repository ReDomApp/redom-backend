import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../database/db";
import { authMiddleware } from "../middleware/auth.middleware";
import { logger } from "../lib/logger";
import { SmsPoolError, smsPoolClient, type SmsPoolPayload } from "../services/aurelink/smspool.client";
import { createAurelinkStripeCheckout } from "../services/payments/stripe-payment.service";

const router = Router();
const USD_MINOR = 100;
const quoteTtlMinutes = 10;

function allowedServices(): Set<string> {
  return new Set((process.env.AURELINK_ALLOWED_SERVICES ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}
function serviceEntries(value: unknown, output: Array<{ id: string; name: string }> = []): Array<{ id: string; name: string }> {
  if (Array.isArray(value)) { for (const item of value) serviceEntries(item, output); return output; }
  if (!value || typeof value !== "object") return output;
  const row = value as Record<string, unknown>;
  const idValue = row["ID"] ?? row["id"] ?? row["service_id"] ?? row["serviceId"];
  const nameValue = row["name"] ?? row["service"] ?? row["service_name"] ?? row["short_name"];
  if (idValue != null && nameValue != null && (typeof idValue === "string" || typeof idValue === "number") && typeof nameValue === "string") {
    output.push({ id: String(idValue).toLowerCase(), name: nameValue.trim().toLowerCase() });
  }
  for (const child of Object.values(row)) if (child && typeof child === "object") serviceEntries(child, output);
  return output;
}
async function isServiceAllowed(service: string): Promise<boolean> {
  const normalized = service.trim().toLowerCase();
  if (!normalized) return false;
  const configured = allowedServices();
  let serviceName = normalized;
  let serviceId = normalized;
  if (/^[0-9]+$/.test(normalized)) {
    try {
      const match = serviceEntries(await smsPoolClient.services()).find((entry) => entry.id === normalized);
      if (!match) return false;
      serviceName = match.name;
      serviceId = match.id;
    } catch { return false; }
  }
  if (/bank|crypto|exchange|government|telecom|carrier/.test(serviceName)) return false;
  if (serviceName.includes("whatsapp") && process.env.SMSPOOL_WHATSAPP_APPROVED !== "true") return false;
  return configured.has(normalized) || configured.has(serviceName) || configured.has(serviceId);
}
function adminAllowed(req: Request): boolean {
  const ids = (process.env.AURELINK_ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return Boolean(req.user?.userId && ids.includes(req.user.userId));
}
function providerFailure(res: Response, error: unknown): Response {
  if (error instanceof SmsPoolError) {
    const status = error.providerType === "NOT_CONFIGURED" ? 503
      : error.providerType === "OUT_OF_STOCK" || error.providerType === "PRICE_NOT_FOUND" ? 409
      : error.providerType === "BALANCE_ERROR" ? 402
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
function retailPriceMinor(providerPrice: number): number {
  const markupPercent = Math.max(0, Number(process.env.AURELINK_MARKUP_PERCENT ?? "35"));
  const fixedFeeMinor = Math.max(0, Math.round(Number(process.env.AURELINK_FIXED_FEE_USD_CENTS ?? "20")));
  return Math.ceil(providerPrice * USD_MINOR * (1 + markupPercent / 100)) + fixedFeeMinor;
}
function rentalPriceForDays(value: unknown, days: number): number | null {
  if (typeof value === "string") {
    try { return rentalPriceForDays(JSON.parse(value) as unknown, days); } catch { return null; }
  }
  if (Array.isArray(value)) {
    for (const item of value) { const price = rentalPriceForDays(item, days); if (price !== null) return price; }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const direct = row[String(days)];
  if (typeof direct === "number" || typeof direct === "string") {
    const price = Number(direct);
    if (Number.isFinite(price) && price > 0) return price;
  }
  for (const child of Object.values(row)) {
    const price = rentalPriceForDays(child, days);
    if (price !== null) return price;
  }
  return null;
}
async function ownedOrder(userId: string, orderId: string, kind?: string) {
  const result = await pool.query(
    "SELECT * FROM aurelink_provider_orders WHERE user_id=$1 AND provider_order_id=$2 AND ($3::text IS NULL OR product_kind=$3) LIMIT 1",
    [userId, orderId, kind ?? null],
  );
  return result.rows[0] ?? null;
}

router.get("/aurelink/status", authMiddleware, (_req, res) => {
  return res.json({
    success: true,
    provider: "smspool",
    configured: Boolean(process.env.SMSPOOL_API_KEY?.trim()),
    allowedServices: [...allowedServices()],
    whatsappApproved: process.env.SMSPOOL_WHATSAPP_APPROVED === "true",
    features: { oneTimeSms: true, rentals: true, carrierLookup: true, esimCatalog: true, esimPurchaseEnabled: false, voiceAndFlash: true },
    note: "SMSPool eSIMs are data-only and do not provide a phone number.",
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
  if (!await isServiceAllowed(parsed.data.service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try {
    const pricing = await smsPoolClient.price({ country: parsed.data.country, service: parsed.data.service, pool: parsed.data.pool });
    const prices = pricesIn(pricing);
    return res.json({ success: true, pricing, lowestDetectedPrice: prices.length ? Math.min(...prices) : null, currency: "USD" });
  } catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/stock", authMiddleware, async (req, res) => {
  const parsed = z.object({ country: z.string().min(1).max(8), service: z.string().min(1).max(100), pool: z.string().max(32).optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Valid country and service are required." });
  if (!await isServiceAllowed(parsed.data.service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try { return res.json({ success: true, stock: await smsPoolClient.stock(parsed.data) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/suggested-countries", authMiddleware, async (req, res) => {
  const service = typeof req.query.service === "string" ? req.query.service : "";
  if (!service) return res.status(400).json({ success: false, message: "Service is required." });
  if (!await isServiceAllowed(service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try { return res.json({ success: true, countries: await smsPoolClient.suggestedCountries(service) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/success-rate", authMiddleware, async (req, res) => {
  const service = typeof req.query.service === "string" ? req.query.service : "";
  const country = typeof req.query.country === "string" ? req.query.country : undefined;
  if (!service) return res.status(400).json({ success: false, message: "Service is required." });
  if (!await isServiceAllowed(service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try { return res.json({ success: true, successRate: await smsPoolClient.successRate(service, country) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/valid-pools", authMiddleware, async (req, res) => {
  const service = typeof req.query.service === "string" ? req.query.service : "";
  const country = typeof req.query.country === "string" ? req.query.country : "";
  if (!service || !country) return res.status(400).json({ success: false, message: "Service and country are required." });
  if (!await isServiceAllowed(service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try { return res.json({ success: true, pools: await smsPoolClient.validPools(service, country) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/rentals", authMiddleware, async (req, res) => {
  const parsed = z.object({ extendable: z.enum(["0", "1"]).default("1") }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid rental catalog request." });
  try { return res.json({ success: true, rentals: await smsPoolClient.rentals(parsed.data.extendable === "1" ? 1 : 0) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/rentals/:rentalId/services", authMiddleware, async (req, res) => {
  const id = z.string().regex(/^[0-9]+$/).safeParse(req.params.rentalId);
  if (!id.success) return res.status(400).json({ success: false, message: "Invalid rental ID." });
  try { return res.json({ success: true, services: await smsPoolClient.rentalServices(id.data) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/rentals/:rentalId/pricing", authMiddleware, async (req, res) => {
  const id = z.string().regex(/^[0-9]+$/).safeParse(req.params.rentalId);
  const service = typeof req.query.service === "string" ? req.query.service : undefined;
  if (!id.success) return res.status(400).json({ success: false, message: "Invalid rental ID." });
  if (service && !await isServiceAllowed(service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try { return res.json({ success: true, pricing: await smsPoolClient.rentalPricing(id.data, service) }); }
  catch (error) { return providerFailure(res, error); }
});

router.post("/aurelink/quotes", authMiddleware, async (req, res) => {
  const parsed = z.object({
    kind: z.literal("activation"),
    country: z.string().min(1).max(8),
    service: z.string().min(1).max(100),
    pool: z.string().max(32).optional(),
  }).safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid quote request." });
  if (!await isServiceAllowed(parsed.data.service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try {
    const providerPricing = await smsPoolClient.price({ country: parsed.data.country, service: parsed.data.service, pool: parsed.data.pool });
    const prices = pricesIn(providerPricing);
    if (!prices.length) return res.status(502).json({ success: false, message: "SMSPool returned pricing that could not be normalized. No quote was created." });
    const providerMaxPrice = Math.min(...prices);
    const retailAmountMinor = retailPriceMinor(providerMaxPrice);
    const result = await pool.query(
      "INSERT INTO aurelink_quotes (user_id,product_kind,country,service,provider_max_price,retail_amount_minor,currency,provider_pricing,expires_at) VALUES ($1,'activation',$2,$3,$4,$5,'USD',$6::jsonb,NOW()+($7::text||' minutes')::interval) RETURNING id,product_kind,country,service,provider_max_price,retail_amount_minor,currency,expires_at",
      [req.user.userId, parsed.data.country, parsed.data.service, providerMaxPrice, retailAmountMinor, JSON.stringify(providerPricing), String(quoteTtlMinutes)],
    );
    return res.json({ success: true, quote: result.rows[0], retailPriceUsd: (retailAmountMinor / USD_MINOR).toFixed(2), pricingSource: "live SMSPool API", expiresInSeconds: quoteTtlMinutes * 60 });
  } catch (error) { return providerFailure(res, error); }
});

router.post("/aurelink/checkout", authMiddleware, async (req, res) => {
  const parsed = z.object({ quoteId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "A valid AURELINK quote is required." });
  try {
    const checkout = await createAurelinkStripeCheckout({ userId: req.user.userId, quoteId: parsed.data.quoteId });
    return res.status(201).json({ success: true, checkoutUrl: checkout.checkoutUrl, paymentReference: checkout.reference, amountMinor: checkout.amountMinor, currency: checkout.currency, purpose: checkout.purpose });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create AURELINK checkout.";
    return res.status(400).json({ success: false, message });
  }
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
    const redemption = await client.query(
      "INSERT INTO aurelink_payment_redemptions (payment_reference,user_id,quote_id,product_kind) VALUES ($1,$2,$3,'activation') ON CONFLICT DO NOTHING RETURNING payment_reference",
      [parsed.data.paymentReference, req.user.userId, parsed.data.quoteId],
    );
    if (redemption.rowCount !== 1) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "This payment has already been used for an AURELINK order." }); }
    await client.query("UPDATE aurelink_quotes SET consumed_at=NOW() WHERE id=$1", [parsed.data.quoteId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return providerFailure(res, error);
  } finally { client.release(); }

  let providerOrderId: string | null = null;
  try {
    const service = String(quote["service"]);
    const country = String(quote["country"]);
    const maxPrice = Number(quote["provider_max_price"]);
    const provider = await smsPoolClient.purchaseSms({ country, service, maxPrice, pool: parsed.data.pool, pricingOption: parsed.data.pricingOption });
    const data = object(provider);
    providerOrderId = String(data["order_id"] ?? data["orderid"] ?? "");
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
    if (providerOrderId) await smsPoolClient.cancelSms(providerOrderId).catch(() => undefined);
    await pool.query("DELETE FROM aurelink_payment_redemptions WHERE payment_reference=$1 AND user_id=$2", [parsed.data.paymentReference, req.user.userId]).catch(() => undefined);
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
router.post("/aurelink/activations/:orderId/resend", authMiddleware, async (req, res) => {
  if (!adminAllowed(req)) return res.status(403).json({ success: false, message: "Resend is administrator-only until provider resend fees are billed to customers." });
  const orderId = z.string().min(1).max(160).safeParse(req.params.orderId);
  if (!orderId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid order ID." });
  try {
    if (!await ownedOrder(req.user.userId, orderId.data, "activation")) return res.status(404).json({ success: false, message: "Order not found." });
    return res.json({ success: true, resend: await smsPoolClient.resendSms(orderId.data) });
  } catch (error) { return providerFailure(res, error); }
});
router.post("/aurelink/activations/:orderId/cancel", authMiddleware, async (req, res) => {
  if (!adminAllowed(req)) return res.status(403).json({ success: false, message: "Cancellation is administrator-only until customer refunds are integrated." });
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

router.post("/aurelink/rental-quotes", authMiddleware, async (req, res) => {
  const parsed = z.object({
    rentalId: z.number().int().positive(),
    days: z.number().int().min(1).max(365),
    serviceId: z.string().max(100).optional(),
  }).safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental quote request." });
  if (parsed.data.serviceId && !await isServiceAllowed(parsed.data.serviceId)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try {
    const providerPricing = await smsPoolClient.rentalPricing(String(parsed.data.rentalId), parsed.data.serviceId);
    const providerMaxPrice = rentalPriceForDays(providerPricing, parsed.data.days);
    if (providerMaxPrice === null) return res.status(409).json({ success: false, message: "SMSPool did not return an exact live price for this rental duration." });
    const stockResponse = object(await smsPoolClient.rentalStock(String(parsed.data.rentalId), parsed.data.days, parsed.data.serviceId));
    const stockCount = Number(stockResponse["stock"] ?? stockResponse["available"] ?? 1);
    if (Number.isFinite(stockCount) && stockCount <= 0) return res.status(409).json({ success: false, message: "No inventory is currently available for this rental." });
    const retailAmountMinor = retailPriceMinor(providerMaxPrice);
    const quoteMetadata = { rentalCatalogId: parsed.data.rentalId, days: parsed.data.days, serviceId: parsed.data.serviceId ?? null, pricing: providerPricing };
    const result = await pool.query(
      "INSERT INTO aurelink_quotes (user_id,product_kind,country,service,provider_max_price,retail_amount_minor,currency,provider_pricing,expires_at) VALUES ($1,'rental',$2,$3,$4,$5,'USD',$6::jsonb,NOW()+($7::text||' minutes')::interval) RETURNING id,product_kind,provider_max_price,retail_amount_minor,currency,expires_at",
      [req.user.userId, String(parsed.data.rentalId), parsed.data.serviceId ?? "always_on", providerMaxPrice, retailAmountMinor, JSON.stringify(quoteMetadata), String(quoteTtlMinutes)],
    );
    return res.json({ success: true, quote: result.rows[0], retailPriceUsd: (retailAmountMinor / USD_MINOR).toFixed(2), pricingSource: "live SMSPool API", expiresInSeconds: quoteTtlMinutes * 60 });
  } catch (error) { return providerFailure(res, error); }
});

router.post("/aurelink/rentals", authMiddleware, async (req, res) => {
  const parsed = z.object({ quoteId: z.string().uuid(), paymentReference: z.string().min(8).max(100) }).safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "A valid rental quote and payment reference are required." });
  const client = await pool.connect();
  let quote: Record<string, unknown> | undefined;
  let paymentReserved = false;
  let purchasedRentalId: string | null = null;
  try {
    await client.query("BEGIN");
    const quoteResult = await client.query(
      "SELECT * FROM aurelink_quotes WHERE id=$1 AND user_id=$2 AND product_kind='rental' AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",
      [parsed.data.quoteId, req.user.userId],
    );
    quote = quoteResult.rows[0] as Record<string, unknown> | undefined;
    if (!quote) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Rental quote expired, consumed, or not found." }); }
    const paid = await client.query(
      "SELECT id FROM payment_transactions WHERE reference=$1 AND user_id=$2 AND status='paid' AND purpose='aurelink_rental' AND currency='USD' AND amount_minor >= $3 LIMIT 1",
      [parsed.data.paymentReference, req.user.userId, String(quote["retail_amount_minor"])],
    );
    if (paid.rowCount !== 1) { await client.query("ROLLBACK"); return res.status(402).json({ success: false, message: "A verified, paid AURELINK rental transaction covering this quote is required." }); }
    const redemption = await client.query(
      "INSERT INTO aurelink_payment_redemptions (payment_reference,user_id,quote_id,product_kind) VALUES ($1,$2,$3,'rental') ON CONFLICT DO NOTHING RETURNING payment_reference",
      [parsed.data.paymentReference, req.user.userId, parsed.data.quoteId],
    );
    if (redemption.rowCount !== 1) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "This payment has already been used for an AURELINK order." }); }
    await client.query("UPDATE aurelink_quotes SET consumed_at=NOW() WHERE id=$1", [parsed.data.quoteId]);
    await client.query("COMMIT");
    paymentReserved = true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return providerFailure(res, error);
  } finally { client.release(); }

  try {
    const quoteMetadata = typeof quote?.["provider_pricing"] === "string" ? JSON.parse(String(quote["provider_pricing"])) as Record<string, unknown> : quote?.["provider_pricing"] as Record<string, unknown>;
    const rentalCatalogId = Number(quoteMetadata?.["rentalCatalogId"]);
    const days = Number(quoteMetadata?.["days"]);
    const serviceId = quoteMetadata?.["serviceId"] == null ? undefined : String(quoteMetadata["serviceId"]);
    if (!Number.isInteger(rentalCatalogId) || rentalCatalogId <= 0 || !Number.isInteger(days) || days <= 0) throw new SmsPoolError("Rental quote is missing its provider metadata.", { providerType: "INVALID_QUOTE" });
    const provider = await smsPoolClient.purchaseRental({ id: rentalCatalogId, days, service_id: serviceId });
    const data = object(provider);
    const providerOrderId = String(data["rental_code"] ?? data["rental_id"] ?? data["order_id"] ?? "");
    const phoneNumber = String(data["phonenumber"] ?? data["number"] ?? "");
    if (!providerOrderId || !phoneNumber) throw new SmsPoolError("SMSPool returned an incomplete rental response.", { providerType: "INVALID_PROVIDER_RESPONSE" });
    purchasedRentalId = providerOrderId;
    const providerMaxPrice = Number(quote?.["provider_max_price"]);
    const actualCost = Number(data["cost"] ?? providerMaxPrice);
    if (!Number.isFinite(actualCost) || actualCost > providerMaxPrice) {
      await smsPoolClient.cancelRental(providerOrderId).catch(() => undefined);
      purchasedRentalId = null;
      throw new SmsPoolError("Rental cost exceeded the quoted maximum; a refund was requested.", { providerType: "PRICE_GUARD" });
    }
    await pool.query(
      "INSERT INTO aurelink_provider_orders (user_id,quote_id,product_kind,provider_order_id,phone_number,country,service,status,provider_cost,provider_payload) VALUES ($1,$2,'rental',$3,$4,$5,$6,'active',$7,$8::jsonb)",
      [req.user.userId, parsed.data.quoteId, providerOrderId, phoneNumber, String(data["country"] ?? quote?.["country"] ?? ""), serviceId ?? null, actualCost, JSON.stringify({ provider, rentalCatalogId, serviceId, days })],
    );
    return res.status(201).json({ success: true, rental: { rentalId: providerOrderId, phoneNumber, days, providerCostUsd: actualCost, details: provider } });
  } catch (error) {
    if (purchasedRentalId) await smsPoolClient.cancelRental(purchasedRentalId).catch(() => undefined);
    if (paymentReserved) await pool.query("DELETE FROM aurelink_payment_redemptions WHERE payment_reference=$1 AND user_id=$2", [parsed.data.paymentReference, req.user.userId]).catch(() => undefined);
    await pool.query("UPDATE aurelink_quotes SET consumed_at=NULL WHERE id=$1 AND user_id=$2", [parsed.data.quoteId, req.user.userId]).catch(() => undefined);
    return providerFailure(res, error);
  }
});
router.get("/aurelink/rentals/:rentalId/messages", authMiddleware, async (req, res) => {
  const rentalId = z.string().min(1).max(160).safeParse(req.params.rentalId);
  if (!rentalId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental ID." });
  try {
    if (!await ownedOrder(req.user.userId, rentalId.data, "rental")) return res.status(404).json({ success: false, message: "Rental not found." });
    return res.json({ success: true, messages: await smsPoolClient.rentalMessages(rentalId.data) });
  } catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/rentals/:rentalId/status", authMiddleware, async (req, res) => {
  const rentalId = z.string().min(1).max(160).safeParse(req.params.rentalId);
  if (!rentalId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental ID." });
  try {
    if (!await ownedOrder(req.user.userId, rentalId.data, "rental")) return res.status(404).json({ success: false, message: "Rental not found." });
    return res.json({ success: true, status: await smsPoolClient.rentalStatus(rentalId.data) });
  } catch (error) { return providerFailure(res, error); }
});
router.post("/aurelink/rentals/:rentalId/renew", authMiddleware, async (req, res) => {
  const rentalId = z.string().min(1).max(160).safeParse(req.params.rentalId);
  const parsed = z.object({ days: z.number().int().min(1).max(365), paymentReference: z.string().min(8).max(100) }).safeParse(req.body);
  if (!rentalId.success || !parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental renewal request." });
  let paymentReserved = false;
  let renewalSucceeded = false;
  try {
    const rental = await ownedOrder(req.user.userId, rentalId.data, "rental");
    if (!rental) return res.status(404).json({ success: false, message: "Rental not found." });
    const savedPayload = typeof rental.provider_payload === "string" ? JSON.parse(rental.provider_payload) as Record<string, unknown> : rental.provider_payload as Record<string, unknown>;
    const catalogId = Number(savedPayload?.["rentalCatalogId"]);
    if (!Number.isInteger(catalogId) || catalogId <= 0) return res.status(409).json({ success: false, message: "This rental is missing its pricing reference and cannot be renewed automatically." });
    const serviceId = savedPayload?.["serviceId"] == null ? undefined : String(savedPayload["serviceId"]);
    const renewalPricing = await smsPoolClient.rentalPricing(String(catalogId), serviceId);
    const providerMaxPrice = rentalPriceForDays(renewalPricing, parsed.data.days);
    if (providerMaxPrice === null) return res.status(409).json({ success: false, message: "SMSPool did not return an exact live renewal price." });
    const stockResponse = object(await smsPoolClient.rentalStock(String(catalogId), parsed.data.days, serviceId));
    const stockCount = Number(stockResponse["stock"] ?? stockResponse["available"] ?? 1);
    if (Number.isFinite(stockCount) && stockCount <= 0) return res.status(409).json({ success: false, message: "No inventory is available for this renewal duration." });
    const retailAmountMinor = retailPriceMinor(providerMaxPrice);
    const redemption = await pool.query(
      "INSERT INTO aurelink_payment_redemptions (payment_reference,user_id,product_kind) SELECT reference,user_id,'rental' FROM payment_transactions WHERE reference=$1 AND user_id=$2 AND status='paid' AND purpose='aurelink_rental' AND currency='USD' AND amount_minor >= $3 ON CONFLICT DO NOTHING RETURNING payment_reference",
      [parsed.data.paymentReference, req.user.userId, String(retailAmountMinor)],
    );
    if (redemption.rowCount !== 1) return res.status(402).json({ success: false, message: "A valid, unused, paid AURELINK rental-renewal transaction covering the live price is required." });
    paymentReserved = true;
    const renewal = await smsPoolClient.renewRental(rentalId.data, parsed.data.days);
    renewalSucceeded = true;
    await pool.query(
      "UPDATE aurelink_provider_orders SET provider_cost=COALESCE(provider_cost,0)+$2,updated_at=NOW(),provider_payload=provider_payload || $3::jsonb WHERE id=$1",
      [rental["id"], providerMaxPrice, JSON.stringify({ lastRenewal: renewal, renewedDays: parsed.data.days })],
    );
    return res.json({ success: true, renewal });
  } catch (error) {
    if (paymentReserved && !renewalSucceeded) await pool.query("DELETE FROM aurelink_payment_redemptions WHERE payment_reference=$1 AND user_id=$2", [parsed.data.paymentReference, req.user.userId]).catch(() => undefined);
    return providerFailure(res, error);
  }
});
router.post("/aurelink/rentals/:rentalId/cancel", authMiddleware, async (req, res) => {
  if (!adminAllowed(req)) return res.status(403).json({ success: false, message: "Cancellation is administrator-only until customer refunds are integrated." });
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
  if (!adminAllowed(req)) return res.status(403).json({ success: false, message: "Carrier lookups require billing integration or administrator access." });
  try { return res.json({ success: true, lookup: await smsPoolClient.carrierLookup(parsed.data.phoneNumber.replace(/[+ ()-]/g, "")) }); }
  catch (error) { return providerFailure(res, error); }
});

router.get("/aurelink/esim/plans", authMiddleware, async (req, res) => {
  const country = typeof req.query.country === "string" ? req.query.country : "";
  if (!country) return res.status(400).json({ success: false, message: "Country is required for eSIM plans." });
  try { return res.json({ success: true, plans: await smsPoolClient.esimPlans(country) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/esim/pricing", authMiddleware, async (_req, res) => {
  try { return res.json({ success: true, pricing: await smsPoolClient.esimPricing() }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/esim/profile", authMiddleware, async (req, res) => {
  if (!adminAllowed(req)) return res.status(403).json({ success: false, message: "Administrator access required until AURELINK eSIM ownership is implemented." });
  const transactionId = typeof req.query.transactionId === "string" ? req.query.transactionId : undefined;
  try { return res.json({ success: true, profile: await smsPoolClient.esimProfile(transactionId) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/esim/topup-plans", authMiddleware, async (req, res) => {
  if (!adminAllowed(req)) return res.status(403).json({ success: false, message: "Administrator access required until AURELINK eSIM ownership is implemented." });
  const transactionId = typeof req.query.transactionId === "string" ? req.query.transactionId : "";
  if (!transactionId) return res.status(400).json({ success: false, message: "Transaction ID is required." });
  try { return res.json({ success: true, plans: await smsPoolClient.esimTopupPlans(transactionId) }); }
  catch (error) { return providerFailure(res, error); }
});
router.post("/aurelink/esim/purchase", authMiddleware, async (_req, res) => {
  return res.status(501).json({ success: false, message: "eSIM purchases are disabled until payment reconciliation is implemented. SMSPool eSIMs are data-only and do not include a phone number." });
});

export default router;

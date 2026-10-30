import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { pool } from "../database/db";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import { logger } from "../lib/logger";
import { SmsPoolError, smsPoolClient, type SmsPoolPayload } from "../services/aurelink/smspool.client";
import { createAurelinkStripeCheckout } from "../services/payments/stripe-payment.service";
import { createAurelinkWalletTopupCheckout } from "../services/payments/payment.service";
import { walletCredit, walletDebit } from "../services/aurelink/aurelink-wallet.service";
import { verifyAurelinkNumber, veriphoneLineAssessment } from "../services/aurelink/veriphone.client";
import { aurelinkPriceBreakdown, type AurelinkNumberProduct } from "../services/aurelink/aurelink-pricing.service";
import { nonVoipClient, nvRows } from "../services/aurelink/nonvoip.client";

const router = Router();
const USD_MINOR = 100;
const quoteTtlMinutes = 10;

function serviceEntries(value: unknown, output: Array<{ id: string; name: string }> = []): Array<{ id: string; name: string }> {
  if (Array.isArray(value)) { for (const item of value) serviceEntries(item, output); return output; }
  if (!value || typeof value !== "object") return output;
  const row = value as Record<string, unknown>;
  const idValue = row["ID"] ?? row["id"] ?? row["service_id"] ?? row["serviceId"];
  const nameValue = row["name"] ?? row["service"] ?? row["service_name"] ?? row["short_name"];
  if (idValue != null && nameValue != null && (typeof idValue === "string" || typeof idValue === "number") && typeof nameValue === "string") {
    output.push({ id: String(idValue).trim().toLowerCase(), name: nameValue.trim().toLowerCase() });
  }
  for (const child of Object.values(row)) if (child && typeof child === "object") serviceEntries(child, output);
  return output;
}
async function isServiceAllowed(service: string): Promise<boolean> {
  const normalized = service.trim().toLowerCase();
  if (!normalized) return false;
  // The live SMSPool catalogue is the source of truth. Do not require a second
  // environment allowlist: an empty AURELINK_ALLOWED_SERVICES previously blocked
  // every provider service even when SMSPool returned it in its catalogue.
  try {
    const entries = serviceEntries(await smsPoolClient.services());
    const match = entries.find((entry) => entry.id === normalized || entry.name === normalized);
    if (!match) return false;
    if (/bank|crypto|exchange|government|telecom|carrier/.test(match.name)) return false;
    // WhatsApp remains a separate premium NonVoip channel until SMSPool explicitly approves it.
    if (match.name.includes("whatsapp") && process.env.SMSPOOL_WHATSAPP_APPROVED !== "true") return false;
    return true;
  } catch {
    return false;
  }
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
function newAurelinkOrderId(): string { return String(randomInt(112, 115)) + String(randomInt(0, 100_000)).padStart(5, "0"); }

function retailPriceMinor(providerPrice: number, product: AurelinkNumberProduct): number {
  return aurelinkPriceBreakdown(providerPrice, product)?.totalMinor ?? 0;
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
function countryEntries(value: unknown, output: Array<{ id: string; code: string; name: string }> = []): Array<{ id: string; code: string; name: string }> {
  if (Array.isArray(value)) { for (const item of value) countryEntries(item, output); return output; }
  if (!value || typeof value !== "object") return output;
  const row = value as Record<string, unknown>;
  const idValue = row["ID"] ?? row["id"] ?? row["country_id"] ?? row["countryId"];
  const nameValue = row["name"] ?? row["country"] ?? row["country_name"];
  const codeValue = row["iso"] ?? row["iso2"] ?? row["code"] ?? row["short_name"] ?? row["country_code"] ?? "";
  if (idValue != null && nameValue != null && (typeof idValue === "string" || typeof idValue === "number") && typeof nameValue === "string") {
    output.push({ id: String(idValue).toLowerCase(), code: String(codeValue).toLowerCase(), name: nameValue.trim().toLowerCase() });
  }
  for (const child of Object.values(row)) if (child && typeof child === "object") countryEntries(child, output);
  return output;
}
function filterVirtualInventory(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((item) => {
    if (!item || typeof item !== "object") return true;
    const row = item as Record<string, unknown>;
    const name = String(row["name"] ?? row["country"] ?? row["country_name"] ?? "").toLowerCase();
    return !/virtual|voip/.test(name);
  }).map((item) => filterVirtualInventory(item));
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  const name = String(row["name"] ?? row["country"] ?? row["country_name"] ?? "").toLowerCase();
  if (name && /virtual|voip/.test(name)) return null;
  const filtered: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(row)) {
    const next = filterVirtualInventory(child);
    if (next !== null && next !== undefined) filtered[key] = next;
  }
  return filtered;
}
async function isCountryAvailable(country: string): Promise<boolean> {
  try {
    const entries = countryEntries(await smsPoolClient.countries());
    const normalized = country.trim().toLowerCase();
    return entries.some((entry) => entry.id === normalized || entry.code === normalized || entry.name === normalized);
  } catch { return false; }
}
async function isRentalAvailable(rentalId: number): Promise<boolean> {
  try {
    const catalogs = await Promise.all([smsPoolClient.rentals(1), smsPoolClient.rentals(0)]);
    for (const catalog of catalogs) {
      const rows = catalog !== null && typeof catalog === "object" ? catalog as Record<string, unknown> : {};
      for (const [key, value] of Object.entries(rows)) {
        if (!value || typeof value !== "object") continue;
        const row = value as Record<string, unknown>;
        const id = String(row["ID"] ?? row["id"] ?? key);
        if (id === String(rentalId)) return true;
      }
    }
    return false;
  } catch { return false; }
}
function providerFields(value: unknown, output: Array<{ key: string; value: string }> = []): Array<{ key: string; value: string }> {
  if (Array.isArray(value)) { for (const item of value) providerFields(item, output); return output; }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
      output.push({ key: key.toLowerCase(), value: String(child).trim() });
    } else if (child && typeof child === "object") providerFields(child, output);
  }
  return output;
}
function carrierAssessment(value: unknown): { carrier: string | null; lineType: string | null; result: "voip" | "mobile" | "unknown" } {
  const fields = providerFields(value);
  const carrierField = fields.find((field) => /^(carrier|carrier_name|operator|network_name|provider_name)$/.test(field.key) && field.value && !/^(unknown|none|null|n\/a)$/i.test(field.value));
  const typeFields = fields.filter((field) => /(type|network|line|connection|category|classification)/.test(field.key));
  const typeText = typeFields.map((field) => field.value).join(" ").toLowerCase();
  const allText = fields.map((field) => field.value).join(" ").toLowerCase();
  if (/\bvoip\b|voice[ -]?over[ -]?ip|virtual[ -]?(?:number|line|phone|telephony)/i.test(typeText) || /\bvoip\b|voice[ -]?over[ -]?ip|virtual[ -]?(?:number|line|phone|telephony)/i.test(allText)) {
    return { carrier: carrierField?.value ?? null, lineType: typeText || null, result: "voip" };
  }
  if (/\b(?:mobile|wireless|cellular|gsm|lte|5g|4g|3g)\b/i.test(typeText)) {
    return { carrier: carrierField?.value ?? null, lineType: typeText || null, result: "mobile" };
  }
  // Some provider responses return a dedicated boolean instead of a line-type string.
  const voipFlag = fields.find((field) => /^(is_voip|voip|virtual|is_virtual)$/.test(field.key));
  if (voipFlag && /^(true|1|yes)$/i.test(voipFlag.value)) return { carrier: carrierField?.value ?? null, lineType: "voip", result: "voip" };
  const mobileFlag = fields.find((field) => /^(is_mobile|mobile|wireless)$/.test(field.key));
  if (mobileFlag && /^(true|1|yes)$/i.test(mobileFlag.value)) return { carrier: carrierField?.value ?? null, lineType: "mobile", result: "mobile" };
  return { carrier: carrierField?.value ?? null, lineType: typeText || null, result: "unknown" };
}
function expiryDate(value: unknown, fallbackSeconds?: number): Date | null {
  const direct = value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
  const raw = direct["expires_at"] ?? direct["expiration"] ?? direct["expiry"] ?? direct["expires"];
  if (typeof raw === "string" && raw.trim()) {
    const parsed = new Date(raw);
    if (Number.isFinite(parsed.getTime())) return parsed;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric < 100000000000 ? numeric * 1000 : numeric);
  }
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return new Date(raw < 100000000000 ? raw * 1000 : raw);
  const secondsRaw = direct["expires_in"] ?? direct["time_left"];
  const seconds = typeof secondsRaw === "number" ? secondsRaw : typeof secondsRaw === "string" ? Number(secondsRaw) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return new Date(Date.now() + seconds * 1000);
  if (fallbackSeconds !== undefined && Number.isFinite(fallbackSeconds) && fallbackSeconds > 0) return new Date(Date.now() + fallbackSeconds * 1000);
  return null;
}

async function ownedOrder(userId: string, orderId: string, kind?: string) {
  const result = await pool.query(
    "SELECT * FROM aurelink_provider_orders WHERE aurelink_user_id=$1 AND provider_order_id=$2 AND ($3::text IS NULL OR product_kind=$3) LIMIT 1",
    [userId, orderId, kind ?? null],
  );
  return result.rows[0] ?? null;
}

router.get("/aurelink/wallet",aurelinkAuthMiddleware,async(req,res)=>{
  if(!req.user?.userId)return res.status(401).json({success:false,message:"Authentication required."});
  try{
    const client=await pool.connect();try{await client.query("BEGIN");const q=await client.query("INSERT INTO aurelink_wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET updated_at=NOW() RETURNING balance_minor,currency,updated_at",[req.user.userId]);await client.query("COMMIT");return res.json({success:true,wallet:{balanceMinor:String(q.rows[0].balance_minor),balanceUsd:(Number(q.rows[0].balance_minor)/100).toFixed(2),currency:q.rows[0].currency}});}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  }catch{return res.status(500).json({success:false,message:"Unable to load Aurelink wallet."});}
});
router.get("/aurelink/wallet/ledger",aurelinkAuthMiddleware,async(req,res)=>{
  if(!req.user?.userId)return res.status(401).json({success:false,message:"Authentication required."});
  const limit=Math.min(100,Math.max(1,Number(req.query.limit)||30));
  try{const q=await pool.query("SELECT entry_type,direction,amount_minor,balance_after_minor,currency,reference,order_id,payment_reference,description,created_at FROM aurelink_wallet_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",[req.user.userId,limit]);return res.json({success:true,entries:q.rows});}catch{return res.status(500).json({success:false,message:"Unable to load wallet ledger."});}
});
router.post("/aurelink/wallet/topup",aurelinkAuthMiddleware,async(req,res)=>{
  const parsed=z.object({amountUsd:z.number().min(5).max(5000)}).safeParse(req.body);
  if(!parsed.success||!req.user?.userId)return res.status(400).json({success:false,message:"Enter a wallet top-up between $5 and $5,000 USD."});
  try{const checkout=await createAurelinkWalletTopupCheckout({userId:req.user.userId,amountMinor:Math.round(parsed.data.amountUsd*100)});return res.status(201).json({success:true,...checkout});}
  catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to create wallet top-up."});}
});
router.get("/aurelink/status", aurelinkAuthMiddleware, (_req, res) => {
  return res.json({
    success: true,
    provider: "smspool",
    configured: Boolean(process.env.SMSPOOL_API_KEY?.trim()),
    serviceAvailability: "live_provider_catalog",
    whatsappApproved: false,
    features: { oneTimeSms: true, rentals: true, carrierLookup: true, carrierVerificationBeforeAcceptance: true, lifecycleTracking: Boolean(process.env.SMSPOOL_API_KEY?.trim()), esimCatalog: true, esimPurchaseEnabled: false, voiceAndFlash: true, whatsapp: false },
    note: "WhatsApp is a separate premium channel and is not supplied by SMSPool. SMSPool eSIMs are data-only and do not provide a phone number.",
  });
});


router.get("/aurelink/short-term/providers", aurelinkAuthMiddleware, async (_req,res)=>{
  let nonVoipCountryCount=0;
  let smsPoolCountryCount=0;
  let nonVoipAvailable=Boolean(process.env.NONVOIP_API_KEY?.trim());
  let smsPoolAvailable=Boolean(process.env.SMSPOOL_API_KEY?.trim());
  try{
    if(nonVoipAvailable){
      const countries=new Set<string>();
      for(let page=1;page<=20;page++){
        const rows=nvRows(await nonVoipClient.products("short-term",undefined,page,50));
        for(const row of rows){
          const code=String(row.country_code??row.countryCode??row.iso2??row.country??"").trim().toUpperCase();
          const price=Number(row.customer_price??row.price??row.cost??row.amount??0);
          const available=row.available!==false&&row.in_stock!==false&&Number(row.stock??row.available_count??1)>0;
          if(code&&available&&Number.isFinite(price)&&price>0) countries.add(code);
        }
        if(rows.length<50)break;
      }
      nonVoipCountryCount=countries.size;
    }
  }catch(error){nonVoipAvailable=false;logger.warn({provider:"nonvoip",errorType:error instanceof Error?error.name:typeof error},"AURELINK Short-term NonVoip country count unavailable");}
  try{
    if(smsPoolAvailable){
      const countries=countryEntries(filterVirtualInventory(await smsPoolClient.countries()));
      smsPoolCountryCount=new Set(countries.map(x=>x.code||x.id)).size;
    }
  }catch(error){smsPoolAvailable=false;logger.warn({provider:"smspool",errorType:error instanceof Error?error.name:typeof error},"AURELINK Short-term SMSPool country count unavailable");}
  return res.json({success:true,product:"short_term",providers:[
    {id:"nonvoip",label:"Lisa Pool 1",pool:1,provider:"NonVoip",available:nonVoipAvailable,countryCount:nonVoipCountryCount},
    {id:"smspool",label:"Mike Pool 2",pool:2,provider:"SMSPool",available:smsPoolAvailable,countryCount:smsPoolCountryCount}
  ]});
});

router.get("/aurelink/provider/balance", aurelinkAuthMiddleware, async (req, res) => {
  if (!adminAllowed(req)) return res.status(403).json({ success: false, message: "Administrator access required." });
  try { return res.json({ success: true, balance: await smsPoolClient.balance() }); }
  catch (error) { return providerFailure(res, error); }
});

router.get("/aurelink/catalog/services", aurelinkAuthMiddleware, async (_req, res) => {
  try { return res.json({ success: true, services: await smsPoolClient.services() }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/countries", aurelinkAuthMiddleware, async (_req, res) => {
  try { return res.json({ success: true, countries: await smsPoolClient.countries() }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/pools", aurelinkAuthMiddleware, async (_req, res) => {
  try { return res.json({ success: true, pools: await smsPoolClient.pools() }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/pricing", aurelinkAuthMiddleware, async (req, res) => {
  const parsed = z.object({ country: z.string().min(1).max(8), service: z.string().min(1).max(100), pool: z.string().max(32).optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Valid country and service are required." });
  if (!await isServiceAllowed(parsed.data.service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  if (!await isCountryAvailable(parsed.data.country)) return res.status(403).json({ success: false, message: "This country is not available in the provider catalog." });
  try {
    const pricing = await smsPoolClient.price({ country: parsed.data.country, service: parsed.data.service, pool: parsed.data.pool });
    const prices = pricesIn(pricing);
    return res.json({ success: true, pricing, lowestDetectedPrice: prices.length ? Math.min(...prices) : null, currency: "USD" });
  } catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/stock", aurelinkAuthMiddleware, async (req, res) => {
  const parsed = z.object({ country: z.string().min(1).max(8), service: z.string().min(1).max(100), pool: z.string().max(32).optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Valid country and service are required." });
  if (!await isServiceAllowed(parsed.data.service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  if (!await isCountryAvailable(parsed.data.country)) return res.status(403).json({ success: false, message: "This country is not available in the provider catalog." });
  try { return res.json({ success: true, stock: await smsPoolClient.stock(parsed.data) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/suggested-countries", aurelinkAuthMiddleware, async (req, res) => {
  const service = typeof req.query.service === "string" ? req.query.service : "";
  if (!service) return res.status(400).json({ success: false, message: "Service is required." });
  if (!await isServiceAllowed(service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try { return res.json({ success: true, countries: await smsPoolClient.suggestedCountries(service) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/success-rate", aurelinkAuthMiddleware, async (req, res) => {
  const service = typeof req.query.service === "string" ? req.query.service : "";
  const country = typeof req.query.country === "string" ? req.query.country : undefined;
  if (!service) return res.status(400).json({ success: false, message: "Service is required." });
  if (!await isServiceAllowed(service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try { return res.json({ success: true, successRate: await smsPoolClient.successRate(service, country) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/valid-pools", aurelinkAuthMiddleware, async (req, res) => {
  const service = typeof req.query.service === "string" ? req.query.service : "";
  const country = typeof req.query.country === "string" ? req.query.country : "";
  if (!service || !country) return res.status(400).json({ success: false, message: "Service and country are required." });
  if (!await isServiceAllowed(service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try { return res.json({ success: true, pools: await smsPoolClient.validPools(service, country) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/rentals", aurelinkAuthMiddleware, async (req, res) => {
  const parsed = z.object({ extendable: z.enum(["0", "1"]).default("1") }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid rental catalog request." });
  try { return res.json({ success: true, rentals: await smsPoolClient.rentals(parsed.data.extendable === "1" ? 1 : 0) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/rentals/:rentalId/services", aurelinkAuthMiddleware, async (req, res) => {
  const id = z.string().regex(/^[0-9]+$/).safeParse(req.params.rentalId);
  if (!id.success) return res.status(400).json({ success: false, message: "Invalid rental ID." });
  try { return res.json({ success: true, services: await smsPoolClient.rentalServices(id.data) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/catalog/rentals/:rentalId/pricing", aurelinkAuthMiddleware, async (req, res) => {
  const id = z.string().regex(/^[0-9]+$/).safeParse(req.params.rentalId);
  const service = typeof req.query.service === "string" ? req.query.service : undefined;
  if (!id.success) return res.status(400).json({ success: false, message: "Invalid rental ID." });
  if (service && !await isServiceAllowed(service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  try { return res.json({ success: true, pricing: await smsPoolClient.rentalPricing(id.data, service) }); }
  catch (error) { return providerFailure(res, error); }
});

router.post("/aurelink/quotes", aurelinkAuthMiddleware, async (req, res) => {
  const parsed = z.object({
    kind: z.literal("activation"),
    country: z.string().min(1).max(8),
    service: z.string().min(1).max(100),
    pool: z.string().max(32).optional(),
  }).safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid quote request." });
  if (!await isServiceAllowed(parsed.data.service)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  if (!await isCountryAvailable(parsed.data.country)) return res.status(403).json({ success: false, message: "This country is not available in the provider catalog." });
  try {
    const smsPoolId = parsed.data.pool ?? "2";
    const providerPricing = await smsPoolClient.price({ country: parsed.data.country, service: parsed.data.service, pool: smsPoolId });
    const prices = pricesIn(providerPricing);
    if (!prices.length) return res.status(502).json({ success: false, message: "SMSPool returned pricing that could not be normalized. No quote was created." });
    const providerMaxPrice = Math.min(...prices);
    const priorOtp = await pool.query("SELECT 1 FROM aurelink_provider_orders WHERE aurelink_user_id=$1 AND product_kind='activation' AND sms_received_at IS NOT NULL LIMIT 1", [req.user.userId]);
    const firstPurchaseEligible = priorOtp.rowCount === 0;
    const requiredLineType = firstPurchaseEligible ? "mobile" : "voip";
    const priceBreakdown = aurelinkPriceBreakdown(providerMaxPrice, "short_term", { firstPurchase: firstPurchaseEligible });
    if (!priceBreakdown) return res.status(409).json({ success: false, message: "This number is unavailable because the provider returned a zero or invalid price." });
    const retailAmountMinor = priceBreakdown.totalMinor;
    const result = await pool.query(
      "INSERT INTO aurelink_quotes (aurelink_user_id,product_kind,country,service,provider_max_price,retail_amount_minor,currency,provider_pricing,expires_at) VALUES ($1,'activation',$2,$3,$4,$5,'USD',$6::jsonb,NOW()+($7::text||' minutes')::interval) RETURNING id,product_kind,country,service,provider_max_price,retail_amount_minor,currency,expires_at",
      [req.user.userId, parsed.data.country, parsed.data.service, providerMaxPrice, retailAmountMinor, JSON.stringify({providerPricing,pricingRule:{providerMultiplier:2,firstPurchaseEligible,requiredLineType,firstPurchaseDiscount:priceBreakdown.firstPurchaseDiscountMinor/100},priceBreakdown}), String(quoteTtlMinutes)],
    );
    return res.json({ success: true, provider: "smspool", poolLabel: "Mike Pool 2", pool: smsPoolId, quote: result.rows[0], retailPriceUsd: (retailAmountMinor / USD_MINOR).toFixed(2), priceBreakdown, requiredLineType, eligibility: firstPurchaseEligible ? "first_purchase_mobile" : "returning_customer_voip", pricingSource: "live SMSPool API", expiresInSeconds: quoteTtlMinutes * 60 });
  } catch (error) { return providerFailure(res, error); }
});

router.post("/aurelink/checkout", aurelinkAuthMiddleware, async (req, res) => {
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

router.post("/aurelink/activations", aurelinkAuthMiddleware, async (req, res) => {
  const parsed = z.object({ quoteId: z.string().uuid(), paymentReference: z.string().min(8).max(100).optional(), pool: z.string().max(32).optional(), pricingOption: z.union([z.literal(0), z.literal(1)]).optional() }).safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Valid quote and payment reference are required." });
  const client = await pool.connect();
  let quote: Record<string, unknown> | undefined;
  try {
    await client.query("BEGIN");
    const quoteResult = await client.query(
      "SELECT * FROM aurelink_quotes WHERE id=$1 AND aurelink_user_id=$2 AND product_kind='activation' AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",
      [parsed.data.quoteId, req.user.userId],
    );
    quote = quoteResult.rows[0] as Record<string, unknown> | undefined;
    if (!quote) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Quote expired, consumed, or not found." }); }
    if(parsed.data.paymentReference){
      const paid=await client.query("SELECT id FROM payment_transactions WHERE reference=$1 AND user_id=$2 AND status='paid' AND purpose='aurelink_otp' AND currency='USD' AND amount_minor >= $3 LIMIT 1",[parsed.data.paymentReference,req.user.userId,String(quote["retail_amount_minor"])]);
      if(paid.rowCount!==1){await client.query("ROLLBACK");return res.status(402).json({success:false,message:"A verified paid transaction is required."});}
      const redemption=await client.query("INSERT INTO aurelink_payment_redemptions(payment_reference,user_id,quote_id,product_kind) VALUES($1,$2,$3,'activation') ON CONFLICT DO NOTHING RETURNING payment_reference",[parsed.data.paymentReference,req.user.userId,parsed.data.quoteId]);
      if(redemption.rowCount!==1){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"This payment has already been used."});}
    }else{
      try{await walletDebit(client,{userId:req.user.userId,amountMinor:String(quote["retail_amount_minor"]),reference:"purchase:"+parsed.data.quoteId,type:"purchase",description:"Short-term mobile number purchase",metadata:{quoteId:parsed.data.quoteId,service:quote["service"],country:quote["country"]}});}
      catch(e){await client.query("ROLLBACK");if(e instanceof Error&&e.message==="INSUFFICIENT_AURELINK_CREDIT")return res.status(402).json({success:false,code:"INSUFFICIENT_CREDIT",message:"Your Aurelink wallet balance is insufficient for this purchase."});throw e;}
    }
    await client.query("UPDATE aurelink_quotes SET consumed_at=NOW() WHERE id=$1",[parsed.data.quoteId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return providerFailure(res, error);
  } finally { client.release(); }

  let providerOrderId: string | null = null;
  try {
    const service = String(quote["service"]);
    const country = String(quote["country"]);
    if (!await isCountryAvailable(country)) throw new SmsPoolError("Country is not available in the provider catalog.", { providerType: "COUNTRY_NOT_AVAILABLE" });
    const maxPrice = Number(quote["provider_max_price"]);
    const provider = await smsPoolClient.purchaseSms({ country, service, maxPrice, pool: parsed.data.pool ?? "2", pricingOption: parsed.data.pricingOption });
    const data = object(provider);
    providerOrderId = String(data["order_id"] ?? data["orderid"] ?? "");
    const phoneNumber = String(data["number"] ?? data["phonenumber"] ?? "");
    if (!providerOrderId || !phoneNumber) throw new SmsPoolError("SMSPool returned an incomplete activation response.", { providerType: "INVALID_PROVIDER_RESPONSE" });
    const actualCost = Number(data["cost"] ?? maxPrice);
    if (!Number.isFinite(actualCost) || actualCost > maxPrice) {
      await smsPoolClient.cancelSms(providerOrderId).catch(() => undefined);
      throw new SmsPoolError("Provider cost exceeded the quoted maximum; the order was cancelled.", { providerType: "PRICE_GUARD" });
    }
    // Verify the purchased number itself; country-level catalog labels are not sufficient proof.
    let lookup: SmsPoolPayload;
    try { lookup = await verifyAurelinkNumber(phoneNumber); }
    catch {
      await smsPoolClient.cancelSms(providerOrderId).catch(() => undefined);
      throw new SmsPoolError("Carrier verification failed. The number was not accepted and cancellation was requested.", { providerType: "CARRIER_LOOKUP_FAILED" });
    }
    const lineAssessment=veriphoneLineAssessment(lookup as unknown as {status?:string;phone_valid?:boolean;phone_type?:string;carrier?:string;current_carrier?:string});
    const assessment={result:lineAssessment.lineType.includes("mobile")?"mobile":lineAssessment.lineType.includes("voip")?"voip":"unknown",carrier:lineAssessment.carrier,lineType:lineAssessment.lineType};
    const pricingRule=(quote["provider_pricing"] as Record<string,unknown>)?.["pricingRule"] as Record<string,unknown>|undefined;
    const requiredLineType=String(pricingRule?.["requiredLineType"]??"mobile");
    if (!lineAssessment.valid || assessment.result !== requiredLineType) {
      const cancelled=object(await smsPoolClient.cancelSms(providerOrderId).catch(() => ({})));
      const cancelConfirmed=cancelled["success"]===true||cancelled["success"]===1||/^(success|cancelled|canceled|refunded)$/i.test(String(cancelled["status"]??cancelled["message"]??""));
      if(!cancelConfirmed) logger.error({providerOrderId,requiredLineType,actualLineType:assessment.result},"AURELINK line-type mismatch; provider cancellation is unconfirmed");
      throw new SmsPoolError(assessment.result==="unknown"?"Veriphone could not classify this number. It was not shown to the customer.":"This number does not match the line type required for this customer's short-term eligibility. It was not shown to the customer.", { providerType: assessment.result==="unknown"?"LINE_TYPE_UNKNOWN":"LINE_TYPE_MISMATCH" });
    }
    const expiry = expiryDate(data);
    const aurelinkOrderId = newAurelinkOrderId();
    await pool.query(
      "INSERT INTO aurelink_provider_orders (aurelink_order_id,aurelink_user_id,quote_id,product_kind,provider_order_id,phone_number,country,service,status,provider_cost,retail_amount_minor,wallet_debit_reference,first_purchase_discount,carrier_name,line_type,verification_status,verified_at,expires_at,provider_payload) VALUES ($1,$2,$3,'activation',$4,$5,$6,$7,'pending',$8,$9,$10,$15,$11,$12,'verified',NOW(),$13,$14::jsonb)",
      [aurelinkOrderId, req.user.userId, parsed.data.quoteId, providerOrderId, phoneNumber, country, service, actualCost, String(quote["retail_amount_minor"]), parsed.data.paymentReference ? null : "purchase:"+parsed.data.quoteId, assessment.carrier, assessment.lineType ?? "unknown", expiry, JSON.stringify({ provider, carrierLookup: lookup, verification: { result: assessment.result, checkedAt: new Date().toISOString() } }), Boolean(((quote["provider_pricing"] as Record<string,unknown>)?.["pricingRule"] as Record<string,unknown>|undefined)?.["firstPurchaseEligible"])],
    );
    return res.status(201).json({ success: true, order: { aurelinkOrderId, orderId: providerOrderId, phoneNumber, country, service, carrier: assessment.carrier, lineType: assessment.lineType ?? "mobile", verificationStatus: "verified", verifiedAt: new Date().toISOString(), providerCostUsd: actualCost, status: data["status"] ?? "pending", expiresAt: expiry?.toISOString() ?? null, expiresIn: data["expires_in"] ?? null } });
  } catch (error) {
    let providerCancellationConfirmed = !providerOrderId;
    if (providerOrderId) {
      const cancellation = object(await smsPoolClient.cancelSms(providerOrderId).catch(() => ({})));
      providerCancellationConfirmed = cancellation["success"] === true || cancellation["success"] === 1 ||
        /^(success|cancelled|canceled|refunded)$/i.test(String(cancellation["status"] ?? cancellation["message"] ?? ""));
      if (!providerCancellationConfirmed) {
        logger.error({ providerOrderId }, "AURELINK provider cancellation is unconfirmed; wallet debit retained for reconciliation");
      }
    }
    if(parsed.data.paymentReference)await pool.query("DELETE FROM aurelink_payment_redemptions WHERE payment_reference=$1 AND user_id=$2",[parsed.data.paymentReference,req.user.userId]).catch(()=>undefined);
    else if (providerCancellationConfirmed) {
      const refundClient=await pool.connect();
      try {
        await refundClient.query("BEGIN");
        await walletCredit(refundClient,{userId:req.user.userId,amountMinor:String(quote?.["retail_amount_minor"]??0),reference:"refund:purchase:"+parsed.data.quoteId,type:"refund",description:"Automatic refund after provider purchase failure or confirmed cancellation",metadata:{quoteId:parsed.data.quoteId,providerOrderId}});
        await refundClient.query("COMMIT");
      } catch(e) {
        await refundClient.query("ROLLBACK").catch(()=>undefined);
        logger.error({errorType:e instanceof Error?e.name:typeof e},"AURELINK wallet purchase refund failed");
      } finally { refundClient.release(); }
    }
    await pool.query("UPDATE aurelink_quotes SET consumed_at=NULL WHERE id=$1 AND aurelink_user_id=$2", [parsed.data.quoteId, req.user.userId]).catch(() => undefined);
    return providerFailure(res, error);
  }
});

router.get("/aurelink/activations/:orderId/messages", aurelinkAuthMiddleware, async (req, res) => {
  const orderId = z.string().min(1).max(160).safeParse(req.params.orderId);
  if (!orderId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid order ID." });
  try {
    const order = await ownedOrder(req.user.userId, orderId.data, "activation");
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    if (String(order["provider"] ?? "smspool").toLowerCase() === "nonvoip") {
      const response = await nonVoipClient.messages(orderId.data);
      const body = nvRecord(response);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const arrived = messages.length > 0;
      await pool.query(
        "UPDATE aurelink_provider_orders SET sms_received_at=CASE WHEN $2 THEN COALESCE(sms_received_at,NOW()) ELSE sms_received_at END,last_provider_check_at=NOW(),updated_at=NOW(),provider_payload=provider_payload || $3::jsonb WHERE id=$1",
        [order["id"], arrived, JSON.stringify({ lastNonVoipMessages: messages })],
      );
      return res.json({ success: true, message: { status: arrived ? "completed" : order["status"], messages, smsReceivedAt: arrived ? (order["sms_received_at"] ?? new Date().toISOString()) : null, expiresAt: order["expires_at"] ?? null } });
    }
    const message = object(await smsPoolClient.checkSms(orderId.data));
    const arrived = message["status"] === 3 || Boolean(message["sms"] ?? message["full_sms"]);
    const expiry = expiryDate(message);
    const nextStatus = message["status"] === 3 ? "completed" : message["status"] === 6 ? "refunded" : undefined;
    await pool.query(
      "UPDATE aurelink_provider_orders SET status=COALESCE($2,status),sms_received_at=CASE WHEN $3 THEN COALESCE(sms_received_at,NOW()) ELSE sms_received_at END,expires_at=COALESCE($4,expires_at),last_provider_check_at=NOW(),updated_at=NOW(),provider_payload=provider_payload || $5::jsonb WHERE id=$1",
      [order["id"], nextStatus ?? null, arrived, expiry, JSON.stringify({ lastPoll: { status: message["status"] ?? null, smsReceived: arrived, checkedAt: new Date().toISOString() } })],
    );
    return res.json({ success: true, message: { status: message["status"], sms: message["sms"] ?? null, fullSms: message["full_sms"] ?? null, smsReceivedAt: arrived ? (order["sms_received_at"] ?? new Date().toISOString()) : null, expiresAt: expiry?.toISOString() ?? order["expires_at"] ?? null, timeLeft: message["time_left"] ?? null } });
  } catch (error) { return providerFailure(res, error); }
});
router.post("/aurelink/activations/:orderId/resend", aurelinkAuthMiddleware, async (req, res) => {
  if (!adminAllowed(req)) return res.status(403).json({ success: false, message: "Resend is administrator-only until provider resend fees are billed to customers." });
  const orderId = z.string().min(1).max(160).safeParse(req.params.orderId);
  if (!orderId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid order ID." });
  try {
    if (!await ownedOrder(req.user.userId, orderId.data, "activation")) return res.status(404).json({ success: false, message: "Order not found." });
    return res.json({ success: true, resend: await smsPoolClient.resendSms(orderId.data) });
  } catch (error) { return providerFailure(res, error); }
});
router.post("/aurelink/activations/:orderId/cancel", aurelinkAuthMiddleware, async (req, res) => {
  const orderId = z.string().min(1).max(160).safeParse(req.params.orderId);
  if (!orderId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid order ID." });
  try {
    const order = await ownedOrder(req.user.userId, orderId.data, "activation");
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    if(["completed","refunded","cancelled","expired"].includes(String(order["status"])))return res.status(409).json({success:false,message:"This activation is no longer cancellable."});
    if (String(order["provider"] ?? "smspool").toLowerCase() === "nonvoip") {
      const result = nvRecord(await nonVoipClient.cancel(orderId.data));
      const confirmed = result["success"] === true || result["success"] === 1 || /^(success|cancelled|canceled|refunded)$/i.test(String(result["status"] ?? result["message"] ?? ""));
      if (!confirmed) return res.status(409).json({ success: false, message: "NonVoip has not confirmed cancellation. No wallet refund has been issued.", provider: result });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("UPDATE aurelink_provider_orders SET status='cancelled',updated_at=NOW(),provider_payload=provider_payload || $2::jsonb WHERE id=$1", [order["id"], JSON.stringify({ cancellation: result })]);
        if (order["wallet_debit_reference"] && order["retail_amount_minor"]) {
          await walletCredit(client, { userId: req.user.userId, amountMinor: String(order["retail_amount_minor"]), reference: "refund:" + String(order["wallet_debit_reference"]), type: "refund", description: "Provider-confirmed NonVoip activation cancellation refund", orderId: String(order["id"]), metadata: { providerCancellation: result } });
          await client.query("UPDATE aurelink_provider_orders SET refund_reference=$2 WHERE id=$1", [order["id"], "refund:" + String(order["wallet_debit_reference"])]);
        }
        await client.query("COMMIT");
        return res.json({ success: true, cancellation: result, refunded: Boolean(order["wallet_debit_reference"]) });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally { client.release(); }
    }
    const result=object(await smsPoolClient.cancelSms(orderId.data));
    const cancelOk=result["success"]===1||result["success"]===true||/cancel|refund|success/i.test(String(result["message"]??result["status"]??""));
    if(!cancelOk)return res.status(409).json({success:false,message:"The provider has not confirmed cancellation. No wallet refund has been issued.",provider:result});
    const client=await pool.connect();
    try{await client.query("BEGIN");await client.query("UPDATE aurelink_provider_orders SET status='cancelled',updated_at=NOW(),provider_payload=provider_payload || $2::jsonb WHERE id=$1",[order["id"],JSON.stringify({cancellation:result})]);
      if(order["wallet_debit_reference"]&&order["retail_amount_minor"]){await walletCredit(client,{userId:req.user.userId,amountMinor:String(order["retail_amount_minor"]),reference:"refund:"+String(order["wallet_debit_reference"]),type:"refund",description:"Provider-confirmed activation cancellation refund",orderId:String(order["id"]),metadata:{providerCancellation:result}});await client.query("UPDATE aurelink_provider_orders SET refund_reference=$2 WHERE id=$1",[order["id"],"refund:"+String(order["wallet_debit_reference"])]);}
      await client.query("COMMIT");return res.json({success:true,cancellation:result,refunded:Boolean(order["wallet_debit_reference"])});
    }catch(e){await client.query("ROLLBACK").catch(()=>undefined);throw e;}finally{client.release();}
  } catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/orders", aurelinkAuthMiddleware, async (req, res) => {
  if (!req.user?.userId) return res.status(401).json({ success: false, message: "Authentication required." });
  try {
    const result = await pool.query(
      "SELECT id,aurelink_order_id,product_kind,provider,provider_order_id,phone_number,country,service,status,provider_cost,retail_amount_minor,currency,carrier_name,line_type,verification_status,verified_at,sms_received_at,rental_started_at,expires_at,last_provider_check_at,refund_reference,created_at,updated_at FROM aurelink_provider_orders WHERE aurelink_user_id=$1 ORDER BY created_at DESC LIMIT 15",
      [req.user.userId],
    );
    return res.json({ success: true, orders: result.rows });
  } catch (error) { return providerFailure(res, error); }
});

router.post("/aurelink/rental-quotes", aurelinkAuthMiddleware, async (req, res) => {
  const parsed = z.object({
    rentalId: z.number().int().min(0),
    days: z.number().int().min(1).max(365),
    serviceId: z.string().max(100).optional(),
  }).safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental quote request." });
  if (parsed.data.serviceId && !await isServiceAllowed(parsed.data.serviceId)) return res.status(403).json({ success: false, message: "This service is not enabled for AURELINK." });
  if (!await isRentalAvailable(parsed.data.rentalId)) return res.status(403).json({ success: false, message: "This rental inventory is not available in the provider catalog." });
  try {
    const providerPricing = await smsPoolClient.rentalPricing(String(parsed.data.rentalId), parsed.data.serviceId);
    const providerMaxPrice = rentalPriceForDays(providerPricing, parsed.data.days);
    if (providerMaxPrice === null) return res.status(409).json({ success: false, message: "SMSPool did not return an exact live price for this rental duration." });
    const stockResponse = object(await smsPoolClient.rentalStock(String(parsed.data.rentalId), parsed.data.days, parsed.data.serviceId));
    const stockCount = Number(stockResponse["stock"] ?? stockResponse["available"] ?? 1);
    if (Number.isFinite(stockCount) && stockCount <= 0) return res.status(409).json({ success: false, message: "No inventory is currently available for this rental." });
    const priceBreakdown = aurelinkPriceBreakdown(providerMaxPrice, "long_term");
    if (!priceBreakdown) return res.status(409).json({ success: false, message: "This long-term number is unavailable because the provider returned a zero or invalid price." });
    const retailAmountMinor = priceBreakdown.totalMinor;
    const quoteMetadata = { rentalCatalogId: parsed.data.rentalId, days: parsed.data.days, serviceId: parsed.data.serviceId ?? null, pricing: providerPricing, priceBreakdown };
    const result = await pool.query(
      "INSERT INTO aurelink_quotes (aurelink_user_id,product_kind,country,service,provider_max_price,retail_amount_minor,currency,provider_pricing,expires_at) VALUES ($1,'rental',$2,$3,$4,$5,'USD',$6::jsonb,NOW()+($7::text||' minutes')::interval) RETURNING id,product_kind,provider_max_price,retail_amount_minor,currency,expires_at",
      [req.user.userId, String(parsed.data.rentalId), parsed.data.serviceId ?? "always_on", providerMaxPrice, retailAmountMinor, JSON.stringify(quoteMetadata), String(quoteTtlMinutes)],
    );
    return res.json({ success: true, quote: result.rows[0], retailPriceUsd: (retailAmountMinor / USD_MINOR).toFixed(2), priceBreakdown, pricingSource: "live SMSPool API", expiresInSeconds: quoteTtlMinutes * 60 });
  } catch (error) { return providerFailure(res, error); }
});

router.post("/aurelink/rentals", aurelinkAuthMiddleware, async (req, res) => {
  const parsed = z.object({ quoteId: z.string().uuid(), paymentReference: z.string().min(8).max(100).optional() }).safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "A valid rental quote and payment reference are required." });
  const client = await pool.connect();
  let quote: Record<string, unknown> | undefined;
  let paymentReserved = false;
  let purchasedRentalId: string | null = null;
  try {
    await client.query("BEGIN");
    const quoteResult = await client.query(
      "SELECT * FROM aurelink_quotes WHERE id=$1 AND aurelink_user_id=$2 AND product_kind='rental' AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",
      [parsed.data.quoteId, req.user.userId],
    );
    quote = quoteResult.rows[0] as Record<string, unknown> | undefined;
    if (!quote) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Rental quote expired, consumed, or not found." }); }
    if (parsed.data.paymentReference) {
      const paid = await client.query("SELECT id FROM payment_transactions WHERE reference=$1 AND user_id=$2 AND status='paid' AND purpose='aurelink_rental' AND currency='USD' AND amount_minor >= $3 LIMIT 1", [parsed.data.paymentReference, req.user.userId, String(quote["retail_amount_minor"])]);
      if (paid.rowCount !== 1) { await client.query("ROLLBACK"); return res.status(402).json({ success: false, message: "A verified paid rental transaction is required." }); }
      const redemption = await client.query("INSERT INTO aurelink_payment_redemptions(payment_reference,user_id,quote_id,product_kind) VALUES($1,$2,$3,'rental') ON CONFLICT DO NOTHING RETURNING payment_reference", [parsed.data.paymentReference, req.user.userId, parsed.data.quoteId]);
      if (redemption.rowCount !== 1) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "This payment has already been used." }); }
    } else {
      try { await walletDebit(client, { userId: req.user.userId, amountMinor: String(quote["retail_amount_minor"]), reference: "purchase:" + parsed.data.quoteId, type: "purchase", description: "Long-term number rental" }); }
      catch (error) { await client.query("ROLLBACK"); if (error instanceof Error && error.message === "INSUFFICIENT_AURELINK_CREDIT") return res.status(402).json({ success: false, code: "INSUFFICIENT_CREDIT", message: "Your Aurelink wallet balance is insufficient." }); throw error; }
    }
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
    if (!await isRentalAvailable(rentalCatalogId)) throw new SmsPoolError("Rental inventory is not available in the provider catalog.", { providerType: "INVENTORY_NOT_AVAILABLE" });
    const days = Number(quoteMetadata?.["days"]);
    const serviceId = quoteMetadata?.["serviceId"] == null ? undefined : String(quoteMetadata["serviceId"]);
    if (!Number.isInteger(rentalCatalogId) || rentalCatalogId < 0 || !Number.isInteger(days) || days <= 0) throw new SmsPoolError("Rental quote is missing its provider metadata.", { providerType: "INVALID_QUOTE" });
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
    let lookup: SmsPoolPayload;
    try { lookup = await verifyAurelinkNumber(phoneNumber); }
    catch {
      await smsPoolClient.cancelRental(providerOrderId).catch(() => undefined);
      purchasedRentalId = null;
      throw new SmsPoolError("Carrier verification failed. The rental was not accepted and cancellation was requested.", { providerType: "CARRIER_LOOKUP_FAILED" });
    }
    const lineAssessment=veriphoneLineAssessment(lookup as Record<string,unknown>);
    const assessment={result:lineAssessment.lineType.includes("mobile")?"mobile":lineAssessment.lineType.includes("voip")?"voip":"other",carrier:lineAssessment.carrier,lineType:lineAssessment.lineType};
    if (!lineAssessment.valid) {
      await smsPoolClient.cancelRental(providerOrderId).catch(() => undefined);
      purchasedRentalId = null;
      throw new SmsPoolError("Veriphone could not validate this long-term number. It was not accepted and cancellation was requested.", { providerType: "LINE_VALIDATION_FAILED" });
    }
    const startedAt = new Date();
    const expiry = expiryDate(data, days * 86400) ?? new Date(startedAt.getTime() + days * 86400000);
    await pool.query(
      "INSERT INTO aurelink_provider_orders (aurelink_order_id,aurelink_user_id,quote_id,product_kind,provider_order_id,phone_number,country,service,status,provider_cost,retail_amount_minor,wallet_debit_reference,carrier_name,line_type,verification_status,verified_at,rental_started_at,expires_at,provider_payload) VALUES ($1,$2,$3,'rental',$4,$5,$6,$7,'active',$8,$9,$10,$11,$12,'verified',NOW(),$13,$14,$15::jsonb)",
      [newAurelinkOrderId(),req.user.userId,parsed.data.quoteId,providerOrderId,phoneNumber,String(data["country"]??quote?.["country"]??""),serviceId??null,actualCost,String(quote?.["retail_amount_minor"]),parsed.data.paymentReference?null:"purchase:"+parsed.data.quoteId,assessment.carrier,assessment.lineType??"mobile",startedAt,expiry,JSON.stringify({provider,carrierLookup:lookup,verification:{result:assessment.result,checkedAt:new Date().toISOString()},rentalCatalogId,serviceId,days})],
    );
    return res.status(201).json({ success: true, rental: { rentalId: providerOrderId, phoneNumber, days, carrier: assessment.carrier, lineType: assessment.lineType ?? "mobile", verificationStatus: "verified", verifiedAt: new Date().toISOString(), startedAt: startedAt.toISOString(), expiresAt: expiry.toISOString(), providerCostUsd: actualCost, details: provider } });
  } catch (error) {
    if (purchasedRentalId) await smsPoolClient.cancelRental(purchasedRentalId).catch(() => undefined);
    if(parsed.data.paymentReference)await pool.query("DELETE FROM aurelink_payment_redemptions WHERE payment_reference=$1 AND user_id=$2",[parsed.data.paymentReference,req.user.userId]).catch(()=>undefined);
    else{const refundClient=await pool.connect();try{await refundClient.query("BEGIN");await walletCredit(refundClient,{userId:req.user.userId,amountMinor:String(quote?.["retail_amount_minor"]??0),reference:"refund:purchase:"+parsed.data.quoteId,type:"refund",description:"Automatic refund: rental provider purchase failed"});await refundClient.query("COMMIT");}catch(e){await refundClient.query("ROLLBACK").catch(()=>undefined);logger.error({errorType:e instanceof Error?e.name:typeof e},"AURELINK rental wallet refund failed");}finally{refundClient.release();}}
    await pool.query("UPDATE aurelink_quotes SET consumed_at=NULL WHERE id=$1 AND aurelink_user_id=$2",[parsed.data.quoteId,req.user.userId]).catch(()=>undefined);
    return providerFailure(res, error);
  }
});
router.get("/aurelink/rentals/:rentalId/messages", aurelinkAuthMiddleware, async (req, res) => {
  const rentalId = z.string().min(1).max(160).safeParse(req.params.rentalId);
  if (!rentalId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental ID." });
  try {
    const order = await ownedOrder(req.user.userId, rentalId.data, "rental");
    if (!order) return res.status(404).json({ success: false, message: "Rental not found." });
    const messages = await smsPoolClient.rentalMessages(rentalId.data);
    const hasMessage = providerFields(messages).some((field) => /^(sms|message|full_sms|message_body|body|code)$/.test(field.key) && field.value.length > 0);
    const expiry = expiryDate(messages);
    await pool.query(
      "UPDATE aurelink_provider_orders SET sms_received_at=CASE WHEN $2 THEN COALESCE(sms_received_at,NOW()) ELSE sms_received_at END,expires_at=COALESCE($3,expires_at),last_provider_check_at=NOW(),updated_at=NOW(),provider_payload=provider_payload || $4::jsonb WHERE id=$1",
      [order["id"], hasMessage, expiry, JSON.stringify({ lastMessagePoll: { hasMessage, checkedAt: new Date().toISOString() } })],
    );
    return res.json({ success: true, messages, smsReceivedAt: hasMessage ? (order["sms_received_at"] ?? new Date().toISOString()) : null, expiresAt: expiry?.toISOString() ?? order["expires_at"] ?? null });
  } catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/rentals/:rentalId/status", aurelinkAuthMiddleware, async (req, res) => {
  const rentalId = z.string().min(1).max(160).safeParse(req.params.rentalId);
  if (!rentalId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental ID." });
  try {
    const order = await ownedOrder(req.user.userId, rentalId.data, "rental");
    if (!order) return res.status(404).json({ success: false, message: "Rental not found." });
    const status = await smsPoolClient.rentalStatus(rentalId.data);
    const statusFields = providerFields(status);
    const rawStatus = statusFields.find((field) => field.key === "status")?.value.toLowerCase();
    const nextStatus = rawStatus && /expired|cancelled|refunded|active|completed/.test(rawStatus) ? rawStatus : null;
    const expiry = expiryDate(status);
    await pool.query(
      "UPDATE aurelink_provider_orders SET status=COALESCE($2,status),expires_at=COALESCE($3,expires_at),last_provider_check_at=NOW(),updated_at=NOW(),provider_payload=provider_payload || $4::jsonb WHERE id=$1",
      [order["id"], nextStatus, expiry, JSON.stringify({ lastStatusPoll: { status: rawStatus ?? null, checkedAt: new Date().toISOString() } })],
    );
    return res.json({ success: true, status, expiresAt: expiry?.toISOString() ?? order["expires_at"] ?? null });
  } catch (error) { return providerFailure(res, error); }
});
router.post("/aurelink/rentals/:rentalId/renew", aurelinkAuthMiddleware, async (req, res) => {
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
    const retailAmountMinor = retailPriceMinor(providerMaxPrice, "long_term");
    const redemption = await pool.query(
      "INSERT INTO aurelink_payment_redemptions (payment_reference,user_id,product_kind) SELECT reference,user_id,'rental' FROM payment_transactions WHERE reference=$1 AND user_id=$2 AND status='paid' AND purpose='aurelink_rental' AND currency='USD' AND amount_minor >= $3 ON CONFLICT DO NOTHING RETURNING payment_reference",
      [parsed.data.paymentReference, req.user.userId, String(retailAmountMinor)],
    );
    if (redemption.rowCount !== 1) return res.status(402).json({ success: false, message: "A valid, unused, paid AURELINK rental-renewal transaction covering the live price is required." });
    paymentReserved = true;
    const renewal = await smsPoolClient.renewRental(rentalId.data, parsed.data.days);
    renewalSucceeded = true;
    await pool.query(
      "UPDATE aurelink_provider_orders SET provider_cost=COALESCE(provider_cost,0)+$2,expires_at=COALESCE(expires_at,NOW())+($4::text||' days')::interval,updated_at=NOW(),provider_payload=provider_payload || $3::jsonb WHERE id=$1",
      [rental["id"], providerMaxPrice, JSON.stringify({ lastRenewal: renewal, renewedDays: parsed.data.days, renewedAt: new Date().toISOString() }), String(parsed.data.days)],
    );
    return res.json({ success: true, renewal });
  } catch (error) {
    if (paymentReserved && !renewalSucceeded) await pool.query("DELETE FROM aurelink_payment_redemptions WHERE payment_reference=$1 AND user_id=$2", [parsed.data.paymentReference, req.user.userId]).catch(() => undefined);
    return providerFailure(res, error);
  }
});
router.post("/aurelink/rentals/:rentalId/cancel", aurelinkAuthMiddleware, async (req, res) => {
  const rentalId = z.string().min(1).max(160).safeParse(req.params.rentalId);
  if (!rentalId.success || !req.user?.userId) return res.status(400).json({ success: false, message: "Invalid rental ID." });
  try {
    const rental = await ownedOrder(req.user.userId, rentalId.data, "rental");
    if (!rental) return res.status(404).json({ success: false, message: "Rental not found." });
    if(["completed","refunded","cancelled","expired"].includes(String(rental["status"])))return res.status(409).json({success:false,message:"This rental is no longer cancellable."});
    const result=object(await smsPoolClient.cancelRental(rentalId.data));
    const confirmed=result["success"]===true||result["success"]===1||/^(success|cancelled|canceled|refunded)$/i.test(String(result["status"]??result["message"]??""));
    if(!confirmed)return res.status(409).json({success:false,message:"Provider has not confirmed cancellation. No wallet refund was issued.",provider:result});
    const client=await pool.connect();try{await client.query("BEGIN");await client.query("UPDATE aurelink_provider_orders SET status='cancelled',updated_at=NOW(),provider_payload=provider_payload || $2::jsonb WHERE id=$1",[rental["id"],JSON.stringify({cancellation:result})]);if(rental["wallet_debit_reference"]&&rental["retail_amount_minor"]){await walletCredit(client,{userId:req.user.userId,amountMinor:String(rental["retail_amount_minor"]),reference:"refund:"+String(rental["wallet_debit_reference"]),type:"refund",description:"Provider-confirmed rental cancellation refund",orderId:String(rental["id"])});await client.query("UPDATE aurelink_provider_orders SET refund_reference=$2 WHERE id=$1",[rental["id"],"refund:"+String(rental["wallet_debit_reference"])]);}await client.query("COMMIT");return res.json({success:true,cancellation:result,refunded:Boolean(rental["wallet_debit_reference"])});}catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
  } catch (error) { return providerFailure(res, error); }
});

router.post("/aurelink/carrier-lookup", aurelinkAuthMiddleware, async (req, res) => {
  const parsed = z.object({ phoneNumber: z.string().min(5).max(32).regex(/^\+?[0-9 ()-]+$/) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "A valid phone number is required." });
  if (!adminAllowed(req)) return res.status(403).json({ success: false, message: "Carrier lookups require billing integration or administrator access." });
  try { return res.json({ success: true, lookup: await smsPoolClient.carrierLookup(parsed.data.phoneNumber.replace(/[+ ()-]/g, "")) }); }
  catch (error) { return providerFailure(res, error); }
});

router.get("/aurelink/esim/plans", aurelinkAuthMiddleware, async (req, res) => {
  const country = typeof req.query.country === "string" ? req.query.country : "";
  if (!country) return res.status(400).json({ success: false, message: "Country is required for eSIM plans." });
  try { return res.json({ success: true, plans: await smsPoolClient.esimPlans(country) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/esim/pricing", aurelinkAuthMiddleware, async (_req, res) => {
  try { return res.json({ success: true, pricing: await smsPoolClient.esimPricing() }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/esim/profile", aurelinkAuthMiddleware, async (req, res) => {
  if (!adminAllowed(req)) return res.status(403).json({ success: false, message: "Administrator access required until AURELINK eSIM ownership is implemented." });
  const transactionId = typeof req.query.transactionId === "string" ? req.query.transactionId : undefined;
  try { return res.json({ success: true, profile: await smsPoolClient.esimProfile(transactionId) }); }
  catch (error) { return providerFailure(res, error); }
});
router.get("/aurelink/esim/topup-plans", aurelinkAuthMiddleware, async (req, res) => {
  if (!adminAllowed(req)) return res.status(403).json({ success: false, message: "Administrator access required until AURELINK eSIM ownership is implemented." });
  const transactionId = typeof req.query.transactionId === "string" ? req.query.transactionId : "";
  if (!transactionId) return res.status(400).json({ success: false, message: "Transaction ID is required." });
  try { return res.json({ success: true, plans: await smsPoolClient.esimTopupPlans(transactionId) }); }
  catch (error) { return providerFailure(res, error); }
});
router.post("/aurelink/esim/purchase", aurelinkAuthMiddleware, async (_req, res) => {
  return res.status(501).json({ success: false, message: "eSIM purchases are disabled until payment reconciliation is implemented. SMSPool eSIMs are data-only and do not include a phone number." });
});

export default router;

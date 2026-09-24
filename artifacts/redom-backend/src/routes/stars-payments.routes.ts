import { Router } from "express";
import axios from "axios";
import crypto from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../database/db";
import { env } from "../config/env";
import { hashPassword, verifyPassword } from "../utils/password";
import { geocodePlace } from "../lib/mapbox";

const router = Router();
const API = "https://api.paystack.co";
type Currency = "NGN" | "USD" | "GHS" | "KES" | "ZAR" | "XOF";
type Country = { name: string; isoCode: string; currency: Currency; rate: number };

const countries: Country[] = [
  { name: "Nigeria", isoCode: "NG", currency: "NGN", rate: 1500 },
  { name: "Ghana", isoCode: "GH", currency: "GHS", rate: 12.5 },
  { name: "Kenya", isoCode: "KE", currency: "KES", rate: 130 },
  { name: "South Africa", isoCode: "ZA", currency: "ZAR", rate: 17.5 },
  { name: "United States", isoCode: "US", currency: "USD", rate: 1 },
  { name: "Côte d'Ivoire", isoCode: "CI", currency: "XOF", rate: 600 },
];

const packages = [
  { key: "stars_10", stars: 10, usdPrice: 2.21, firstPurchaseUsdPrice: 1.99, firstPurchaseDiscountPercent: 10, popular: false },
  { key: "stars_20", stars: 20, usdPrice: 2.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_50", stars: 50, usdPrice: 4.87, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_100", stars: 100, usdPrice: 10.76, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: true },
  { key: "stars_150", stars: 150, usdPrice: 14.00, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_200", stars: 200, usdPrice: 19.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_500", stars: 500, usdPrice: 50.00, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_700", stars: 700, usdPrice: 70.00, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_1000", stars: 1000, usdPrice: 99.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_1500", stars: 1500, usdPrice: 149.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_2000", stars: 2000, usdPrice: 199.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_2500", stars: 2500, usdPrice: 249.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_5000", stars: 5000, usdPrice: 499.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_7500", stars: 7500, usdPrice: 749.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_10000", stars: 10000, usdPrice: 999.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_15000", stars: 15000, usdPrice: 1499.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_20000", stars: 20000, usdPrice: 1999.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_50000", stars: 50000, usdPrice: 4999.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_75000", stars: 75000, usdPrice: 7499.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
  { key: "stars_100000", stars: 100000, usdPrice: 9999.99, firstPurchaseUsdPrice: null, firstPurchaseDiscountPercent: 0, popular: false },
] as const;

function getCountry(code: string): Country {
  const country = countries.find((item) => item.isoCode === code.toUpperCase());
  if (!country) throw new Error("This country is not currently supported for ReDom Pay.");
  return country;
}
function getPackage(key: string) {
  const value = packages.find((item) => item.key === key);
  if (!value) throw new Error("Invalid ReDom Stars package.");
  return value;
}
function fxRate(country: Country): number {
  const configured = process.env.REDOM_STARS_FX_JSON;
  if (!configured) return country.rate;
  try {
    const parsed = JSON.parse(configured) as Record<string, number>;
    return Number.isFinite(parsed[country.currency]) && parsed[country.currency] > 0 ? parsed[country.currency] : country.rate;
  } catch { return country.rate; }
}
function quote(country: Country, pkg: typeof packages[number], firstPurchaseEligible = false) {
  const rate = fxRate(country);
  const effectiveUsdPrice = firstPurchaseEligible && pkg.firstPurchaseUsdPrice != null ? pkg.firstPurchaseUsdPrice : pkg.usdPrice;
  const amountMinor = Math.round(effectiveUsdPrice * rate * 100);
  const localAmount = amountMinor / 100;
  const minimumMinor: Record<Currency, number> = { NGN: 5000, USD: 200, GHS: 10, KES: 300, ZAR: 100, XOF: 100 };
  const payable = amountMinor >= minimumMinor[country.currency];
  return {
    key: pkg.key, stars: pkg.stars, usdPrice: effectiveUsdPrice, regularUsdPrice: pkg.usdPrice, firstPurchaseUsdPrice: pkg.firstPurchaseUsdPrice, firstPurchaseDiscountPercent: pkg.firstPurchaseDiscountPercent, popular: pkg.popular, localAmount, amountMinor, currency: country.currency,
    localAmountFormatted: new Intl.NumberFormat(undefined, { style: "currency", currency: country.currency, minimumFractionDigits: country.currency === "XOF" ? 0 : 2 }).format(localAmount),
    payable, availabilityReason: payable ? null : `The selected payment provider minimum for ${country.currency} is ${minimumMinor[country.currency] / 100} ${country.currency}.`,
  };
}
async function paystack<T>(method: "get" | "post", path: string, data?: unknown): Promise<T> {
  const response = await axios.request<{ status: boolean; message: string; data: T }>({
    method, url: API + path, data,
    headers: { Authorization: "Bearer " + env.payments.paystack.secretKey, "Content-Type": "application/json", "Cache-Control": "no-cache" },
    timeout: 20000,
  });
  if (!response.data?.status) throw new Error(response.data?.message || "Payment provider request failed.");
  return response.data.data;
}
function makeReference(): string { return "rdstars_" + Date.now().toString(36) + "_" + crypto.randomBytes(5).toString("hex"); }
function makeRedomTransactionId(): string {
  const max = 10_000_000_000_000n;
  const value = BigInt("0x" + crypto.randomBytes(7).toString("hex")) % max;
  return "R-" + value.toString().padStart(13, "0");
}
async function uniqueRedomTransactionId(client: import("pg").PoolClient): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const value = makeRedomTransactionId();
    const found = await client.query("SELECT 1 FROM payment_transactions WHERE redom_transaction_id=$1 LIMIT 1", [value]);
    if (!found.rows[0]) return value;
  }
  throw new Error("Could not allocate a unique ReDom transaction ID.");
}
function keyFromSecret(): Buffer { return crypto.createHash("sha256").update(env.authentication.sessionSecret).digest(); }
function encryptAuthorization(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromSecret(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
function decryptAuthorization(value: string): string {
  const [ivText, tagText, ciphertextText] = value.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromSecret(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}
function paymentCallbackUrl(): string { return "https://redom-backend.onrender.com/redom-backend/payments/callback"; }
async function getUser(userId: string) {
  const result = await pool.query("SELECT id, email, first_name, last_name, phone_number FROM users WHERE id=$1 LIMIT 1", [userId]);
  return result.rows[0] ?? null;
}
async function assertPinIfRequired(userId: string, pin: string | undefined) {
  const settings = await pool.query("SELECT pin_enabled, pin_hash FROM payment_settings WHERE user_id=$1 LIMIT 1", [userId]);
  const row = settings.rows[0];
  if (!row?.pin_enabled) return;
  if (!row.pin_hash) throw new Error("Payment PIN is enabled but has not been configured.");
  if (!pin || !(await verifyPassword(pin, String(row.pin_hash)))) throw new Error("Incorrect payment PIN.");
}

router.get("/stars/catalog", authMiddleware, async (req, res) => {
  const selected = typeof req.query.country === "string" ? req.query.country.toUpperCase() : null;
  const selectedCountry = selected ? getCountry(selected) : null;
  const userId = req.user?.userId;
  let firstPurchaseEligible = false;
  if (userId) {
    const prior = await pool.query("SELECT 1 FROM redom_stars_transactions WHERE user_id=$1 AND type='purchase' LIMIT 1", [userId]);
    firstPurchaseEligible = !prior.rows[0];
  }
  return res.json({
    success: true,
    firstPurchaseEligible,
    countries: countries.map((country) => ({ name: country.name, isoCode: country.isoCode, currency: country.currency })),
    packages: selectedCountry ? packages.map((pkg) => quote(selectedCountry, pkg, firstPurchaseEligible)) : [],
  });
});

router.get("/stars/activity", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
  await pool.query("INSERT INTO redom_stars_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING", [userId]);
  const balance = await pool.query("SELECT balance FROM redom_stars_accounts WHERE user_id=$1", [userId]);
  const activity = await pool.query(
    `SELECT id, type, stars, balance_after, package_key, country_code, currency, amount_minor, reference, created_at
       FROM redom_stars_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [userId],
  );
  return res.json({
    success: true, balance: Number(balance.rows[0]?.balance ?? 0),
    activity: activity.rows.map((row) => ({
      id: String(row.id), type: String(row.type), stars: Number(row.stars), balanceAfter: Number(row.balance_after),
      packageKey: row.package_key ? String(row.package_key) : null, countryCode: row.country_code ? String(row.country_code) : null,
      currency: row.currency ? String(row.currency) : null, amountMinor: row.amount_minor == null ? null : Number(row.amount_minor),
      reference: row.reference ? String(row.reference) : null, createdAt: new Date(row.created_at).toISOString(),
    })),
  });
});

router.post("/stars/initialize", authMiddleware, async (req, res) => {
  const parsed = z.object({
    packageKey: z.string().min(1).max(50),
    countryCode: z.string().length(2),
    email: z.string().email().max(255),
    pin: z.string().regex(/^\d{4,8}$/).optional(),
    paymentMethodId: z.string().uuid().optional(),
    address: z.object({
      countryCode: z.string().length(2), countryName: z.string().min(1).max(120), fullName: z.string().min(1).max(180),
      addressLine1: z.string().min(1).max(255), addressLine2: z.string().max(255).optional().nullable(),
      city: z.string().min(1).max(120), state: z.string().max(120).optional().nullable(), postalCode: z.string().max(40).optional().nullable(),
      mapboxPlaceId: z.string().max(255).optional().nullable(), latitude: z.number().optional().nullable(), longitude: z.number().optional().nullable(),
    }).optional(),
  }).safeParse(req.body);
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid Stars checkout details." });

  const user = await getUser(userId);
  if (!user?.email) return res.status(400).json({ success: false, message: "A verified email address is required." });
  if (String(parsed.data.email).toLowerCase() !== String(user.email).toLowerCase()) return res.status(400).json({ success: false, message: "Use the email address on your ReDom account." });

  try {
    await assertPinIfRequired(userId, parsed.data.pin);
    const country = getCountry(parsed.data.countryCode);
    const pkg = getPackage(parsed.data.packageKey);
    const priorPurchase = await pool.query("SELECT 1 FROM redom_stars_transactions WHERE user_id=$1 AND type='purchase' LIMIT 1", [userId]);
    const priced = quote(country, pkg, !priorPurchase.rows[0]);
    if (!priced.payable) return res.status(400).json({ success: false, message: priced.availabilityReason });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const redomId = await uniqueRedomTransactionId(client);
      const reference = makeReference();
      const metadata = { purpose: "stars_purchase", packageKey: pkg.key, stars: pkg.stars, countryCode: country.isoCode, currency: country.currency, customerEmail: parsed.data.email, redomTransactionId: redomId, paymentMethodId: parsed.data.paymentMethodId ?? null };
      const inserted = await client.query(
        `INSERT INTO payment_transactions
          (user_id,reference,redom_transaction_id,amount_minor,currency,purpose,status,metadata,country_code,customer_email)
         VALUES($1,$2,$3,$4,$5,'stars_purchase','initialized',$6::jsonb,$7,$8) RETURNING id`,
        [userId, reference, redomId, priced.amountMinor, priced.currency, JSON.stringify(metadata), country.isoCode, parsed.data.email],
      );
      if (parsed.data.address) {
        const a = parsed.data.address;
        await client.query(
          `INSERT INTO redom_payment_addresses
           (user_id,country_code,country_name,full_name,address_line1,address_line2,city,state,postal_code,mapbox_place_id,latitude,longitude)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [userId,a.countryCode,a.countryName,a.fullName,a.addressLine1,a.addressLine2 ?? null,a.city,a.state ?? null,a.postalCode ?? null,a.mapboxPlaceId ?? null,a.latitude ?? null,a.longitude ?? null],
        );
      }
      await client.query("COMMIT");

      if (parsed.data.paymentMethodId) {
        const method = await pool.query("SELECT * FROM redom_payment_methods WHERE id=$1 AND user_id=$2 AND active=true AND reusable=true LIMIT 1", [parsed.data.paymentMethodId, userId]);
        if (!method.rows[0]) throw new Error("Saved payment method not found.");
        const authorizationCode = decryptAuthorization(String(method.rows[0].authorization_code_encrypted));
        const charged = await paystack<any>("post", "/transaction/charge_authorization", {
          email: String(method.rows[0].customer_email), amount: String(priced.amountMinor), currency: priced.currency, authorization_code: authorizationCode, reference,
          metadata: JSON.stringify(metadata),
        });
        await pool.query("UPDATE payment_transactions SET gateway_status=$1, updated_at=now() WHERE id=$2", [charged?.status ?? "ongoing", inserted.rows[0].id]);
        return res.json({ success: true, mode: "saved_card", checkoutUrl: charged?.url ?? null, accessCode: charged?.access_code ?? null, reference, redomTransactionId: redomId, status: charged?.status ?? "ongoing" });
      }

      const initialized = await paystack<{ authorization_url: string; access_code: string; reference: string }>("post", "/transaction/initialize", {
        email: parsed.data.email, amount: String(priced.amountMinor), currency: priced.currency, channels: ["card", "bank_transfer"],
        callback_url: paymentCallbackUrl(), metadata: JSON.stringify(metadata),
      });
      await pool.query("UPDATE payment_transactions SET checkout_url=$1, access_code=$2, reference=$3, updated_at=now() WHERE id=$4", [initialized.authorization_url, initialized.access_code, initialized.reference, inserted.rows[0].id]);
      return res.json({ success: true, mode: "hosted_checkout", checkoutUrl: initialized.authorization_url, accessCode: initialized.access_code, reference: initialized.reference, redomTransactionId: redomId });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Stars payment.";
    return res.status(400).json({ success: false, message });
  }
});

router.get("/payment-methods", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
  const result = await pool.query(
    `SELECT id, provider, customer_email, brand, card_type, last4, exp_month, exp_year, bank, country_code, currency, reusable, created_at
       FROM redom_payment_methods WHERE user_id=$1 AND active=true ORDER BY created_at DESC`,
    [userId],
  );
  return res.json({ success: true, methods: result.rows.map((row) => ({
    id:String(row.id), provider:String(row.provider), email:String(row.customer_email), brand:row.brand ? String(row.brand):null,
    cardType:row.card_type ? String(row.card_type):null, last4:row.last4 ? String(row.last4):null, expMonth:row.exp_month == null?null:Number(row.exp_month),
    expYear:row.exp_year == null?null:Number(row.exp_year), bank:row.bank?String(row.bank):null, countryCode:row.country_code?String(row.country_code):null,
    currency:row.currency?String(row.currency):null, reusable:Boolean(row.reusable), createdAt:new Date(row.created_at).toISOString()
  }))});
});

router.delete("/payment-methods/:id", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  const methodId = z.string().uuid().safeParse(req.params.id);
  const parsed = z.object({ password: z.string().min(1).max(200) }).safeParse(req.body);
  if (!userId || !methodId.success || !parsed.success) return res.status(400).json({ success:false,message:"Re-authentication is required." });
  const user = await pool.query("SELECT password_hash FROM users WHERE id=$1 LIMIT 1",[userId]);
  if (!user.rows[0] || !(await verifyPassword(parsed.data.password,String(user.rows[0].password_hash)))) return res.status(403).json({success:false,message:"Password verification failed."});
  const method = await pool.query("SELECT authorization_code_encrypted FROM redom_payment_methods WHERE id=$1 AND user_id=$2 AND active=true",[methodId.data,userId]);
  if (!method.rows[0]) return res.status(404).json({success:false,message:"Payment method not found."});
  try { await paystack("post","/customer/deactivate_authorization",{authorization_code:decryptAuthorization(String(method.rows[0].authorization_code_encrypted))}); } catch {}
  await pool.query("UPDATE redom_payment_methods SET active=false,reusable=false,updated_at=now() WHERE id=$1 AND user_id=$2",[methodId.data,userId]);
  return res.json({success:true});
});

router.get("/payment-addresses", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId;
  if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  const result=await pool.query(`SELECT id,country_code,country_name,full_name,address_line1,address_line2,city,state,postal_code,mapbox_place_id,latitude,longitude,is_default,created_at,updated_at FROM redom_payment_addresses WHERE user_id=$1 ORDER BY is_default DESC,updated_at DESC LIMIT 20`,[userId]);
  return res.json({success:true,addresses:result.rows});
});

router.get("/address/search", authMiddleware, async (req,res)=>{
  const q=typeof req.query.q==="string"?req.query.q.trim():"";
  if(q.length<2)return res.json({success:true,suggestions:[]});
  try{
    const feature=await geocodePlace(q);
    return res.json({success:true,suggestions:feature?[{id:String(feature.id??""),placeName:String(feature.place_name??feature.text??q),longitude:Array.isArray(feature.center)?Number(feature.center[0]):null,latitude:Array.isArray(feature.center)?Number(feature.center[1]):null,context:Array.isArray(feature.context)?feature.context.map((item:any)=>({id:item.id,text:item.text,shortCode:item.short_code??null})):[]}]:[]});
  }catch{return res.status(502).json({success:false,message:"Address search is temporarily unavailable."});}
});

router.post("/payment-security/pin", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId;
  const parsed=z.object({pin:z.string().regex(/^\d{4,8}$/),currentPin:z.string().regex(/^\d{4,8}$/).optional()}).safeParse(req.body);
  if(!userId||!parsed.success)return res.status(400).json({success:false,message:"PIN must contain 4 to 8 digits."});
  const current=await pool.query("SELECT pin_hash FROM payment_settings WHERE user_id=$1",[userId]);
  if(current.rows[0]?.pin_hash && (!parsed.data.currentPin || !(await verifyPassword(parsed.data.currentPin,String(current.rows[0].pin_hash))))) return res.status(403).json({success:false,message:"Current payment PIN is incorrect."});
  const hashed=await hashPassword(parsed.data.pin);
  await pool.query(`INSERT INTO payment_settings(user_id,pin_hash,pin_enabled) VALUES($1,$2,true) ON CONFLICT(user_id) DO UPDATE SET pin_hash=EXCLUDED.pin_hash,pin_enabled=true,updated_at=now()`,[userId,hashed]);
  return res.json({success:true,pinEnabled:true});
});

router.delete("/payment-security/pin", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId;
  const parsed=z.object({password:z.string().min(1).max(200)}).safeParse(req.body);
  if(!userId||!parsed.success)return res.status(400).json({success:false,message:"Password verification is required."});
  const user=await pool.query("SELECT password_hash FROM users WHERE id=$1",[userId]);
  if(!user.rows[0]||!(await verifyPassword(parsed.data.password,String(user.rows[0].password_hash))))return res.status(403).json({success:false,message:"Password verification failed."});
  await pool.query("UPDATE payment_settings SET pin_enabled=false,pin_hash=NULL,updated_at=now() WHERE user_id=$1",[userId]);
  return res.json({success:true,pinEnabled:false});
});

export default router;

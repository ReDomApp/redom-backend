import { Router } from "express";
import axios from "axios";
import crypto from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../database/db";
import { env } from "../config/env";
import { hashPassword, verifyPassword } from "../utils/password";
import { geocodePlace } from "../lib/mapbox";
import { createStripeStarsCheckout } from "../services/payments/stripe-payment.service";
import { createStarsTrialSetupCheckout, getStarsTrialEligibility, TERMS_VERSION } from "../services/payments/stripe-stars-trial.service";
import { getStripeStarsCountries, getStripeStarsCountry, stripeMinimumMinor } from "../services/payments/stripe-country.service";

const router = Router();
const API = "https://api.paystack.co";
type Currency = string;
type Country = { name:string; isoCode:string; currency:Currency; rate:number; cardSupported:boolean; successRate:number|null; observedPayments:number };

let countries:Country[]=[];
async function refreshCountries(){countries=await getStripeStarsCountries();return countries;}
async function getCountry(code:string):Promise<Country>{
 const country=(await refreshCountries()).find(item=>item.isoCode===code.toUpperCase());
 if(!country)throw new Error("This country is not supported for Stripe card payments.");
 return country;
}
function fxRate(country:Country):number{return country.rate;}
function getPackage(key: string) {
  const value = packages.find((item) => item.key === key);
  if (!value) throw new Error("Invalid ReDom Stars package.");
  return value;
}
function quote(country:Country,pkg:typeof packages[number],firstPurchaseEligible=false){
 const rate=fxRate(country);
 const effectiveUsdPrice=firstPurchaseEligible&&pkg.firstPurchaseUsdPrice!=null?pkg.firstPurchaseUsdPrice:pkg.usdPrice;
 const zeroDecimal=new Set(["BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"]);
 const amountMinor=rate>0?Math.max(1,Math.round(effectiveUsdPrice*rate*(zeroDecimal.has(country.currency)?1:100))):0;
 const localAmount=zeroDecimal.has(country.currency)?amountMinor:amountMinor/100;
 const minimumMinor=stripeMinimumMinor(country.currency);
 const payable=rate>0&&(minimumMinor==null||amountMinor>=minimumMinor);
 return {
  key:pkg.key,stars:pkg.stars,usdPrice:effectiveUsdPrice,regularUsdPrice:pkg.usdPrice,firstPurchaseUsdPrice:pkg.firstPurchaseUsdPrice,
  firstPurchaseDiscountPercent:pkg.firstPurchaseDiscountPercent,popular:pkg.popular,localAmount,amountMinor,currency:country.currency,
  localAmountFormatted:new Intl.NumberFormat(undefined,{style:"currency",currency:country.currency}).format(localAmount),
  payable,availabilityReason:payable?null:`The selected Stripe card currency minimum for ${country.currency} is ${minimumMinor!/100} ${country.currency}.`
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
function makeReference(): string { return "rdstars-" + Date.now().toString(36) + "-" + crypto.randomBytes(5).toString("hex"); }
function makeStripeReference(): string { return "rdstripe-" + Date.now().toString(36) + "-" + crypto.randomBytes(5).toString("hex"); }
function makeStripeTransactionId(): string {
  // Stripe IDs: RS- + 13–16 digits; first digit is restricted to 1–3.
  const length = 13 + crypto.randomInt(0, 4);
  const first = String(crypto.randomInt(1, 4));
  let digits = first;
  while (digits.length < length) digits += String(crypto.randomInt(0, 10));
  return "RS-" + digits;
}
function makePaystackTransactionId(): string {
  // Paystack IDs: RP- + 7–12 digits; first digit is restricted to 7–9.
  const length = 7 + crypto.randomInt(0, 6);
  const first = String(crypto.randomInt(7, 10));
  let digits = first;
  while (digits.length < length) digits += String(crypto.randomInt(0, 10));
  return "RP-" + digits;
}

async function uniqueRedomTransactionId(client: { query: Function }, provider: "paystack" | "stripe"): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const candidate = provider === "stripe" ? makeStripeTransactionId() : makePaystackTransactionId();
    const existing = await client.query("SELECT 1 FROM payment_transactions WHERE redom_transaction_id=$1 LIMIT 1", [candidate]);
    if (!existing.rows[0]) return candidate;
  }
  throw new Error("Unable to allocate a unique ReDom transaction ID.");
}

function makeSetupReference(): string {
  return "rdsetup-" + Date.now().toString(36) + "-" + crypto.randomBytes(5).toString("hex");
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
  const availableCountries=await refreshCountries();
  const selectedCountry = selected ? availableCountries.find(x=>x.isoCode===selected) ?? null : null;
  const userId = req.user?.userId;
  let firstPurchaseEligible = false;
  if (userId) {
    const prior = await pool.query("SELECT 1 FROM redom_stars_transactions WHERE user_id=$1 AND type='purchase' LIMIT 1", [userId]);
    firstPurchaseEligible = !prior.rows[0];
  }
  return res.json({
    success: true,
    firstPurchaseEligible,
    countries: availableCountries.map((country) => ({ name:country.name, isoCode:country.isoCode, currency:country.currency, cardSupported:country.cardSupported, successRate:country.successRate, observedPayments:country.observedPayments })),
    selectedCountry: selectedCountry ? { name: selectedCountry.name, isoCode: selectedCountry.isoCode, currency: selectedCountry.currency } : null,
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

router.get("/stars/trial", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId;
  if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  try{return res.json({success:true,...await getStarsTrialEligibility(userId)});}
  catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to check trial eligibility."});}
});

router.post("/stars/trial/initialize", authMiddleware, async (req,res)=>{
  const parsed=z.object({
    countryCode:z.string().length(2),
    email:z.string().email().max(255),
    termsVersion:z.string().min(1).max(100).default(TERMS_VERSION),
    consentTimestamp:z.string().datetime().optional(),
  }).safeParse(req.body);
  const userId=req.user?.userId;
  if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  if(!parsed.success)return res.status(400).json({success:false,message:"Invalid trial authorization details."});
  const user=await getUser(userId);
  if(!user?.email||String(user.email).toLowerCase()!==String(parsed.data.email).toLowerCase())return res.status(400).json({success:false,message:"Use the email address on your ReDom account."});
  try{
    const result=await createStarsTrialSetupCheckout({userId,email:String(user.email),countryCode:parsed.data.countryCode,termsVersion:parsed.data.termsVersion,consentTimestamp:parsed.data.consentTimestamp});
    return res.json({success:true,mode:"stripe_trial_setup",checkoutUrl:result.checkoutUrl,reference:result.reference,termsVersion:parsed.data.termsVersion});
  }catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to start the Stars trial."});}
});

router.post("/stars/initialize", authMiddleware, async (req, res) => {
  const parsed = z.object({
    packageKey: z.string().min(1).max(50),
    countryCode: z.string().length(2),
    email: z.string().email().max(255),
    preferredChannel: z.enum(["card", "bank_transfer"]).optional(),
    pin: z.string().regex(/^\d{4,8}$/).optional(),
    paymentMethodId: z.string().uuid().optional(),
    provider: z.enum(["paystack", "stripe"]).optional(),
    retryReference: z.string().min(8).max(100).regex(/^[A-Za-z0-9_.=-]+$/).optional().nullable(),
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
    const country = await getCountry(parsed.data.countryCode);
    const pkg = getPackage(parsed.data.packageKey);
    const priorPurchase = await pool.query("SELECT 1 FROM redom_stars_transactions WHERE user_id=$1 AND type='purchase' LIMIT 1", [userId]);
    const priced = quote(country, pkg, !priorPurchase.rows[0]);
    if (!priced.payable) return res.status(400).json({ success: false, message: priced.availabilityReason });

    // Buy Stars is Stripe-only. Country selection controls local currency and
    // catalog pricing, but it never selects Paystack or any other provider.
    const provider: "stripe" = "stripe";

    // Stripe Stars are intentionally deferred: no payment_transactions row or
    // ReDom transaction ID is created until Stripe confirms payment. A second
    // failed attempt is the only failure state that creates a ReDom transaction.
    const reference = makeStripeReference();
    const stripe = await createDeferredStripeStarsCheckout({
      userId,
      reference,
      retryReference: parsed.data.retryReference ?? null,
      amountMinor: priced.amountMinor,
      currency: priced.currency,
      email: parsed.data.email,
      stars: pkg.stars,
      packageKey: pkg.key,
      countryCode: country.isoCode,
    });

    if (parsed.data.address) {
      const a = parsed.data.address;
      await pool.query(
        `INSERT INTO redom_payment_addresses
         (user_id,country_code,country_name,full_name,address_line1,address_line2,city,state,postal_code,mapbox_place_id,latitude,longitude)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [userId,a.countryCode,a.countryName,a.fullName,a.addressLine1,a.addressLine2 ?? null,a.city,a.state ?? null,a.postalCode ?? null,a.mapboxPlaceId ?? null,a.latitude ?? null,a.longitude ?? null],
      );
    }

    return res.json({
      success: true,
      mode: "stripe",
      provider,
      checkoutUrl: stripe.checkoutUrl,
      accessCode: null,
      reference,
      redomTransactionId: null,
      status: "checkout_created",
      channel: "stripe_checkout",
      attemptNumber: stripe.attemptNumber,
      paymentMethodTypes: stripe.paymentMethodTypes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Stars payment.";
    return res.status(400).json({ success: false, message });
  }
});

router.post("/payment-methods/setup", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId;
  if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  const user=await getUser(userId);
  if(!user?.email)return res.status(400).json({success:false,message:"A verified email address is required."});
  try{
    const settings=await pool.query("SELECT currency FROM payment_settings WHERE user_id=$1 LIMIT 1",[userId]);
    const currency=String(settings.rows[0]?.currency||"NGN").toUpperCase();
    const countryForCurrency = (await refreshCountries()).find((item) => item.currency === currency);
    if (!countryForCurrency) return res.status(400).json({success:false,message:"Your current payment currency is not supported for secure card setup."});
    // Temporary card validation charge: exactly the configured local-currency
    // equivalent of USD $0.25, refunded immediately after provider success.
    const setupAmountMinor = Math.max(1, Math.round(fxRate(countryForCurrency) * 25));
    const reference=makeSetupReference();
    const metadata={purpose:"payment_method_setup",customerEmail:String(user.email),currency,setupAmountMinor,verificationUsdAmount:0.25};
    const inserted=await pool.query(`INSERT INTO payment_transactions
      (user_id,reference,amount_minor,currency,purpose,status,metadata,customer_email)
      VALUES($1,$2,$3,$4,'payment_method_setup','initialized',$5::jsonb,$6) RETURNING id`,
      [userId,reference,setupAmountMinor,currency,JSON.stringify(metadata),String(user.email)]);
    const initialized=await paystack<{authorization_url:string;access_code:string;reference:string}>("post","/transaction/initialize",{
      email:String(user.email),amount:String(setupAmountMinor),currency,channels:["card"],
      callback_url:paymentCallbackUrl(),metadata:JSON.stringify(metadata),reference
    });
    await pool.query("UPDATE payment_transactions SET checkout_url=$1,access_code=$2,reference=$3,updated_at=now() WHERE id=$4",[initialized.authorization_url,initialized.access_code,initialized.reference,inserted.rows[0].id]);
    return res.json({success:true,checkoutUrl:initialized.authorization_url,accessCode:initialized.access_code,reference:initialized.reference,currency,amountMinor:setupAmountMinor});
  }catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to start secure card setup."});}
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

router.post("/payment-addresses", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId;
  const parsed=z.object({
    countryCode:z.string().length(2), countryName:z.string().min(1).max(120), fullName:z.string().min(1).max(180),
    addressLine1:z.string().min(1).max(255), addressLine2:z.string().max(255).optional().nullable(),
    city:z.string().min(1).max(120), state:z.string().max(120).optional().nullable(), postalCode:z.string().max(40).optional().nullable(),
    mapboxPlaceId:z.string().max(255).optional().nullable(), latitude:z.number().optional().nullable(), longitude:z.number().optional().nullable(),
    isDefault:z.boolean().optional()
  }).safeParse(req.body);
  if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  if(!parsed.success)return res.status(400).json({success:false,message:"Invalid payment address."});
  const a=parsed.data;
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const makeDefault=a.isDefault !== false;
    if(makeDefault)await client.query("UPDATE redom_payment_addresses SET is_default=false,updated_at=now() WHERE user_id=$1",[userId]);
    const inserted=await client.query(`INSERT INTO redom_payment_addresses
      (user_id,country_code,country_name,full_name,address_line1,address_line2,city,state,postal_code,mapbox_place_id,latitude,longitude,is_default)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,country_code,country_name,full_name,address_line1,address_line2,city,state,postal_code,mapbox_place_id,latitude,longitude,is_default,created_at,updated_at`,
      [userId,a.countryCode.toUpperCase(),a.countryName,a.fullName,a.addressLine1,a.addressLine2??null,a.city,a.state??null,a.postalCode??null,a.mapboxPlaceId??null,a.latitude??null,a.longitude??null,makeDefault]);
    await client.query("COMMIT");
    return res.status(201).json({success:true,address:inserted.rows[0]});
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to save payment address."});}
  finally{client.release();}
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

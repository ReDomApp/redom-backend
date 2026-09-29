import { Router } from "express";
import axios from "axios";
import crypto from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../database/db";
import { env } from "../config/env";
import { hashPassword, verifyPassword } from "../utils/password";
import { geocodePlace } from "../lib/mapbox";
import { createStripeStarsCheckout, createSavedStripeStarsPayment, verifyStripeStarsCheckout } from "../services/payments/stripe-payment.service";
import { createStarsTrialSetupCheckout, getStarsTrialEligibility, TERMS_VERSION } from "../services/payments/stripe-stars-trial.service";
import { getStripeStarsCountries, getStripeStarsCountry, stripeMinimumMinor } from "../services/payments/stripe-country.service";
import { createStripeCardSetup, finalizeStripeCardSetup, createStripeCardSetupCheckout, finalizeStripeCardSetupCheckout, listStripeCardMethods, getStripeCardMethodForUser, detachStripeCardMethod } from "../services/payments/stripe-saved-payment.service";
import { createSupportCase, addSupportMessage } from "../services/support/support.service";
import { Resend } from "resend";
import { twilioSmsProvider } from "../lib/providers/sms/twilio-sms-provider";

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
    timeZone:z.string().min(1).max(100).default("UTC"),
  }).safeParse(req.body);
  const userId=req.user?.userId;
  if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  if(!parsed.success)return res.status(400).json({success:false,message:"Invalid trial authorization details."});
  const user=await getUser(userId);
  if(!user?.email||String(user.email).toLowerCase()!==String(parsed.data.email).toLowerCase())return res.status(400).json({success:false,message:"Use the email address on your ReDom account."});
  try{
    const result=await createStarsTrialSetupCheckout({userId,email:String(user.email),countryCode:parsed.data.countryCode,termsVersion:parsed.data.termsVersion,consentTimestamp:parsed.data.consentTimestamp,timeZone:parsed.data.timeZone});
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

router.post("/stars/saved-payment/start", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId;
  const parsed=z.object({
    packageKey:z.string().min(1).max(50),
    countryCode:z.string().length(2),
    email:z.string().email().max(255),
    paymentMethodId:z.string().uuid(),
  }).safeParse(req.body);
  if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  if(!parsed.success)return res.status(400).json({success:false,message:"Invalid saved-card Stars payment details."});
  const user=await getUser(userId);
  if(!user?.email||String(user.email).toLowerCase()!==String(parsed.data.email).toLowerCase())return res.status(400).json({success:false,message:"Use the email address on your ReDom account."});
  try{
    const country=await getCountry(parsed.data.countryCode);
    const pkg=getPackage(parsed.data.packageKey);
    const prior=await pool.query("SELECT 1 FROM redom_stars_transactions WHERE user_id=$1 AND type='purchase' LIMIT 1",[userId]);
    const priced=quote(country,pkg,!prior.rows[0]);
    if(!priced.payable)return res.status(400).json({success:false,message:priced.availabilityReason});
    const reference=makeStripeReference();
    const payment=await createSavedStripeStarsPayment({
      userId,reference,amountMinor:priced.amountMinor,currency:priced.currency,email:String(user.email),
      stars:pkg.stars,packageKey:pkg.key,countryCode:country.isoCode,paymentMethodId:parsed.data.paymentMethodId,
    });
    if(payment.status==="succeeded"){
      await pool.query("UPDATE stripe_stars_checkout_attempts SET status='open',updated_at=now() WHERE reference=$1",[reference]);
      await verifyStripeStarsCheckout(userId,reference);
    }
    return res.json({success:true,reference,paymentIntentId:payment.paymentIntentId,clientSecret:payment.clientSecret,status:payment.status,brand:payment.brand,last4:payment.last4});
  }catch(error){
    return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to start the saved ReDom Pay payment."});
  }
});

router.get("/payment-methods/stripe/publishable-key", async (_req,res)=>{
  return res.json({success:true,publishableKey:env.stripe.publishableKey});
});
router.get("/payment-methods/countries", authMiddleware, async (_req,res)=>{
  try {
    const all:any[]=[]; let startingAfter:string|undefined;
    for(let page=0;page<10;page++){
      const response=await axios.get("https://api.stripe.com/v1/country_specs",{headers:{Authorization:"Bearer "+env.stripe.secretKey},params:{limit:100,...(startingAfter?{starting_after:startingAfter}:{})},timeout:20000});
      const data=response.data?.data??[]; all.push(...data.filter((x:any)=>Array.isArray(x.supported_payment_methods)&&x.supported_payment_methods.includes("card")));
      if(!response.data?.has_more||!data.length)break; startingAfter=data[data.length-1].id;
    }
    const names=new Intl.DisplayNames(["en"],{type:"region"});
    const countries=all.map((x:any)=>({isoCode:String(x.id).toUpperCase(),name:String(names.of(String(x.id).toUpperCase())||x.id)})).sort((a:any,b:any)=>a.name.localeCompare(b.name));
    return res.json({success:true,countries});
  } catch { return res.status(502).json({success:false,message:"Unable to load supported payment countries."}); }
});
router.post("/payment-methods/setup/checkout", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId;
  const parsed=z.object({name:z.string().trim().min(1).max(180),returnUrl:z.string().url(),cancelUrl:z.string().url().optional()}).safeParse(req.body);
  if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  if(!parsed.success)return res.status(400).json({success:false,message:"A valid return URL and cardholder name are required."});
  const returnUrl=parsed.data.returnUrl;
  if(!/^(redom|exp):\/\//i.test(returnUrl))return res.status(400).json({success:false,message:"Unsupported ReDom return URL."});
  const cancelUrl=parsed.data.cancelUrl&&/^(redom|exp):\/\//i.test(parsed.data.cancelUrl)?parsed.data.cancelUrl:returnUrl;
  const successPage="https://redom-backend.onrender.com/redom-backend/orders-payments/payment-methods/setup/web/success?return_url="+encodeURIComponent(returnUrl)+"&session_id={CHECKOUT_SESSION_ID}";
  const cancelPage="https://redom-backend.onrender.com/redom-backend/orders-payments/payment-methods/setup/web/cancel?return_url="+encodeURIComponent(cancelUrl);
  try {
    const user=await getUser(userId); if(!user?.email)return res.status(400).json({success:false,message:"A verified email address is required."});
    const result=await createStripeCardSetupCheckout({userId,email:String(user.email),name:parsed.data.name,successUrl:successPage,cancelUrl:cancelPage});
    return res.json({success:true,...result});
  } catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to start secure Stripe card entry."});}
});
router.post("/payment-methods/setup/checkout/finalize", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId; const parsed=z.object({sessionId:z.string().regex(/^cs_[A-Za-z0-9_]+$/)}).safeParse(req.body);
  if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  if(!parsed.success)return res.status(400).json({success:false,message:"Invalid Checkout Session."});
  try{return res.json({success:true,...await finalizeStripeCardSetupCheckout(userId,parsed.data.sessionId)});}
  catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to finalize the secure card save."});}
});
router.get("/payment-methods/setup/web/success", async (req,res)=>{
  const returnUrl=typeof req.query.return_url==="string"?req.query.return_url:"";
  const sessionId=typeof req.query.session_id==="string"?req.query.session_id:"";
  if(!/^(redom|exp):\/\//i.test(returnUrl)||!/^cs_[A-Za-z0-9_]+$/.test(sessionId))return res.status(400).send("Invalid ReDom Pay return request.");
  const target=returnUrl+(returnUrl.includes("?")?"&":"?")+"session_id="+encodeURIComponent(sessionId);
  res.type("html").send("<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>ReDom Pay</title></head><body style=\"font-family:Arial;text-align:center;padding:48px\"><h2>Card setup complete</h2><p>Returning to ReDom Pay securely…</p><p><a href=\""+target.replace(/&/g,"&amp;")+"\">Return to ReDom</a></p><script>setTimeout(function(){location.href="+JSON.stringify(target)+"},350);</script></body></html>");
});
router.get("/payment-methods/setup/web/cancel", async (req,res)=>{
  const returnUrl=typeof req.query.return_url==="string"?req.query.return_url:"";
  if(!/^(redom|exp):\/\//i.test(returnUrl))return res.status(400).send("Invalid ReDom Pay return request.");
  res.type("html").send("<!doctype html><html><body style=\"font-family:Arial;text-align:center;padding:48px\"><h2>Card setup cancelled</h2><p>You can return to ReDom Pay and try again.</p><p><a href=\""+returnUrl.replace(/&/g,"&amp;")+"\">Return to ReDom</a></p></body></html>");
});
router.post("/payment-methods/setup", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId; if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  const parsed=z.object({paymentMethodId:z.string().regex(/^pm_[A-Za-z0-9_]+$/),name:z.string().trim().min(1).max(180)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Valid card payment-method information is required."});
  const user=await getUser(userId); if(!user?.email)return res.status(400).json({success:false,message:"A verified email address is required."});
  try {
    const result=await createStripeCardSetup({userId,email:String(user.email),name:parsed.data.name,paymentMethodId:parsed.data.paymentMethodId});
    return res.json({success:true,...result});
  } catch(error) { return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to validate and save the card."}); }
});
router.post("/payment-methods/setup/finalize", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId; if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  const parsed=z.object({setupIntentId:z.string().regex(/^seti_[A-Za-z0-9_]+$/)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Invalid setup intent."});
  try { const result=await finalizeStripeCardSetup(userId,parsed.data.setupIntentId); return res.json({success:true,...result}); }
  catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to finalize card setup."});}
});
router.get("/payment-methods", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId; if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  try { const methods=await listStripeCardMethods(userId); return res.json({success:true,methods}); }
  catch { return res.status(502).json({success:false,message:"Unable to retrieve payment methods."}); }
});
router.get("/payment-methods/:id", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId; const id=z.string().uuid().safeParse(req.params.id);
  if(!userId||!id.success)return res.status(400).json({success:false,message:"Invalid payment method."});
  try {
    const result=await getStripeCardMethodForUser(userId,id.data);
    const row=result.row; const provider=result.provider;
    const maskedName=provider.cardholderName?provider.cardholderName.split(/\s+/).map((part:string)=>part?part[0]+"•••":"").join(" "):null;
    return res.json({success:true,method:{id:String(row.id),provider:"stripe",brand:provider.brand,last4:provider.last4,maskedLast4:provider.last4?"•••• "+provider.last4:null,cardType:provider.cardType,countryCode:provider.countryCode,status:String(row.status||"active"),reusable:Boolean(row.reusable),expMonth:provider.expMonth,expYear:provider.expYear,maskedCvc:"•••",cardholderName:maskedName,createdAt:new Date(row.created_at).toISOString(),stripePaymentMethodId:provider.stripePaymentMethodId}});
  } catch(error){return res.status(404).json({success:false,message:error instanceof Error?error.message:"Payment method not found."});}
});
function hashRemovalCode(code:string){return crypto.createHmac("sha256",env.authentication.sessionSecret).update(code).digest("hex");}
function maskTarget(value:string){if(value.includes("@")){const [a,b]=value.split("@");return (a.slice(0,2)+"•••@"+b);} return value.length>4?"••••"+value.slice(-4):"••••";}
async function issueRemovalCode(userId:string,methodId:string,attemptCount=0){
  const user=await getUser(userId); if(!user?.email)throw new Error("A verified ReDom email address is required.");
  await pool.query("UPDATE payment_method_removal_challenges SET consumed_at=COALESCE(consumed_at,now()),updated_at=now() WHERE user_id=$1 AND payment_method_id=$2 AND consumed_at IS NULL",[userId,methodId]);
  const code=String(crypto.randomInt(10000000,100000000)); const expiresAt=new Date(Date.now()+10*60*1000);
  let channel="email"; let target=String(user.email);
  if(user.phone_number){
    try { await twilioSmsProvider.sendOtp({channel:"sms",to:String(user.phone_number),code,expiresAt}); channel="sms"; target=maskTarget(String(user.phone_number)); } catch {}
  }
  if(channel==="email"){ const resend=new Resend(env.email.resend.apiKey); const result=await resend.emails.send({from:env.email.securityFrom,to:[String(user.email)],subject:"ReDom Pay Security Verification",text:"Your ReDom Pay payment-method removal code is "+code+". It expires in 10 minutes. If you did not request this, do not use the code and contact ReDom Support.",html:"<p><strong>ReDom Pay Security Verification</strong></p><p>Your payment-method removal code is <strong>"+code+"</strong>.</p><p>This code expires in 10 minutes.</p><p><strong>Security warning:</strong> Never share this code with anyone.</p>"}); if(result.error)throw new Error(result.error.message); }
  await pool.query("INSERT INTO payment_method_removal_challenges(user_id,payment_method_id,channel_type,target_masked,code_hash,expires_at,attempt_count,max_attempts) VALUES($1,$2,$3,$4,$5,$6,$7,2)",[userId,methodId,channel,target,hashRemovalCode(code),expiresAt,attemptCount]);
  return {channel,target,expiresAt:expiresAt.toISOString()};
}
router.post("/payment-methods/:id/removal-challenge", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId; const id=z.string().uuid().safeParse(req.params.id); if(!userId||!id.success)return res.status(400).json({success:false,message:"Invalid payment method."});
  const locked=await pool.query("SELECT lock_until FROM payment_method_removal_challenges WHERE user_id=$1 AND payment_method_id=$2 AND lock_until>now() ORDER BY lock_until DESC LIMIT 1",[userId,id.data]);
  if(locked.rows[0])return res.status(429).json({success:false,locked:true,lockedUntil:new Date(locked.rows[0].lock_until).toISOString(),message:"Payment-method removal is temporarily locked for security."});
  const method=await pool.query("SELECT id FROM redom_payment_methods WHERE id=$1 AND user_id=$2 AND active=true LIMIT 1",[id.data,userId]); if(!method.rows[0])return res.status(404).json({success:false,message:"Payment method not found."});
  try { const challenge=await issueRemovalCode(userId,id.data); return res.json({success:true,...challenge}); } catch(error){return res.status(502).json({success:false,message:"Unable to send the security code."});}
});
router.post("/payment-methods/:id/removal-challenge/resend", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId; const id=z.string().uuid().safeParse(req.params.id);
  if(!userId||!id.success)return res.status(400).json({success:false,message:"Invalid payment method."});
  const locked=await pool.query("SELECT lock_until FROM payment_method_removal_challenges WHERE user_id=$1 AND payment_method_id=$2 AND lock_until>now() ORDER BY lock_until DESC LIMIT 1",[userId,id.data]);
  if(locked.rows[0])return res.status(429).json({success:false,locked:true,lockedUntil:new Date(locked.rows[0].lock_until).toISOString(),message:"Payment-method removal is temporarily locked for security."});
  const latest=await pool.query("SELECT attempt_count FROM payment_method_removal_challenges WHERE user_id=$1 AND payment_method_id=$2 ORDER BY created_at DESC LIMIT 1",[userId,id.data]);
  try { const challenge=await issueRemovalCode(userId,id.data,Math.min(1,Number(latest.rows[0]?.attempt_count||0))); return res.json({success:true,...challenge}); }
  catch { return res.status(502).json({success:false,message:"Unable to resend the security code."}); }
});
router.post("/payment-methods/:id/removal-challenge/verify", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId; const id=z.string().uuid().safeParse(req.params.id); const parsed=z.object({code:z.string().regex(/^\d{8}$/)}).safeParse(req.body);
  if(!userId||!id.success||!parsed.success)return res.status(400).json({success:false,message:"Enter the 8-digit security code."});
  const q=await pool.query("SELECT * FROM payment_method_removal_challenges WHERE user_id=$1 AND payment_method_id=$2 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",[userId,id.data]); const row=q.rows[0];
  if(!row)return res.status(400).json({success:false,message:"This security code is no longer valid. Request a new code."});
  if(new Date(row.expires_at).getTime()<Date.now()){await pool.query("UPDATE payment_method_removal_challenges SET consumed_at=now(),updated_at=now() WHERE id=$1",[row.id]);return res.status(400).json({success:false,message:"This security code has expired."});}
  if(hashRemovalCode(parsed.data.code)!==String(row.code_hash)){
    const nextAttempt=Number(row.attempt_count||0)+1;
    if(nextAttempt>=2){const lockUntil=new Date(Date.now()+72*60*60*1000);await pool.query("UPDATE payment_method_removal_challenges SET attempt_count=$1,consumed_at=now(),lock_until=$2,updated_at=now() WHERE id=$3",[nextAttempt,lockUntil,row.id]);return res.status(429).json({success:false,locked:true,lockedUntil:lockUntil.toISOString(),message:"Payment-method removal is locked for 72 hours after two incorrect security-code attempts."});}
    await pool.query("UPDATE payment_method_removal_challenges SET attempt_count=$1,consumed_at=now(),updated_at=now() WHERE id=$2",[nextAttempt,row.id]);
    try {const next=await issueRemovalCode(userId,id.data,nextAttempt);return res.status(401).json({success:false,codeInvalid:true,attemptsRemaining:1,...next,message:"Incorrect security code. A new 8-digit code has been sent and the previous code is invalid."});}catch{return res.status(502).json({success:false,message:"Incorrect security code. We could not send a new code."});}
  }
  await pool.query("UPDATE payment_method_removal_challenges SET consumed_at=now(),updated_at=now() WHERE id=$1",[row.id]);
  try { await detachStripeCardMethod(userId,id.data); return res.json({success:true}); } catch(error){ return res.status(502).json({success:false,message:"The payment method could not be removed."}); }
});
router.get("/payment-settings/backup", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId;if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  const q=await pool.query("SELECT backup_payment_methods_enabled FROM payment_settings WHERE user_id=$1",[userId]);
  return res.json({success:true,enabled:q.rows[0]?Boolean(q.rows[0].backup_payment_methods_enabled):true});
});
router.patch("/payment-settings/backup", authMiddleware, async (req,res)=>{
  const userId=req.user?.userId;if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
  const parsed=z.object({enabled:z.boolean()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid backup payment-method setting."});
  await pool.query("INSERT INTO payment_settings(user_id,backup_payment_methods_enabled) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET backup_payment_methods_enabled=EXCLUDED.backup_payment_methods_enabled,updated_at=now()",[userId,parsed.data.enabled]);
  return res.json({success:true,enabled:parsed.data.enabled});
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

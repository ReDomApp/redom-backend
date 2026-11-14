import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/db";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import { verifyAurelinkEmailBillingCheckout as verifyLegacyStripeMail, cancelAurelinkEmailSubscription as cancelLegacyStripeMail } from "../services/payments/stripe-payment.service";
import { createAurelinkMailCheckout, verifyAurelinkMailCheckout, cancelAurelinkMailSubscription, handleAurelinkMailWebhook, startAurelinkMailCreditPayment } from "../services/payments/aurelink-mail-payment.service";
import { captureAurelinkEmailUsage, refundAurelinkEmailUsage, resizeAurelinkEmailUsageReservation } from "../services/aurelink/communications-email-billing.service";
import { createAurelinkSmsPackageCheckout, startAurelinkSmsPackagePayment, verifyAurelinkSmsPackageCheckout, handleAurelinkSmsPackageWebhook } from "../services/aurelink/communications-sms-payment.service";
import { adjustAurelinkSmsPackageBalance } from "../services/aurelink/communications-sms-billing.service";

const router=Router();
const admins=()=>new Set(String(process.env.AURELINK_ADMIN_USER_IDS||"").split(",").map(x=>x.trim()).filter(Boolean));
async function workspaceId(userId:string,projectId?:string,requested?:string):Promise<string>{
  if(requested){
    const row=await pool.query("SELECT w.id FROM aurelink_communications_workspaces w LEFT JOIN aurelink_communications_members m ON m.workspace_id=w.id AND m.accepted_user_id=$1 AND m.status='active' WHERE w.id=$2 AND w.status='active' AND (w.user_id=$1 OR m.accepted_user_id=$1)",[userId,requested]);
    if(!row.rows[0])throw new Error("Aurelink workspace not found or access denied.");
    return String(row.rows[0].id);
  }
  if(projectId){
    await pool.query("INSERT INTO aurelink_communications_workspaces(user_id,project_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[userId,projectId]);
    const row=await pool.query("SELECT id FROM aurelink_communications_workspaces WHERE user_id=$1 AND project_id=$2 AND status='active'",[userId,projectId]);
    if(!row.rows[0])throw new Error("Aurelink project communications workspace is unavailable.");
    return String(row.rows[0].id);
  }
  await pool.query("INSERT INTO aurelink_communications_workspaces(user_id) VALUES($1) ON CONFLICT DO NOTHING",[userId]);
  const row=await pool.query("SELECT id FROM aurelink_communications_workspaces WHERE user_id=$1 AND project_id IS NULL AND status='active'",[userId]);
  if(!row.rows[0])throw new Error("Aurelink communications workspace is unavailable.");
  return String(row.rows[0].id);
}

async function canManageBilling(userId:string,wid:string):Promise<boolean>{
  const row=(await pool.query(
    "SELECT w.user_id,m.role FROM aurelink_communications_workspaces w LEFT JOIN aurelink_communications_members m ON m.workspace_id=w.id AND m.accepted_user_id=$1 AND m.status='active' WHERE w.id=$2 AND (w.user_id=$1 OR m.accepted_user_id=$1) LIMIT 1",
    [userId,wid]
  )).rows[0];
  return Boolean(row&&(String(row.user_id)===userId||["owner","admin","billing"].includes(String(row.role||""))));
}


const paymentLinkHeaders={"Cache-Control":"no-store, no-cache, must-revalidate, private","Pragma":"no-cache","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow, noarchive","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
router.get("/aurelink/mail/credits/pay/:token",async(req,res)=>{
  const token=String(req.params.token||"");
  if(!/^[A-Za-z0-9_-]{40,60}$/.test(token))return res.status(410).set(paymentLinkHeaders).type("text/plain").send("This payment link is invalid or expired.");
  const action="/aurelink/mail/credits/pay/"+encodeURIComponent(token);
  return res.status(200).set(paymentLinkHeaders).type("html").send("<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Aurelink Mail secure payment</title><body><main><h1>Continue to secure payment</h1><p>This one-time link will be used only when you press the button below. Payment is completed on the payment provider's secure website.</p><form method='post' action='"+action+"'><button type='submit'>Continue to payment</button></form><p>If you did not request this purchase, close this page.</p></main></body></html>");
});
router.post("/aurelink/mail/credits/pay/:token",async(req,res)=>{
  try{const url=await startAurelinkMailCreditPayment(String(req.params.token||""));return res.status(303).set(paymentLinkHeaders).location(url).end();}
  catch(e){return res.status(410).set(paymentLinkHeaders).type("text/plain").send("This payment link is invalid, expired, or already used. Request a new payment email.");}
});

router.get("/aurelink/sms/packages/pay/:token",async(req,res)=>{
 const token=String(req.params.token||"");if(!/^[A-Za-z0-9_-]{40,60}$/.test(token))return res.status(410).set(paymentLinkHeaders).type("text/plain").send("This SMS payment link is invalid or expired.");
 const action="/aurelink/sms/packages/pay/"+encodeURIComponent(token);
 return res.status(200).set(paymentLinkHeaders).type("html").send("<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Aurelink SMS secure payment</title><body><main><h1>Continue to secure payment</h1><p>This one-time link will be used only when you press the button below. Payment is completed on the payment provider's secure website.</p><form method='post' action='"+action+"'><button type='submit'>Continue to payment</button></form><p>If you did not request this purchase, close this page.</p></main></body></html>");
});
router.post("/aurelink/sms/packages/pay/:token",async(req,res)=>{
 try{const url=await startAurelinkSmsPackagePayment(String(req.params.token||""));return res.status(303).set(paymentLinkHeaders).location(url).end();}
 catch{return res.status(410).set(paymentLinkHeaders).type("text/plain").send("This SMS payment link is invalid, expired, or already used. Request a new payment email.");}
});
router.post("/aurelink/webhooks/paystack-sms",async(req,res)=>{
 try{const body=Buffer.isBuffer(req.body)?JSON.parse(req.body.toString("utf8")):req.body;await handleAurelinkSmsPackageWebhook("paystack",req.headers as Record<string,string|undefined>,body,Buffer.isBuffer(req.body)?req.body:undefined);return res.sendStatus(200);}
 catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Paystack SMS webhook rejected."});}
});
router.post("/aurelink/webhooks/paypal-sms",async(req,res)=>{
 try{await handleAurelinkSmsPackageWebhook("paypal",req.headers as Record<string,string|undefined>,req.body);return res.sendStatus(200);}
 catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"PayPal SMS webhook rejected."});}
});
router.post("/aurelink/communications/sms/billing/checkout",aurelinkAuthMiddleware,async(req,res)=>{
 const parsed=z.object({packageCode:z.string().min(3).max(40),pricingCountryCode:z.string().length(2).transform(v=>v.toUpperCase())}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({success:false,message:"Select an SMS package and the pricing country for currency conversion."});
 try{const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);if(!await canManageBilling(req.user!.userId,wid))return res.status(403).json({success:false,code:"BILLING_PERMISSION_REQUIRED",message:"Workspace owner, administrator or billing permission is required."});const result=await createAurelinkSmsPackageCheckout({userId:req.user!.userId,workspaceId:wid,packageCode:parsed.data.packageCode,pricingCountryCode:parsed.data.pricingCountryCode});return res.status(201).json({success:true,...result});}
 catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to create SMS package payment."});}
});
router.get("/aurelink/communications/sms/billing/verify/:reference",aurelinkAuthMiddleware,async(req,res)=>{
 const ref=z.string().min(8).max(40).regex(/^[A-Za-z0-9_-]+$/).safeParse(req.params.reference);if(!ref.success)return res.status(400).json({success:false,message:"Invalid SMS package payment reference."});
 try{return res.json({success:true,payment:await verifyAurelinkSmsPackageCheckout(req.user!.userId,ref.data)});}
 catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to verify SMS package payment."});}
});

router.post("/aurelink/webhooks/paystack-mail",async(req,res)=>{
  try{
    const body=Buffer.isBuffer(req.body)?JSON.parse(req.body.toString("utf8")):req.body;
    await handleAurelinkMailWebhook("paystack",req.headers as Record<string,string|undefined>,body,Buffer.isBuffer(req.body)?req.body:undefined);
    return res.sendStatus(200);
  }catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Paystack webhook rejected."});}
});
router.post("/aurelink/webhooks/paypal-mail",async(req,res)=>{
  try{
    await handleAurelinkMailWebhook("paypal",req.headers as Record<string,string|undefined>,req.body);
    return res.sendStatus(200);
  }catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"PayPal webhook rejected."});}
});
router.post("/aurelink/admin/accounts/:userId/verify-country",aurelinkAuthMiddleware,async(req,res)=>{
  if(!admins().has(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink administrator access is required."});
  const parsed=z.object({countryCode:z.string().length(2).transform(v=>v.toUpperCase()),verificationMethod:z.enum(["government_document","business_document","manual_compliance_review"]),evidenceReference:z.string().min(6).max(180)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Provide a two-letter country code and an approved verification method."});
  const updated=await pool.query("UPDATE aurelink_users SET country_code=$2,country_verified_at=NOW(),country_verification_method=$3,country_verification_reference=$4,updated_at=NOW() WHERE id=$1 RETURNING id,country_code,country_verified_at,country_verification_method,country_verification_reference",[req.params.userId,parsed.data.countryCode,parsed.data.verificationMethod,parsed.data.evidenceReference]);
  if(!updated.rows[0])return res.status(404).json({success:false,message:"Aurelink account not found."});
  return res.json({success:true,accountCountry:updated.rows[0]});
});

router.get("/aurelink/communications/email/billing/plans",aurelinkAuthMiddleware,async(_req,res)=>{
  const plans=await pool.query(
    `SELECT p.id,p.plan_code,p.display_name,p.min_monthly_emails,p.max_monthly_emails,p.daily_limit,p.features,p.enterprise,
            COALESCE(jsonb_agg(jsonb_build_object('id',o.id,'monthlyEmailAllowance',o.monthly_email_allowance,'monthlyPriceMinor',o.monthly_price_minor,'currency',o.currency)
              ORDER BY o.monthly_email_allowance) FILTER(WHERE o.id IS NOT NULL),'[]'::jsonb) AS options
       FROM aurelink_email_plan_catalog p
       LEFT JOIN aurelink_email_plan_options o ON o.plan_id=p.id AND o.active=TRUE
         AND o.effective_from<=NOW() AND (o.effective_until IS NULL OR o.effective_until>NOW())
      WHERE p.active=TRUE GROUP BY p.id ORDER BY p.sort_order,p.min_monthly_emails`
  );
  return res.json({success:true,currency:"USD",plans:plans.rows});
});

router.get("/aurelink/communications/email/billing/credit-packs",aurelinkAuthMiddleware,async(_req,res)=>{
  const packs=await pool.query("SELECT id,email_credits,price_minor,currency FROM aurelink_email_credit_packs WHERE active=TRUE ORDER BY email_credits");
  return res.json({success:true,currency:"USD",creditPacks:packs.rows});
});

router.post("/aurelink/communications/email/billing/checkout",aurelinkAuthMiddleware,async(req,res)=>{
  const parsed=z.object({
    purchaseType:z.enum(["subscription","email_credits"]),
    planOptionId:z.string().uuid().optional(),
    creditPackId:z.string().uuid().optional(),
    pricingCountryCode:z.string().length(2).transform(v=>v.toUpperCase()).optional()
  }).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Choose a monthly email plan configuration or prepaid email credit pack."});
  if(parsed.data.purchaseType==="subscription"&&!parsed.data.planOptionId)return res.status(400).json({success:false,message:"Select an exact monthly email allowance and price."});
  if(parsed.data.purchaseType==="email_credits"&&!parsed.data.creditPackId)return res.status(400).json({success:false,message:"Select a prepaid email credit pack."});
  if(parsed.data.purchaseType==="email_credits"&&!parsed.data.pricingCountryCode)return res.status(400).json({success:false,message:"Select the pricing country used for live currency conversion."});
  try{
    const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
    if(!await canManageBilling(req.user!.userId,wid))return res.status(403).json({success:false,code:"BILLING_PERMISSION_REQUIRED",message:"Workspace owner, administrator or billing permission is required."});
    const result=await createAurelinkMailCheckout({
      userId:req.user!.userId,workspaceId:wid,purchaseType:parsed.data.purchaseType,
      planOptionId:parsed.data.planOptionId,creditPackId:parsed.data.creditPackId,pricingCountryCode:parsed.data.pricingCountryCode
    });
    return res.status(201).json({success:true,...result});
  }catch(error){
    const message=error instanceof Error?error.message:"Unable to create Aurelink Mail checkout.";
    return res.status(message.includes("already has an active")?409:400).json({success:false,message});
  }
});

router.get("/aurelink/communications/email/billing/verify/:reference",aurelinkAuthMiddleware,async(req,res)=>{
  const reference=z.string().min(8).max(120).regex(/^[A-Za-z0-9_-]+$/).safeParse(req.params.reference);
  if(!reference.success)return res.status(400).json({success:false,message:"Invalid Aurelink Mail payment reference."});
  try{
    const provider=(await pool.query("SELECT payment_provider FROM aurelink_email_billing_payments WHERE reference=$1 AND user_id=$2",[reference.data,req.user!.userId])).rows[0]?.payment_provider;
    const payment=provider==="stripe"?await verifyLegacyStripeMail(req.user!.userId,reference.data):await verifyAurelinkMailCheckout(req.user!.userId,reference.data);
    return res.json({success:true,payment});
  }catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to verify Aurelink Mail payment."});}
});

router.get("/aurelink/communications/email/billing/overview",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  await pool.query("INSERT INTO aurelink_email_billing_accounts(workspace_id,user_id) SELECT id,user_id FROM aurelink_communications_workspaces WHERE id=$1 ON CONFLICT(workspace_id) DO NOTHING",[wid]);
  const [subscription,credits,wallet,usage,account,daily]=await Promise.all([
    pool.query(
      `SELECT s.id,s.status,s.monthly_email_allowance,s.used_emails,s.reserved_emails,
              GREATEST(0,s.monthly_email_allowance-s.used_emails-s.reserved_emails) AS remaining_emails,
              s.allow_prepaid_fallback,s.cancel_at_period_end,s.billing_period_start,s.billing_period_end,
              p.plan_code,p.display_name,o.monthly_price_minor,o.currency
         FROM aurelink_email_subscriptions s
         JOIN aurelink_email_plan_options o ON o.id=s.plan_option_id
         JOIN aurelink_email_plan_catalog p ON p.id=o.plan_id
        WHERE s.workspace_id=$1 AND s.status IN ('active','past_due','pending_payment')
        ORDER BY s.created_at DESC LIMIT 1`,[wid]
    ),
    pool.query("SELECT balance_emails FROM aurelink_email_credit_wallets WHERE workspace_id=$1",[wid]),
    pool.query("SELECT balance_minor,currency FROM aurelink_wallets WHERE user_id=$1",[req.user!.userId]),
    pool.query(
      `SELECT COUNT(*) FILTER(WHERE status='captured')::bigint AS accepted_messages,
              COALESCE(SUM(units) FILTER(WHERE status='captured'),0)::bigint AS accepted_emails,
              COALESCE(SUM(units) FILTER(WHERE status IN ('reserved','unknown')),0)::bigint AS pending_emails
         FROM aurelink_email_usage_reservations WHERE workspace_id=$1
          AND created_at>=COALESCE((SELECT billing_period_start FROM aurelink_email_subscriptions WHERE workspace_id=$1 AND status IN ('active','past_due') ORDER BY created_at DESC LIMIT 1),date_trunc('month',NOW()))
          AND created_at<COALESCE((SELECT billing_period_end FROM aurelink_email_subscriptions WHERE workspace_id=$1 AND status IN ('active','past_due') ORDER BY created_at DESC LIMIT 1),date_trunc('month',NOW())+INTERVAL '1 month')`,[wid]
    ),
    pool.query("SELECT billing_mode FROM aurelink_email_billing_accounts WHERE workspace_id=$1",[wid]),
    pool.query("SELECT used_emails,reserved_emails FROM aurelink_email_free_daily_usage WHERE workspace_id=$1 AND usage_date=CURRENT_DATE",[wid])
  ]);
  const freeLimit=Number((await pool.query("SELECT daily_limit FROM aurelink_email_plan_catalog WHERE plan_code='free'")).rows[0]?.daily_limit||100);
  const freeUsed=BigInt(String(daily.rows[0]?.used_emails||"0")),freeReserved=BigInt(String(daily.rows[0]?.reserved_emails||"0"));
  return res.json({
    success:true,workspaceId:wid,currency:"USD",
    billingMode:String(account.rows[0]?.billing_mode||"free"),
    freeDailyAllowance:{limit:freeLimit,used:freeUsed.toString(),reserved:freeReserved.toString(),remaining:(BigInt(freeLimit)-freeUsed-freeReserved>0n?BigInt(freeLimit)-freeUsed-freeReserved:0n).toString()},
    subscription:subscription.rows[0]||null,
    prepaidEmailCredits:String(credits.rows[0]?.balance_emails??"0"),
    payAsYouGoWallet:{balanceMinor:String(wallet.rows[0]?.balance_minor??"0"),currency:String(wallet.rows[0]?.currency??"USD")},
    usage:usage.rows[0]
  });
});

router.patch("/aurelink/communications/email/billing/mode",aurelinkAuthMiddleware,async(req,res)=>{
  const parsed=z.object({mode:z.enum(["free","payg"])}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Choose Free or Pay-as-you-go billing mode."});
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  if(!await canManageBilling(req.user!.userId,wid))return res.status(403).json({success:false,code:"BILLING_PERMISSION_REQUIRED",message:"Workspace owner, administrator or billing permission is required."});
  const active=await pool.query("SELECT id FROM aurelink_email_subscriptions WHERE workspace_id=$1 AND status IN ('active','past_due','pending_payment') LIMIT 1",[wid]);
  if(active.rows[0])return res.status(409).json({success:false,code:"ACTIVE_SUBSCRIPTION_EXISTS",message:"Cancel or resolve the current monthly subscription before changing billing mode."});
  await pool.query(
    "INSERT INTO aurelink_email_billing_accounts(workspace_id,user_id,billing_mode) SELECT id,user_id,$2 FROM aurelink_communications_workspaces WHERE id=$1 ON CONFLICT(workspace_id) DO UPDATE SET billing_mode=EXCLUDED.billing_mode,updated_at=NOW()",
    [wid,parsed.data.mode]
  );
  await pool.query("INSERT INTO aurelink_email_billing_audit(workspace_id,actor_user_id,action,details) VALUES($1,$2,'billing_mode_changed',$3::jsonb)",[wid,req.user!.userId,JSON.stringify({mode:parsed.data.mode})]);
  return res.json({success:true,workspaceId:wid,billingMode:parsed.data.mode});
});

router.post("/aurelink/communications/email/billing/cancel",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  if(!await canManageBilling(req.user!.userId,wid))return res.status(403).json({success:false,code:"BILLING_PERMISSION_REQUIRED",message:"Workspace owner, administrator or billing permission is required."});
  try{
    const provider=(await pool.query("SELECT payment_provider FROM aurelink_email_subscriptions WHERE workspace_id=$1 AND status IN ('active','past_due') ORDER BY created_at DESC LIMIT 1",[wid])).rows[0]?.payment_provider;
    const result=provider==="stripe"?await cancelLegacyStripeMail(wid):await cancelAurelinkMailSubscription(wid);
    await pool.query("INSERT INTO aurelink_email_billing_audit(workspace_id,actor_user_id,action,details) VALUES($1,$2,'subscription_cancel_scheduled',$3::jsonb)",[wid,req.user!.userId,JSON.stringify({subscriptionId:result.subscriptionId,paymentProvider:provider,periodEnd:result.periodEnd.toISOString()})]);
    return res.json({success:true,subscription:result,message:"Your subscription remains active until the end of the paid billing period."});
  }catch(error){return res.status(409).json({success:false,message:error instanceof Error?error.message:"Unable to schedule subscription cancellation."});}
});

router.patch("/aurelink/communications/email/billing/prepaid-fallback",aurelinkAuthMiddleware,async(req,res)=>{
  const parsed=z.object({enabled:z.boolean()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"enabled must be a boolean."});
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  if(!await canManageBilling(req.user!.userId,wid))return res.status(403).json({success:false,code:"BILLING_PERMISSION_REQUIRED",message:"Workspace owner, administrator or billing permission is required."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const updated=await client.query(
      "UPDATE aurelink_email_subscriptions SET allow_prepaid_fallback=$2,updated_at=NOW() WHERE id=(SELECT id FROM aurelink_email_subscriptions WHERE workspace_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE) RETURNING id,allow_prepaid_fallback",
      [wid,parsed.data.enabled]
    );
    if(!updated.rows[0]){await client.query("ROLLBACK");return res.status(404).json({success:false,code:"ACTIVE_EMAIL_SUBSCRIPTION_NOT_FOUND",message:"There is no active monthly email subscription for this workspace."});}
    await client.query("INSERT INTO aurelink_email_billing_audit(workspace_id,actor_user_id,action,target_id,details) VALUES($1,$2,'prepaid_fallback_changed',$3,$4::jsonb)",[wid,req.user!.userId,updated.rows[0].id,JSON.stringify({enabled:parsed.data.enabled})]);
    await client.query("COMMIT");
    return res.json({success:true,subscription:updated.rows[0]});
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);return res.status(500).json({success:false,message:"Unable to update prepaid fallback."});}
  finally{client.release();}
});

router.post("/aurelink/admin/communications/email/pricing/options",aurelinkAuthMiddleware,async(req,res)=>{
  if(!admins().has(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink administrator access is required."});
  const parsed=z.object({planCode:z.string().min(2).max(32),monthlyEmailAllowance:z.number().int().refine(value=>value>0&&value<=1000000000),monthlyPriceMinor:z.number().int().refine(value=>value>=50&&value<=1000000000),effectiveFrom:z.string().datetime().optional()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Provide a valid plan code, exact monthly allowance and USD price of at least $0.50 in cents."});
  const plan=(await pool.query("SELECT id,min_monthly_emails,max_monthly_emails,enterprise FROM aurelink_email_plan_catalog WHERE plan_code=$1 AND active=TRUE",[parsed.data.planCode])).rows[0];
  if(!plan)return res.status(404).json({success:false,message:"Email plan not found or inactive."});
  const allowance=BigInt(parsed.data.monthlyEmailAllowance);
  if(allowance<BigInt(plan.min_monthly_emails)||(plan.max_monthly_emails!==null&&allowance>BigInt(plan.max_monthly_emails))||(plan.enterprise&&allowance<1000000n)){
    return res.status(400).json({success:false,code:"EMAIL_ALLOWANCE_OUT_OF_RANGE",message:"The exact allowance is outside this plan's configured volume range."});
  }
  const effectiveFrom=parsed.data.effectiveFrom?new Date(parsed.data.effectiveFrom):new Date();
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query(
      "UPDATE aurelink_email_plan_options SET effective_until=$3,updated_at=NOW() WHERE plan_id=$1 AND monthly_email_allowance=$2 AND active=TRUE AND effective_from<$3 AND (effective_until IS NULL OR effective_until>$3)",
      [plan.id,parsed.data.monthlyEmailAllowance,effectiveFrom]
    );
    const created=await client.query(
      "INSERT INTO aurelink_email_plan_options(plan_id,monthly_email_allowance,monthly_price_minor,effective_from,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,monthly_email_allowance,monthly_price_minor,currency,effective_from",
      [plan.id,parsed.data.monthlyEmailAllowance,parsed.data.monthlyPriceMinor,effectiveFrom,req.user!.userId]
    );
    await client.query("INSERT INTO aurelink_email_billing_audit(workspace_id,actor_user_id,action,target_id,details) VALUES(NULL,$1,'plan_option_created',$2,$3::jsonb)",[req.user!.userId,created.rows[0].id,JSON.stringify({planCode:parsed.data.planCode,allowance:parsed.data.monthlyEmailAllowance,priceMinor:parsed.data.monthlyPriceMinor,effectiveFrom:effectiveFrom.toISOString()})]);
    await client.query("COMMIT");
    return res.status(201).json({success:true,option:created.rows[0]});
  }catch(error){
    await client.query("ROLLBACK").catch(()=>undefined);
    return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to create email pricing option."});
  }finally{client.release();}
});

router.post("/aurelink/admin/communications/email/pricing/options/:id/disable",aurelinkAuthMiddleware,async(req,res)=>{
  if(!admins().has(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink administrator access is required."});
  const result=await pool.query("UPDATE aurelink_email_plan_options SET active=FALSE,updated_at=NOW() WHERE id=$1 AND active=TRUE RETURNING id,active",[req.params.id]);
  if(!result.rows[0])return res.status(404).json({success:false,message:"Active email pricing option not found."});
  return res.json({success:true,option:result.rows[0]});
});

router.post("/aurelink/admin/communications/email/pricing/credit-packs",aurelinkAuthMiddleware,async(req,res)=>{
  if(!admins().has(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink administrator access is required."});
  const parsed=z.object({emailCredits:z.number().int().refine(value=>[1000,5000,10000,50000,100000,250000].includes(value)),priceMinor:z.number().int().refine(value=>value>=50&&value<=1000000000)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Prepaid packs must be one of 1,000, 5,000, 10,000, 50,000, 100,000 or 250,000 credits, with a USD price of at least $0.50 in cents."});
  const result=await pool.query("INSERT INTO aurelink_email_credit_packs(email_credits,price_minor) VALUES($1,$2) ON CONFLICT(email_credits,price_minor) DO UPDATE SET active=TRUE,updated_at=NOW() RETURNING id,email_credits,price_minor,currency,active",[parsed.data.emailCredits,parsed.data.priceMinor]);
  return res.status(201).json({success:true,creditPack:result.rows[0]});
});

router.post("/aurelink/admin/communications/email/pricing/credit-packs/:id/disable",aurelinkAuthMiddleware,async(req,res)=>{
  if(!admins().has(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink administrator access is required."});
  const result=await pool.query("UPDATE aurelink_email_credit_packs SET active=FALSE,updated_at=NOW() WHERE id=$1 AND active=TRUE RETURNING id,active",[req.params.id]);
  if(!result.rows[0])return res.status(404).json({success:false,message:"Active prepaid email credit pack not found."});
  return res.json({success:true,creditPack:result.rows[0]});
});

router.post("/aurelink/admin/communications/email/credits/adjust",aurelinkAuthMiddleware,async(req,res)=>{
  if(!admins().has(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink administrator access is required."});
  const parsed=z.object({workspaceId:z.string().uuid(),amountEmails:z.number().int().positive().max(250000),direction:z.enum(["credit","debit"]),reason:z.string().min(8).max(500),reference:z.string().min(8).max(120)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"A workspace, positive email quantity, direction, reason and unique reference are required."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const workspace=(await client.query("SELECT id,user_id FROM aurelink_communications_workspaces WHERE id=$1 FOR UPDATE",[parsed.data.workspaceId])).rows[0];
    if(!workspace)throw new Error("Aurelink workspace not found.");
    await client.query("INSERT INTO aurelink_email_credit_wallets(workspace_id,user_id) VALUES($1,$2) ON CONFLICT(workspace_id) DO NOTHING",[workspace.id,workspace.user_id]);
    const wallet=(await client.query("SELECT balance_emails FROM aurelink_email_credit_wallets WHERE workspace_id=$1 FOR UPDATE",[workspace.id])).rows[0];
    const current=BigInt(String(wallet.balance_emails)),amount=BigInt(parsed.data.amountEmails);
    if(parsed.data.direction==="debit"&&current<amount)throw new Error("INSUFFICIENT_EMAIL_CREDITS");
    const next=parsed.data.direction==="credit"?current+amount:current-amount;
    if(next>250000n)throw new Error("PREPAID_CREDIT_BALANCE_LIMIT");
    await client.query("UPDATE aurelink_email_credit_wallets SET balance_emails=$2,updated_at=NOW() WHERE workspace_id=$1",[workspace.id,next.toString()]);
    await client.query("INSERT INTO aurelink_email_credit_ledger(workspace_id,user_id,entry_type,direction,amount_emails,balance_after,reference,description,metadata) VALUES($1,$2,'adjustment',$3,$4,$5,$6,$7,$8::jsonb)",[workspace.id,workspace.user_id,parsed.data.direction,amount.toString(),next.toString(),parsed.data.reference,parsed.data.reason,JSON.stringify({adminUserId:req.user!.userId})]);
    await client.query("INSERT INTO aurelink_email_billing_audit(workspace_id,actor_user_id,action,details) VALUES($1,$2,'email_credit_adjustment',$3::jsonb)",[workspace.id,req.user!.userId,JSON.stringify({amountEmails:parsed.data.amountEmails,direction:parsed.data.direction,reason:parsed.data.reason,reference:parsed.data.reference})]);
    await client.query("COMMIT");
    return res.json({success:true,workspaceId:workspace.id,prepaidEmailCredits:next.toString()});
  }catch(error){
    await client.query("ROLLBACK").catch(()=>undefined);
    return res.status(error instanceof Error&&["INSUFFICIENT_EMAIL_CREDITS","PREPAID_CREDIT_BALANCE_LIMIT"].includes(error.message)?409:400).json({success:false,message:error instanceof Error?error.message:"Unable to adjust email credits."});
  }finally{client.release();}
});

router.get("/aurelink/admin/communications/email/smtp/manual-review",aurelinkAuthMiddleware,async(req,res)=>{
  if(!admins().has(req.user!.userId))return res.status(403).json({success:false,code:"ADMIN_REQUIRED",message:"Aurelink administrator access is required."});
  const limit=Math.max(1,Math.min(100,Number.parseInt(String(req.query.limit||"50"),10)||50));
  await pool.query(
    `UPDATE aurelink_email_usage_reservations r SET status='unknown',updated_at=NOW()
      WHERE r.status='reserved' AND r.metadata->>'transport'='smtp' AND r.created_at<NOW()-INTERVAL '2 minutes'
        AND EXISTS(SELECT 1 FROM aurelink_smtp_messages s WHERE s.message_key=r.message_id::text AND s.status='pending')`
  );
  await pool.query(
    `UPDATE aurelink_messages m SET status='unknown',provider_status='smtp_gateway_stale_submission',provider_error='SMTP gateway stopped before a final provider result was recorded.',updated_at=NOW()
      WHERE m.id IN (SELECT r.message_id FROM aurelink_email_usage_reservations r JOIN aurelink_smtp_messages s ON s.message_key=r.message_id::text WHERE r.status='unknown' AND r.metadata->>'transport'='smtp' AND s.status='pending')
        AND m.status='queued'`
  );
  await pool.query(
    `UPDATE aurelink_smtp_messages SET status='unknown',error='SMTP gateway stopped before a final provider result was recorded.',updated_at=NOW()
      WHERE status='pending' AND message_key IN (SELECT r.message_id::text FROM aurelink_email_usage_reservations r WHERE r.status='unknown' AND r.metadata->>'transport'='smtp')`
  );
  const result=await pool.query(
    `SELECT m.id AS message_id,m.workspace_id,m.provider,m.recipient,m.sender,m.category,m.status AS message_status,
            m.provider_error,m.provider_message_id,m.created_at,r.source,r.units,r.status AS billing_status,
            s.client_message_id,s.envelope_from,s.recipients,s.error AS smtp_error
       FROM aurelink_email_usage_reservations r
       JOIN aurelink_messages m ON m.id=r.message_id
       LEFT JOIN aurelink_smtp_messages s ON s.message_key=m.id::text AND s.workspace_id=m.workspace_id
      WHERE r.status='unknown' AND r.metadata->>'transport'='smtp'
      ORDER BY r.updated_at ASC LIMIT $1`,[limit]
  );
  return res.json({success:true,items:result.rows,count:result.rows.length});
});

router.post("/aurelink/admin/communications/email/smtp/:id/reconcile",aurelinkAuthMiddleware,async(req,res)=>{
  if(!admins().has(req.user!.userId))return res.status(403).json({success:false,code:"ADMIN_REQUIRED",message:"Aurelink administrator access is required."});
  if(!z.string().uuid().safeParse(req.params.id).success)return res.status(400).json({success:false,message:"A valid message ID is required."});
  const parsed=z.object({outcome:z.enum(["accepted","rejected"]),evidenceReference:z.string().min(8).max(500),providerMessageId:z.string().min(1).max(220).optional()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Provide an accepted/rejected outcome, evidence reference, and provider message ID when required."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const found=await client.query(
      "SELECT m.id,m.workspace_id,m.provider,m.channel,m.provider_message_id,r.source,r.units,r.status AS billing_status,r.metadata,w.user_id FROM aurelink_messages m JOIN aurelink_email_usage_reservations r ON r.message_id=m.id JOIN aurelink_communications_workspaces w ON w.id=m.workspace_id WHERE m.id=$1 FOR UPDATE OF m,r",
      [req.params.id]
    );
    const row=found.rows[0];
    if(!row||row.channel!=="email"||row.metadata?.transport!=="smtp"||row.billing_status!=="unknown"){
      await client.query("ROLLBACK");
      return res.status(409).json({success:false,code:"NOT_AWAITING_RECONCILIATION",message:"This SMTP message is not awaiting billing reconciliation."});
    }
    const partial=row.metadata?.partialAcceptance===true;
    const acceptedRecipients=Array.isArray(row.metadata?.acceptedRecipients)?row.metadata.acceptedRecipients.map(String):[];
    const rejectedRecipients=Array.isArray(row.metadata?.rejectedRecipients)?row.metadata.rejectedRecipients.map(String):[];
    if(partial&&parsed.data.outcome==="rejected"){await client.query("ROLLBACK");return res.status(409).json({success:false,code:"PARTIAL_ACCEPTANCE_REQUIRES_ALLOCATION",message:"Provider evidence already records partial acceptance. Reconcile it as accepted so only accepted recipients are charged."});}
    if(parsed.data.outcome==="accepted"){
      const providerMessageId=String(parsed.data.providerMessageId||row.provider_message_id||"");
      if(!providerMessageId){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"A provider message ID is required to confirm acceptance."});}
      if(partial){
        if(!acceptedRecipients.length||!rejectedRecipients.length){await client.query("ROLLBACK");return res.status(409).json({success:false,code:"PARTIAL_ALLOCATION_MISSING",message:"The accepted/rejected recipient allocation is incomplete."});}
        await resizeAurelinkEmailUsageReservation(client,String(row.id),acceptedRecipients.length,rejectedRecipients);
        await client.query("UPDATE aurelink_messages SET recipient=$2,provider_status='smtp_partial_acceptance',provider_error=$3,updated_at=NOW() WHERE id=$1",[row.id,JSON.stringify(acceptedRecipients),"Provider rejected recipient(s): "+rejectedRecipients.join(", ")]);
        await client.query("UPDATE aurelink_smtp_messages SET recipients=$2::jsonb,error=$3,updated_at=NOW() WHERE workspace_id=$1 AND message_key=$4",[row.workspace_id,JSON.stringify(acceptedRecipients),"Provider rejected recipient(s): "+rejectedRecipients.join(", "),String(row.id)]);
      }
      const provider=String(row.provider||"");
      if(!["resend","brevo"].includes(provider)){await client.query("ROLLBACK");return res.status(409).json({success:false,code:"UNSUPPORTED_SMTP_PROVIDER",message:"This SMTP provider cannot be reconciled through the current billing workflow."});}
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[provider+":"+providerMessageId]);
      const duplicate=await client.query("SELECT id FROM aurelink_messages WHERE provider=$1 AND provider_message_id=$2 AND id<>$3 LIMIT 1",[provider,providerMessageId,row.id]);
      if(duplicate.rows.length){await client.query("ROLLBACK");return res.status(409).json({success:false,code:"PROVIDER_MESSAGE_ID_IN_USE",message:"That provider message ID is already linked to another Aurelink message."});}
      await client.query("UPDATE aurelink_email_usage_reservations SET status='reserved',updated_at=NOW() WHERE message_id=$1",[row.id]);
      await client.query("UPDATE aurelink_messages SET provider=$4,provider_message_id=$2,status='accepted',provider_status=CASE WHEN $3 THEN 'operator_confirmed_partial_acceptance' ELSE 'operator_confirmed_accepted' END,provider_error=CASE WHEN $3 THEN provider_error ELSE NULL END,accepted_at=COALESCE(accepted_at,NOW()),updated_at=NOW() WHERE id=$1",[row.id,providerMessageId,partial,provider]);
      await client.query("UPDATE aurelink_communications_usage SET provider=$3,status='accepted',provider_message_id=$2,updated_at=NOW() WHERE message_id=$1",[row.id,providerMessageId,provider]);
      await client.query("UPDATE aurelink_smtp_messages SET provider_message_id=$2,status='accepted',error=CASE WHEN $4 THEN error ELSE NULL END,updated_at=NOW() WHERE workspace_id=$1 AND message_key=$3",[row.workspace_id,providerMessageId,String(row.id),partial]);
      await captureAurelinkEmailUsage(client,String(row.id));
    }else{
      await client.query("UPDATE aurelink_email_usage_reservations SET status='reserved',updated_at=NOW() WHERE message_id=$1",[row.id]);
      await client.query("UPDATE aurelink_messages SET status='failed',provider_status='operator_confirmed_not_accepted',provider_error='Provider review confirmed that the SMTP submission was not accepted.',updated_at=NOW() WHERE id=$1",[row.id]);
      await client.query("UPDATE aurelink_communications_usage SET status='failed',updated_at=NOW() WHERE message_id=$1",[row.id]);
      await client.query("UPDATE aurelink_smtp_messages SET status='failed',error='Provider review confirmed that the SMTP submission was not accepted.',updated_at=NOW() WHERE workspace_id=$1 AND message_key=$2",[row.workspace_id,String(row.id)]);
      await refundAurelinkEmailUsage(client,String(row.id));
    }
    await client.query("INSERT INTO aurelink_email_billing_audit(workspace_id,actor_user_id,action,target_id,details) VALUES($1,$2,'smtp_usage_reconciled',$3,$4::jsonb)",[row.workspace_id,req.user!.userId,row.id,JSON.stringify({outcome:parsed.data.outcome,evidenceReference:parsed.data.evidenceReference,providerMessageId:parsed.data.providerMessageId||null,source:row.source,units:partial?acceptedRecipients.length:row.units,rejectedRecipients:partial?rejectedRecipients:[]})]);
    await client.query("COMMIT");
    return res.json({success:true,messageId:row.id,outcome:parsed.data.outcome,financialAction:parsed.data.outcome==="accepted"?"usage_captured":"reservation_released_or_refunded"});
  }catch(error){
    await client.query("ROLLBACK").catch(()=>undefined);
    return res.status(500).json({success:false,message:"SMTP billing reconciliation could not be saved."});
  }finally{client.release();}
});


router.get("/aurelink/admin/communications/sms/payments/:reference",aurelinkAuthMiddleware,async(req,res)=>{
 if(!admins().has(req.user!.userId))return res.status(403).json({success:false,code:"ADMIN_REQUIRED",message:"Aurelink administrator access is required."});
 const reference=z.string().regex(/^[A-Z0-9]{18,19}$/).safeParse(req.params.reference);if(!reference.success)return res.status(400).json({success:false,message:"Invalid SMS purchase reference."});
 const payment=(await pool.query("SELECT reference,user_id,workspace_id,package_code,sms_segments,amount_minor,currency,payment_provider,provider_currency,provider_amount_minor,status,provider_order_id,provider_transaction_reference,credit_ledger_reference,refunded_amount_minor,dispute_status,provider_payment_status,credit_allocation_status,payment_verified_at,credit_allocated_at,paid_at,created_at,updated_at FROM aurelink_sms_package_payments WHERE reference=$1",[reference.data])).rows[0];if(!payment)return res.status(404).json({success:false,message:"SMS purchase not found."});
 const [history,refunds,disputes,ledger]=await Promise.all([
  pool.query("SELECT event_type,provider,provider_event_id,provider_order_id,provider_transaction_reference,details,created_at FROM aurelink_sms_payment_reference_events WHERE payment_reference=$1 ORDER BY created_at ASC",[reference.data]),
  pool.query("SELECT provider,provider_refund_id,amount_minor,currency,status,reason,created_at,updated_at FROM aurelink_sms_payment_refunds WHERE payment_reference=$1 ORDER BY created_at DESC",[reference.data]),
  pool.query("SELECT provider,provider_dispute_id,status,reason,evidence_due_at,resolved_at,investigation_notes,created_at,updated_at FROM aurelink_sms_payment_disputes WHERE payment_reference=$1 ORDER BY created_at DESC",[reference.data]),
  pool.query("SELECT reference,entry_type,direction,amount_segments,balance_after,description,metadata,created_at FROM aurelink_sms_package_ledger WHERE payment_reference=$1 OR reference=$2 ORDER BY created_at ASC",[reference.data,payment.credit_ledger_reference||""])
 ]);
 return res.json({success:true,payment,history:history.rows,refunds:refunds.rows,disputes:disputes.rows,ledger:ledger.rows});
});
router.post("/aurelink/admin/communications/sms/credits/adjust",aurelinkAuthMiddleware,async(req,res)=>{
 if(!admins().has(req.user!.userId))return res.status(403).json({success:false,code:"ADMIN_REQUIRED",message:"Aurelink administrator access is required."});
 const parsed=z.object({workspaceId:z.string().uuid(),amountSegments:z.number().int().positive().max(10000000),direction:z.enum(["credit","debit"]),reason:z.string().min(8).max(500),reversalOfReference:z.string().regex(/^[A-Z0-9]{18,19}$/).optional()}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({success:false,message:"Provide a workspace, positive SMS segment quantity, direction, reason and optional original ledger reference for a reversal."});
 const client=await pool.connect();try{await client.query("BEGIN");const result=await adjustAurelinkSmsPackageBalance(client,{workspaceId:parsed.data.workspaceId,actorUserId:req.user!.userId,amountSegments:parsed.data.amountSegments,direction:parsed.data.direction,reason:parsed.data.reason,reversalOfReference:parsed.data.reversalOfReference});await client.query("COMMIT");return res.status(201).json({success:true,adjustment:result});}catch(error){await client.query("ROLLBACK").catch(()=>undefined);return res.status(409).json({success:false,message:error instanceof Error?error.message:"Unable to adjust SMS package balance."});}finally{client.release();}
});
router.post("/aurelink/admin/communications/sms/payments/:reference/disputes/:disputeId/notes",aurelinkAuthMiddleware,async(req,res)=>{
 if(!admins().has(req.user!.userId))return res.status(403).json({success:false,code:"ADMIN_REQUIRED",message:"Aurelink administrator access is required."});
 const reference=z.string().regex(/^[A-Z0-9]{18,19}$/).safeParse(req.params.reference),note=z.string().trim().min(10).max(2000).safeParse(req.body?.note);if(!reference.success||!note.success)return res.status(400).json({success:false,message:"A valid purchase reference and investigation note are required."});
 const client=await pool.connect();try{await client.query("BEGIN");const dispute=(await client.query("SELECT id FROM aurelink_sms_payment_disputes WHERE payment_reference=$1 AND provider_dispute_id=$2 FOR UPDATE",[reference.data,req.params.disputeId])).rows[0];if(!dispute){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"SMS payment dispute not found."});}await client.query("UPDATE aurelink_sms_payment_disputes SET investigation_notes=investigation_notes||jsonb_build_array(jsonb_build_object('note',$2::text,'actorUserId',$3::text,'createdAt',NOW())),updated_at=NOW() WHERE id=$1",[dispute.id,note.data,req.user!.userId]);await client.query("INSERT INTO aurelink_sms_payment_audit(payment_reference,action,details) VALUES($1,'dispute_investigation_note_added',$2::jsonb)",[reference.data,JSON.stringify({disputeId:req.params.disputeId,actorUserId:req.user!.userId,note:note.data})]);await client.query("COMMIT");return res.json({success:true});}catch(error){await client.query("ROLLBACK").catch(()=>undefined);return res.status(500).json({success:false,message:"Unable to append dispute investigation note."});}finally{client.release();}
});

export default router;

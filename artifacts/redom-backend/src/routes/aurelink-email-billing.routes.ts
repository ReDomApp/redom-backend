import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/db";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import { createAurelinkEmailBillingCheckout, verifyAurelinkEmailBillingCheckout, cancelAurelinkEmailSubscription } from "../services/payments/stripe-payment.service";
import { captureAurelinkEmailUsage, refundAurelinkEmailUsage, resizeAurelinkEmailUsageReservation } from "../services/aurelink/communications-email-billing.service";

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
    creditPackId:z.string().uuid().optional()
  }).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Choose a monthly email plan configuration or prepaid email credit pack."});
  if(parsed.data.purchaseType==="subscription"&&!parsed.data.planOptionId)return res.status(400).json({success:false,message:"Select an exact monthly email allowance and price."});
  if(parsed.data.purchaseType==="email_credits"&&!parsed.data.creditPackId)return res.status(400).json({success:false,message:"Select a prepaid email credit pack."});
  try{
    const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
    if(!await canManageBilling(req.user!.userId,wid))return res.status(403).json({success:false,code:"BILLING_PERMISSION_REQUIRED",message:"Workspace owner, administrator or billing permission is required."});
    const result=await createAurelinkEmailBillingCheckout({
      userId:req.user!.userId,workspaceId:wid,purchaseType:parsed.data.purchaseType,
      planOptionId:parsed.data.planOptionId,creditPackId:parsed.data.creditPackId
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
    const payment=await verifyAurelinkEmailBillingCheckout(req.user!.userId,reference.data);
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
    billingMode:String(account.rows[0]?.billing_mode||"payg"),
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
    const result=await cancelAurelinkEmailSubscription(wid);
    await pool.query("INSERT INTO aurelink_email_billing_audit(workspace_id,actor_user_id,action,details) VALUES($1,$2,'subscription_cancel_scheduled',$3::jsonb)",[wid,req.user!.userId,JSON.stringify({stripeSubscriptionId:result.subscriptionId,periodEnd:result.periodEnd.toISOString()})]);
    return res.json({success:true,subscription:result,message:"Your subscription remains active until the end of the paid billing period."});
  }catch(error){return res.status(409).json({success:false,message:error instanceof Error?error.message:"Unable to schedule subscription cancellation."});}
});

router.patch("/aurelink/communications/email/billing/prepaid-fallback",aurelinkAuthMiddleware,async(req,res)=>{
  const parsed=z.object({enabled:z.boolean()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"enabled must be a boolean."});
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  if(!await canManageBilling(req.user!.userId,wid))return res.status(403).json({success:false,code:"BILLING_PERMISSION_REQUIRED",message:"Workspace owner, administrator or billing permission is required."});
  const updated=await pool.query(
    "UPDATE aurelink_email_subscriptions SET allow_prepaid_fallback=$2,updated_at=NOW() WHERE id=(SELECT id FROM aurelink_email_subscriptions WHERE workspace_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1) RETURNING id,allow_prepaid_fallback",
    [wid,parsed.data.enabled]
  );
  if(!updated.rows[0])return res.status(404).json({success:false,code:"ACTIVE_EMAIL_SUBSCRIPTION_NOT_FOUND",message:"There is no active monthly email subscription for this workspace."});
  return res.json({success:true,subscription:updated.rows[0]});
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
  const parsed=z.object({emailCredits:z.number().int().refine(value=>value>0&&value<=1000000000),priceMinor:z.number().int().refine(value=>value>=50&&value<=1000000000)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Provide a positive email-credit quantity and USD price of at least $0.50 in cents."});
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
  const parsed=z.object({workspaceId:z.string().uuid(),amountEmails:z.number().int().positive().max(1000000000),direction:z.enum(["credit","debit"]),reason:z.string().min(8).max(500),reference:z.string().min(8).max(120)}).safeParse(req.body);
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
    await client.query("UPDATE aurelink_email_credit_wallets SET balance_emails=$2,updated_at=NOW() WHERE workspace_id=$1",[workspace.id,next.toString()]);
    await client.query("INSERT INTO aurelink_email_credit_ledger(workspace_id,user_id,entry_type,direction,amount_emails,balance_after,reference,description,metadata) VALUES($1,$2,'adjustment',$3,$4,$5,$6,$7,$8::jsonb)",[workspace.id,workspace.user_id,parsed.data.direction,amount.toString(),next.toString(),parsed.data.reference,parsed.data.reason,JSON.stringify({adminUserId:req.user!.userId})]);
    await client.query("INSERT INTO aurelink_email_billing_audit(workspace_id,actor_user_id,action,details) VALUES($1,$2,'email_credit_adjustment',$3::jsonb)",[workspace.id,req.user!.userId,JSON.stringify({amountEmails:parsed.data.amountEmails,direction:parsed.data.direction,reason:parsed.data.reason,reference:parsed.data.reference})]);
    await client.query("COMMIT");
    return res.json({success:true,workspaceId:workspace.id,prepaidEmailCredits:next.toString()});
  }catch(error){
    await client.query("ROLLBACK").catch(()=>undefined);
    return res.status(error instanceof Error&&error.message==="INSUFFICIENT_EMAIL_CREDITS"?409:400).json({success:false,message:error instanceof Error?error.message:"Unable to adjust email credits."});
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

export default router;

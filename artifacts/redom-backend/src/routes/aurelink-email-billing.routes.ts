import { Router } from "express";
import { z } from "zod";
import { pool } from "../database/db";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";

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

router.get("/aurelink/communications/email/billing/overview",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  const [subscription,credits,wallet,usage]=await Promise.all([
    pool.query(
      `SELECT s.id,s.status,s.monthly_email_allowance,s.used_emails,s.reserved_emails,
              GREATEST(0,s.monthly_email_allowance-s.used_emails-s.reserved_emails) AS remaining_emails,
              s.allow_prepaid_fallback,s.billing_period_start,s.billing_period_end,
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
      `SELECT COUNT(*) FILTER(WHERE status IN ('accepted','delivered'))::bigint AS accepted_messages,
              COALESCE(SUM(units) FILTER(WHERE status IN ('accepted','delivered')),0)::bigint AS accepted_emails,
              COALESCE(SUM(units) FILTER(WHERE status='queued'),0)::bigint AS pending_emails
         FROM aurelink_communications_usage WHERE workspace_id=$1 AND channel='email'
          AND created_at>=date_trunc('month',NOW())`,[wid]
    )
  ]);
  return res.json({
    success:true,workspaceId:wid,currency:"USD",
    subscription:subscription.rows[0]||null,
    prepaidEmailCredits:String(credits.rows[0]?.balance_emails??"0"),
    payAsYouGoWallet:{balanceMinor:String(wallet.rows[0]?.balance_minor??"0"),currency:String(wallet.rows[0]?.currency??"USD")},
    usage:usage.rows[0]
  });
});

router.patch("/aurelink/communications/email/billing/prepaid-fallback",aurelinkAuthMiddleware,async(req,res)=>{
  const parsed=z.object({enabled:z.boolean()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"enabled must be a boolean."});
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  const updated=await pool.query(
    "UPDATE aurelink_email_subscriptions SET allow_prepaid_fallback=$2,updated_at=NOW() WHERE id=(SELECT id FROM aurelink_email_subscriptions WHERE workspace_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1) RETURNING id,allow_prepaid_fallback",
    [wid,parsed.data.enabled]
  );
  if(!updated.rows[0])return res.status(404).json({success:false,code:"ACTIVE_EMAIL_SUBSCRIPTION_NOT_FOUND",message:"There is no active monthly email subscription for this workspace."});
  return res.json({success:true,subscription:updated.rows[0]});
});

router.post("/aurelink/admin/communications/email/pricing/options",aurelinkAuthMiddleware,async(req,res)=>{
  if(!admins().has(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink administrator access is required."});
  const parsed=z.object({planCode:z.string().min(2).max(32),monthlyEmailAllowance:z.number().int().positive().max(1000000000),monthlyPriceMinor:z.number().int().positive().max(1000000000),effectiveFrom:z.string().datetime().optional()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Provide a valid plan code, exact monthly allowance and USD price in cents."});
  const plan=(await pool.query("SELECT id,min_monthly_emails,max_monthly_emails,enterprise FROM aurelink_email_plan_catalog WHERE plan_code=$1 AND active=TRUE",[parsed.data.planCode])).rows[0];
  if(!plan)return res.status(404).json({success:false,message:"Email plan not found or inactive."});
  const allowance=BigInt(parsed.data.monthlyEmailAllowance);
  if(allowance<BigInt(plan.min_monthly_emails)||(plan.max_monthly_emails!==null&&allowance>BigInt(plan.max_monthly_emails))||(plan.enterprise&&allowance<1000000n)){
    return res.status(400).json({success:false,code:"EMAIL_ALLOWANCE_OUT_OF_RANGE",message:"The exact allowance is outside this plan's configured volume range."});
  }
  const effectiveFrom=parsed.data.effectiveFrom?new Date(parsed.data.effectiveFrom):new Date();
  const created=await pool.query(
    "INSERT INTO aurelink_email_plan_options(plan_id,monthly_email_allowance,monthly_price_minor,effective_from,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,monthly_email_allowance,monthly_price_minor,currency,effective_from",
    [plan.id,parsed.data.monthlyEmailAllowance,parsed.data.monthlyPriceMinor,effectiveFrom,req.user!.userId]
  );
  const auditWorkspace=(await pool.query("SELECT id FROM aurelink_communications_workspaces WHERE user_id=$1 AND project_id IS NULL LIMIT 1",[req.user!.userId])).rows[0];
  if(auditWorkspace)await pool.query("INSERT INTO aurelink_email_billing_audit(workspace_id,actor_user_id,action,target_id,details) VALUES($1,$2,'plan_option_created',$3,$4::jsonb)",[auditWorkspace.id,req.user!.userId,created.rows[0].id,JSON.stringify({planCode:parsed.data.planCode,allowance:parsed.data.monthlyEmailAllowance,priceMinor:parsed.data.monthlyPriceMinor})]);
  return res.status(201).json({success:true,option:created.rows[0]});
});

router.post("/aurelink/admin/communications/email/pricing/options/:id/disable",aurelinkAuthMiddleware,async(req,res)=>{
  if(!admins().has(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink administrator access is required."});
  const result=await pool.query("UPDATE aurelink_email_plan_options SET active=FALSE,updated_at=NOW() WHERE id=$1 AND active=TRUE RETURNING id,active",[req.params.id]);
  if(!result.rows[0])return res.status(404).json({success:false,message:"Active email pricing option not found."});
  return res.json({success:true,option:result.rows[0]});
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

export default router;

import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { pool } from "../database/db";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";

const router=Router();
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const clamp=(value:unknown,min:number,max:number,fallback:number)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Math.floor(Number(value)):fallback));
function isAurelinkAdmin(userId:string){return new Set(String(process.env.AURELINK_ADMIN_USER_IDS||"").split(",").map(x=>x.trim()).filter(Boolean)).has(userId);}
async function getWorkspace(userId:string,projectId?:string,requestedId?:string){
 if(requestedId){
  const row=(await pool.query(`SELECT w.id,w.user_id,w.project_id,
    CASE WHEN w.user_id=$1 THEN 'owner' ELSE m.role END AS role
    FROM aurelink_communications_workspaces w
    LEFT JOIN aurelink_communications_members m ON m.workspace_id=w.id AND m.accepted_user_id=$1 AND m.status='active'
    WHERE w.id=$2 AND w.status='active' AND (w.user_id=$1 OR m.accepted_user_id=$1)`,[userId,requestedId])).rows[0];
  if(!row)throw Object.assign(new Error("Workspace not found or access denied."),{status:404});
  return row;
 }
 if(projectId){
  await pool.query("INSERT INTO aurelink_communications_workspaces(user_id,project_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[userId,projectId]);
  const row=(await pool.query("SELECT id,user_id,project_id,'owner' AS role FROM aurelink_communications_workspaces WHERE user_id=$1 AND project_id=$2 AND status='active'",[userId,projectId])).rows[0];
  if(!row)throw new Error("Aurelink project workspace is unavailable.");
  return row;
 }
 await pool.query("INSERT INTO aurelink_communications_workspaces(user_id) VALUES($1) ON CONFLICT DO NOTHING",[userId]);
 const row=(await pool.query("SELECT id,user_id,project_id,'owner' AS role FROM aurelink_communications_workspaces WHERE user_id=$1 AND project_id IS NULL AND status='active'",[userId])).rows[0];
 if(!row)throw new Error("Aurelink communications workspace is unavailable.");
 return row;
}
async function requireManager(userId:string,workspaceId:string){
 const row=(await pool.query("SELECT w.user_id,m.role FROM aurelink_communications_workspaces w LEFT JOIN aurelink_communications_members m ON m.workspace_id=w.id AND m.accepted_user_id=$1 AND m.status='active' WHERE w.id=$2",[userId,workspaceId])).rows[0];
 if(!row||(String(row.user_id)!==userId&&!["admin"].includes(String(row.role))))throw Object.assign(new Error("Workspace owner or admin permission is required."),{status:403});
 return row;
}
function fail(res:any,error:any){return res.status(Number(error?.status)||400).json({success:false,message:error instanceof Error?error.message:"Aurelink platform request failed."});}

/* Billing: wallet, price catalogue, usage ledger and customer statements. */
router.get("/aurelink/communications/billing/overview",aurelinkAuthMiddleware,async(req,res)=>{
 try{
  const ws=await getWorkspace(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  const [wallet,usage,ledger,prices]=await Promise.all([
   pool.query("SELECT balance_minor,currency FROM aurelink_wallets WHERE user_id=$1",[ws.user_id]),
   pool.query("SELECT channel,status,COUNT(*)::int AS messages,COALESCE(SUM(units),0)::bigint AS units FROM aurelink_communications_usage WHERE workspace_id=$1 AND created_at>=NOW()-INTERVAL '30 days' GROUP BY channel,status",[ws.id]),
   pool.query("SELECT COALESCE(SUM(amount_minor) FILTER(WHERE entry_type='charge' AND status IN ('reserved','posted')),0)::bigint AS charged_minor,COALESCE(SUM(amount_minor) FILTER(WHERE entry_type='refund'),0)::bigint AS refunded_minor FROM aurelink_communications_billing_ledger WHERE workspace_id=$1 AND created_at>=NOW()-INTERVAL '30 days'",[ws.id]),
   pool.query("SELECT service,country_code,provider,category,unit_price_minor,currency,effective_from FROM aurelink_communications_price_catalog WHERE active=TRUE AND effective_from<=NOW() AND (effective_until IS NULL OR effective_until>NOW()) ORDER BY service,country_code,provider,category",[ ])
  ]);
  res.json({success:true,workspaceId:ws.id,currency:"USD",wallet:{balanceMinor:String(wallet.rows[0]?.balance_minor||"0"),currency:wallet.rows[0]?.currency||"USD"},periodDays:30,usage:usage.rows,ledger:ledger.rows[0],activePrices:prices.rows});
 }catch(error){return fail(res,error);}
});
router.get("/aurelink/communications/billing/usage",aurelinkAuthMiddleware,async(req,res)=>{
 try{
  const ws=await getWorkspace(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined),limit=clamp(req.query.limit,1,100,50);
  const rows=await pool.query(`SELECT u.message_id,u.channel,u.provider,u.category,u.units,u.status,u.unit_price_minor,u.currency,u.created_at,
    b.amount_minor,b.status AS billing_status,b.wallet_reference
    FROM aurelink_communications_usage u
    LEFT JOIN aurelink_communications_billing_ledger b ON b.message_id=u.message_id AND b.entry_type='charge'
    WHERE u.workspace_id=$1 ORDER BY u.created_at DESC LIMIT $2`,[ws.id,limit]);
  res.json({success:true,usage:rows.rows});
 }catch(error){return fail(res,error);}
});
router.get("/aurelink/communications/billing/statement",aurelinkAuthMiddleware,async(req,res)=>{
 try{
  const ws=await getWorkspace(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  const month=String(req.query.month||new Date().toISOString().slice(0,7));
  if(!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month))return res.status(400).json({success:false,message:"month must use YYYY-MM."});
  const result=await pool.query(`SELECT entry_type,status,currency,COUNT(*)::int AS entries,COALESCE(SUM(amount_minor),0)::bigint AS amount_minor
    FROM aurelink_communications_billing_ledger WHERE workspace_id=$1
    AND created_at>=($2||'-01')::date AND created_at<(($2||'-01')::date+INTERVAL '1 month')
    GROUP BY entry_type,status,currency ORDER BY entry_type,status`,[ws.id,month]);
  res.json({success:true,workspaceId:ws.id,month,currency:"USD",lines:result.rows,statementType:"usage_statement",invoiceIssued:false});
 }catch(error){return fail(res,error);}
});
router.get("/aurelink/admin/communications/prices",aurelinkAuthMiddleware,async(req,res)=>{
 if(!isAurelinkAdmin(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink administrator permission required."});
 const rows=await pool.query("SELECT * FROM aurelink_communications_price_catalog ORDER BY service,country_code,provider,category,effective_from DESC");
 res.json({success:true,prices:rows.rows});
});
router.post("/aurelink/admin/communications/prices",aurelinkAuthMiddleware,async(req,res)=>{
 if(!isAurelinkAdmin(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink administrator permission required."});
 const service=String(req.body.service||""),country=String(req.body.countryCode||"*").toUpperCase(),provider=String(req.body.provider||"*").toLowerCase(),category=String(req.body.category||"*").toLowerCase(),price=Number(req.body.unitPriceMinor);
 if(!["sms_segment","email_message","smtp_message"].includes(service)||!(country==="*"||/^[A-Z]{2}$/.test(country))||!Number.isSafeInteger(price)||price<=0)return res.status(400).json({success:false,message:"Provide a supported service, ISO country code or *, and a positive integer unitPriceMinor."});
 const result=await pool.query("INSERT INTO aurelink_communications_price_catalog(service,country_code,provider,category,unit_price_minor,currency,effective_from) VALUES($1,$2,$3,$4,$5,'USD',COALESCE($6::timestamptz,NOW())) RETURNING *",[service,country,provider,category,price,req.body.effectiveFrom||null]);
 res.status(201).json({success:true,price:result.rows[0]});
});
router.post("/aurelink/admin/communications/prices/:id/disable",aurelinkAuthMiddleware,async(req,res)=>{
 if(!isAurelinkAdmin(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink administrator permission required."});
 const result=await pool.query("UPDATE aurelink_communications_price_catalog SET active=FALSE,updated_at=NOW() WHERE id=$1 RETURNING id,active",[req.params.id]);
 if(!result.rows[0])return res.status(404).json({success:false,message:"Price record not found."});
 res.json({success:true,price:result.rows[0]});
});

/* Reputation monitoring and customer-visible alerts. */
router.get("/aurelink/communications/reputation",aurelinkAuthMiddleware,async(req,res)=>{
 try{
  const ws=await getWorkspace(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  const [scores,alerts]=await Promise.all([
   pool.query("SELECT DISTINCT ON(domain) domain,score,level,sample_size,delivered_count,bounced_count,complained_count,deferred_count,bounce_rate,complaint_rate,delivery_rate,calculated_at FROM aurelink_communications_reputation WHERE workspace_id=$1 ORDER BY domain,calculated_at DESC",[ws.id]),
   pool.query("SELECT id,domain,alert_key,severity,title,description,status,first_seen_at,last_seen_at,resolved_at FROM aurelink_communications_reputation_alerts WHERE workspace_id=$1 ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END,last_seen_at DESC LIMIT 100",[ws.id])
  ]);
  res.json({success:true,scores:scores.rows,alerts:alerts.rows});
 }catch(error){return fail(res,error);}
});
router.post("/aurelink/communications/reputation/alerts/:id/acknowledge",aurelinkAuthMiddleware,async(req,res)=>{
 try{
  const ws=await getWorkspace(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  const result=await pool.query("UPDATE aurelink_communications_reputation_alerts SET status='acknowledged' WHERE id=$1 AND workspace_id=$2 AND status='open' RETURNING id,status",[req.params.id,ws.id]);
  if(!result.rows[0])return res.status(404).json({success:false,message:"Open reputation alert not found."});
  res.json({success:true,alert:result.rows[0]});
 }catch(error){return fail(res,error);}
});

/* Workspace team: invitation tokens are returned once for the client to deliver by email. */
router.get("/aurelink/communications/team/members",aurelinkAuthMiddleware,async(req,res)=>{
 try{
  const ws=await getWorkspace(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  const rows=await pool.query("SELECT id,email,role,status,invited_at,invitation_expires_at,accepted_user_id FROM aurelink_communications_members WHERE workspace_id=$1 ORDER BY invited_at DESC",[ws.id]);
  res.json({success:true,workspaceId:ws.id,currentRole:ws.role,members:rows.rows});
 }catch(error){return fail(res,error);}
});
router.post("/aurelink/communications/team/invitations",aurelinkAuthMiddleware,async(req,res)=>{
 try{
  const ws=await getWorkspace(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  await requireManager(req.user!.userId,String(ws.id));
  const email=String(req.body.email||"").trim().toLowerCase(),role=String(req.body.role||"developer");
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)||email.length>320)return res.status(400).json({success:false,message:"Enter a valid invitation email address."});
  if(!["admin","developer","analyst","billing"].includes(role))return res.status(400).json({success:false,message:"Role must be admin, developer, analyst or billing."});
  const token=randomBytes(32).toString("base64url"),tokenHash=hash(token),expiresAt=new Date(Date.now()+7*86400000);
  const result=await pool.query(`INSERT INTO aurelink_communications_members(workspace_id,email,role,status,invitation_token_hash,invitation_expires_at,created_by_user_id)
    VALUES($1,$2,$3,'invited',$4,$5,$6)
    ON CONFLICT(workspace_id,email) DO UPDATE SET role=EXCLUDED.role,status='invited',invitation_token_hash=EXCLUDED.invitation_token_hash,invitation_expires_at=EXCLUDED.invitation_expires_at,created_by_user_id=EXCLUDED.created_by_user_id,accepted_user_id=NULL,invited_at=NOW(),updated_at=NOW()
    RETURNING id,email,role,status,invitation_expires_at`,[ws.id,email,role,tokenHash,expiresAt,req.user!.userId]);
  res.status(201).json({success:true,invitation:result.rows[0],invitationToken:token,expiresAt:expiresAt.toISOString(),delivery:"The invitation token is returned once. Deliver it to the invited address using the configured Aurelink email service."});
 }catch(error){return fail(res,error);}
});
router.post("/aurelink/communications/team/invitations/accept",aurelinkAuthMiddleware,async(req,res)=>{
 const token=String(req.body.token||"").trim();if(token.length<32||token.length>200)return res.status(400).json({success:false,message:"A valid invitation token is required."});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const user=(await client.query("SELECT id,email,email_verified FROM aurelink_users WHERE id=$1 FOR UPDATE",[req.user!.userId])).rows[0];
  if(!user?.email_verified){await client.query("ROLLBACK");return res.status(403).json({success:false,message:"Verify your Aurelink account email before accepting a workspace invitation."});}
  const invite=(await client.query("SELECT id,workspace_id,email,role FROM aurelink_communications_members WHERE invitation_token_hash=$1 AND status='invited' AND invitation_expires_at>NOW() FOR UPDATE",[hash(token)])).rows[0];
  if(!invite||String(invite.email).toLowerCase()!==String(user.email).toLowerCase()){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"Invitation is invalid, expired or addressed to another email account."});}
  await client.query("UPDATE aurelink_communications_members SET status='active',accepted_user_id=$2,invitation_token_hash=NULL,updated_at=NOW() WHERE id=$1",[invite.id,user.id]);
  await client.query("COMMIT");
  res.json({success:true,workspaceId:invite.workspace_id,role:invite.role});
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);return fail(res,error);}finally{client.release();}
});
router.patch("/aurelink/communications/team/members/:id/role",aurelinkAuthMiddleware,async(req,res)=>{
 try{
  const ws=await getWorkspace(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  await requireManager(req.user!.userId,String(ws.id));
  const role=String(req.body.role||"");
  if(!["admin","developer","analyst","billing"].includes(role))return res.status(400).json({success:false,message:"Unsupported workspace role."});
  const result=await pool.query("UPDATE aurelink_communications_members SET role=$3,updated_at=NOW() WHERE id=$1 AND workspace_id=$2 AND status='active' AND role<>'owner' RETURNING id,email,role,status",[req.params.id,ws.id,role]);
  if(!result.rows[0])return res.status(404).json({success:false,message:"Active workspace member not found."});
  res.json({success:true,member:result.rows[0]});
 }catch(error){return fail(res,error);}
});
router.delete("/aurelink/communications/team/members/:id",aurelinkAuthMiddleware,async(req,res)=>{
 try{
  const ws=await getWorkspace(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  await requireManager(req.user!.userId,String(ws.id));
  const result=await pool.query("UPDATE aurelink_communications_members SET status='revoked',invitation_token_hash=NULL,updated_at=NOW() WHERE id=$1 AND workspace_id=$2 AND role<>'owner' AND status<>'revoked' RETURNING id,email,status",[req.params.id,ws.id]);
  if(!result.rows[0])return res.status(404).json({success:false,message:"Workspace member not found."});
  res.json({success:true,member:result.rows[0]});
 }catch(error){return fail(res,error);}
});

export default router;

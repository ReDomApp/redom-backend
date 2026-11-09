import { Router } from "express";
import { randomBytes, scryptSync } from "node:crypto";
import { decryptAurelinkDnsSecret, encryptAurelinkDnsSecret, validateCloudflareZoneToken, applyCloudflareDnsRecords } from "../services/aurelink/communications-dns.service";
import { pool } from "../database/db";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import {
  createAurelinkProviderDomain, getAurelinkProviderDomain, inspectAurelinkDomainDns,
  verifyAurelinkProviderDomain, updateAurelinkResendDomainTracking, configureAurelinkBrevoTransactionalWebhook, createAurelinkProviderEmailSender, getAurelinkProviderEmailSender, type AurelinkEmailProvider,
} from "../services/aurelink/communications-domains.service";

const router = Router();
const emailProviders = new Set(["resend", "brevo"]);
const senderProviders = new Set(["twilio", "brevo"]);

async function workspaceId(userId: string, projectId?: string): Promise<string> {
  if (projectId) {
    await pool.query("INSERT INTO aurelink_communications_workspaces(user_id,project_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [userId,projectId]);
    const row = (await pool.query("SELECT id FROM aurelink_communications_workspaces WHERE user_id=$1 AND project_id=$2 AND status='active'", [userId,projectId])).rows[0];
    if (!row) throw new Error("Aurelink project communications workspace is unavailable.");
    return String(row.id);
  }
  await pool.query("INSERT INTO aurelink_communications_workspaces(user_id) VALUES($1) ON CONFLICT DO NOTHING", [userId]);
  const row = (await pool.query("SELECT id FROM aurelink_communications_workspaces WHERE user_id=$1 AND project_id IS NULL AND status='active'", [userId])).rows[0];
  if (!row) throw new Error("Aurelink communications workspace is unavailable.");
  return String(row.id);
}
function normalizeDomain(value: string): string {
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error("Enter a valid fully qualified domain name.");
  }
  return domain;
}


router.post("/aurelink/communications/providers/brevo/webhook/configure",aurelinkAuthMiddleware,async(req,res)=>{
 const admins=new Set(String(process.env.AURELINK_ADMIN_USER_IDS||"").split(",").map(value=>value.trim()).filter(Boolean));
 if(!admins.has(req.user!.userId))return res.status(403).json({success:false,message:"Only configured Aurelink communications administrators can configure the shared Brevo provider webhook."});
 const url=String(req.body.url||process.env.AURELINK_BREVO_WEBHOOK_URL||"");
 try{
  const result=await configureAurelinkBrevoTransactionalWebhook(url,String(process.env.AURELINK_BREVO_WEBHOOK_SECRET||""));
  return res.json({success:true,...result,secretConfigured:true,note:"The Brevo REST API has created or updated the transactional webhook and will send authenticated delivery/open/click events to Aurelink."});
 }catch(error){return res.status(502).json({success:false,message:error instanceof Error?error.message:"Unable to configure Brevo transactional webhook."});}
});

router.get("/aurelink/communications/domains", aurelinkAuthMiddleware, async (req,res) => {
  const wid = await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
  const rows = await pool.query("SELECT id,domain,provider,provider_domain_id,status,dns_records,last_checked_at,verified_at,created_at,updated_at FROM aurelink_email_domains WHERE workspace_id=$1 ORDER BY created_at DESC", [wid]);
  return res.json({ success:true, domains:rows.rows });
});

router.post("/aurelink/communications/domains", aurelinkAuthMiddleware, async (req,res) => {
  const domain = String(req.body.domain || "");
  const provider = String(req.body.provider || process.env.AURELINK_DEFAULT_EMAIL_PROVIDER || "resend");
  if (!emailProviders.has(provider)) return res.status(400).json({success:false,message:"Email domain provider must be resend or brevo."});
  try {
    const wid = await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
    const normalized = normalizeDomain(domain);
    const created = await createAurelinkProviderDomain(provider as AurelinkEmailProvider, normalized);
    const result = await pool.query(
      "INSERT INTO aurelink_email_domains(workspace_id,domain,provider,provider_domain_id,status,dns_records,last_checked_at) VALUES($1,$2,$3,$4,'verification_pending',$5::jsonb,NOW()) ON CONFLICT(workspace_id,domain,provider) DO UPDATE SET provider_domain_id=EXCLUDED.provider_domain_id,dns_records=EXCLUDED.dns_records,status='verification_pending',last_checked_at=NOW(),updated_at=NOW() RETURNING id,domain,provider,provider_domain_id,status,dns_records,last_checked_at,verified_at",
      [wid,normalized,provider,created.providerDomainId,JSON.stringify(created.records)]
    );
    return res.status(201).json({
      success:true, domain:result.rows[0],
      instructions:"Add the DNS records exactly as returned. Aurelink does not change DNS unless an authorized DNS-provider integration is connected.",
      providerVerified:created.verified, providerAuthenticated:created.authenticated,
    });
  } catch(error) {
    return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to create provider domain."});
  }
});

async function refreshDomain(req:any, res:any, verify:boolean) {
  const wid = await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
  const found = await pool.query("SELECT * FROM aurelink_email_domains WHERE id=$1 AND workspace_id=$2", [req.params.id,wid]);
  const row = found.rows[0];
  if (!row) return res.status(404).json({success:false,message:"Email domain not found."});
  try {
    const provider = String(row.provider) as AurelinkEmailProvider;
    const providerDomainId = String(row.provider_domain_id || row.domain);
    const remote = verify
      ? await verifyAurelinkProviderDomain(provider,providerDomainId,String(row.domain))
      : await getAurelinkProviderDomain(provider,providerDomainId,String(row.domain));
    const dns = await inspectAurelinkDomainDns(String(row.domain),remote.records);
    const isVerified = remote.verified && remote.authenticated;
    const status = isVerified ? "verified" : "verification_pending";
    const updated = await pool.query(
      "UPDATE aurelink_email_domains SET status=$3,dns_records=$4::jsonb,last_checked_at=NOW(),verified_at=CASE WHEN $3='verified' THEN COALESCE(verified_at,NOW()) ELSE NULL END,updated_at=NOW() WHERE id=$1 AND workspace_id=$2 RETURNING id,domain,provider,provider_domain_id,status,dns_records,last_checked_at,verified_at",
      [row.id,wid,status,JSON.stringify(dns.records)]
    );
    return res.json({success:true,domain:updated.rows[0],provider:{verified:remote.verified,authenticated:remote.authenticated},dns});
  } catch(error) {
    await pool.query("UPDATE aurelink_email_domains SET last_checked_at=NOW(),updated_at=NOW() WHERE id=$1 AND workspace_id=$2",[row.id,wid]);
    return res.status(502).json({success:false,message:error instanceof Error?error.message:"Provider domain verification failed."});
  }
}
router.post("/aurelink/communications/domains/:id/check",aurelinkAuthMiddleware,async(req,res)=>refreshDomain(req,res,false));
router.post("/aurelink/communications/domains/:id/verify",aurelinkAuthMiddleware,async(req,res)=>refreshDomain(req,res,true));

router.post("/aurelink/communications/domains/:id/tracking",aurelinkAuthMiddleware,async(req,res)=>{
 const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
 const row=(await pool.query("SELECT id,domain,provider,provider_domain_id FROM aurelink_email_domains WHERE id=$1 AND workspace_id=$2",[req.params.id,wid])).rows[0];
 if(!row)return res.status(404).json({success:false,message:"Email domain not found."});
 if(row.provider!=="resend")return res.status(409).json({success:false,message:"Brevo open/click tracking is controlled by its transactional webhook configuration. Resend domain tracking can be configured here."});
 try{
  const settings={openTracking:typeof req.body.openTracking==="boolean"?req.body.openTracking:undefined,clickTracking:typeof req.body.clickTracking==="boolean"?req.body.clickTracking:undefined};
  const result=await updateAurelinkResendDomainTracking(String(row.provider_domain_id),settings);
  const saved={openTracking:settings.openTracking,clickTracking:settings.clickTracking,updatedAt:new Date().toISOString()};
  await pool.query("UPDATE aurelink_email_domains SET tracking_settings=$3::jsonb,updated_at=NOW() WHERE id=$1 AND workspace_id=$2",[row.id,wid,JSON.stringify(saved)]);
  return res.json({success:true,domainId:row.id,provider:"resend",tracking:saved,providerResponse:result});
 }catch(error){return res.status(502).json({success:false,message:error instanceof Error?error.message:"Unable to update Resend tracking settings."});}
});


router.get("/aurelink/communications/senders",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
  const rows=await pool.query("SELECT id,channel,sender,country_code,provider,status,provider_reference,rejection_reason,request_details,submitted_at,approved_at,created_at,updated_at FROM aurelink_sender_ids WHERE workspace_id=$1 ORDER BY created_at DESC",[wid]);
  return res.json({success:true,senders:rows.rows});
});
router.post("/aurelink/communications/senders",aurelinkAuthMiddleware,async(req,res)=>{
  const channel=req.body.channel==="sms"?"sms":req.body.channel==="email"?"email":null;
  const sender=String(req.body.sender||"").trim();
  const provider=String(req.body.provider||"twilio").toLowerCase();
  const countryCode=String(req.body.countryCode||"").toUpperCase();
  const requestDetails={
    senderType:"alphanumeric",
    businessName:String(req.body.businessName||"").trim().slice(0,160),
    businessWebsite:String(req.body.businessWebsite||"").trim().slice(0,500),
    messageUseCase:String(req.body.messageUseCase||"").trim().slice(0,1000),
    sampleMessage:String(req.body.sampleMessage||"").trim().slice(0,1000),
    estimatedMonthlyVolume:String(req.body.estimatedMonthlyVolume||"").trim().slice(0,40),
    registrationDocuments:Array.isArray(req.body.registrationDocuments)?req.body.registrationDocuments.filter((x:any)=>typeof x==="string").slice(0,10):[],
  };
  if(!channel||channel!=="sms")return res.status(400).json({success:false,message:"This registration workflow currently accepts SMS sender IDs only."});
  if(!sender||!/^[A-Za-z0-9]{3,11}$/.test(sender)||!/[A-Za-z]/.test(sender))return res.status(400).json({success:false,message:"Alphanumeric sender IDs must be 3–11 ASCII letters or digits and include at least one letter."});
  if(!senderProviders.has(provider))return res.status(400).json({success:false,message:"SMS sender registration provider must be twilio or brevo."});
  if(!/^[A-Z]{2}$/.test(countryCode))return res.status(400).json({success:false,message:"A two-letter ISO destination country code is required."});
  if(countryCode==="US"||countryCode==="CA")return res.status(422).json({success:false,code:"ALPHANUMERIC_SENDER_UNSUPPORTED",message:"Alphanumeric sender IDs are not supported in the United States or Canada. Use an eligible registered phone-number sender instead."});
  if(req.body.senderType && req.body.senderType!=="alphanumeric")return res.status(400).json({success:false,message:"This endpoint registers alphanumeric sender IDs only. Phone-number, toll-free and short-code registration require separate country-specific workflows."});
  if(!requestDetails.businessName||!requestDetails.businessWebsite||!requestDetails.messageUseCase||!requestDetails.sampleMessage)return res.status(400).json({success:false,message:"Business name, business website, messaging use case and sample message are required for carrier review."});
  if(requestDetails.registrationDocuments.some((value:string)=>{try{return new URL(value).protocol!=="https:";}catch{return true;}}))return res.status(400).json({success:false,message:"Registration document references must be HTTPS URLs."});
  try{
    const website=new URL(requestDetails.businessWebsite);
    if(website.protocol!=="https:")throw new Error("Business website must use HTTPS.");
  }catch{return res.status(400).json({success:false,message:"Provide a valid HTTPS business website."});}
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
  const saved=await pool.query(
    "INSERT INTO aurelink_sender_ids(workspace_id,channel,sender,country_code,provider,status,request_details) VALUES($1,'sms',$2,$3,$4,'pending',$5::jsonb) RETURNING id,channel,sender,country_code,provider,status,request_details,created_at",
    [wid,sender,countryCode,provider,JSON.stringify(requestDetails)]
  );
  return res.status(202).json({
    success:true,sender:saved.rows[0],
    registrationState:"pending_customer_submission",
    providerSubmission:"not_submitted",
    nextStep:provider==="brevo"
      ?"Open Brevo > Settings > Campaigns > SMS Sender ID, submit the same sender and country with the business details/documents above, then return to Aurelink when Brevo confirms approval."
      :"Open Twilio Console > Communications > Trust Hub > Registrations > Alphanumeric Sender IDs, submit the same sender and country with the business details/documents above, then return to Aurelink when Twilio confirms approval.",
    providerRegistrationGuide:provider==="brevo"
      ?"https://help.brevo.com/hc/en-us/articles/28255350696466-Register-a-Sender-ID-to-send-SMS-messages"
      :"https://www.twilio.com/docs/trust-hub/registrations/alphanumeric-sender-id",
    approvalEvidenceRequired:true,
    note:"Aurelink stores and enforces registration state; provider/carrier approval is not fabricated or automatically inferred.",
  });
});


router.post("/aurelink/communications/senders/:id/review",aurelinkAuthMiddleware,async(req,res)=>{
  const admins=new Set(String(process.env.AURELINK_ADMIN_USER_IDS||"").split(",").map(value=>value.trim()).filter(Boolean));
  if(!admins.has(req.user!.userId))return res.status(403).json({success:false,message:"Only configured Aurelink communications administrators can review sender registrations."});
  const status=String(req.body.status||"");
  const providerReference=String(req.body.providerReference||"").trim();
  const evidenceUrl=String(req.body.evidenceUrl||"").trim();
  const rejectionReason=String(req.body.rejectionReason||"").trim();
  if(!["submitted","approved","rejected","suspended"].includes(status))return res.status(400).json({success:false,message:"Review status must be submitted, approved, rejected or suspended."});
  if((status==="submitted"||status==="approved")&&!providerReference)return res.status(400).json({success:false,message:"A real provider registration/reference ID is required."});
  if(status==="approved"){
    try{const parsed=new URL(evidenceUrl);if(parsed.protocol!=="https:")throw new Error("invalid");}
    catch{return res.status(400).json({success:false,message:"Approval requires an HTTPS link to the provider/carrier approval evidence."});}
  }
  if(status==="rejected"&&!rejectionReason)return res.status(400).json({success:false,message:"A rejection reason is required."});
  const result=await pool.query(
    "UPDATE aurelink_sender_ids SET status=$2,provider_reference=COALESCE(NULLIF($3,''),provider_reference),rejection_reason=CASE WHEN $2='rejected' THEN $4 ELSE NULL END,submitted_at=CASE WHEN $2 IN ('submitted','approved') THEN COALESCE(submitted_at,NOW()) ELSE submitted_at END,approved_at=CASE WHEN $2='approved' THEN NOW() ELSE NULL END,request_details=request_details||$5::jsonb,updated_at=NOW() WHERE id=$1 RETURNING id,workspace_id,channel,sender,country_code,provider,status,provider_reference,rejection_reason,request_details,submitted_at,approved_at,updated_at",
    [req.params.id,status,providerReference,rejectionReason,JSON.stringify(status==="approved"?{providerApprovalEvidenceUrl:evidenceUrl,approvalRecordedAt:new Date().toISOString()}:{})]
  );
  if(!result.rows[0])return res.status(404).json({success:false,message:"Sender registration request not found."});
  return res.json({success:true,sender:result.rows[0],note:"Approval is recorded only against the provider reference and evidence supplied by the authorized reviewer. Aurelink does not fabricate carrier approval."});
});


router.get("/aurelink/communications/smtp/credentials",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
  const rows=await pool.query("SELECT id,username,label,status,created_at,updated_at,last_used_at FROM aurelink_smtp_credentials WHERE workspace_id=$1 ORDER BY created_at DESC",[wid]);
  return res.json({success:true,host:process.env.AURELINK_SMTP_HOSTNAME||null,port:587,security:"STARTTLS required",credentials:rows.rows});
});
router.post("/aurelink/communications/smtp/credentials",aurelinkAuthMiddleware,async(req,res)=>{
  const label=String(req.body.label||"SMTP credential").trim().slice(0,120)||"SMTP credential";
  const username="aul_smtp_"+randomBytes(18).toString("hex");
  const password=randomBytes(32).toString("base64url");
  const salt=randomBytes(16),digest=scryptSync(password,salt,64);
  const passwordHash="scrypt$"+salt.toString("base64url")+"$"+digest.toString("base64url");
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
  const saved=await pool.query("INSERT INTO aurelink_smtp_credentials(workspace_id,username,password_hash,label) VALUES($1,$2,$3,$4) RETURNING id,username,label,status,created_at",[wid,username,passwordHash,label]);
  return res.status(201).json({
    success:true,credential:{...saved.rows[0],password},
    smtp:{host:process.env.AURELINK_SMTP_HOSTNAME||null,port:587,security:"STARTTLS required",authentication:"Username and password"},
    warning:"The password is shown once. Store it in a secret manager. SMTP will accept connections only after the separate TCP relay is deployed and AURELINK_SMTP_HOSTNAME is configured."
  });
});
router.delete("/aurelink/communications/smtp/credentials/:id",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
  const result=await pool.query("UPDATE aurelink_smtp_credentials SET status='revoked',updated_at=NOW() WHERE id=$1 AND workspace_id=$2 AND status='active' RETURNING id,username,status,updated_at",[req.params.id,wid]);
  if(!result.rows[0])return res.status(404).json({success:false,message:"Active SMTP credential not found."});
  return res.json({success:true,credential:result.rows[0]});
});

router.post("/aurelink/communications/dns/cloudflare/connect",aurelinkAuthMiddleware,async(req,res)=>{
  const domainRaw=String(req.body.domain||""),zoneId=String(req.body.zoneId||""),apiToken=String(req.body.apiToken||"");
  try{
    const domain=normalizeDomain(domainRaw),zone=await validateCloudflareZoneToken(apiToken,zoneId,domain),wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
    const encrypted=encryptAurelinkDnsSecret(apiToken);
    const saved=await pool.query("INSERT INTO aurelink_dns_provider_connections(workspace_id,provider,domain,zone_id,secret_encrypted,secret_prefix,status) VALUES($1,'cloudflare',$2,$3,$4,$5,'active') ON CONFLICT(workspace_id,provider,domain) DO UPDATE SET zone_id=EXCLUDED.zone_id,secret_encrypted=EXCLUDED.secret_encrypted,secret_prefix=EXCLUDED.secret_prefix,status='active',updated_at=NOW() RETURNING id,provider,domain,zone_id,status,created_at,updated_at",[wid,domain,zoneId,encrypted,apiToken.slice(0,8)]);
    return res.status(201).json({success:true,connection:saved.rows[0],zoneName:zone.zoneName,requiredTokenPermissions:["Zone:Read","DNS:Edit"],secretStoredEncrypted:true});
  }catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to connect Cloudflare DNS."});}
});
router.get("/aurelink/communications/dns/cloudflare/connections",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
  const rows=await pool.query("SELECT id,provider,domain,zone_id,status,secret_prefix,created_at,updated_at FROM aurelink_dns_provider_connections WHERE workspace_id=$1 AND provider='cloudflare' ORDER BY created_at DESC",[wid]);
  return res.json({success:true,connections:rows.rows});
});
router.post("/aurelink/communications/domains/:id/apply-dns",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
  const found=await pool.query("SELECT d.id,d.domain,d.dns_records,c.zone_id,c.secret_encrypted FROM aurelink_email_domains d JOIN aurelink_dns_provider_connections c ON c.workspace_id=d.workspace_id AND c.domain=d.domain AND c.provider='cloudflare' AND c.status='active' WHERE d.id=$1 AND d.workspace_id=$2",[req.params.id,wid]);
  const row=found.rows[0];
  if(!row)return res.status(404).json({success:false,message:"Domain or matching active Cloudflare DNS connection not found. Connect a token scoped to this domain first."});
  try{
    const token=decryptAurelinkDnsSecret(String(row.secret_encrypted));
    await validateCloudflareZoneToken(token,String(row.zone_id),String(row.domain));
    const applied=await applyCloudflareDnsRecords(token,String(row.zone_id),String(row.domain),Array.isArray(row.dns_records)?row.dns_records:[]);
    return res.status(applied.complete?200:207).json({success:applied.complete,domainId:row.id,domain:row.domain,...applied});
  }catch(error){return res.status(502).json({success:false,message:error instanceof Error?error.message:"Cloudflare DNS provisioning failed."});}
});


router.get("/aurelink/communications/email-senders",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
  const rows=await pool.query("SELECT id,provider,email,domain,sender_name,provider_sender_id,status,provider_details,verified_at,created_at,updated_at FROM aurelink_email_senders WHERE workspace_id=$1 ORDER BY created_at DESC",[wid]);
  return res.json({success:true,senders:rows.rows});
});
router.post("/aurelink/communications/email-senders",aurelinkAuthMiddleware,async(req,res)=>{
  const email=String(req.body.email||"").trim().toLowerCase();
  const name=String(req.body.name||"").trim().slice(0,120);
  const provider=String(req.body.provider||"brevo").toLowerCase();
  if(!emailProviders.has(provider))return res.status(400).json({success:false,message:"Email sender provider must be resend or brevo."});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name)return res.status(400).json({success:false,message:"A valid sender email and display name are required."});
  const domain=email.split("@").pop()!;
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
  const verifiedDomain=await pool.query("SELECT id FROM aurelink_email_domains WHERE workspace_id=$1 AND domain=$2 AND provider=$3 AND status='verified' LIMIT 1",[wid,domain,provider]);
  if(!verifiedDomain.rows[0])return res.status(409).json({success:false,code:"EMAIL_DOMAIN_NOT_VERIFIED",message:"Verify and authenticate this domain with the selected provider before creating a sender identity."});
  try{
    const remote=provider==="brevo"?await createAurelinkProviderEmailSender(email,name):{providerSenderId:"",active:true,raw:{verification:"domain_authenticated"}};
    const status=remote.active?"verified":"pending_verification";
    const saved=await pool.query("INSERT INTO aurelink_email_senders(workspace_id,provider,email,domain,sender_name,provider_sender_id,status,provider_details,verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,CASE WHEN $7='verified' THEN NOW() ELSE NULL END) ON CONFLICT(workspace_id,provider,email) DO UPDATE SET sender_name=EXCLUDED.sender_name,provider_sender_id=COALESCE(EXCLUDED.provider_sender_id,aurelink_email_senders.provider_sender_id),status=EXCLUDED.status,provider_details=EXCLUDED.provider_details,verified_at=EXCLUDED.verified_at,updated_at=NOW() RETURNING id,provider,email,domain,sender_name,provider_sender_id,status,provider_details,verified_at,created_at",
      [wid,provider,email,domain,name,remote.providerSenderId||null,status,JSON.stringify(remote.raw)]);
    return res.status(provider==="brevo"?202:201).json({success:true,sender:saved.rows[0],nextStep:provider==="brevo"?"Brevo has sent a verification email to this sender address. Complete that email verification, then call the check endpoint.":"Resend uses the authenticated sending domain; no separate sender identity verification endpoint is required."});
  }catch(error){return res.status(502).json({success:false,message:error instanceof Error?error.message:"Provider sender creation failed."});}
});
router.post("/aurelink/communications/email-senders/:id/check",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId);
  const found=await pool.query("SELECT * FROM aurelink_email_senders WHERE id=$1 AND workspace_id=$2",[req.params.id,wid]);
  const row=found.rows[0];
  if(!row)return res.status(404).json({success:false,message:"Email sender identity not found."});
  try{
    if(row.provider==="resend"){
      const domain=await pool.query("SELECT id FROM aurelink_email_domains WHERE workspace_id=$1 AND domain=$2 AND provider='resend' AND status='verified' LIMIT 1",[wid,row.domain]);
      if(!domain.rows[0])return res.status(409).json({success:false,message:"The Resend domain is no longer verified."});
      const updated=await pool.query("UPDATE aurelink_email_senders SET status='verified',verified_at=COALESCE(verified_at,NOW()),updated_at=NOW() WHERE id=$1 RETURNING id,provider,email,domain,status,verified_at",[row.id]);
      return res.json({success:true,sender:updated.rows[0]});
    }
    const remote=await getAurelinkProviderEmailSender(String(row.email),String(row.domain));
    const status=remote.active?"verified":"pending_verification";
    const updated=await pool.query("UPDATE aurelink_email_senders SET provider_sender_id=COALESCE(NULLIF($2,''),provider_sender_id),status=$3,provider_details=$4::jsonb,verified_at=CASE WHEN $3='verified' THEN COALESCE(verified_at,NOW()) ELSE NULL END,updated_at=NOW() WHERE id=$1 RETURNING id,provider,email,domain,sender_name,provider_sender_id,status,provider_details,verified_at",[row.id,remote.providerSenderId,status,JSON.stringify(remote.raw)]);
    return res.json({success:true,sender:updated.rows[0]});
  }catch(error){return res.status(502).json({success:false,message:error instanceof Error?error.message:"Unable to refresh provider sender status."});}
});

export default router;

import { Router } from "express";
import { createHash, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { isAurelinkBrevoSenderFormatValid, requiresAurelinkBrevoNumberSender } from "../services/aurelink/sms-country-registry";
import { decryptAurelinkDnsSecret, encryptAurelinkDnsSecret, validateCloudflareZoneToken, applyCloudflareDnsRecords } from "../services/aurelink/communications-dns.service";
import { pool } from "../database/db";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import {
  createAurelinkProviderDomain, getAurelinkProviderDomain, inspectAurelinkDomainDns,
  verifyAurelinkProviderDomain, updateAurelinkResendDomainTracking, configureAurelinkBrevoTransactionalWebhook, createAurelinkProviderEmailSender, getAurelinkProviderEmailSender, type AurelinkEmailProvider,
} from "../services/aurelink/communications-domains.service";

const router = Router();
const hash = (value:string) => createHash("sha256").update(value).digest("hex");
const emailProviders = new Set(["resend", "brevo"]);
const senderProviders = new Set(["twilio", "brevo"]);

async function workspaceId(userId: string, projectId?: string, requestedWorkspaceId?: string): Promise<string> {
  if(requestedWorkspaceId){
    const member=(await pool.query("SELECT w.id FROM aurelink_communications_workspaces w LEFT JOIN aurelink_communications_members m ON m.workspace_id=w.id AND m.accepted_user_id=$1 AND m.status='active' WHERE w.id=$2 AND w.status='active' AND (w.user_id=$1 OR m.accepted_user_id=$1)",[userId,requestedWorkspaceId])).rows[0];
    if(!member)throw new Error("Aurelink workspace not found or access denied.");
    return String(member.id);
  }
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
  const wid = await workspaceId(req.user!.userId,(req as any).aurelinkProjectId, String(req.headers["x-aurelink-workspace-id"]||"") || undefined);
  const rows = await pool.query("SELECT id,domain,provider,provider_domain_id,status,dns_records,last_checked_at,verified_at,created_at,updated_at FROM aurelink_email_domains WHERE workspace_id=$1 ORDER BY created_at DESC", [wid]);
  return res.json({ success:true, domains:rows.rows });
});

router.post("/aurelink/communications/domains", aurelinkAuthMiddleware, async (req,res) => {
  const provider = String(req.body.provider || process.env.AURELINK_DEFAULT_EMAIL_PROVIDER || "resend").toLowerCase();
  if (!emailProviders.has(provider)) return res.status(400).json({success:false,message:"Email domain provider must be resend or brevo."});
  const providerDefaultDomain = provider === "resend"
    ? (process.env.AURELINK_RESEND_SENDING_DOMAIN || "mail.wnncompany.com")
    : (process.env.AURELINK_BREVO_SENDING_DOMAIN || "market.wnncompany.com");
  const domain = String(req.body.domain || providerDefaultDomain);
  try {
    const wid = await workspaceId(req.user!.userId,(req as any).aurelinkProjectId, String(req.headers["x-aurelink-workspace-id"]||"") || undefined);
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
  const wid = await workspaceId(req.user!.userId,(req as any).aurelinkProjectId, String(req.headers["x-aurelink-workspace-id"]||"") || undefined);
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
 const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId, String(req.headers["x-aurelink-workspace-id"]||"") || undefined);
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



function normalizeSenderDomain(value:string){
 const domain=value.trim().toLowerCase().replace(/^https?:\/\//,"").split("/")[0].replace(/\.$/,"");
 if(domain.length>253||! /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))throw new Error("A valid public business website domain is required.");
 return domain;
}
function senderTokenKey(){
 const source=process.env.AURELINK_COMMUNICATIONS_ENCRYPTION_KEY||process.env.JWT_ACCESS_SECRET;
 if(!source||source.length<32)throw new Error("A 32+ character Aurelink communications encryption key is required.");
 return createHash("sha256").update(source).update("|aurelink-sender-registration-token-v1").digest();
}
function encryptSenderToken(value:string){
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",senderTokenKey(),iv),body=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
 return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),body.toString("base64url")].join(".");
}
function decryptSenderToken(value:string){
 const [iv,tag,body]=value.split(".");
 if(!iv||!tag||!body)throw new Error("Sender registration token ciphertext is invalid.");
 const decipher=createDecipheriv("aes-256-gcm",senderTokenKey(),Buffer.from(iv,"base64url"));
 decipher.setAuthTag(Buffer.from(tag,"base64url"));
 return Buffer.concat([decipher.update(Buffer.from(body,"base64url")),decipher.final()]).toString("utf8");
}
function senderAdmin(userId:string){return new Set(String(process.env.AURELINK_ADMIN_USER_IDS||"").split(",").map(v=>v.trim()).filter(Boolean)).has(userId);}
router.get("/aurelink/communications/sms/countries",aurelinkAuthMiddleware,async(_req,res)=>{
 const rows=await pool.query("SELECT country_code,country_name,calling_code,international_prefix FROM aurelink_sms_supported_countries WHERE enabled=true ORDER BY country_name ASC");
 return res.json({success:true,count:rows.rows.length,format:"E.164",countries:rows.rows.map(row=>({...row,internationalFormatExample:String(row.calling_code)+"XXXXXXXX"})),excluded:["SG"]});
});
router.get("/aurelink/communications/websites",aurelinkAuthMiddleware,async(req,res)=>{
 const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
 const rows=await pool.query("SELECT id,domain,website_url,verification_method,status,verified_at,evidence,created_at,updated_at FROM aurelink_verified_websites WHERE workspace_id=$1 ORDER BY created_at DESC",[wid]);
 return res.json({success:true,websites:rows.rows});
});
router.post("/aurelink/communications/websites",aurelinkAuthMiddleware,async(req,res)=>{
 try{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  const websiteUrl=String(req.body.websiteUrl||"").trim(),parsed=new URL(websiteUrl);
  if(parsed.protocol!=="https:"||parsed.username||parsed.password) return res.status(400).json({success:false,code:"HTTPS_WEBSITE_REQUIRED",message:"Use a public HTTPS company website without embedded credentials."});
  const domain=normalizeSenderDomain(parsed.hostname),token="aurelink-site-verification="+randomBytes(32).toString("hex"),tokenHash=hash(token),expiresAt=new Date(Date.now()+24*60*60*1000);
  const saved=await pool.query("INSERT INTO aurelink_verified_websites(workspace_id,domain,website_url,verification_method,verification_token_hash,verification_expires_at,status,evidence) VALUES($1,$2,$3,'dns_txt',$4,$5,'pending',$6::jsonb) ON CONFLICT(workspace_id,domain) DO UPDATE SET website_url=EXCLUDED.website_url,verification_method='dns_txt',verification_token_hash=EXCLUDED.verification_token_hash,verification_expires_at=EXCLUDED.verification_expires_at,status='pending',verified_at=NULL,verified_by=NULL,evidence='{}'::jsonb,updated_at=NOW() RETURNING id,domain,website_url,status,verification_method,verification_expires_at,created_at",[wid,domain,websiteUrl,tokenHash,expiresAt,JSON.stringify({challengeIssuedAt:new Date().toISOString()})]);
  return res.status(201).json({success:true,website:saved.rows[0],dnsRecord:{type:"TXT",host:"_aurelink-verification."+domain,value:token},instructions:"Publish the exact TXT record, then call the verify endpoint. Website ownership is not considered verified until Aurelink resolves and matches this challenge."});
 }catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to register website."});}
});
router.post("/aurelink/communications/websites/:id/verify",aurelinkAuthMiddleware,async(req,res)=>{
 const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
 const row=(await pool.query("SELECT * FROM aurelink_verified_websites WHERE id=$1 AND workspace_id=$2",[req.params.id,wid])).rows[0];
 if(!row)return res.status(404).json({success:false,message:"Website verification request not found."});
 if(!row.verification_expires_at||new Date(row.verification_expires_at).getTime()<=Date.now())return res.status(410).json({success:false,code:"WEBSITE_CHALLENGE_EXPIRED",message:"The DNS verification challenge has expired. Create a new challenge before applying for a Sender ID."});
 try{
  const records=await resolveTxt("_aurelink-verification."+String(row.domain));
  const challenge=records.flat().find((v:string)=>v.startsWith("aurelink-site-verification="));
  if(!challenge||hash(challenge)!==String(row.verification_token_hash))return res.status(409).json({success:false,code:"WEBSITE_OWNERSHIP_NOT_PROVEN",message:"The required DNS TXT challenge was not found or did not match. The website remains unverified."});
  const updated=await pool.query("UPDATE aurelink_verified_websites SET status='verified',verified_at=NOW(),evidence=jsonb_build_object('dnsTxtVerified',true,'verifiedAt',NOW()),updated_at=NOW() WHERE id=$1 AND workspace_id=$2 RETURNING id,domain,website_url,status,verified_at",[row.id,wid]);
  return res.json({success:true,website:updated.rows[0]});
 }catch{return res.status(409).json({success:false,code:"WEBSITE_DNS_CHECK_FAILED",message:"Aurelink could not verify the DNS challenge. No sender registration can proceed until ownership is verified."});}
});
router.get("/aurelink/communications/senders",aurelinkAuthMiddleware,async(req,res)=>{
 const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
 const rows=await pool.query("SELECT id,channel,sender,country_code,provider,status,registration_state,security_review_status,security_reviewed_at,last_security_reason,provider_reference,rejection_reason,brevo_review_due_at,brevo_submitted_at,brevo_provider_reference,brevo_terminal_status,brevo_terminal_at,request_details,submitted_at,approved_at,created_at,updated_at FROM aurelink_sender_ids WHERE workspace_id=$1 ORDER BY created_at DESC",[wid]);
 return res.json({success:true,senders:rows.rows});
});
router.post("/aurelink/communications/senders",aurelinkAuthMiddleware,async(req,res)=>{
 try{
  const sender=String(req.body.sender||"").trim(),provider="brevo",countryCode=String(req.body.countryCode||"").toUpperCase();
  const senderType=String(req.body.senderType||"alphanumeric");
  if(req.body.provider&&String(req.body.provider).toLowerCase()!=="brevo")return res.status(400).json({success:false,message:"Aurelink Sender ID applications are routed through Brevo."});
  if(!/^[A-Z]{2}$/.test(countryCode))return res.status(400).json({success:false,message:"A two-letter ISO destination country code is required."});
  const supportedCountry=(await pool.query("SELECT country_code,country_name,calling_code FROM aurelink_sms_supported_countries WHERE country_code=$1 AND enabled=true",[countryCode])).rows[0];
  if(!supportedCountry)return res.status(422).json({success:false,code:"SMS_DESTINATION_UNSUPPORTED",message:"Aurelink does not currently support SMS delivery or Sender ID registration for this destination."});
  if(requiresAurelinkBrevoNumberSender(countryCode)&&!["US","CA"].includes(countryCode))return res.status(501).json({success:false,code:"NANP_PROVIDER_NUMBER_WORKFLOW_REQUIRED",message:"This +1 destination requires a Brevo-provided or ported number sender (10DLC, short code or toll-free). The dedicated number-based registration workflow is not enabled yet; this request has not been submitted."});
  if(senderType!=="alphanumeric"&&senderType!=="toll_free")return res.status(400).json({success:false,message:"Unsupported sender type."});
  if(["US","CA"].includes(countryCode)){
   if(senderType!=="toll_free"||!isAurelinkBrevoSenderFormatValid(sender,countryCode))return res.status(422).json({success:false,code:"TOLL_FREE_NUMBER_REQUIRED",message:"US and Canada require a valid +1 toll-free number registration; alphanumeric Sender IDs are not accepted."});
  }else if(senderType!=="alphanumeric"||!isAurelinkBrevoSenderFormatValid(sender,countryCode))return res.status(400).json({success:false,code:"BREVO_SENDER_FORMAT_INVALID",message:"The Sender ID does not meet Brevo's 3–11 character alphanumeric format or destination-specific character restrictions."});
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  const restriction=(await pool.query("SELECT ends_at FROM aurelink_sender_security_restrictions WHERE user_id=$1 AND workspace_id=$2 AND status='active' AND ends_at>NOW() ORDER BY ends_at DESC LIMIT 1",[req.user!.userId,wid])).rows[0];
  if(restriction)return res.status(423).json({success:false,code:"SENDER_REGISTRATION_RESTRICTED",restrictedUntil:restriction.ends_at,message:"Sender ID registration is temporarily restricted by Aurelink Security."});
  const websiteDomain=normalizeSenderDomain(String(req.body.businessWebsite||""));
  const website=(await pool.query("SELECT id,website_url FROM aurelink_verified_websites WHERE workspace_id=$1 AND domain=$2 AND status='verified' AND verified_at IS NOT NULL",[wid,websiteDomain])).rows[0];
  if(!website)return res.status(422).json({success:false,code:"AURELINK_WEBSITE_NOT_VERIFIED",message:"Register and verify this business website in Aurelink Developer before applying for a Sender ID."});
  const duplicate=(await pool.query("SELECT id,status,registration_state FROM aurelink_sender_ids WHERE workspace_id=$1 AND LOWER(sender)=LOWER($2) AND country_code=$3 AND provider='brevo' AND registration_state IN ('security_review','scheduled_for_brevo','brevo_submission_ready','brevo_submitted','approved') LIMIT 1",[wid,sender,countryCode])).rows[0];
  if(duplicate)return res.status(409).json({success:false,code:"SENDER_APPLICATION_ALREADY_EXISTS",existingApplicationId:duplicate.id,message:"An active or approved Brevo Sender ID application already exists for this sender and destination."});
  const businessName=String(req.body.businessName||"").trim(),businessAddress=String(req.body.businessAddress||"").trim();
  const businessType=String(req.body.businessType||"").trim(),registrationNumber=String(req.body.registrationNumber||"").trim(),registrationNumberType=String(req.body.registrationNumberType||"").trim();
  const companyLocation=String(req.body.companyLocation||"").toLowerCase(),doingBusinessAs=String(req.body.doingBusinessAs||"").trim();
  const privacyPolicyUrl=String(req.body.privacyPolicyUrl||"").trim(),termsUrl=String(req.body.termsUrl||"").trim();
  const messageUseCase=String(req.body.messageUseCase||"").trim(),sampleMessage=String(req.body.sampleMessage||"").trim();
  const promotionalSample=String(req.body.promotionalSample||"").trim(),transactionalSample=String(req.body.transactionalSample||"").trim();
  const messageDomain=String(req.body.messageDomain||websiteDomain).trim().toLowerCase();
  const optInType=String(req.body.optInType||"").toLowerCase();
  const smsPurpose=String(req.body.smsPurpose||"").toLowerCase(),monthlyVolume=Number(req.body.monthlyVolume);
  const contact={name:String(req.body.contactName||"").trim(),email:String(req.body.contactEmail||"").trim().toLowerCase(),phone:String(req.body.contactPhone||"").trim()};
  const consentEvidenceReference=String(req.body.consentEvidenceReference||"").trim();
  const documents=Array.isArray(req.body.registrationDocuments)?req.body.registrationDocuments.filter((v:any)=>typeof v==="string").map((v:string)=>v.trim()).slice(0,10):[];
  const docHashes=Array.isArray(req.body.registrationDocumentSha256)?req.body.registrationDocumentSha256.filter((v:any)=>typeof v==="string").map((v:string)=>v.toLowerCase()).slice(0,10):[];
  if(!businessName||businessName.length>160||!businessAddress||businessAddress.length>500||!businessType||!registrationNumber||!registrationNumberType||!messageUseCase||messageUseCase.length>500||!sampleMessage||sampleMessage.length>1000||!["local","international"].includes(companyLocation))return res.status(400).json({success:false,code:"BUSINESS_DETAILS_INCOMPLETE",message:"Legal company name, address, business type, official registration number/type, local or international company location, SMS use case and a real sample message are mandatory."});
  if(!["promotional","transactional","both"].includes(smsPurpose))return res.status(400).json({success:false,message:"Select promotional, transactional or both as the SMS purpose."});
  if((smsPurpose==="promotional"||smsPurpose==="both")&&!promotionalSample)return res.status(400).json({success:false,code:"PROMOTIONAL_SAMPLE_REQUIRED",message:"A promotional sample message is required for the selected SMS purpose."});
  if((smsPurpose==="transactional"||smsPurpose==="both")&&!transactionalSample)return res.status(400).json({success:false,code:"TRANSACTIONAL_SAMPLE_REQUIRED",message:"A transactional sample message is required for the selected SMS purpose."});
  if(!["website_form","keyword","paper_form","voice","api","other"].includes(optInType))return res.status(400).json({success:false,code:"OPT_IN_TYPE_REQUIRED",message:"Select and describe the recipient opt-in method."});
  if(messageDomain!==websiteDomain)return res.status(422).json({success:false,code:"SMS_DOMAIN_MISMATCH",message:"The SMS link domain must match the verified business website."});
  if(["US","CA"].includes(countryCode)&&!contact.email.endsWith("@"+websiteDomain))return res.status(422).json({success:false,code:"BUSINESS_EMAIL_REQUIRED",message:"US/Canada toll-free registrations require a business email address on the verified company domain."});
  if(!Number.isSafeInteger(monthlyVolume)||monthlyVolume<1||monthlyVolume>100000000)return res.status(400).json({success:false,message:"Provide a realistic positive monthly SMS volume estimate."});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)||!contact.name||!contact.phone||contact.phone.length>32)return res.status(400).json({success:false,message:"A named business contact with a valid email address and phone number is required."});
  for(const [label,url] of [["Privacy Policy",privacyPolicyUrl],["Terms and Conditions",termsUrl]]){
   let parsed:URL;try{parsed=new URL(url);}catch{return res.status(400).json({success:false,message:label+" must be a valid public HTTPS URL."});}
   if(parsed.protocol!=="https:"||parsed.username||parsed.password)return res.status(400).json({success:false,message:label+" must be a public HTTPS URL."});
   const policyHost=normalizeSenderDomain(parsed.hostname);
   if(policyHost!==websiteDomain&&!policyHost.endsWith("."+websiteDomain))return res.status(422).json({success:false,code:"POLICY_DOMAIN_MISMATCH",message:label+" must be published on the verified business website or one of its subdomains."});
  }
  if(!consentEvidenceReference||consentEvidenceReference.length>1000)return res.status(400).json({success:false,code:"CONSENT_EVIDENCE_REQUIRED",message:"Provide a retrievable record or secure reference proving how recipients opt in."});
  try{const evidenceUrl=new URL(consentEvidenceReference);if(evidenceUrl.protocol!=="https:"||evidenceUrl.username||evidenceUrl.password)throw new Error("invalid");}catch{return res.status(400).json({success:false,code:"CONSENT_EVIDENCE_URL_REQUIRED",message:"Recipient opt-in evidence must be retrievable through a secure HTTPS evidence URL."});}
  if(documents.length===0||documents.length!==docHashes.length||docHashes.some((v:string)=>!/^[a-f0-9]{64}$/.test(v)))return res.status(400).json({success:false,code:"DOCUMENT_EVIDENCE_INCOMPLETE",message:"Provide genuine registration/brand-ownership documents and a SHA-256 checksum for every uploaded document. Unverified links alone are not accepted."});
  for(const value of documents){try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password)throw new Error("invalid");}catch{return res.status(400).json({success:false,message:"Every document must be stored at an HTTPS evidence URL."});}}
  const requestDetails={senderType,businessName,doingBusinessAs,businessType,registrationNumber,registrationNumberType,companyLocation,businessAddress,businessWebsite:String(website.website_url),privacyPolicyUrl,termsUrl,businessContact:contact,messageUseCase,sampleMessage,promotionalSample,transactionalSample,smsPurpose,monthlyVolume,messageDomain,optInType,consentEvidenceReference,registrationDocuments:documents,registrationDocumentSha256:docHashes,attestations:{documentsAreAuthentic:req.body.documentsAreAuthentic===true,authorizedToUseBrand:req.body.authorizedToUseBrand===true,consentObtained:req.body.consentObtained===true,privacyAndTermsReviewed:req.body.privacyAndTermsReviewed===true}};
  if(Object.values(requestDetails.attestations).some(v=>v!==true))return res.status(422).json({success:false,code:"REQUIRED_ATTESTATIONS_MISSING",message:"All authenticity, brand-authorization, recipient-consent and policy-review attestations must be explicitly confirmed."});
  const fingerprint=hash(JSON.stringify({sender:sender.toLowerCase(),countryCode,provider,requestDetails}));
  const saved=await pool.query("INSERT INTO aurelink_sender_ids(workspace_id,channel,sender,country_code,provider,status,request_details,registration_state,security_review_status,website_domain,website_verification_id,submitted_evidence,evidence_fingerprint,consent_evidence_reference,business_address,business_contact,monthly_volume,sms_purpose,sender_type,submitted_by_user_id) VALUES($1,'sms',$2,$3,$4,'pending',$7::jsonb,'security_review','pending',$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb,$12,$13,$14,$15) RETURNING id,channel,sender,country_code,provider,status,registration_state,security_review_status,website_domain,submitted_by_user_id,created_at",[wid,sender,countryCode,provider,websiteDomain,website.id,JSON.stringify(requestDetails),fingerprint,consentEvidenceReference,businessAddress,JSON.stringify(contact),monthlyVolume,smsPurpose,senderType,req.user!.userId]);
  return res.status(202).json({success:true,sender:saved.rows[0],submissionBlocked:true,registrationState:"security_review",nextStep:"Aurelink security review must pass before provider submission is enabled. Carrier approval is a separate subsequent stage.",securityChecks:["Verified Aurelink Developer website ownership","Complete legal business and contact details","Privacy Policy and Terms URLs","SMS use case and sample message","Monthly volume and purpose","Recipient opt-in evidence","Document checksums and authenticity attestations","Country-specific route review"],important:"Aurelink does not claim that a checksum proves a document is genuine. Human verification and provider/carrier evidence are required; fabricated documents can trigger account restrictions."});
 }catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to create Sender ID application."});}
});
router.post("/aurelink/communications/senders/:id/review",aurelinkAuthMiddleware,async(req,res)=>{
 if(!senderAdmin(req.user!.userId))return res.status(403).json({success:false,message:"Only configured Aurelink security administrators can review Sender ID applications."});
 const status=String(req.body.status||""),securityStatus=String(req.body.securityReviewStatus||"");
 const providerReference=String(req.body.providerReference||"").trim(),evidenceUrl=String(req.body.evidenceUrl||"").trim(),reason=String(req.body.rejectionReason||req.body.securityReason||"").trim();
 if(!["security_passed","security_failed","submitted","approved","rejected","suspended"].includes(status))return res.status(400).json({success:false,message:"Unsupported Sender ID review transition."});
 const found=(await pool.query("SELECT s.*,v.status AS website_status FROM aurelink_sender_ids s LEFT JOIN aurelink_verified_websites v ON v.id=s.website_verification_id WHERE s.id=$1",[req.params.id])).rows[0];
 if(!found)return res.status(404).json({success:false,message:"Sender registration request not found."});
 if(status==="security_passed"){
  if(found.registration_state!=="security_review"||found.security_review_status!=="pending")return res.status(409).json({success:false,code:"SECURITY_REVIEW_NOT_PENDING",message:"This Sender ID application is not awaiting Aurelink security review."});
  const checklist=req.body.securityChecklist||{};
  const required=["legalBusinessVerified","brandOwnershipVerified","documentAuthenticityVerified","websiteContentVerified","privacyPolicyStatementVerified","termsContentVerified","consentEvidenceVerified","smsUseCaseVerified","countryRequirementsVerified"];
  const missing=required.filter((key:string)=>checklist[key]!==true);
  if(found.website_status!=="verified"||!found.evidence_fingerprint||!found.consent_evidence_reference||!Array.isArray(found.request_details?.registrationDocuments)||!found.request_details.registrationDocuments.length||found.request_details?.attestations?.documentsAreAuthentic!==true||missing.length)return res.status(422).json({success:false,code:"SECURITY_GATE_INCOMPLETE",missingChecks:missing,message:"Website ownership, legal/brand verification, original-document authenticity, policy content, opt-in evidence and destination-specific carrier requirements must all be manually verified before security approval."});
  const token="AUR-SID-"+randomBytes(32).toString("base64url"),tokenHash=hash(token),encryptedToken=encryptSenderToken(token);
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const due=await client.query("SELECT NOW()+INTERVAL '1 hour' AS due_at");
   const reviewDueAt=due.rows[0].due_at;
   const updated=await client.query("UPDATE aurelink_sender_ids SET security_review_status='passed',security_reviewed_at=NOW(),security_reviewed_by=$2,registration_state='scheduled_for_brevo',brevo_review_due_at=$3,brevo_request_token_hash=$4,last_security_reason=NULL,request_details=request_details||jsonb_build_object('securityChecklist',$5::jsonb,'securityChecklistCompletedAt',NOW(),'provider','brevo'),updated_at=NOW() WHERE id=$1 RETURNING id,status,registration_state,security_review_status,security_reviewed_at,brevo_review_due_at",[req.params.id,req.user!.userId,reviewDueAt,tokenHash,JSON.stringify(checklist)]);
   await client.query("INSERT INTO aurelink_sender_provider_submissions(sender_application_id,workspace_id,provider,request_token_hash,request_token_encrypted,status,scheduled_at) VALUES($1,$2,'brevo',$3,$4,'scheduled',$5)",[req.params.id,found.workspace_id,tokenHash,encryptedToken,reviewDueAt]);
   await client.query("INSERT INTO aurelink_sender_security_audit(sender_application_id,workspace_id,actor_user_id,action,details) VALUES($1,$2,$3,'security_approved',jsonb_build_object('provider','brevo','scheduledAt',$4,'reviewDelayMinutes',60))",[req.params.id,found.workspace_id,req.user!.userId,reviewDueAt]);
   await client.query("COMMIT");
   return res.json({success:true,sender:updated.rows[0],provider:"brevo",providerSubmission:"scheduled",reviewDelayMinutes:60,reviewDueAt,requestTokenLinked:true,note:"Aurelink security review passed. The application is held for the one-hour internal review window before it enters Brevo's submission queue. Carrier approval remains separate."});
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
 }
 if(status==="security_failed"){
  if(found.registration_state!=="security_review"||found.security_review_status!=="pending")return res.status(409).json({success:false,code:"SECURITY_REVIEW_NOT_PENDING",message:"Only an application awaiting Aurelink security review can be failed through this transition."});
  const restrictionDays=Number(req.body.restrictionDays);
  if(!reason)return res.status(400).json({success:false,message:"A security failure reason is required."});
  if(!Number.isInteger(restrictionDays)||restrictionDays<1||restrictionDays>365)return res.status(400).json({success:false,message:"Set a security restriction period between 1 and 365 days."});
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const updated=await client.query("UPDATE aurelink_sender_ids SET security_review_status='failed',registration_state='rejected',status='rejected',security_reviewed_at=NOW(),security_reviewed_by=$2,last_security_reason=$3,rejection_reason=$3,updated_at=NOW() WHERE id=$1 RETURNING id,workspace_id,submitted_by_user_id,status,registration_state,security_review_status,last_security_reason",[req.params.id,req.user!.userId,reason]);
   if(!updated.rows[0]){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"Sender registration request not found."});}
   const applicantId=updated.rows[0].submitted_by_user_id||((await client.query("SELECT user_id FROM aurelink_communications_workspaces WHERE id=$1",[updated.rows[0].workspace_id])).rows[0]?.user_id);
   if(!applicantId)throw new Error("Unable to identify the original Sender ID applicant for the security restriction.");
   const restriction=await client.query("INSERT INTO aurelink_sender_security_restrictions(user_id,workspace_id,sender_application_id,reason,ends_at,created_by) VALUES($2,$3,$1,$4,NOW()+($5 * INTERVAL '1 day'),$6) RETURNING id,starts_at,ends_at,status",[req.params.id,applicantId,updated.rows[0].workspace_id,reason,restrictionDays,req.user!.userId]);
   await client.query("INSERT INTO aurelink_sender_security_audit(sender_application_id,workspace_id,actor_user_id,action,details) VALUES($1,$2,$3,'security_rejected',jsonb_build_object('reason',$4,'restrictionId',$5,'restrictionEndsAt',$6))",[req.params.id,updated.rows[0].workspace_id,req.user!.userId,reason,restriction.rows[0].id,restriction.rows[0].ends_at]);
   await client.query("COMMIT");
   return res.json({success:true,sender:updated.rows[0],securityRestriction:restriction.rows[0],note:"The original applicant is temporarily blocked from new Sender ID applications and SMS delivery through this workspace."});
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);return res.status(500).json({success:false,message:error instanceof Error?error.message:"Unable to apply Sender ID security restriction."});}
  finally{client.release();}
 }
 if(found.security_review_status!=="passed"||!["ready_for_submission","submitted"].includes(String(found.registration_state)))return res.status(423).json({success:false,code:"SECURITY_GATE_NOT_PASSED",message:"Provider submission and approval are blocked until Aurelink security review has passed."});
 if(status==="submitted"&&!providerReference)return res.status(400).json({success:false,message:"A real provider registration reference is required."});
 if(status==="approved"){
  try{const u=new URL(evidenceUrl);if(u.protocol!=="https:"||!providerReference)throw new Error("invalid");}catch{return res.status(400).json({success:false,message:"Approval requires a real provider reference and HTTPS provider/carrier approval evidence."});}
 }
 if(status==="rejected"&&!reason)return res.status(400).json({success:false,message:"A rejection reason is required."});
 const saved=await pool.query("UPDATE aurelink_sender_ids SET status=$2,registration_state=$3,provider_reference=COALESCE(NULLIF($4,''),provider_reference),rejection_reason=CASE WHEN $2='rejected' THEN $5 ELSE NULL END,submitted_at=CASE WHEN $2 IN ('submitted','approved') THEN COALESCE(submitted_at,NOW()) ELSE submitted_at END,approved_at=CASE WHEN $2='approved' THEN NOW() ELSE NULL END,request_details=request_details||$6::jsonb,updated_at=NOW() WHERE id=$1 RETURNING id,workspace_id,channel,sender,country_code,provider,status,registration_state,security_review_status,provider_reference,rejection_reason,submitted_at,approved_at,updated_at",[req.params.id,status,status==="submitted"?"submitted":status==="approved"?"approved":status==="rejected"?"rejected":"suspended",providerReference,reason,JSON.stringify(status==="approved"?{providerApprovalEvidenceUrl:evidenceUrl,approvalRecordedAt:new Date().toISOString()}:{})]);
 return res.json({success:true,sender:saved.rows[0],note:"Provider approval is recorded only with a real provider reference and evidence. Aurelink security approval and carrier approval remain separate."});
});



router.get("/aurelink/admin/communications/senders/:id/audit",aurelinkAuthMiddleware,async(req,res)=>{
 if(!senderAdmin(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink communications administrator access required."});
 const rows=await pool.query("SELECT id,actor_user_id,action,details,created_at FROM aurelink_sender_security_audit WHERE sender_application_id=$1 ORDER BY created_at ASC",[req.params.id]);
 return res.json({success:true,audit:rows.rows});
});
router.get("/aurelink/admin/communications/sender-submissions",aurelinkAuthMiddleware,async(req,res)=>{
 if(!senderAdmin(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink communications administrator access required."});
 const rows=await pool.query("SELECT q.id,q.sender_application_id,q.provider,q.status,q.scheduled_at,q.submitted_at,q.provider_reference,q.provider_status,q.attempts,q.last_error,s.sender,s.country_code,s.request_details,s.registration_state FROM aurelink_sender_provider_submissions q JOIN aurelink_sender_ids s ON s.id=q.sender_application_id WHERE q.status IN ('ready_for_operator_submission','submitted','processing') ORDER BY q.scheduled_at ASC LIMIT 200");
 return res.json({success:true,submissionMode:"Brevo sender registration currently requires Brevo Console operator submission; no public sender-registration API is documented.",submissions:rows.rows});
});
router.post("/aurelink/admin/communications/sender-submissions/:id/reveal-token",aurelinkAuthMiddleware,async(req,res)=>{
 if(!senderAdmin(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink communications administrator access required."});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const row=(await client.query("SELECT id,status,request_token_encrypted,token_revealed_at,scheduled_at FROM aurelink_sender_provider_submissions WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];
  if(!row){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"Brevo submission request not found."});}
  if(row.status!=="ready_for_operator_submission"||new Date(row.scheduled_at).getTime()>Date.now()){await client.query("ROLLBACK");return res.status(423).json({success:false,message:"The one-hour review window has not elapsed or this request is no longer ready for submission."});}
  if(row.token_revealed_at||!row.request_token_encrypted){await client.query("ROLLBACK");return res.status(409).json({success:false,code:"TOKEN_ALREADY_REVEALED",message:"The one-time provider correlation token has already been revealed. Use the existing secure operator record; do not generate a second mapping."});}
  const token=decryptSenderToken(String(row.request_token_encrypted));
  await client.query("UPDATE aurelink_sender_provider_submissions SET token_revealed_at=NOW(),updated_at=NOW() WHERE id=$1",[row.id]);
  const owner=(await client.query("SELECT sender_application_id,workspace_id FROM aurelink_sender_provider_submissions WHERE id=$1",[row.id])).rows[0];
  await client.query("INSERT INTO aurelink_sender_security_audit(sender_application_id,workspace_id,actor_user_id,action,details) VALUES($1,$2,$3,'provider_token_revealed',jsonb_build_object('revealedOnce',true))",[owner.sender_application_id,owner.workspace_id,req.user!.userId]);
  await client.query("COMMIT");
  return res.json({success:true,requestToken:token,usage:"Include this exact Aurelink reference in the Brevo registration's additional supporting information where the form permits. Keep it with the provider reference for later status reconciliation. This token is revealed once."});
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);return res.status(500).json({success:false,message:error instanceof Error?error.message:"Unable to reveal provider token."});}
 finally{client.release();}
});
router.post("/aurelink/admin/communications/sender-submissions/:id/mark-submitted",aurelinkAuthMiddleware,async(req,res)=>{
 if(!senderAdmin(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink communications administrator access required."});
 const token=String(req.body.requestToken||""),providerReference=String(req.body.providerReference||"").trim();
 if(!token||!providerReference)return res.status(400).json({success:false,message:"The one-time Aurelink request token and real Brevo registration reference are required."});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const row=(await client.query("SELECT * FROM aurelink_sender_provider_submissions WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];
  if(!row||row.status!=="ready_for_operator_submission"||!row.token_revealed_at||row.request_token_hash!==hash(token)){await client.query("ROLLBACK");return res.status(409).json({success:false,code:"PROVIDER_REQUEST_MAPPING_FAILED",message:"The submission is not ready or the Aurelink correlation token does not match."});}
  await client.query("UPDATE aurelink_sender_provider_submissions SET status='submitted',submitted_at=NOW(),provider_reference=$2,provider_status='submitted',attempts=attempts+1,updated_at=NOW() WHERE id=$1",[row.id,providerReference]);
  const saved=await client.query("UPDATE aurelink_sender_ids SET status='submitted',registration_state='brevo_submitted',submitted_at=NOW(),provider_reference=$2,brevo_provider_reference=$2,brevo_submitted_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING id,sender,country_code,status,registration_state,provider_reference,submitted_at",[row.sender_application_id,providerReference]);
  await client.query("INSERT INTO aurelink_sender_security_audit(sender_application_id,workspace_id,actor_user_id,action,details) VALUES($1,$2,$3,'provider_submitted',jsonb_build_object('provider','brevo','providerReference',$4))",[row.sender_application_id,row.workspace_id,req.user!.userId,providerReference]);
  await client.query("COMMIT");
  return res.json({success:true,sender:saved.rows[0],provider:"brevo",requestMapped:true,tokenConsumed:false,note:"The token remains active until Brevo returns a terminal registration outcome."});
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);return res.status(500).json({success:false,message:error instanceof Error?error.message:"Unable to record Brevo submission."});}
 finally{client.release();}
});
async function applyBrevoSenderRegistrationResult(input:{token:string;eventId:string;status:string;providerReference?:string;reason?:string;payload?:unknown;actorUserId?:string}){
 const tokenHash=hash(input.token),status=input.status.toLowerCase();
 const terminal=status==="completed"||status==="successful"||status==="success"||status==="approved"||status==="rejected"||status==="declined"||status==="failed"||status==="denied";
 const approved=["completed","successful","success","approved"].includes(status);
 const rejected=["rejected","declined","failed","denied"].includes(status);
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const row=(await client.query("SELECT * FROM aurelink_sender_provider_submissions WHERE request_token_hash=$1 FOR UPDATE",[tokenHash])).rows[0];
  if(!row){await client.query("ROLLBACK");return {found:false,duplicate:false};}
  if(row.token_consumed_at){await client.query("COMMIT");return {found:true,duplicate:false,terminal:true,ignoredAfterTerminal:true};}
  if(!["submitted","processing"].includes(String(row.status))){await client.query("ROLLBACK");return {found:false,duplicate:false,notSubmitted:true};}
  const event=await client.query("INSERT INTO aurelink_sender_provider_events(provider,provider_event_id,submission_id,event_status,payload) VALUES('brevo',$1,$2,$3,$4::jsonb) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id",[input.eventId,row.id,status,JSON.stringify(input.payload||{})]);
  if(!event.rows.length){await client.query("COMMIT");return {found:true,duplicate:true,terminal:false};}
  if(terminal){
   if(!input.providerReference){await client.query("ROLLBACK");throw new Error("A terminal Brevo result must include its provider registration reference.");}
   const queueStatus=approved?"completed":"rejected";
   await client.query("UPDATE aurelink_sender_provider_submissions SET status=$2,provider_status=$3,provider_reference=$4,terminal_payload=$5::jsonb,terminal_event_id=$6,token_consumed_at=NOW(),request_token_encrypted=NULL,updated_at=NOW() WHERE id=$1",[row.id,queueStatus,status,input.providerReference,JSON.stringify(input.payload||{}),input.eventId]);
   await client.query("UPDATE aurelink_sender_ids SET status=$2,registration_state=$3,brevo_terminal_status=$4,brevo_terminal_at=NOW(),brevo_provider_reference=$5,provider_reference=$5,approved_at=CASE WHEN $2='approved' THEN NOW() ELSE NULL END,rejection_reason=CASE WHEN $2='rejected' THEN $6 ELSE NULL END,updated_at=NOW() WHERE id=$1",[row.sender_application_id,approved?"approved":"rejected",approved?"approved":"rejected",status,input.providerReference,input.reason||null]);
  }else{
   await client.query("UPDATE aurelink_sender_provider_submissions SET status='processing',provider_status=$2,provider_reference=COALESCE($3,provider_reference),updated_at=NOW() WHERE id=$1",[row.id,status,input.providerReference||null]);
  }
  await client.query("INSERT INTO aurelink_sender_security_audit(sender_application_id,workspace_id,actor_user_id,action,details) VALUES($1,$2,$3,'provider_status_received',$4::jsonb)",[row.sender_application_id,row.workspace_id,input.actorUserId||null,JSON.stringify({provider:"brevo",eventId:input.eventId,status,terminal,providerReference:input.providerReference||null,tokenConsumed:terminal})]);
  await client.query("COMMIT");
  return {found:true,duplicate:false,terminal,tokenConsumed:terminal,result:terminal?(approved?"approved":"rejected"):"processing"};
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
}
router.post("/aurelink/webhooks/brevo/sender-registration",async(req,res)=>{
 const secret=process.env.AURELINK_BREVO_SENDER_REGISTRATION_WEBHOOK_SECRET;
 if(!secret)return res.status(503).json({success:false,message:"Sender registration callback secret is not configured."});
 const authorization=String(req.headers.authorization||""),supplied=authorization.startsWith("Bearer ")?authorization.slice(7):"";
 const a=Buffer.from(secret),b=Buffer.from(supplied);
 if(!supplied||a.length!==b.length||!timingSafeEqual(a,b))return res.status(403).json({success:false,message:"Invalid sender-registration callback authentication."});
 const token=String(req.body.requestToken||""),eventId=String(req.body.eventId||""),status=String(req.body.status||"").toLowerCase();
 if(!token||!eventId||!status)return res.status(400).json({success:false,message:"requestToken, eventId and status are required."});
 if(["completed","successful","success","approved","rejected","declined","failed","denied"].includes(status)){
  const evidenceUrl=String(req.body.evidenceUrl||"");
  try{const parsed=new URL(evidenceUrl);if(parsed.protocol!=="https:"||parsed.username||parsed.password)throw new Error("invalid");}catch{return res.status(400).json({success:false,code:"BREVO_TERMINAL_EVIDENCE_REQUIRED",message:"Terminal registration outcomes require an HTTPS Brevo evidence URL and provider reference."});}
 }
 try{
  const result=await applyBrevoSenderRegistrationResult({token,eventId,status,providerReference:req.body.providerReference?String(req.body.providerReference):undefined,reason:req.body.reason?String(req.body.reason):undefined,payload:req.body});
  if(!result.found)return res.status(404).json({success:false,code:"SENDER_REQUEST_TOKEN_NOT_FOUND",message:"No pending Brevo sender registration is mapped to this token."});
  return res.status(200).json({success:true,...result});
 }catch(error){return res.status(409).json({success:false,message:error instanceof Error?error.message:"Unable to process Brevo sender registration result."});}
});
router.post("/aurelink/admin/communications/sender-submissions/:id/reconcile",aurelinkAuthMiddleware,async(req,res)=>{
 if(!senderAdmin(req.user!.userId))return res.status(403).json({success:false,message:"Aurelink communications administrator access required."});
 const token=String(req.body.requestToken||""),eventId=String(req.body.eventId||"manual-"+randomBytes(12).toString("hex")),status=String(req.body.status||"").toLowerCase();
 if(!token||!status)return res.status(400).json({success:false,message:"The request token and actual Brevo status are required."});
 if(["completed","successful","success","approved","rejected","declined","failed","denied"].includes(status)){
  const evidenceUrl=String(req.body.evidenceUrl||"");
  try{const parsed=new URL(evidenceUrl);if(parsed.protocol!=="https:"||parsed.username||parsed.password||!req.body.providerReference)throw new Error("invalid");}catch{return res.status(400).json({success:false,code:"BREVO_TERMINAL_EVIDENCE_REQUIRED",message:"Terminal outcomes require a real provider reference and HTTPS evidence from Brevo."});}
 }
 try{
  const result=await applyBrevoSenderRegistrationResult({token,eventId,status,providerReference:req.body.providerReference?String(req.body.providerReference):undefined,reason:req.body.reason?String(req.body.reason):undefined,payload:{...req.body,source:"aurelink_admin_reconciliation"},actorUserId:req.user!.userId});
  if(!result.found)return res.status(404).json({success:false,code:"SENDER_REQUEST_TOKEN_NOT_FOUND",message:"No Brevo registration is mapped to this token."});
  return res.json({success:true,...result});
 }catch(error){return res.status(409).json({success:false,message:error instanceof Error?error.message:"Unable to reconcile Brevo status."});}
});
router.post("/aurelink/communications/dns/cloudflare/connect",aurelinkAuthMiddleware,async(req,res)=>{
  const domainRaw=String(req.body.domain||""),zoneId=String(req.body.zoneId||""),apiToken=String(req.body.apiToken||"");
  try{
    const domain=normalizeDomain(domainRaw),zone=await validateCloudflareZoneToken(apiToken,zoneId,domain),wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId, String(req.headers["x-aurelink-workspace-id"]||"") || undefined);
    const encrypted=encryptAurelinkDnsSecret(apiToken);
    const saved=await pool.query("INSERT INTO aurelink_dns_provider_connections(workspace_id,provider,domain,zone_id,secret_encrypted,secret_prefix,status) VALUES($1,'cloudflare',$2,$3,$4,$5,'active') ON CONFLICT(workspace_id,provider,domain) DO UPDATE SET zone_id=EXCLUDED.zone_id,secret_encrypted=EXCLUDED.secret_encrypted,secret_prefix=EXCLUDED.secret_prefix,status='active',updated_at=NOW() RETURNING id,provider,domain,zone_id,status,created_at,updated_at",[wid,domain,zoneId,encrypted,apiToken.slice(0,8)]);
    return res.status(201).json({success:true,connection:saved.rows[0],zoneName:zone.zoneName,requiredTokenPermissions:["Zone:Read","DNS:Edit"],secretStoredEncrypted:true});
  }catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to connect Cloudflare DNS."});}
});
router.get("/aurelink/communications/dns/cloudflare/connections",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId, String(req.headers["x-aurelink-workspace-id"]||"") || undefined);
  const rows=await pool.query("SELECT id,provider,domain,zone_id,status,secret_prefix,created_at,updated_at FROM aurelink_dns_provider_connections WHERE workspace_id=$1 AND provider='cloudflare' ORDER BY created_at DESC",[wid]);
  return res.json({success:true,connections:rows.rows});
});
router.post("/aurelink/communications/domains/:id/apply-dns",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId, String(req.headers["x-aurelink-workspace-id"]||"") || undefined);
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
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId, String(req.headers["x-aurelink-workspace-id"]||"") || undefined);
  const rows=await pool.query("SELECT id,provider,email,domain,sender_name,provider_sender_id,status,provider_details,verified_at,created_at,updated_at FROM aurelink_email_senders WHERE workspace_id=$1 ORDER BY created_at DESC",[wid]);
  return res.json({success:true,senders:rows.rows});
});
router.post("/aurelink/communications/email-senders",aurelinkAuthMiddleware,async(req,res)=>{
  const email=String(req.body.email||"").trim().toLowerCase();
  const name=String(req.body.name||"").trim().slice(0,120);
  const provider=String(req.body.provider||process.env.AURELINK_DEFAULT_EMAIL_PROVIDER||"resend").toLowerCase();
  if(!emailProviders.has(provider))return res.status(400).json({success:false,message:"Email sender provider must be resend or brevo."});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name)return res.status(400).json({success:false,message:"A valid sender email and display name are required."});
  const domain=email.split("@").pop()!;
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId, String(req.headers["x-aurelink-workspace-id"]||"") || undefined);
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
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId, String(req.headers["x-aurelink-workspace-id"]||"") || undefined);
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

import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
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
function senderAdmin(userId:string){return new Set(String(process.env.AURELINK_ADMIN_USER_IDS||"").split(",").map(v=>v.trim()).filter(Boolean)).has(userId);}
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
  const domain=normalizeSenderDomain(parsed.hostname),token="aurelink-site-verification="+randomBytes(32).toString("hex"),tokenHash=hash(token);
  const saved=await pool.query("INSERT INTO aurelink_verified_websites(workspace_id,domain,website_url,verification_method,verification_token_hash,status,evidence) VALUES($1,$2,$3,'dns_txt',$4,'pending',$5::jsonb) ON CONFLICT(workspace_id,domain) DO UPDATE SET website_url=EXCLUDED.website_url,verification_method='dns_txt',verification_token_hash=EXCLUDED.verification_token_hash,status='pending',verified_at=NULL,verified_by=NULL,evidence='{}'::jsonb,updated_at=NOW() RETURNING id,domain,website_url,status,verification_method,created_at",[wid,domain,websiteUrl,tokenHash,JSON.stringify({challengeIssuedAt:new Date().toISOString()})]);
  return res.status(201).json({success:true,website:saved.rows[0],dnsRecord:{type:"TXT",host:"_aurelink-verification."+domain,value:token},instructions:"Publish the exact TXT record, then call the verify endpoint. Website ownership is not considered verified until Aurelink resolves and matches this challenge."});
 }catch(error){return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to register website."});}
});
router.post("/aurelink/communications/websites/:id/verify",aurelinkAuthMiddleware,async(req,res)=>{
 const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
 const row=(await pool.query("SELECT * FROM aurelink_verified_websites WHERE id=$1 AND workspace_id=$2",[req.params.id,wid])).rows[0];
 if(!row)return res.status(404).json({success:false,message:"Website verification request not found."});
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
 const rows=await pool.query("SELECT id,channel,sender,country_code,provider,status,registration_state,security_review_status,security_reviewed_at,last_security_reason,provider_reference,rejection_reason,request_details,submitted_at,approved_at,created_at,updated_at FROM aurelink_sender_ids WHERE workspace_id=$1 ORDER BY created_at DESC",[wid]);
 return res.json({success:true,senders:rows.rows});
});
router.post("/aurelink/communications/senders",aurelinkAuthMiddleware,async(req,res)=>{
 try{
  const sender=String(req.body.sender||"").trim(),provider=String(req.body.provider||"twilio").toLowerCase(),countryCode=String(req.body.countryCode||"").toUpperCase();
  const senderType=String(req.body.senderType||"alphanumeric");
  if(!sender||!/^[A-Za-z0-9]{3,11}$/.test(sender)||!/[A-Za-z]/.test(sender))return res.status(400).json({success:false,message:"Alphanumeric Sender IDs must be 3–11 ASCII letters or digits and include at least one letter."});
  if(!senderProviders.has(provider))return res.status(400).json({success:false,message:"SMS sender registration provider must be twilio or brevo."});
  if(!/^[A-Z]{2}$/.test(countryCode))return res.status(400).json({success:false,message:"A two-letter ISO destination country code is required."});
  if(senderType!=="alphanumeric"&&senderType!=="toll_free")return res.status(400).json({success:false,message:"Unsupported sender type."});
  if(senderType==="toll_free")return res.status(501).json({success:false,code:"TOLL_FREE_REGISTRATION_WORKFLOW_REQUIRED",message:"Toll-free number registration is a separate number-based workflow and is not yet enabled here. This request has not been submitted."});
  if(["US","CA"].includes(countryCode))return res.status(422).json({success:false,code:"TOLL_FREE_REGISTRATION_REQUIRED",message:"This destination requires a registered toll-free number workflow; an alphanumeric Sender ID cannot be submitted."});
  const wid=await workspaceId(req.user!.userId,(req as any).aurelinkProjectId,String(req.headers["x-aurelink-workspace-id"]||"")||undefined);
  const websiteDomain=normalizeSenderDomain(String(req.body.businessWebsite||""));
  const website=(await pool.query("SELECT id,website_url FROM aurelink_verified_websites WHERE workspace_id=$1 AND domain=$2 AND status='verified'",[wid,websiteDomain])).rows[0];
  if(!website)return res.status(422).json({success:false,code:"AURELINK_WEBSITE_NOT_VERIFIED",message:"Register and verify this business website in Aurelink Developer before applying for a Sender ID."});
  const businessName=String(req.body.businessName||"").trim(),businessAddress=String(req.body.businessAddress||"").trim();
  const privacyPolicyUrl=String(req.body.privacyPolicyUrl||"").trim(),termsUrl=String(req.body.termsUrl||"").trim();
  const messageUseCase=String(req.body.messageUseCase||"").trim(),sampleMessage=String(req.body.sampleMessage||"").trim();
  const smsPurpose=String(req.body.smsPurpose||"").toLowerCase(),monthlyVolume=Number(req.body.monthlyVolume);
  const contact={name:String(req.body.contactName||"").trim(),email:String(req.body.contactEmail||"").trim().toLowerCase(),phone:String(req.body.contactPhone||"").trim()};
  const consentEvidenceReference=String(req.body.consentEvidenceReference||"").trim();
  const documents=Array.isArray(req.body.registrationDocuments)?req.body.registrationDocuments.filter((v:any)=>typeof v==="string").map((v:string)=>v.trim()).slice(0,10):[];
  const docHashes=Array.isArray(req.body.registrationDocumentSha256)?req.body.registrationDocumentSha256.filter((v:any)=>typeof v==="string").map((v:string)=>v.toLowerCase()).slice(0,10):[];
  if(!businessName||businessName.length>160||!businessAddress||businessAddress.length>500||!messageUseCase||messageUseCase.length>2000||!sampleMessage||sampleMessage.length>1000)return res.status(400).json({success:false,code:"BUSINESS_DETAILS_INCOMPLETE",message:"Registered legal business name, business address, SMS use case and a real sample message are mandatory."});
  if(!["promotional","transactional","both"].includes(smsPurpose))return res.status(400).json({success:false,message:"Select promotional, transactional or both as the SMS purpose."});
  if(!Number.isSafeInteger(monthlyVolume)||monthlyVolume<1||monthlyVolume>100000000)return res.status(400).json({success:false,message:"Provide a realistic positive monthly SMS volume estimate."});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)||!contact.name||!contact.phone||contact.phone.length>32)return res.status(400).json({success:false,message:"A named business contact with a valid email address and phone number is required."});
  for(const [label,url] of [["Privacy Policy",privacyPolicyUrl],["Terms and Conditions",termsUrl]]){
   let parsed:URL;try{parsed=new URL(url);}catch{return res.status(400).json({success:false,message:label+" must be a valid public HTTPS URL."});}
   if(parsed.protocol!=="https:"||parsed.username||parsed.password)return res.status(400).json({success:false,message:label+" must be a public HTTPS URL."});
  }
  if(!consentEvidenceReference||consentEvidenceReference.length>1000)return res.status(400).json({success:false,code:"CONSENT_EVIDENCE_REQUIRED",message:"Provide a retrievable record or secure reference proving how recipients opt in."});
  if(documents.length===0||documents.length!==docHashes.length||docHashes.some((v:string)=>!/^[a-f0-9]{64}$/.test(v)))return res.status(400).json({success:false,code:"DOCUMENT_EVIDENCE_INCOMPLETE",message:"Provide genuine registration/brand-ownership documents and a SHA-256 checksum for every uploaded document. Unverified links alone are not accepted."});
  for(const value of documents){try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password)throw new Error("invalid");}catch{return res.status(400).json({success:false,message:"Every document must be stored at an HTTPS evidence URL."});}}
  const requestDetails={senderType,businessName,businessAddress,businessWebsite:String(website.website_url),privacyPolicyUrl,termsUrl,businessContact:contact,messageUseCase,sampleMessage,smsPurpose,monthlyVolume,consentEvidenceReference,registrationDocuments:documents,registrationDocumentSha256:docHashes,attestations:{documentsAreAuthentic:req.body.documentsAreAuthentic===true,authorizedToUseBrand:req.body.authorizedToUseBrand===true,consentObtained:req.body.consentObtained===true,privacyAndTermsReviewed:req.body.privacyAndTermsReviewed===true}};
  if(Object.values(requestDetails.attestations).some(v=>v!==true))return res.status(422).json({success:false,code:"REQUIRED_ATTESTATIONS_MISSING",message:"All authenticity, brand-authorization, recipient-consent and policy-review attestations must be explicitly confirmed."});
  const fingerprint=hash(JSON.stringify({sender:sender.toLowerCase(),countryCode,provider,requestDetails}));
  const saved=await pool.query("INSERT INTO aurelink_sender_ids(workspace_id,channel,sender,country_code,provider,status,request_details,registration_state,security_review_status,website_domain,website_verification_id,submitted_evidence,evidence_fingerprint,consent_evidence_reference,business_address,business_contact,monthly_volume,sms_purpose,sender_type) VALUES($1,'sms',$2,$3,$4,'pending','{}'::jsonb,'security_review','pending',$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb,$12,$13,$14) RETURNING id,channel,sender,country_code,provider,status,registration_state,security_review_status,website_domain,created_at",[wid,sender,countryCode,provider,websiteDomain,website.id,JSON.stringify(requestDetails),fingerprint,consentEvidenceReference,businessAddress,JSON.stringify(contact),monthlyVolume,smsPurpose,senderType]);
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
  const checklist=req.body.securityChecklist||{};
  const required=["legalBusinessVerified","brandOwnershipVerified","documentAuthenticityVerified","websiteContentVerified","privacyPolicyStatementVerified","termsContentVerified","consentEvidenceVerified","smsUseCaseVerified","countryRequirementsVerified"];
  const missing=required.filter((key:string)=>checklist[key]!==true);
  if(found.website_status!=="verified"||!found.evidence_fingerprint||!found.consent_evidence_reference||!Array.isArray(found.request_details?.registrationDocuments)||!found.request_details.registrationDocuments.length||found.request_details?.attestations?.documentsAreAuthentic!==true||missing.length)return res.status(422).json({success:false,code:"SECURITY_GATE_INCOMPLETE",missingChecks:missing,message:"Website ownership, legal/brand verification, original-document authenticity, policy content, opt-in evidence and destination-specific carrier requirements must all be manually verified before the security gate can pass."});
  const updated=await pool.query("UPDATE aurelink_sender_ids SET security_review_status='passed',security_reviewed_at=NOW(),security_reviewed_by=$2,registration_state='ready_for_submission',last_security_reason=NULL,request_details=request_details||jsonb_build_object('securityChecklist',$3::jsonb,'securityChecklistCompletedAt',NOW()),updated_at=NOW() WHERE id=$1 RETURNING id,status,registration_state,security_review_status,security_reviewed_at",[req.params.id,req.user!.userId,JSON.stringify(checklist)]);
  return res.json({success:true,sender:updated.rows[0],providerSubmission:"not_submitted",note:"Security review passed. This does not submit to a carrier or approve the Sender ID."});
 }
 if(status==="security_failed"){
  if(!reason)return res.status(400).json({success:false,message:"A security failure reason is required."});
  const updated=await pool.query("UPDATE aurelink_sender_ids SET security_review_status='failed',registration_state='rejected',status='rejected',security_reviewed_at=NOW(),security_reviewed_by=$2,last_security_reason=$3,rejection_reason=$3,updated_at=NOW() WHERE id=$1 RETURNING id,status,registration_state,security_review_status,last_security_reason",[req.params.id,req.user!.userId,reason]);
  return res.json({success:true,sender:updated.rows[0]});
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

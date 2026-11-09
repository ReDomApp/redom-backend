import { Router } from "express";
import { createHash, randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "../database/db";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import { verifyAurelinkResendWebhook, mapAurelinkResendEvent, mapAurelinkTwilioStatus, updateAurelinkMessageStatus } from "../services/aurelink/communications-callbacks.service";
import {
  createOtpCode, makeVerificationHash,
} from "../services/aurelink/communications-providers.service";
import { enqueueAurelinkMessage, retryAurelinkMessage } from "../services/aurelink/communications-worker.service";
import { emitAurelinkWebhookEvent } from "../services/aurelink/developer-platform.service";

const router = Router();

router.post("/aurelink/webhooks/resend", async (req,res) => {
  const secret=process.env.AURELINK_RESEND_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET;
  if(!secret) return res.status(503).json({success:false,message:"Aurelink Resend webhook secret is not configured."});
  if(!Buffer.isBuffer(req.body)) return res.status(400).json({success:false,message:"Expected raw Resend webhook payload."});
  const id=String(req.headers["svix-id"]||""),timestamp=String(req.headers["svix-timestamp"]||""),signature=String(req.headers["svix-signature"]||"");
  if(!verifyAurelinkResendWebhook(req.body,id,timestamp,signature,secret)) return res.status(400).json({success:false,message:"Invalid Resend webhook signature."});
  let event:any;try{event=JSON.parse(req.body.toString("utf8"));}catch{return res.status(400).json({success:false,message:"Invalid JSON payload."});}
  const status=mapAurelinkResendEvent(String(event?.type||"")),messageId=String(event?.data?.email_id||event?.data?.id||"");
  try {
    const stored=await pool.query("INSERT INTO aurelink_provider_events(provider,provider_event_id,provider_message_id,event_type,payload,processed_at) VALUES('resend',$1,$2,$3,$4::jsonb,NOW()) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id",[id,messageId||null,String(event?.type||"unknown"),JSON.stringify(event)]);
    if(stored.rows.length&&status&&messageId) await updateAurelinkMessageStatus({provider:"resend",providerMessageId:messageId,status,providerStatus:String(event.type),providerError:event?.data?.bounce?.message||event?.data?.reason||undefined,deliveredAt:status==="delivered"?new Date(event?.created_at||Date.now()):undefined});
    if(stored.rows.length&&status&&messageId) await pool.query("UPDATE aurelink_smtp_messages SET status=CASE WHEN $2='delivered' THEN 'delivered' WHEN $2 IN ('bounced','complained','failed') THEN 'failed' ELSE status END,updated_at=NOW() WHERE provider='resend' AND provider_message_id=$1",[messageId,status]);
    return res.status(200).json({received:true,updated:Boolean(stored.rows.length&&status&&messageId),duplicate:!stored.rows.length});
  }catch{return res.status(500).json({success:false,message:"Unable to persist Resend delivery event."});}
});

router.post("/aurelink/webhooks/twilio/status", async (req,res) => {
  const authToken=process.env.AURELINK_TWILIO_AUTH_TOKEN||process.env.TWILIO_AUTH_TOKEN;
  if(!authToken) return res.status(503).send("Aurelink Twilio callback is not configured.");
  const signature=String(req.headers["x-twilio-signature"]||"");
  const protocol=String(req.headers["x-forwarded-proto"]||req.protocol).split(",")[0].trim();
  const host=String(req.headers["x-forwarded-host"]||req.headers.host||"").split(",")[0].trim();
  if(!signature||!host) return res.status(400).send("Missing Twilio callback signature.");
  const url=protocol+"://"+host+req.originalUrl;
  const params=req.body&&typeof req.body==="object"?req.body:{};
  const keys=Object.keys(params).sort();
  let data=url;for(const key of keys)data+=key+String((params as any)[key]);
  const expected=createHmac("sha1",authToken).update(data).digest("base64");
  const a=Buffer.from(expected),b=Buffer.from(signature);
  if(a.length!==b.length||!timingSafeEqual(a,b)) return res.status(403).send("Invalid Twilio signature.");
  const sid=String((params as any).MessageSid||""),rawStatus=String((params as any).MessageStatus||""),status=mapAurelinkTwilioStatus(rawStatus);
  try {
    if(sid&&status){const eventId=sid+":"+rawStatus+":"+String((params as any).ErrorCode||"");const stored=await pool.query("INSERT INTO aurelink_provider_events(provider,provider_event_id,provider_message_id,event_type,payload,processed_at) VALUES('twilio',$1,$2,$3,$4::jsonb,NOW()) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id",[eventId,sid,"message.status",JSON.stringify(params)]);if(stored.rows.length)await updateAurelinkMessageStatus({provider:"twilio",providerMessageId:sid,status,providerStatus:rawStatus,providerError:(params as any).ErrorMessage||undefined,deliveredAt:status==="delivered"?new Date():undefined});}
    return res.status(204).end();
  }catch{return res.status(500).send("Unable to persist Twilio delivery status.");}
});
const EMAIL_PROVIDERS = new Set(["resend", "brevo"]);
const SMS_PROVIDERS = new Set(["brevo", "twilio"]);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const PROVIDER_READY = {
  sms: {
    brevo: Boolean(process.env.AURELINK_BREVO_API_KEY || process.env.BREVO_API_KEY),
    twilio: Boolean((process.env.AURELINK_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID) && (process.env.AURELINK_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN) && (process.env.AURELINK_TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER)),
  },
  email: {
    resend: Boolean(process.env.AURELINK_RESEND_API_KEY || process.env.RESEND_API_KEY),
    brevo: Boolean(process.env.AURELINK_BREVO_API_KEY || process.env.BREVO_API_KEY),
  },
};

async function workspaceId(userId: string): Promise<string> {
  await pool.query("INSERT INTO aurelink_communications_workspaces(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING", [userId]);
  const row = (await pool.query("SELECT id FROM aurelink_communications_workspaces WHERE user_id=$1 AND status='active'", [userId])).rows[0];
  if (!row) throw new Error("Aurelink communications workspace is unavailable.");
  return String(row.id);
}
async function approvedSmsSender(wid:string,sender:string,provider:string,countryCode:string):Promise<boolean>{
  const providers=[provider,process.env.AURELINK_SMS_FALLBACK_PROVIDER].filter((value,index,array):value is string=>Boolean(value)&&array.indexOf(value)===index);
  for(const selected of providers){
    if(!SMS_PROVIDERS.has(selected))return false;
    const row=await pool.query("SELECT id FROM aurelink_sender_ids WHERE workspace_id=$1 AND channel='sms' AND LOWER(sender)=LOWER($2) AND provider=$3 AND country_code=$4 AND status='approved' LIMIT 1",[wid,sender,selected,countryCode]);
    if(!row.rows[0])return false;
  }
  return true;
}
async function verifiedEmailSender(wid:string,sender:string,provider:string):Promise<boolean>{
  const domain=sender.split("@").pop()?.toLowerCase()||"";
  if(!domain)return false;
  const providers=[provider,process.env.AURELINK_EMAIL_FALLBACK_PROVIDER].filter((value,index,array):value is string=>Boolean(value)&&array.indexOf(value)===index);
  for(const selected of providers){
    if(!EMAIL_PROVIDERS.has(selected))return false;
    const row=await pool.query("SELECT id FROM aurelink_email_domains WHERE workspace_id=$1 AND domain=$2 AND provider=$3 AND status='verified' LIMIT 1",[wid,domain,selected]);
    if(!row.rows[0])return false;
  }
  return true;
}

/** Provider sends are available only to live Aurelink account sessions at this stage. */
router.get("/aurelink/communications/overview", aurelinkAuthMiddleware, async (req,res) => {
  const wid = await workspaceId(req.user!.userId);
  const [messages,domains,senderIds,contacts,campaigns,usage] = await Promise.all([
    pool.query("SELECT channel,status,COUNT(*)::int AS total FROM aurelink_messages WHERE workspace_id=$1 AND created_at>NOW()-INTERVAL '30 days' GROUP BY channel,status",[wid]),
    pool.query("SELECT status,COUNT(*)::int AS total FROM aurelink_email_domains WHERE workspace_id=$1 GROUP BY status",[wid]),
    pool.query("SELECT channel,status,COUNT(*)::int AS total FROM aurelink_sender_ids WHERE workspace_id=$1 GROUP BY channel,status",[wid]),
    pool.query("SELECT (SELECT COUNT(*) FROM aurelink_sms_contacts WHERE workspace_id=$1)::int AS sms,(SELECT COUNT(*) FROM aurelink_email_contacts WHERE workspace_id=$1)::int AS email",[wid]),
    pool.query("SELECT channel,status,COUNT(*)::int AS total FROM aurelink_campaigns WHERE workspace_id=$1 GROUP BY channel,status",[wid]),
    pool.query("SELECT channel,status,COUNT(*)::int AS messages,SUM(units)::int AS units,COALESCE(SUM(CASE WHEN wallet_debit_reference IS NULL OR NOT EXISTS(SELECT 1 FROM aurelink_wallet_ledger l WHERE l.reference='aurelink-communications-refund:'||message_id::text) THEN unit_price_minor ELSE 0 END),0)::bigint AS metered_amount_minor,currency FROM aurelink_communications_usage WHERE workspace_id=$1 GROUP BY channel,status,currency",[wid]),
  ]);
  res.json({success:true,workspaceId:wid,providers:PROVIDER_READY,messages:messages.rows,domains:domains.rows,senderIds:senderIds.rows,contacts:contacts.rows[0],campaigns:campaigns.rows,usage:usage.rows});
});

router.post("/aurelink/communications/sms/send", aurelinkAuthMiddleware, async (req,res) => {
  const provider=String(req.body.provider||process.env.AURELINK_DEFAULT_SMS_PROVIDER||"brevo");
  if(!SMS_PROVIDERS.has(provider))return res.status(400).json({success:false,message:"Unsupported SMS provider."});
  const category=req.body.category==="marketing"?"marketing":req.body.category==="otp"?"otp":req.body.category==="notification"?"notification":"transactional";
  const recipient=String(req.body.recipient||""),sender=String(req.body.sender||""),countryCode=String(req.body.countryCode||"").toUpperCase(),content=String(req.body.content||""),webUrl=typeof req.body.webUrl==="string"?req.body.webUrl:undefined;
  if(!/^\\+?[1-9]\\d{7,14}$/.test(recipient)||!/^[A-Za-z0-9]{1,11}$/.test(sender)||!/[A-Za-z]/.test(sender)||!/^[A-Z]{2}$/.test(countryCode)||!content.trim()||content.length>5000)return res.status(400).json({success:false,message:"Provide an E.164 recipient, ISO countryCode, approved 1–11 character alphanumeric sender and message content up to 5000 characters."});
  try{
    const wid=await workspaceId(req.user!.userId);
    if(!await approvedSmsSender(wid,sender,provider,countryCode))return res.status(403).json({success:false,code:"SMS_SENDER_NOT_APPROVED",message:"This sender ID is not approved for the selected provider and destination country."});
    if(category==="marketing"){
      const contact=(await pool.query("SELECT consent_status FROM aurelink_sms_contacts WHERE workspace_id=$1 AND phone_number=$2",[wid,recipient])).rows[0];
      if(contact?.consent_status!=="opted_in")return res.status(403).json({success:false,code:"MARKETING_CONSENT_REQUIRED",message:"Marketing SMS requires a contact with recorded opt-in consent."});
      if(!webUrl)return res.status(400).json({success:false,message:"Marketing SMS requires an opt-out/event URL."});
    }
    const key=String(req.headers["idempotency-key"]||"").trim();
    if(!key||key.length>128)return res.status(400).json({success:false,code:"IDEMPOTENCY_KEY_REQUIRED",message:"Send a unique Idempotency-Key header (maximum 128 characters)."});
    const queued=await enqueueAurelinkMessage({userId:req.user!.userId,workspaceId:wid,channel:"sms",category,provider,recipient,sender,content,idempotencyKey:key,payload:{channel:"sms",provider:provider as "brevo"|"twilio",category:category as "transactional"|"marketing"|"otp"|"notification",input:{recipient,sender,content,category:category as "transactional"|"marketing"|"otp"|"notification",webUrl}}});
    if("conflict" in queued)return res.status(409).json({success:false,code:"IDEMPOTENCY_CONFLICT",message:"This Idempotency-Key was already used with a different request."});
    return res.status(202).json({success:true,message:queued.message,replayed:Boolean(queued.replayed)});
  }catch(error){if(error instanceof Error&&error.message==="INSUFFICIENT_AURELINK_CREDIT")return res.status(402).json({success:false,code:"INSUFFICIENT_CREDIT",message:"Your Aurelink wallet balance is insufficient for this message."});return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to queue SMS."});}
});

router.post("/aurelink/communications/email/send",aurelinkAuthMiddleware,async(req,res)=>{
  const provider=String(req.body.provider||process.env.AURELINK_DEFAULT_EMAIL_PROVIDER||"resend");
  if(!EMAIL_PROVIDERS.has(provider))return res.status(400).json({success:false,message:"Unsupported email provider."});
  const recipient=String(req.body.recipient||""),sender=String(req.body.sender||""),senderName=String(req.body.senderName||""),subject=String(req.body.subject||""),html=typeof req.body.html==="string"?req.body.html:undefined,text=typeof req.body.text==="string"?req.body.text:undefined;
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(recipient)||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(sender)||!subject.trim()||(!html?.trim()&&!text?.trim()))return res.status(400).json({success:false,message:"Provide valid sender/recipient email addresses, a subject and HTML or text content."});
  try{
    const wid=await workspaceId(req.user!.userId);
    if(!await verifiedEmailSender(wid,sender,provider))return res.status(403).json({success:false,code:"EMAIL_DOMAIN_NOT_VERIFIED",message:"Verify and authenticate this sender domain with the selected provider before sending."});
    const suppression=(await pool.query("SELECT id FROM aurelink_email_suppressions WHERE workspace_id=$1 AND LOWER(email)=LOWER($2)",[wid,recipient])).rows[0];
    if(suppression)return res.status(403).json({success:false,code:"EMAIL_SUPPRESSED",message:"This recipient is suppressed for this workspace."});
    const key=String(req.headers["idempotency-key"]||"").trim();
    if(!key||key.length>128)return res.status(400).json({success:false,code:"IDEMPOTENCY_KEY_REQUIRED",message:"Send a unique Idempotency-Key header (maximum 128 characters)."});
    const queued=await enqueueAurelinkMessage({userId:req.user!.userId,workspaceId:wid,channel:"email",category:"transactional",provider,recipient,sender,subject,content:html||text||"",idempotencyKey:key,payload:{channel:"email",provider:provider as "resend"|"brevo",category:"transactional",input:{recipient,sender,senderName,subject,html,text,replyTo:typeof req.body.replyTo==="string"?req.body.replyTo:undefined}}});
    if("conflict" in queued)return res.status(409).json({success:false,code:"IDEMPOTENCY_CONFLICT",message:"This Idempotency-Key was already used with a different request."});
    return res.status(202).json({success:true,message:queued.message,replayed:Boolean(queued.replayed)});
  }catch(error){if(error instanceof Error&&error.message==="INSUFFICIENT_AURELINK_CREDIT")return res.status(402).json({success:false,code:"INSUFFICIENT_CREDIT",message:"Your Aurelink wallet balance is insufficient for this message."});return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to queue email."});}
});

router.get("/aurelink/communications/contacts",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId),channel=req.query.channel==="sms"||req.query.channel==="email"?String(req.query.channel):null;
  if(!channel)return res.status(400).json({success:false,message:"Specify channel=sms or channel=email."});
  const table=channel==="sms"?"aurelink_sms_contacts":"aurelink_email_contacts";
  const result=await pool.query(`SELECT id,${channel==="sms"?"phone_number":"email"} AS address,display_name,consent_status,consent_source,consented_at,opted_out_at,created_at,updated_at FROM ${table} WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 500`,[wid]);
  return res.json({success:true,channel,contacts:result.rows});
});

router.post("/aurelink/communications/contacts",aurelinkAuthMiddleware,async(req,res)=>{
  const channel=req.body.channel==="sms"?"sms":req.body.channel==="email"?"email":null,address=String(req.body.address||"").trim(),displayName=String(req.body.displayName||"").trim()||null;
  const consentStatus=req.body.consentStatus==="opted_in"?"opted_in":req.body.consentStatus==="opted_out"?"opted_out":"unknown";
  const consentSource=typeof req.body.consentSource==="string"?req.body.consentSource.trim().slice(0,240):null;
  if(!channel)return res.status(400).json({success:false,message:"Contact channel must be sms or email."});
  if(channel==="sms"&&!/^\+[1-9]\d{7,14}$/.test(address))return res.status(400).json({success:false,message:"Phone number must use E.164 format."});
  if(channel==="email"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))return res.status(400).json({success:false,message:"Enter a valid email address."});
  if(consentStatus==="opted_in"&&!consentSource)return res.status(400).json({success:false,message:"Record the opt-in source when setting consent_status=opted_in."});
  const wid=await workspaceId(req.user!.userId);
  const result=channel==="sms"
    ?await pool.query("INSERT INTO aurelink_sms_contacts(workspace_id,phone_number,display_name,consent_status,consent_source,consented_at,opted_out_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $4='opted_in' THEN NOW() ELSE NULL END,CASE WHEN $4='opted_out' THEN NOW() ELSE NULL END) ON CONFLICT(workspace_id,phone_number) DO UPDATE SET display_name=EXCLUDED.display_name,consent_status=EXCLUDED.consent_status,consent_source=EXCLUDED.consent_source,consented_at=CASE WHEN EXCLUDED.consent_status='opted_in' THEN NOW() ELSE aurelink_sms_contacts.consented_at END,opted_out_at=CASE WHEN EXCLUDED.consent_status='opted_out' THEN NOW() WHEN EXCLUDED.consent_status='opted_in' THEN NULL ELSE aurelink_sms_contacts.opted_out_at END,updated_at=NOW() RETURNING id,phone_number AS address,display_name,consent_status,consent_source,consented_at,opted_out_at",[wid,address,displayName,consentStatus,consentSource])
    :await pool.query("INSERT INTO aurelink_email_contacts(workspace_id,email,display_name,consent_status,consent_source,consented_at,opted_out_at) VALUES($1,LOWER($2),$3,$4,$5,CASE WHEN $4='opted_in' THEN NOW() ELSE NULL END,CASE WHEN $4='opted_out' THEN NOW() ELSE NULL END) ON CONFLICT(workspace_id,email) DO UPDATE SET display_name=EXCLUDED.display_name,consent_status=EXCLUDED.consent_status,consent_source=EXCLUDED.consent_source,consented_at=CASE WHEN EXCLUDED.consent_status='opted_in' THEN NOW() ELSE aurelink_email_contacts.consented_at END,opted_out_at=CASE WHEN EXCLUDED.consent_status='opted_out' THEN NOW() WHEN EXCLUDED.consent_status='opted_in' THEN NULL ELSE aurelink_email_contacts.opted_out_at END,updated_at=NOW() RETURNING id,email AS address,display_name,consent_status,consent_source,consented_at,opted_out_at",[wid,address,displayName,consentStatus,consentSource]);
  return res.status(200).json({success:true,contact:result.rows[0]});
});

router.get("/aurelink/communications/messages",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId),limit=Math.min(100,Math.max(1,Number.parseInt(String(req.query.limit||"50"),10)||50)),offset=Math.max(0,Number.parseInt(String(req.query.offset||"0"),10)||0);
  const channel=req.query.channel==="sms"||req.query.channel==="email"?String(req.query.channel):null,status=typeof req.query.status==="string"?req.query.status:null;
  const result=await pool.query("SELECT id,channel,category,provider,provider_message_id,recipient,sender,subject,status,provider_status,provider_error,created_at,accepted_at,delivered_at FROM aurelink_messages WHERE workspace_id=$1 AND ($2::text IS NULL OR channel=$2) AND ($3::text IS NULL OR status=$3) ORDER BY created_at DESC LIMIT $4 OFFSET $5",[wid,channel,status,limit,offset]);
  return res.json({success:true,messages:result.rows,pagination:{limit,offset,count:result.rows.length}});
});

router.get("/aurelink/communications/messages/:id",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId);
  const result=await pool.query("SELECT id,channel,category,provider,provider_message_id,recipient,sender,subject,status,provider_status,provider_error,segments,cost_minor,currency,created_at,accepted_at,delivered_at,updated_at FROM aurelink_messages WHERE workspace_id=$1 AND id=$2",[wid,req.params.id]);
  if(!result.rows[0])return res.status(404).json({success:false,message:"Message not found."});
  return res.json({success:true,message:result.rows[0]});
});

router.post("/aurelink/communications/messages/:id/retry",aurelinkAuthMiddleware,async(req,res)=>{
  const key=String(req.headers["idempotency-key"]||"").trim();
  if(!key||key.length>128)return res.status(400).json({success:false,code:"IDEMPOTENCY_KEY_REQUIRED",message:"Send a unique Idempotency-Key header (maximum 128 characters)."});
  try{
    const wid=await workspaceId(req.user!.userId),result=await retryAurelinkMessage({userId:req.user!.userId,workspaceId:wid,messageId:String(req.params.id),idempotencyKey:key});
    if("conflict" in result)return res.status(409).json({success:false,code:"IDEMPOTENCY_CONFLICT",message:"This Idempotency-Key was already used with a different request."});
    return res.status(202).json({success:true,message:result.message,replayed:Boolean(result.replayed)});
  }catch(error){
    if(error instanceof Error&&error.message==="MESSAGE_NOT_FOUND")return res.status(404).json({success:false,message:"Message not found."});
    if(error instanceof Error&&error.message==="MESSAGE_NOT_RETRYABLE")return res.status(409).json({success:false,message:"Only failed direct messages can be retried here. Campaign retries use the campaign send endpoint."});
    if(error instanceof Error&&error.message==="INSUFFICIENT_AURELINK_CREDIT")return res.status(402).json({success:false,code:"INSUFFICIENT_CREDIT",message:"Your Aurelink wallet balance is insufficient for this retry."});
    return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to retry message."});
  }
});

router.get("/aurelink/communications/campaigns",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId);
  const rows=await pool.query("SELECT id,channel,name,status,subject,scheduled_at,started_at,completed_at,created_at FROM aurelink_campaigns WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",[wid]);
  return res.json({success:true,campaigns:rows.rows});
});

router.post("/aurelink/communications/campaigns",aurelinkAuthMiddleware,async(req,res)=>{
  const channel=req.body.channel==="email"?"email":req.body.channel==="sms"?"sms":null;
  const name=String(req.body.name||"").trim(),subject=String(req.body.subject||"").trim()||null;
  const contentText=typeof req.body.text==="string"?req.body.text:typeof req.body.content==="string"?req.body.content:undefined;
  const contentHtml=typeof req.body.html==="string"?req.body.html:undefined;
  if(!channel||!name||name.length>140||(!contentText?.trim()&&!contentHtml?.trim()))return res.status(400).json({success:false,message:"Campaign channel, name and message content are required."});
  if(channel==="email"&&!subject)return res.status(400).json({success:false,message:"Email campaigns require a subject."});
  if(channel==="sms"&&!contentText?.trim())return res.status(400).json({success:false,message:"SMS campaigns require text content."});
  const wid=await workspaceId(req.user!.userId);
  const created=await pool.query("INSERT INTO aurelink_campaigns(workspace_id,channel,name,status,subject,content_text,content_html,audience) VALUES($1,$2,$3,'draft',$4,$5,$6,$7::jsonb) RETURNING id,channel,name,status,created_at",[wid,channel,name,subject,contentText||null,contentHtml||null,JSON.stringify({consentStatus:"opted_in"})]);
  return res.status(201).json({success:true,campaign:created.rows[0]});
});

router.post("/aurelink/communications/campaigns/:id/send",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId),client=await pool.connect();
  try{
    await client.query("BEGIN");
    const found=await client.query("SELECT * FROM aurelink_campaigns WHERE id=$1 AND workspace_id=$2 FOR UPDATE",[req.params.id,wid]);
    const campaign=found.rows[0];
    if(!campaign){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"Campaign not found."});}
    if(campaign.status!=="draft"&&campaign.status!=="scheduled"&&campaign.status!=="sending"&&campaign.status!=="paused"){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"Only draft or scheduled campaigns can be started."});}
    const provider=String(req.body.provider||(campaign.channel==="sms"?(process.env.AURELINK_DEFAULT_SMS_PROVIDER||"brevo"):(process.env.AURELINK_DEFAULT_EMAIL_PROVIDER||"resend")));
    if(campaign.channel==="sms"&&!SMS_PROVIDERS.has(provider)||campaign.channel==="email"&&!EMAIL_PROVIDERS.has(provider)){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"Unsupported campaign provider."});}
    const sender=String(req.body.sender||"");
    const countryCode=String(req.body.countryCode||"").toUpperCase();
    if(campaign.channel==="sms"&&!/^[A-Z]{2}$/.test(countryCode)){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"SMS campaigns require an ISO destination countryCode."});}
    if(campaign.channel==="sms"&&typeof req.body.webUrl!=="string") {await client.query("ROLLBACK");return res.status(400).json({success:false,message:"SMS campaigns require an HTTPS opt-out/event webUrl."});}
    if(!sender){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"An approved sender is required to start a campaign."});}
    if(campaign.channel==="sms"&&!/^[A-Za-z0-9]{1,11}$/.test(sender)||campaign.channel==="email"&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(sender)){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"The campaign sender is invalid for the selected channel."});}
    if(campaign.channel==="sms"){
      if(!await approvedSmsSender(wid,sender,provider,countryCode)){await client.query("ROLLBACK");return res.status(403).json({success:false,code:"SMS_SENDER_NOT_APPROVED",message:"This sender ID is not approved for the selected provider and destination country."});}
      try{if(new URL(String(req.body.webUrl)).protocol!=="https:")throw new Error("invalid");}catch{await client.query("ROLLBACK");return res.status(400).json({success:false,message:"SMS campaigns require an HTTPS opt-out/event webUrl."});}
    }else if(!await verifiedEmailSender(wid,sender,provider)){await client.query("ROLLBACK");return res.status(403).json({success:false,code:"EMAIL_DOMAIN_NOT_VERIFIED",message:"Verify and authenticate this sender domain with the selected provider before sending."});}
    const recipients=campaign.channel==="sms"
      ?await client.query("SELECT id,phone_number AS destination FROM aurelink_sms_contacts WHERE workspace_id=$1 AND consent_status='opted_in' AND phone_number IS NOT NULL ORDER BY id",[wid])
      :await client.query("SELECT id,email AS destination FROM aurelink_email_contacts WHERE workspace_id=$1 AND consent_status='opted_in' AND email IS NOT NULL ORDER BY id",[wid]);
    if(!recipients.rows.length){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"No opted-in contacts are eligible for this campaign."});}
    await client.query("UPDATE aurelink_campaigns SET status='sending',started_at=NOW(),updated_at=NOW() WHERE id=$1",[campaign.id]);
    await client.query("COMMIT");
    let queued=0,skipped=0;
    for(const contact of recipients.rows){
      const recipient=String(contact.destination);
      const previous=await pool.query("SELECT status,(SELECT COUNT(*)::int FROM aurelink_messages WHERE campaign_id=$1 AND recipient=$2) AS attempts FROM aurelink_messages WHERE campaign_id=$1 AND recipient=$2 ORDER BY created_at DESC LIMIT 1",[campaign.id,recipient]);
      if(previous.rows[0]&&previous.rows[0].status!=="failed"){skipped++;continue;}
      const attemptNo=Number(previous.rows[0]?.attempts||0)+1,idempotencyKey=("campaign:"+campaign.id+":"+contact.id+":"+attemptNo).slice(0,128);
      if(campaign.channel==="sms"){
        const payload={channel:"sms" as const,provider:provider as "brevo"|"twilio",category:"marketing" as const,input:{recipient,sender,content:String(campaign.content_text||""),category:"marketing" as const,webUrl:typeof req.body.webUrl==="string"?req.body.webUrl:undefined}};
        if(!payload.input.webUrl){skipped++;continue;}
        const result=await enqueueAurelinkMessage({userId:req.user!.userId,workspaceId:wid,channel:"sms",category:"campaign",provider,recipient,sender,content:payload.input.content,idempotencyKey,payload,campaignId:String(campaign.id)});
        if("conflict" in result)skipped++;else queued++;
      }else{
        const suppressed=(await pool.query("SELECT id FROM aurelink_email_suppressions WHERE workspace_id=$1 AND LOWER(email)=LOWER($2)",[wid,recipient])).rows[0];
        if(suppressed){skipped++;continue;}
        const payload={channel:"email" as const,provider:provider as "resend"|"brevo",category:"notification" as const,input:{recipient,sender,senderName:String(req.body.senderName||"Aurelink"),subject:String(campaign.subject),html:campaign.content_html||undefined,text:campaign.content_text||undefined}};
        const result=await enqueueAurelinkMessage({userId:req.user!.userId,workspaceId:wid,channel:"email",category:"campaign",provider,recipient,sender,subject:String(campaign.subject),content:String(campaign.content_html||campaign.content_text||""),idempotencyKey,payload,campaignId:String(campaign.id)});
        if("conflict" in result)skipped++;else queued++;
      }
    }
    if(queued===0)await pool.query("UPDATE aurelink_campaigns c SET status=CASE WHEN EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(m.recipient) m.recipient,j.status FROM aurelink_messages m JOIN aurelink_communications_jobs j ON j.message_id=m.id WHERE m.campaign_id=c.id ORDER BY m.recipient,m.created_at DESC) latest WHERE latest.status='failed') THEN 'paused' ELSE 'completed' END,completed_at=NOW(),updated_at=NOW() WHERE c.id=$1 AND NOT EXISTS(SELECT 1 FROM aurelink_messages m JOIN aurelink_communications_jobs j ON j.message_id=m.id WHERE m.campaign_id=c.id AND j.status IN ('pending','processing'))",[campaign.id]);
    return res.status(202).json({success:true,campaignId:campaign.id,queued,skipped,status:queued?"sending":"completed"});
  }catch(error){
    await client.query("ROLLBACK").catch(()=>undefined);
    if(error instanceof Error&&error.message==="INSUFFICIENT_AURELINK_CREDIT")return res.status(402).json({success:false,code:"INSUFFICIENT_CREDIT",message:"Your Aurelink wallet balance is insufficient to queue the full campaign."});
    return res.status(500).json({success:false,message:error instanceof Error?error.message:"Unable to start campaign."});
  }finally{client.release();}
});

router.post("/aurelink/verify/start",aurelinkAuthMiddleware,async(req,res)=>{
  const channel=req.body.channel==="email"?"email":"sms",destination=String(req.body.destination||""),purpose=String(req.body.purpose||"account");
  if(!destination||destination.length>320||!/^[A-Za-z0-9_.-]{1,40}$/.test(purpose))return res.status(400).json({success:false,message:"A valid destination and purpose are required."});
  if(channel==="sms"&&!/^\+[1-9]\d{7,14}$/.test(destination))return res.status(400).json({success:false,message:"Phone number must use E.164 format."});
  if(channel==="email"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination))return res.status(400).json({success:false,message:"Enter a valid email address."});
  const wid=await workspaceId(req.user!.userId),code=createOtpCode(),salt=randomUUID(),expiresAt=new Date(Date.now()+5*60*1000),provider=String(req.body.provider||(channel==="email"?(process.env.AURELINK_DEFAULT_EMAIL_PROVIDER||"resend"):(process.env.AURELINK_DEFAULT_SMS_PROVIDER||"brevo")));
  if(channel==="email"&&!EMAIL_PROVIDERS.has(provider)||channel==="sms"&&!SMS_PROVIDERS.has(provider))return res.status(400).json({success:false,message:"Unsupported verification provider."});
  const sender=String(req.body.sender||"");
  if(channel==="sms"&&!/^[A-Za-z0-9]{1,11}$/.test(sender))return res.status(400).json({success:false,message:"SMS sender must be 1–11 alphanumeric characters."});
  if(channel==="email"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender))return res.status(400).json({success:false,message:"A valid sender email address is required."});
  if(channel==="sms"){const countryCode=String(req.body.countryCode||"").toUpperCase();if(!/^[A-Z]{2}$/.test(countryCode)||!await approvedSmsSender(wid,sender,provider,countryCode))return res.status(403).json({success:false,code:"SMS_SENDER_NOT_APPROVED",message:"An approved sender ID for the destination country is required."});}else if(!await verifiedEmailSender(wid,sender,provider))return res.status(403).json({success:false,code:"EMAIL_DOMAIN_NOT_VERIFIED",message:"Verify the sender domain with the selected provider before sending verification email."});
  const saved=await pool.query("INSERT INTO aurelink_verification_sessions(workspace_id,channel,purpose,destination,destination_hash,code_hash,verification_salt,provider,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,expires_at",[wid,channel,purpose,destination,hash(destination.toLowerCase()),makeVerificationHash(code,salt),salt,provider,expiresAt]);
  try{
    const content=channel==="sms"?`Your Aurelink verification code is ${code}. It expires in 5 minutes.`:`Your Aurelink verification code is ${code}. It expires in 5 minutes. Never share this code.`;
    const queued=channel==="sms"
      ?await enqueueAurelinkMessage({userId:req.user!.userId,workspaceId:wid,channel:"sms",category:"otp",provider,recipient:destination,sender,content,idempotencyKey:"verification:"+String(saved.rows[0].id),verificationId:String(saved.rows[0].id),payload:{channel:"sms",provider:provider as "brevo"|"twilio",category:"otp",input:{recipient:destination,sender,content,category:"otp"}}})
      :await enqueueAurelinkMessage({userId:req.user!.userId,workspaceId:wid,channel:"email",category:"otp",provider,recipient:destination,sender,subject:"Your Aurelink verification code",content,idempotencyKey:"verification:"+String(saved.rows[0].id),verificationId:String(saved.rows[0].id),payload:{channel:"email",provider:provider as "resend"|"brevo",category:"notification",input:{recipient:destination,sender,senderName:"Aurelink",subject:"Your Aurelink verification code",text:content}}});
    if("conflict" in queued)throw new Error("Unable to create the verification delivery job.");
    await emitAurelinkWebhookEvent(req.user!.userId,"verification.created",{verificationId:saved.rows[0].id,channel,purpose,expiresAt});
    return res.status(202).json({success:true,verificationId:saved.rows[0].id,expiresAt,messageStatus:"queued"});
  }catch(error){
    await pool.query("UPDATE aurelink_verification_sessions SET status='cancelled',updated_at=NOW() WHERE id=$1",[saved.rows[0].id]);
    if(error instanceof Error&&error.message==="INSUFFICIENT_AURELINK_CREDIT")return res.status(402).json({success:false,code:"INSUFFICIENT_CREDIT",message:"Your Aurelink wallet balance is insufficient for verification delivery."});
    return res.status(502).json({success:false,message:error instanceof Error?error.message:"Verification delivery could not be queued."});
  }
});

router.post("/aurelink/verify/:id/check",aurelinkAuthMiddleware,async(req,res)=>{
  const wid=await workspaceId(req.user!.userId),client=await pool.connect();
  try{
    await client.query("BEGIN");
    const found=await client.query("SELECT * FROM aurelink_verification_sessions WHERE id=$1 AND workspace_id=$2 FOR UPDATE",[req.params.id,wid]);
    const session=found.rows[0];
    if(!session){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"Verification session not found."});}
    if(session.status==="approved"){await client.query("COMMIT");return res.json({success:true,verified:true,verifiedAt:session.verified_at||null});}
    if(session.status!=="pending"){await client.query("ROLLBACK");return res.status(410).json({success:false,message:"Verification session is no longer active."});}
    if(new Date(session.expires_at).getTime()<=Date.now()){await client.query("UPDATE aurelink_verification_sessions SET status='expired',updated_at=NOW() WHERE id=$1",[session.id]);await client.query("COMMIT");await emitAurelinkWebhookEvent(req.user!.userId,"verification.expired",{verificationId:session.id,purpose:session.purpose});return res.status(410).json({success:false,message:"Verification session expired."});}
    if(Number(session.attempts)>=Number(session.max_attempts)){await client.query("UPDATE aurelink_verification_sessions SET status='locked',updated_at=NOW() WHERE id=$1",[session.id]);await client.query("COMMIT");return res.status(429).json({success:false,message:"Verification attempts exceeded."});}
    const code=String(req.body.code||""), candidate=makeVerificationHash(code,String(session.verification_salt||"")), hashInput=String(session.code_hash||"");
    const supplied=Buffer.from(hashInput,"hex"),expected=Buffer.from(candidate,"hex");
    const candidateMatches=/^\\d{6}$/.test(code)&&hashInput.length===64&&supplied.length===expected.length&&timingSafeEqual(supplied,expected);
    if(!candidateMatches){const wrong=await client.query("UPDATE aurelink_verification_sessions SET attempts=attempts+1,status=CASE WHEN attempts+1>=max_attempts THEN 'locked' ELSE status END,updated_at=NOW() WHERE id=$1 RETURNING attempts,status",[session.id]);await client.query("COMMIT");return res.status(wrong.rows[0]?.status==="locked"?429:400).json({success:false,message:wrong.rows[0]?.status==="locked"?"Verification attempts exceeded.":"Incorrect verification code."});}
    await client.query("UPDATE aurelink_verification_sessions SET status='approved',verified_at=NOW(),updated_at=NOW() WHERE id=$1",[session.id]);
    await client.query("COMMIT");
    await emitAurelinkWebhookEvent(req.user!.userId,"verification.approved",{verificationId:session.id,purpose:session.purpose,verifiedAt:new Date().toISOString()});
    return res.json({success:true,verified:true,verifiedAt:new Date().toISOString()});
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);return res.status(500).json({success:false,message:"Verification could not be checked."});}
  finally{client.release();}
});

export default router;

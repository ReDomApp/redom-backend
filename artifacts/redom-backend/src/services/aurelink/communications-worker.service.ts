import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { pool } from "../../database/db";
import { captureAurelinkUsage, chargeAurelinkUsage, countSmsSegments, refundAurelinkUsage } from "./communications-billing.service";
import { sendAurelinkEmail, sendAurelinkSms } from "./communications-providers.service";

type JobPayload =
  | { channel:"sms"; provider:"brevo"|"twilio"; category:"transactional"|"marketing"|"otp"|"notification"; input:{recipient:string;sender:string;content:string;category:"transactional"|"marketing"|"otp"|"notification";countryCode?:string;tag?:string;webUrl?:string} }
  | { channel:"email"; provider:"resend"|"brevo"; category:"transactional"|"notification"; scheduledAt?:string; input:{recipient:string;sender:string;senderName?:string;subject:string;html?:string;text?:string;replyTo?:string;tags?:string[];attachments?:Array<{filename:string;content:string;contentType?:string}>} };

function key(){const source=process.env.AURELINK_COMMUNICATIONS_ENCRYPTION_KEY||process.env.JWT_ACCESS_SECRET;if(!source||source.length<32)throw new Error("Set AURELINK_COMMUNICATIONS_ENCRYPTION_KEY (32+ characters) or JWT_ACCESS_SECRET before enabling communications delivery.");return createHash("sha256").update(source).update("|aurelink-communications-v1").digest();}
function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv),body=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),body.toString("base64url")].join(".");}
function decrypt(value:string){const [iv,tag,body]=value.split(".");if(!iv||!tag||!body)throw new Error("Communications job payload is corrupt.");const decipher=createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64url"));decipher.setAuthTag(Buffer.from(tag,"base64url"));return Buffer.concat([decipher.update(Buffer.from(body,"base64url")),decipher.final()]).toString("utf8");}

export async function enqueueAurelinkMessage(input:{
 userId:string;workspaceId:string;channel:"sms"|"email";category:string;provider:string;recipient:string;sender:string;subject?:string;content:string;idempotencyKey:string;payload:JobPayload;campaignId?:string;verificationId?:string;scheduledAt?:Date;
}){
 const payloadHash=createHash("sha256").update(JSON.stringify(input.payload)).digest("hex");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const inserted=await client.query(
   "INSERT INTO aurelink_messages(workspace_id,channel,category,provider,recipient,sender,subject,content_hash,idempotency_key,status,campaign_id,verification_session_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued',$10,$11) ON CONFLICT(workspace_id,idempotency_key) DO NOTHING RETURNING id,channel,category,provider,recipient,status,created_at",
   [input.workspaceId,input.channel,input.category,input.provider,input.recipient,input.sender,input.subject||null,createHash("sha256").update(input.content).digest("hex"),input.idempotencyKey,input.campaignId||null,input.verificationId||null]
  );
  if(!inserted.rows.length){
   const existing=await client.query("SELECT m.id,m.channel,m.category,m.provider,m.recipient,m.status,m.created_at,m.content_hash,j.payload_hash FROM aurelink_messages m LEFT JOIN aurelink_communications_jobs j ON j.message_id=m.id WHERE m.workspace_id=$1 AND m.idempotency_key=$2 FOR UPDATE OF m",[input.workspaceId,input.idempotencyKey]);
   const row=existing.rows[0];
   if(!row||row.content_hash!==createHash("sha256").update(input.content).digest("hex")||row.payload_hash!==payloadHash){await client.query("ROLLBACK");return {conflict:true as const};}
   await client.query("COMMIT");
   return {message:row,replayed:true as const};
  }
  const message=inserted.rows[0];
  await client.query("INSERT INTO aurelink_communications_jobs(message_id,workspace_id,payload_encrypted,payload_hash,next_attempt_at) VALUES($1,$2,$3,$4,COALESCE($5,NOW()))",[message.id,input.workspaceId,encrypt(JSON.stringify(input.payload)),payloadHash,input.scheduledAt||null]);
  const smsUnits=input.channel==="sms"?countSmsSegments(input.content):1;
  const countryCode=input.channel==="sms"?(input.payload.channel==="sms"?(input.payload.input.countryCode||"*"):"*"):"*";
  const billable=await chargeAurelinkUsage(client,{userId:input.userId,workspaceId:input.workspaceId,messageId:String(message.id),service:input.channel==="sms"?"sms_segment":"email_message",units:smsUnits,countryCode,metadata:{channel:input.channel,provider:input.provider,category:input.category}});
  await client.query("INSERT INTO aurelink_communications_usage(workspace_id,message_id,channel,provider,category,units,status,unit_price_minor,wallet_debit_reference) VALUES($1,$2,$3,$4,$5,$6,'queued',$7,$8)",[input.workspaceId,message.id,input.channel,input.provider,input.category,smsUnits,billable.unitPriceMinor,billable.reference]);
  await client.query("COMMIT");
  return {message,replayed:false as const};
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
}

export async function retryAurelinkMessage(input:{userId:string;workspaceId:string;messageId:string;idempotencyKey:string}){
 const found=await pool.query("SELECT m.*,w.user_id,j.payload_encrypted FROM aurelink_messages m JOIN aurelink_communications_workspaces w ON w.id=m.workspace_id JOIN aurelink_communications_jobs j ON j.message_id=m.id WHERE m.id=$1 AND m.workspace_id=$2",[input.messageId,input.workspaceId]);
 const original=found.rows[0];
 if(!original||String(original.user_id)!==input.userId)throw new Error("MESSAGE_NOT_FOUND");
 if(original.status!=="failed"||original.campaign_id||original.verification_session_id)throw new Error("MESSAGE_NOT_RETRYABLE");
 const payload=JSON.parse(decrypt(original.payload_encrypted)) as JobPayload;
 const content=payload.channel==="sms"?payload.input.content:(payload.input.html||payload.input.text||"");
 return enqueueAurelinkMessage({userId:input.userId,workspaceId:input.workspaceId,channel:original.channel,category:original.category,provider:payload.provider,recipient:original.recipient,sender:original.sender||"",subject:original.subject||undefined,content,idempotencyKey:input.idempotencyKey,payload});
}

let timer:ReturnType<typeof setInterval>|undefined;let busy=false;
async function finalizeCampaign(messageId:string){
 await pool.query("UPDATE aurelink_campaigns c SET status=CASE WHEN EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(m.recipient) m.recipient,j.status FROM aurelink_messages m JOIN aurelink_communications_jobs j ON j.message_id=m.id WHERE m.campaign_id=c.id ORDER BY m.recipient,m.created_at DESC) latest WHERE latest.status='failed') THEN 'paused' ELSE 'completed' END,completed_at=NOW(),updated_at=NOW() WHERE c.id=(SELECT campaign_id FROM aurelink_messages WHERE id=$1) AND NOT EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(m.recipient) m.recipient,j.status FROM aurelink_messages m JOIN aurelink_communications_jobs j ON j.message_id=m.id WHERE m.campaign_id=c.id ORDER BY m.recipient,m.created_at DESC) latest WHERE latest.status IN ('pending','processing'))",[messageId]);
}
async function refundCommunicationCharge(messageId:string){
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const charge=await client.query("SELECT m.workspace_id,w.user_id FROM aurelink_messages m JOIN aurelink_communications_workspaces w ON w.id=m.workspace_id WHERE m.id=$1 FOR UPDATE OF m",[messageId]);
  const row=charge.rows[0];
  if(row) await refundAurelinkUsage(client,messageId,String(row.user_id),String(row.workspace_id));
  await client.query("COMMIT");
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);console.error("[Aurelink communications refund]",error instanceof Error?error.message:"unknown error");}
 finally{client.release();}
}
async function processOne(row:any){
 try{
  const payload=JSON.parse(decrypt(row.payload_encrypted)) as JobPayload;
  let result:any;
  if(payload.channel==="sms"){
    try{result=await sendAurelinkSms(payload.provider,payload.input);}
    catch(primaryError){const fallback=process.env.AURELINK_SMS_FALLBACK_PROVIDER;if((fallback!=="brevo"&&fallback!=="twilio")||fallback===payload.provider)throw primaryError;result=await sendAurelinkSms(fallback,payload.input);}
  }else{
    try{result=await sendAurelinkEmail(payload.provider,payload.input);}
    catch(primaryError){
      const fallback=process.env.AURELINK_EMAIL_FALLBACK_PROVIDER;
      if((fallback!=="resend"&&fallback!=="brevo")||fallback===payload.provider)throw primaryError;
      const sender=await pool.query(
        "SELECT s.email,s.sender_name,s.domain FROM aurelink_email_senders s JOIN aurelink_email_domains d ON d.workspace_id=s.workspace_id AND d.provider=s.provider AND LOWER(d.domain)=LOWER(s.domain) AND d.status='verified' WHERE s.workspace_id=$1 AND s.provider=$2 AND s.status='verified' ORDER BY CASE WHEN LOWER(SPLIT_PART(s.email,'@',1))=LOWER(SPLIT_PART($3,'@',1)) THEN 0 ELSE 1 END,s.created_at ASC LIMIT 1",
        [row.workspace_id,fallback,payload.input.sender]
      );
      if(!sender.rows[0]?.email)throw new Error("No verified "+fallback+" fallback sender and authenticated domain are configured for this Aurelink workspace.");
      const fallbackInput={...payload.input,sender:String(sender.rows[0].email),senderName:String(sender.rows[0].sender_name||payload.input.senderName||"Aurelink"),replyTo:payload.input.replyTo||payload.input.sender};
      result=await sendAurelinkEmail(fallback,fallbackInput);
    }
  }
  await pool.query("UPDATE aurelink_messages SET provider=$2,provider_message_id=$3,status='accepted',accepted_at=NOW(),updated_at=NOW() WHERE id=$1",[row.message_id,result.provider,result.providerMessageId]);
  await pool.query("UPDATE aurelink_communications_jobs SET status='completed',completed_at=NOW(),last_error=NULL,updated_at=NOW() WHERE id=$1",[row.id]);
  await pool.query("UPDATE aurelink_communications_usage SET provider=$2,status='accepted',provider_message_id=$3,updated_at=NOW() WHERE message_id=$1",[row.message_id,result.provider,result.providerMessageId]);
  const billingClient=await pool.connect();
  try { await billingClient.query("BEGIN"); await captureAurelinkUsage(billingClient,String(row.message_id)); await billingClient.query("COMMIT"); }
  catch(error) { await billingClient.query("ROLLBACK").catch(()=>undefined); console.error("[Aurelink usage capture]",error instanceof Error?error.message:"unknown error"); }
  finally { billingClient.release(); }
  await pool.query("UPDATE aurelink_verification_sessions SET provider_message_id=$2,updated_at=NOW() WHERE id=(SELECT verification_session_id FROM aurelink_messages WHERE id=$1)",[row.message_id,result.providerMessageId]);
  await finalizeCampaign(row.message_id);
 }catch(error){
  const attempts=Number(row.attempts),failed=attempts>=8,delay=Math.min(3600,30*Math.pow(2,attempts-1)),message=error instanceof Error?error.message:"Provider delivery failed.";
  await pool.query("UPDATE aurelink_communications_jobs SET status=$2,attempts=$3,next_attempt_at=NOW()+($4 * INTERVAL '1 second'),last_error=$5,updated_at=NOW() WHERE id=$1",[row.id,failed?"failed":"pending",attempts,delay,message.slice(0,500)]);
  await pool.query("UPDATE aurelink_messages SET status=$2,provider_error=$3,updated_at=NOW() WHERE id=$1",[row.message_id,failed?"failed":"queued",message.slice(0,500)]);
  await pool.query("UPDATE aurelink_communications_usage SET status=$2,updated_at=NOW() WHERE message_id=$1",[row.message_id,failed?"failed":"queued"]);
  if(failed){await refundCommunicationCharge(String(row.message_id));await pool.query("UPDATE aurelink_verification_sessions SET status='cancelled',updated_at=NOW() WHERE id=(SELECT verification_session_id FROM aurelink_messages WHERE id=$1 AND verification_session_id IS NOT NULL)",[row.message_id]);await finalizeCampaign(row.message_id);}
 }
}
async function tick(){
 if(busy)return;busy=true;
 try{
  const batch=await pool.query(`WITH due AS (SELECT id FROM aurelink_communications_jobs WHERE status='pending' AND next_attempt_at<=NOW() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 10) UPDATE aurelink_communications_jobs j SET status='processing',attempts=attempts+1,locked_at=NOW(),updated_at=NOW() FROM due WHERE j.id=due.id RETURNING j.*`);
  for(const row of batch.rows)await processOne(row);
  await pool.query("UPDATE aurelink_communications_jobs SET status='pending',locked_at=NULL,next_attempt_at=NOW()+INTERVAL '30 seconds',updated_at=NOW() WHERE status='processing' AND locked_at<NOW()-INTERVAL '5 minutes'");
  const refunds=await pool.query("SELECT u.message_id FROM aurelink_communications_usage u JOIN aurelink_communications_jobs j ON j.message_id=u.message_id AND j.status='failed' JOIN aurelink_communications_billing_ledger b ON b.message_id=u.message_id AND b.entry_type='charge' AND b.status IN ('reserved','posted') WHERE u.status='failed' AND NOT EXISTS(SELECT 1 FROM aurelink_communications_billing_ledger r WHERE r.message_id=u.message_id AND r.entry_type='refund') ORDER BY u.updated_at LIMIT 20");
  for(const item of refunds.rows)await refundCommunicationCharge(String(item.message_id));
 }catch(error){console.error("[Aurelink communications worker]",error instanceof Error?error.message:"unknown error");}
 finally{busy=false;}
}
export function startAurelinkCommunicationsWorker(){if(timer)return;timer=setInterval(()=>void tick(),2000);void tick();}
export function stopAurelinkCommunicationsWorker(){if(timer)clearInterval(timer);timer=undefined;}

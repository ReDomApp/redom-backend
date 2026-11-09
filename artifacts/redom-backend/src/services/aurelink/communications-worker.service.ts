import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { pool } from "../../database/db";
import { sendAurelinkEmail, sendAurelinkSms } from "./communications-providers.service";

type JobPayload =
  | { channel:"sms"; provider:"brevo"|"twilio"; category:"transactional"|"marketing"|"otp"|"notification"; input:{recipient:string;sender:string;content:string;category:"transactional"|"marketing"|"otp"|"notification";tag?:string;webUrl?:string} }
  | { channel:"email"; provider:"resend"|"brevo"; category:"transactional"|"notification"; input:{recipient:string;sender:string;senderName?:string;subject:string;html?:string;text?:string;replyTo?:string;tags?:string[]} };

function key(){const source=process.env.AURELINK_COMMUNICATIONS_ENCRYPTION_KEY||process.env.JWT_ACCESS_SECRET;if(!source||source.length<32)throw new Error("Set AURELINK_COMMUNICATIONS_ENCRYPTION_KEY (32+ characters) or JWT_ACCESS_SECRET before enabling communications delivery.");return createHash("sha256").update(source).update("|aurelink-communications-v1").digest();}
function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv),body=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),body.toString("base64url")].join(".");}
function decrypt(value:string){const [iv,tag,body]=value.split(".");if(!iv||!tag||!body)throw new Error("Communications job payload is corrupt.");const decipher=createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64url"));decipher.setAuthTag(Buffer.from(tag,"base64url"));return Buffer.concat([decipher.update(Buffer.from(body,"base64url")),decipher.final()]).toString("utf8");}

export async function enqueueAurelinkMessage(input:{
 userId:string;workspaceId:string;channel:"sms"|"email";category:string;provider:string;recipient:string;sender:string;subject?:string;content:string;idempotencyKey:string;payload:JobPayload;
}){
 const payloadHash=createHash("sha256").update(JSON.stringify(input.payload)).digest("hex");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const inserted=await client.query(
   "INSERT INTO aurelink_messages(workspace_id,channel,category,provider,recipient,sender,subject,content_hash,idempotency_key,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued') ON CONFLICT(workspace_id,idempotency_key) DO NOTHING RETURNING id,channel,category,provider,recipient,status,created_at",
   [input.workspaceId,input.channel,input.category,input.provider,input.recipient,input.sender,input.subject||null,createHash("sha256").update(input.content).digest("hex"),input.idempotencyKey]
  );
  if(!inserted.rows.length){
   const existing=await client.query("SELECT id,channel,category,provider,recipient,status,created_at,content_hash FROM aurelink_messages WHERE workspace_id=$1 AND idempotency_key=$2 FOR UPDATE",[input.workspaceId,input.idempotencyKey]);
   const row=existing.rows[0];
   if(!row||row.content_hash!==createHash("sha256").update(input.content).digest("hex")){await client.query("ROLLBACK");return {conflict:true as const};}
   await client.query("COMMIT");
   return {message:row,replayed:true as const};
  }
  const message=inserted.rows[0];
  await client.query("INSERT INTO aurelink_communications_jobs(message_id,workspace_id,payload_encrypted,payload_hash) VALUES($1,$2,$3,$4)",[message.id,input.workspaceId,encrypt(JSON.stringify(input.payload)),payloadHash]);
  await client.query("INSERT INTO aurelink_communications_usage(workspace_id,message_id,channel,provider,category,units,status) VALUES($1,$2,$3,$4,$5,1,'queued')",[input.workspaceId,message.id,input.channel,input.provider,input.category]);
  await client.query("COMMIT");
  return {message,replayed:false as const};
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
}

let timer:ReturnType<typeof setInterval>|undefined;let busy=false;
async function processOne(row:any){
 const payload=JSON.parse(decrypt(row.payload_encrypted)) as JobPayload;
 try{
  const result=payload.channel==="sms"?await sendAurelinkSms(payload.provider as "brevo"|"twilio",payload.input as Extract<JobPayload,{channel:"sms"}>["input"]):await sendAurelinkEmail(payload.provider as "resend"|"brevo",payload.input as Extract<JobPayload,{channel:"email"}>["input"]);
  await pool.query("UPDATE aurelink_messages SET provider_message_id=$2,status='accepted',accepted_at=NOW(),updated_at=NOW() WHERE id=$1",[row.message_id,result.providerMessageId]);
  await pool.query("UPDATE aurelink_communications_jobs SET status='completed',completed_at=NOW(),last_error=NULL,updated_at=NOW() WHERE id=$1",[row.id]);
  await pool.query("UPDATE aurelink_communications_usage SET status='accepted',provider_message_id=$2,updated_at=NOW() WHERE message_id=$1",[row.message_id,result.providerMessageId]);
 }catch(error){
  const attempts=Number(row.attempts),failed=attempts>=8,delay=Math.min(3600,30*Math.pow(2,attempts-1)),message=error instanceof Error?error.message:"Provider delivery failed.";
  await pool.query("UPDATE aurelink_communications_jobs SET status=$2,attempts=$3,next_attempt_at=NOW()+($4 * INTERVAL '1 second'),last_error=$5,updated_at=NOW() WHERE id=$1",[row.id,failed?"failed":"pending",attempts,delay,message.slice(0,500)]);
  await pool.query("UPDATE aurelink_messages SET status=$2,provider_error=$3,updated_at=NOW() WHERE id=$1",[row.message_id,failed?"failed":"queued",message.slice(0,500)]);
  await pool.query("UPDATE aurelink_communications_usage SET status=$2,updated_at=NOW() WHERE message_id=$1",[row.message_id,failed?"failed":"queued"]);
 }
}
async function tick(){
 if(busy)return;busy=true;
 try{
  const batch=await pool.query(`WITH due AS (SELECT id FROM aurelink_communications_jobs WHERE status='pending' AND next_attempt_at<=NOW() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 10) UPDATE aurelink_communications_jobs j SET status='processing',attempts=attempts+1,locked_at=NOW(),updated_at=NOW() FROM due WHERE j.id=due.id RETURNING j.*`);
  for(const row of batch.rows)await processOne(row);
  await pool.query("UPDATE aurelink_communications_jobs SET status='pending',locked_at=NULL,next_attempt_at=NOW()+INTERVAL '30 seconds',updated_at=NOW() WHERE status='processing' AND locked_at<NOW()-INTERVAL '5 minutes'");
 }catch(error){console.error("[Aurelink communications worker]",error instanceof Error?error.message:"unknown error");}
 finally{busy=false;}
}
export function startAurelinkCommunicationsWorker(){if(timer)return;timer=setInterval(()=>void tick(),2000);void tick();}
export function stopAurelinkCommunicationsWorker(){if(timer)clearInterval(timer);timer=undefined;}

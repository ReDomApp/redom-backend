import { createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "../../database/db";
import { emitAurelinkWebhookEvent } from "./developer-platform.service";

/** Verify a Resend/Svix webhook using the raw request body and signed headers. */
export function verifyAurelinkResendWebhook(raw:Buffer, id:string, timestamp:string, signature:string, secret:string):boolean {
  const seconds=Number(timestamp);
  if(!id||!Number.isFinite(seconds)||Math.abs(Date.now()/1000-seconds)>300)return false;
  const key=secret.startsWith("whsec_")?Buffer.from(secret.slice(6),"base64"):Buffer.from(secret);
  const expected=createHmac("sha256",key).update(id+"."+timestamp+"."+raw.toString("utf8")).digest("base64");
  return signature.split(" ").some(part=>{
    const pieces=part.split(",");
    if(pieces.length!==2||pieces[0]!=="v1")return false;
    const supplied=Buffer.from(pieces[1]),calculated=Buffer.from(expected);
    return supplied.length===calculated.length&&timingSafeEqual(supplied,calculated);
  });
}

export function mapAurelinkResendEvent(eventType:string):string|null {
  const map:Record<string,string>={
    "email.sent":"sent",
    "email.delivered":"delivered",
    "email.delivery_delayed":"deferred",
    "email.bounced":"bounced",
    "email.failed":"failed",
    "email.complained":"complained",
    "email.suppressed":"rejected"
  };
  return map[eventType]??null;
}
export function mapAurelinkTwilioStatus(status:string):string|null {
  const map:Record<string,string>={accepted:"accepted",queued:"accepted",sending:"sent",sent:"sent",delivered:"delivered",undelivered:"failed",failed:"failed"};
  return map[status.toLowerCase()]??null;
}

export async function updateAurelinkMessageStatus(input:{
  provider:string;providerMessageId:string;status:string;providerStatus?:string;providerError?:string;deliveredAt?:Date;
}):Promise<void>{
  const allowed=new Set(["accepted","sent","delivered","deferred","bounced","failed","rejected","complained","unsubscribed"]);
  if(!allowed.has(input.status))return;
  const updated=await pool.query(
    "UPDATE aurelink_messages SET status=$3,provider_status=$4,provider_error=$5,delivered_at=COALESCE($6,delivered_at),updated_at=NOW() WHERE provider=$1 AND provider_message_id=$2 RETURNING id,workspace_id,channel,category,recipient",
    [input.provider,input.providerMessageId,input.status,input.providerStatus??null,input.providerError?.slice(0,500)??null,input.deliveredAt??null],
  );
  for(const row of updated.rows){
    await pool.query("UPDATE aurelink_communications_usage SET status=$2,updated_at=NOW() WHERE message_id=$1",[row.id,input.status==="delivered"?"delivered":input.status==="failed"||input.status==="bounced"||input.status==="rejected"?"failed":"accepted"]).catch(()=>undefined);
    const channel=String(row.channel)==="sms"?"sms":"email";
    const suffix=input.status==="delivered"?"delivered":input.status==="failed"||input.status==="bounced"||input.status==="rejected"?"failed":input.status;
    await emitAurelinkWebhookEventFromWorkspace(String(row.workspace_id),channel+"."+suffix,{messageId:row.id,providerMessageId:input.providerMessageId,recipient:row.recipient,status:input.status,provider:input.provider});
  }
}
async function emitAurelinkWebhookEventFromWorkspace(workspaceId:string,eventType:string,data:Record<string,unknown>){
  const owner=await pool.query("SELECT user_id FROM aurelink_communications_workspaces WHERE id=$1",[workspaceId]);
  if(owner.rows[0]?.user_id)await emitAurelinkWebhookEvent(String(owner.rows[0].user_id),eventType,data);
}

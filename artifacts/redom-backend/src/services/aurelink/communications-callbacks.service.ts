import { pool } from "../../database/db";
import { emitAurelinkWebhookEvent } from "./developer-platform.service";

export { verifyAurelinkResendWebhook, mapAurelinkResendEvent, mapAurelinkTwilioStatus } from "./communications-webhooks.utils";
import { verifyAurelinkResendWebhook, mapAurelinkResendEvent, mapAurelinkTwilioStatus } from "./communications-webhooks.utils";

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
    if(String(row.channel)==="email"&&(input.status==="bounced"||input.status==="complained"||input.status==="unsubscribed")){
      const reason=input.status==="bounced"?"hard_bounce":input.status==="complained"?"spam_complaint":"unsubscribe";
      await pool.query("INSERT INTO aurelink_email_suppressions(workspace_id,email,reason,source_provider) VALUES($1,LOWER($2),$3,$4) ON CONFLICT(workspace_id,email) DO NOTHING",[row.workspace_id,row.recipient,reason,input.provider]);
    }
    await pool.query("UPDATE aurelink_communications_usage SET status=$2,updated_at=NOW() WHERE message_id=$1",[row.id,input.status==="delivered"?"delivered":input.status==="failed"||input.status==="bounced"||input.status==="rejected"?"failed":"accepted"]).catch(()=>undefined);
    const channel=String(row.channel)==="sms"?"sms":"email";
    const suffix=input.status==="delivered"?"delivered":input.status==="accepted"||input.status==="sent"||input.status==="deferred"?"accepted":channel==="email"&&input.status==="bounced"?"bounced":channel==="email"&&input.status==="complained"?"complained":channel==="email"&&input.status==="unsubscribed"?"unsubscribed":"failed";
    await emitAurelinkWebhookEventFromWorkspace(String(row.workspace_id),channel+"."+suffix,{messageId:row.id,providerMessageId:input.providerMessageId,recipient:row.recipient,status:input.status,provider:input.provider});
  }
}
async function emitAurelinkWebhookEventFromWorkspace(workspaceId:string,eventType:string,data:Record<string,unknown>){
  const owner=await pool.query("SELECT user_id FROM aurelink_communications_workspaces WHERE id=$1",[workspaceId]);
  if(owner.rows[0]?.user_id)await emitAurelinkWebhookEvent(String(owner.rows[0].user_id),eventType,data);
}

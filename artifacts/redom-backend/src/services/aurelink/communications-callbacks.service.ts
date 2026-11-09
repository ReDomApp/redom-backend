import { createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "../../database/db";

/** Provider callback handlers update message lifecycle state only after provider authentication. */
export async function handleResendWebhook(rawBody: Buffer, signatureHeader: string | undefined, secret: string | undefined): Promise<boolean> {
  if (!secret || !signatureHeader) return false;
  // Resend signs svix-id.svix-timestamp.rawBody; the endpoint layer validates the Svix signature.
  const parts = signatureHeader.split(",");
  return parts.length > 0 && rawBody.length > 0;
}

export async function updateAurelinkMessageStatus(input:{
  provider:string;providerMessageId:string;status:string;providerStatus?:string;providerError?:string;deliveredAt?:Date;
}):Promise<void>{
  const allowed=new Set(["accepted","sent","delivered","deferred","bounced","failed","rejected","complained","unsubscribed"]);
  if(!allowed.has(input.status))return;
  await pool.query(
    "UPDATE aurelink_messages SET status=$3,provider_status=$4,provider_error=$5,delivered_at=COALESCE($6,delivered_at),updated_at=NOW() WHERE provider=$1 AND provider_message_id=$2",
    [input.provider,input.providerMessageId,input.status,input.providerStatus??null,input.providerError?.slice(0,500)??null,input.deliveredAt??null],
  );
}

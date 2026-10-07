import { createHmac, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import { newId } from "./store.js";

export async function emitEvent(pool: Pool, messageId: string, type: string, data: unknown): Promise<void> {
  const eventId = newId("evt");
  await pool.query(
    "INSERT INTO redom_mail_events (id,message_id,type,payload) VALUES ($1,$2,$3,$4)",
    [eventId, messageId, type, JSON.stringify({ type, created_at: new Date().toISOString(), data })],
  );

  const hooks = await pool.query(
    "SELECT * FROM redom_mail_webhooks WHERE enabled=true AND events @> $1::jsonb",
    [JSON.stringify([type])],
  );
  for (const hook of hooks.rows) {
    await pool.query(
      "INSERT INTO redom_mail_webhook_deliveries (id,webhook_id,event_id) VALUES ($1,$2,$3)",
      [newId("whd"), hook.id, eventId],
    );
  }
}

export function signWebhook(payload: string, secret: string, timestamp: string): string {
  return createHmac("sha256", secret).update(timestamp + "." + payload).digest("hex");
}

export function verifyWebhookSignature(payload: string, secret: string, timestamp: string, signature: string): boolean {
  const expected = signWebhook(payload, secret, timestamp);
  return expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

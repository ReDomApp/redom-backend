import { Pool } from "pg";
import { signWebhook } from "./webhooks.js";

export function startWebhookWorker(pool: Pool): void {
  setInterval(async () => {
    const rows = await pool.query(`
      SELECT d.*, w.endpoint, w.signing_secret, e.payload
      FROM redom_mail_webhook_deliveries d
      JOIN redom_mail_webhooks w ON w.id=d.webhook_id
      JOIN redom_mail_events e ON e.id=d.event_id
      WHERE d.status='pending' AND d.next_attempt_at <= NOW()
      ORDER BY d.next_attempt_at
      LIMIT 20
    `);

    for (const row of rows.rows) {
      const body = JSON.stringify(row.payload);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signWebhook(body, row.signing_secret, timestamp);
      try {
        const response = await fetch(row.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-redom-signature": signature,
            "x-redom-timestamp": timestamp,
            "user-agent": "ReDom-Mail-Webhook/1.0",
          },
          body,
          signal: AbortSignal.timeout(15000),
        });
        if (response.ok) {
          await pool.query(
            "UPDATE redom_mail_webhook_deliveries SET status='delivered',delivered_at=NOW(),attempts=attempts+1,last_status_code=$2 WHERE id=$1",
            [row.id, response.status],
          );
        } else {
          throw new Error("HTTP " + response.status);
        }
      } catch (error) {
        const attempts = Number(row.attempts) + 1;
        if (attempts >= 10) {
          await pool.query(
            "UPDATE redom_mail_webhook_deliveries SET status='failed',attempts=$2,last_error=$3 WHERE id=$1",
            [row.id, attempts, error instanceof Error ? error.message : String(error)],
          );
        } else {
          const delay = Math.min(3600, 2 ** attempts * 5);
          await pool.query(
            "UPDATE redom_mail_webhook_deliveries SET attempts=$2,next_attempt_at=NOW()+($3 * INTERVAL '1 second'),last_error=$4 WHERE id=$1",
            [row.id, attempts, delay, error instanceof Error ? error.message : String(error)],
          );
        }
      }
    }
  }, 1000);
}

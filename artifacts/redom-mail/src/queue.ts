import pg from "pg";
import type { NormalizedMessage } from "./types.js";
import { deliverDirect } from "./smtp.js";

const { Pool } = pg;

type QueueConfig = Parameters<typeof deliverDirect>[1] & {
  databaseUrl: string;
  retryLimit: number;
  retryBaseMs: number;
};

export class MailQueue {
  private readonly pool: pg.Pool;
  private running = false;

  constructor(private readonly config: QueueConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl, max: 5 });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS redom_mail_queue (
        id TEXT PRIMARY KEY,
        message JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS redom_mail_queue_ready_idx
        ON redom_mail_queue (status, available_at);
    `);
  }

  async enqueue(message: NormalizedMessage): Promise<void> {
    await this.pool.query(
      `INSERT INTO redom_mail_queue (id, message) VALUES ($1, $2::jsonb)`,
      [message.id, JSON.stringify(message)],
    );
    void this.drain();
  }

  async size(): Promise<number> {
    const result = await this.pool.query(
      "SELECT COUNT(*)::int AS count FROM redom_mail_queue WHERE status IN ('queued','processing')",
    );
    return result.rows[0].count;
  }

  start(): void {
    void this.drain();
    setInterval(() => void this.drain(), 1000);
  }

  private async claim(): Promise<NormalizedMessage | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(`
        SELECT id, message, attempts
        FROM redom_mail_queue
        WHERE status = 'queued'
          AND available_at <= NOW()
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      if (!result.rowCount) {
        await client.query("COMMIT");
        return null;
      }
      const row = result.rows[0];
      await client.query(
        `UPDATE redom_mail_queue
         SET status = 'processing', attempts = attempts + 1, locked_at = NOW()
         WHERE id = $1`,
        [row.id],
      );
      await client.query("COMMIT");
      return { ...(row.message as NormalizedMessage), attempt: row.attempts + 1 };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (true) {
        const message = await this.claim();
        if (!message) break;

        try {
          const result = await deliverDirect(message, this.config);
          if (result.retryable && message.attempt < this.config.retryLimit) {
            const delay = this.config.retryBaseMs * Math.pow(2, message.attempt - 1);
            await this.pool.query(
              `UPDATE redom_mail_queue
               SET status = 'queued', available_at = NOW() + ($2 || ' milliseconds')::interval,
                   last_error = $3
               WHERE id = $1`,
              [message.id, delay, result.response],
            );
          } else if (result.retryable) {
            await this.pool.query(
              `UPDATE redom_mail_queue SET status = 'failed', last_error = $2 WHERE id = $1`,
              [message.id, result.response],
            );
          } else {
            await this.pool.query(
              `UPDATE redom_mail_queue SET status = 'delivered', delivered_at = NOW() WHERE id = $1`,
              [message.id],
            );
          }
        } catch (error) {
          const messageText = error instanceof Error ? error.message : String(error);
          await this.pool.query(
            `UPDATE redom_mail_queue
             SET status = CASE WHEN attempts >= $2 THEN 'failed' ELSE 'queued' END,
                 available_at = NOW() + INTERVAL '30 seconds',
                 last_error = $3
             WHERE id = $1`,
            [message.id, this.config.retryLimit, messageText],
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}

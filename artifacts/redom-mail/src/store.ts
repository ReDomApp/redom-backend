import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import type { NormalizedMessage } from "./types.js";

export type AttachmentInput = {
  filename: string;
  contentType: string;
  contentDisposition?: string;
  contentId?: string;
  content: Buffer;
};

export type StoredMessage = NormalizedMessage & {
  direction: "outbound" | "inbound";
  status: string;
};

export function newId(prefix: string): string {
  return prefix + "_" + Date.now().toString(36) + "_" + randomBytes(8).toString("hex");
}

export class MailStore {
  constructor(readonly pool: Pool) {}

  async saveMessage(
    message: NormalizedMessage,
    direction: "outbound" | "inbound",
    status: string,
    attachments: AttachmentInput[] = [],
    idempotencyKey?: string,
    scheduledAt?: Date,
  ): Promise<{ message: StoredMessage; created: boolean }> {
    if (idempotencyKey) {
      const existing = await this.pool.query(
        "SELECT * FROM redom_mail_messages WHERE idempotency_key=$1 LIMIT 1",
        [idempotencyKey],
      );
      if (existing.rowCount) return { message: this.rowToMessage(existing.rows[0]), created: false };
    }

    const result = await this.pool.query(
      `INSERT INTO redom_mail_messages
       (id,direction,status,from_address,to_addresses,cc_addresses,bcc_addresses,reply_to,subject,text_body,html_body,headers,message_id,idempotency_key,scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        message.id, direction, status, message.from.email,
        JSON.stringify(message.recipients.map((x) => x.email)), JSON.stringify((message.cc ?? []).map((x) => x.email)), JSON.stringify((message.bcc ?? []).map((x) => x.email)),
        JSON.stringify(message.replyTo ?? []), message.subject, message.text ?? null, message.html ?? null,
        JSON.stringify(message.headers), message.headers["Message-ID"] ?? null,
        idempotencyKey ?? null, scheduledAt ?? null,
      ],
    );

    for (const attachment of attachments) {
      await this.pool.query(
        `INSERT INTO redom_mail_attachments
         (id,message_id,filename,content_type,content_disposition,content_id,size_bytes,content)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          newId("att"), message.id, attachment.filename, attachment.contentType,
          attachment.contentDisposition ?? null, attachment.contentId ?? null,
          attachment.content.length, attachment.content,
        ],
      );
    }

    return { message: this.rowToMessage(result.rows[0]), created: true };
  }

  async enqueue(messageId: string, availableAt: Date = new Date()): Promise<void> {
    await this.pool.query(
      "INSERT INTO redom_mail_queue (id,message_id,available_at) VALUES ($1,$2,$3)",
      [newId("job"), messageId, availableAt],
    );
  }

  async getMessage(id: string): Promise<StoredMessage | null> {
    const result = await this.pool.query("SELECT * FROM redom_mail_messages WHERE id=$1", [id]);
    return result.rowCount ? this.rowToMessage(result.rows[0]) : null;
  }

  async listMessages(limit = 50, direction?: string): Promise<StoredMessage[]> {
    const result = direction
      ? await this.pool.query(
          "SELECT * FROM redom_mail_messages WHERE direction=$1 ORDER BY created_at DESC LIMIT $2",
          [direction, Math.min(limit, 100)],
        )
      : await this.pool.query(
          "SELECT * FROM redom_mail_messages ORDER BY created_at DESC LIMIT $1",
          [Math.min(limit, 100)],
        );
    return result.rows.map((row) => this.rowToMessage(row));
  }

  async listAttachments(messageId: string): Promise<Array<Record<string, unknown>>> {
    const result = await this.pool.query(
      "SELECT id,filename,content_type,content_disposition,content_id,size_bytes,created_at FROM redom_mail_attachments WHERE message_id=$1 ORDER BY created_at",
      [messageId],
    );
    return result.rows;
  }

  async getAttachment(id: string): Promise<{ filename: string; contentType: string; content: Buffer } | null> {
    const result = await this.pool.query(
      "SELECT filename,content_type,content FROM redom_mail_attachments WHERE id=$1",
      [id],
    );
    if (!result.rowCount) return null;
    return {
      filename: result.rows[0].filename,
      contentType: result.rows[0].content_type,
      content: result.rows[0].content,
    };
  }

  async updateStatus(messageId: string, status: string, error?: string): Promise<void> {
    await this.pool.query(
      "UPDATE redom_mail_messages SET status=$2,last_error=$3,delivered_at=CASE WHEN $2='delivered' THEN NOW() ELSE delivered_at END,updated_at=NOW() WHERE id=$1",
      [messageId, status, error ?? null],
    );
  }

  private rowToMessage(row: any): StoredMessage {
    return {
      id: row.id,
      direction: row.direction,
      status: row.status,
      from: { email: row.from_address },
      recipients: (row.to_addresses as string[]).map((email) => ({ email })),
      cc: (row.cc_addresses as string[]).map((email) => ({ email })),
      bcc: (row.bcc_addresses as string[]).map((email) => ({ email })),
      replyTo: (row.reply_to ?? []).map((email: string) => ({ email })),
      subject: row.subject,
      text: row.text_body ?? undefined,
      html: row.html_body ?? undefined,
      headers: row.headers ?? {},
      createdAt: new Date(row.created_at).toISOString(),
      attempt: 0,
    };
  }
}

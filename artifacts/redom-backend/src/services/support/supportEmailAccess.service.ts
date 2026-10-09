import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env";
import { pool } from "../../database/db";

const encryptionKey = createHash("sha256").update(env.authentication.sessionSecret).digest();
function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decryptToken(value: string): string {
  const [iv, tag, encrypted] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function hashSupportAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SupportEmailAccessGrant = {
  token: string;
  expiresAt: Date;
};

/**
 * Creates or reuses an active grant for the same case, recipient and purpose.
 * Expired grants are marked before lookup. Row-level locking plus a partial
 * unique index in the migration prevents concurrent duplicate active grants.
 */
export async function createOrReuseSupportEmailAccessGrant(input: {
  caseId: string;
  recipientEmail: string;
  purpose?: string;
}): Promise<SupportEmailAccessGrant> {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  const purpose = input.purpose ?? "view_case";
  if (!recipientEmail || recipientEmail.length > 255) throw new Error("A valid support-email recipient is required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE support_email_access_grants SET status='expired' WHERE status='active' AND expires_at <= now()",
    );
    const existing = await client.query(
      `SELECT token_ciphertext, expires_at FROM support_email_access_grants
       WHERE case_id=$1 AND lower(recipient_email)=lower($2) AND purpose=$3
         AND status='active' AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [input.caseId, recipientEmail, purpose],
    );
    if (existing.rows[0]) {
      const token = decryptToken(String(existing.rows[0].token_ciphertext));
      const expiresAt = new Date(existing.rows[0].expires_at);
      await client.query("COMMIT");
      return { token, expiresAt };
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO support_email_access_grants
       (case_id, recipient_email, purpose, token_hash, token_ciphertext, status, expires_at)
       VALUES ($1,$2,$3,$4,$5,'active',$6)`,
      [input.caseId, recipientEmail, purpose, hashSupportAccessToken(token), encryptToken(token), expiresAt],
    );
    await client.query("COMMIT");
    return { token, expiresAt };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Verify the token without consuming it; email challenge must succeed first. */
export async function getSupportEmailGrantForVerification(token: string): Promise<{
  id: string; caseId: string; recipientEmail: string; purpose: string; expiresAt: Date;
} | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const result = await pool.query(
    `UPDATE support_email_access_grants SET status='expired'
     WHERE token_hash=$1 AND status='active' AND expires_at <= now()`,
    [hashSupportAccessToken(token)],
  );
  const grant = await pool.query(
    `SELECT id, case_id, recipient_email, purpose, expires_at
     FROM support_email_access_grants
     WHERE token_hash=$1 AND status='active' AND consumed_at IS NULL
       AND revoked_at IS NULL AND expires_at > now() LIMIT 1`,
    [hashSupportAccessToken(token)],
  );
  if (!grant.rows[0]) return null;
  return {
    id: String(grant.rows[0].id),
    caseId: String(grant.rows[0].case_id),
    recipientEmail: String(grant.rows[0].recipient_email),
    purpose: String(grant.rows[0].purpose),
    expiresAt: new Date(grant.rows[0].expires_at),
  };
}

/** Atomic single-use consumption. Call only after recipient verification succeeds. */
export async function consumeSupportEmailGrant(grantId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE support_email_access_grants SET status='consumed', consumed_at=now()
     WHERE id=$1 AND status='active' AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now()
     RETURNING id`,
    [grantId],
  );
  return result.rowCount === 1;
}

export async function revokeSupportEmailGrantsForCase(caseId: string): Promise<void> {
  await pool.query(
    `UPDATE support_email_access_grants SET status='revoked', revoked_at=now()
     WHERE case_id=$1 AND status='active'`,
    [caseId],
  );
}

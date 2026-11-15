import { randomBytes, randomInt, createHash } from "node:crypto";
import { pool } from "../database/db";
import { resend } from "../lib/resend";

export type CredentialVerificationPurpose = "api_key_create" | "api_key_rotate" | "smtp_credential_create" | "smtp_credential_rotate";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
let schemaReady: Promise<void> | null = null;

async function ensureSchema() {
  if (!schemaReady) schemaReady = pool.query(`
    CREATE TABLE IF NOT EXISTS aurelink_credential_email_challenges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,
      purpose VARCHAR(48) NOT NULL,
      code_hash CHAR(64) NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      grant_hash CHAR(64),
      grant_expires_at TIMESTAMPTZ,
      grant_consumed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS aurelink_credential_email_challenges_user_created_idx
      ON aurelink_credential_email_challenges(user_id, created_at DESC);
  `).then(() => undefined).catch(error => { schemaReady = null; throw error; });
  return schemaReady;
}

export async function requestCredentialEmailCode(userId: string, purpose: CredentialVerificationPurpose) {
  await ensureSchema();
  const client = await pool.connect();
  let email = "";
  let code = "";
  let challengeId = "";
  try {
    await client.query("BEGIN");
    const user = (await client.query("SELECT email,email_verified FROM aurelink_users WHERE id=$1 FOR UPDATE", [userId])).rows[0];
    if (!user?.email || !user.email_verified) throw new Error("Verify your Aurelink account email before generating credentials.");
    const recent = (await client.query("SELECT COUNT(*)::int AS count, MAX(created_at) AS latest FROM aurelink_credential_email_challenges WHERE user_id=$1 AND created_at>NOW()-INTERVAL '1 hour'", [userId])).rows[0];
    if (Number(recent?.count || 0) >= 5) throw new Error("Too many verification emails. Try again in an hour.");
    if (recent?.latest && Date.now() - new Date(recent.latest).getTime() < 60_000) throw new Error("A verification code was sent recently. Wait one minute before requesting another.");
    await client.query("UPDATE aurelink_credential_email_challenges SET consumed_at=COALESCE(consumed_at,NOW()),grant_consumed_at=COALESCE(grant_consumed_at,NOW()) WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL", [userId, purpose]);
    code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const inserted = await client.query("INSERT INTO aurelink_credential_email_challenges(user_id,purpose,code_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '5 minutes') RETURNING id", [userId, purpose, hash(code)]);
    challengeId = String(inserted.rows[0].id);
    email = String(user.email);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
  const result = await resend.emails.send({
    from: process.env.AURELINK_EMAIL_FROM || "Aurelink <noreply@wnncompany.com>",
    to: email,
    subject: "Your Aurelink security verification code",
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#172a43"><h2>Verify this credential action</h2><p>Use this one-time code to continue generating or rotating an Aurelink credential.</p><div style="font-size:32px;letter-spacing:8px;font-weight:700;padding:18px 0">${code}</div><p>This code expires in five minutes. You have up to five attempts. If you did not request this, secure your account.</p><p style="color:#718096;font-size:12px">Aurelink Account Security</p></div>`,
  });
  if (result.error) {
    await pool.query("UPDATE aurelink_credential_email_challenges SET consumed_at=NOW() WHERE id=$1", [challengeId]);
    throw new Error("Aurelink could not send the verification email. Please try again.");
  }
  return { success: true, challengeId, expiresIn: 300, destination: email.replace(/^(.).+(@.*)$/, "$1••••$2") };
}

export async function verifyCredentialEmailCode(userId: string, purpose: CredentialVerificationPurpose, challengeId: string, code: string) {
  await ensureSchema();
  const client = await pool.connect();
  const grant = randomBytes(32).toString("base64url");
  try {
    await client.query("BEGIN");
    const row = (await client.query("SELECT id,code_hash,attempts FROM aurelink_credential_email_challenges WHERE id=$1 AND user_id=$2 AND purpose=$3 AND consumed_at IS NULL AND expires_at>NOW() AND attempts<5 FOR UPDATE", [challengeId, userId, purpose])).rows[0];
    if (!row) throw new Error("This verification code expired or is no longer valid. Request a new code.");
    if (!/^\d{6}$/.test(code) || hash(code) !== row.code_hash) {
      await client.query("UPDATE aurelink_credential_email_challenges SET attempts=attempts+1 WHERE id=$1", [row.id]);
      await client.query("COMMIT");
      throw new Error("The six-digit verification code is incorrect.");
    }
    await client.query("UPDATE aurelink_credential_email_challenges SET consumed_at=NOW(),grant_hash=$2,grant_expires_at=NOW()+INTERVAL '5 minutes' WHERE id=$1", [row.id, hash(grant)]);
    await client.query("COMMIT");
    return { success: true, verificationToken: grant, expiresIn: 300 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function consumeCredentialVerification(userId: string, purpose: CredentialVerificationPurpose, token: string) {
  await ensureSchema();
  if (!token || token.length > 256) throw new Error("Verify your email before creating or rotating this credential.");
  const result = await pool.query(
    "UPDATE aurelink_credential_email_challenges SET grant_consumed_at=NOW() WHERE user_id=$1 AND purpose=$2 AND grant_hash=$3 AND grant_consumed_at IS NULL AND grant_expires_at>NOW() RETURNING id",
    [userId, purpose, hash(token)],
  );
  if (!result.rowCount) throw new Error("Email verification is required or has expired. Request a new six-digit code.");
}

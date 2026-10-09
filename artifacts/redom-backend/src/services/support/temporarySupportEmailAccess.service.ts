import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env";
import { pool } from "../../database/db";

const TOKEN_TTL_HOURS = 24;
const PURPOSES = new Set(["case_view", "refund_status", "security_notice", "policy_view"]);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const key = () => createHash("sha256").update(env.authentication.sessionSecret).digest();
const normalizeEmail = (value: string) => value.trim().toLowerCase();
function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decryptToken(value: string): string {
  const [iv, tag, data] = value.split(".");
  if (!iv || !tag || !data) throw new Error("Stored support access grant cannot be decrypted.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
export type SupportEmailGrant = { caseId: string; caseNumber: string; recipientEmail: string; purpose: string; token: string; expiresAt: string; reused: boolean };

export async function createOrReuseSupportEmailGrant(input: { caseNumber: string; recipientEmail: string; purpose?: string }): Promise<SupportEmailGrant> {
  const caseNumber = input.caseNumber.trim().toUpperCase();
  const recipientEmail = normalizeEmail(input.recipientEmail);
  const purpose = input.purpose ?? "case_view";
  if (!/^R\d{11}$/.test(caseNumber) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail) || !PURPOSES.has(purpose)) throw new Error("Invalid support email access grant request.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT id,case_number,requester_email FROM support_cases WHERE case_number=$1 FOR UPDATE", [caseNumber]);
    const supportCase = found.rows[0];
    if (!supportCase) throw new Error("Support case not found.");
    if (normalizeEmail(String(supportCase.requester_email ?? "")) !== recipientEmail) throw new Error("Recipient does not match the support case requester.");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [[String(supportCase.id),recipientEmail,purpose].join(":")]);
    await client.query("UPDATE support_email_access_grants SET status='expired' WHERE status='active' AND expires_at<=now()");
    const existing = await client.query(
      `SELECT token_ciphertext, expires_at FROM support_email_access_grants
        WHERE case_id=$1 AND lower(recipient_email)=lower($2) AND purpose=$3 AND status='active' AND expires_at>now()
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [String(supportCase.id),recipientEmail,purpose],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      await client.query("COMMIT");
      return { caseId:String(supportCase.id),caseNumber,recipientEmail,purpose,token:decryptToken(String(row.token_ciphertext)),expiresAt:new Date(String(row.expires_at)).toISOString(),reused:true };
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now()+TOKEN_TTL_HOURS*60*60*1000).toISOString();
    await client.query(
      `INSERT INTO support_email_access_grants(case_id,recipient_email,purpose,token_hash,token_ciphertext,status,expires_at)
       VALUES($1,$2,$3,$4,$5,'active',$6)`,
      [String(supportCase.id),recipientEmail,purpose,digest(token),encryptToken(token),expiresAt],
    );
    await client.query("COMMIT");
    return { caseId:String(supportCase.id),caseNumber,recipientEmail,purpose,token,expiresAt,reused:false };
  } catch (error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; }
  finally { client.release(); }
}

export async function inspectSupportEmailGrant(token: string): Promise<{ valid:boolean; caseNumber?:string; recipientEmail?:string; purpose?:string }> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return {valid:false};
  await pool.query("UPDATE support_email_access_grants SET status='expired' WHERE status='active' AND expires_at<=now()");
  const result = await pool.query(
    `SELECT sc.case_number,g.recipient_email,g.purpose FROM support_email_access_grants g
      JOIN support_cases sc ON sc.id=g.case_id
      WHERE g.token_hash=$1 AND g.status='active' AND g.expires_at>now() LIMIT 1`,[digest(token)]);
  if (!result.rows[0]) return {valid:false};
  return {valid:true,caseNumber:String(result.rows[0].case_number),recipientEmail:String(result.rows[0].recipient_email),purpose:String(result.rows[0].purpose)};
}

export async function consumeSupportEmailGrant(token: string, verifiedRecipientEmail: string): Promise<{caseId:string;caseNumber:string;purpose:string}|null> {
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const result=await client.query(
      `UPDATE support_email_access_grants g SET status='consumed',consumed_at=now()
        FROM support_cases sc WHERE g.case_id=sc.id AND g.token_hash=$1
          AND lower(g.recipient_email)=lower($2) AND g.status='active' AND g.expires_at>now()
          AND sc.status<>'closed'
        RETURNING g.case_id,sc.case_number,g.purpose`,
      [digest(token),normalizeEmail(verifiedRecipientEmail)]);
    if (!result.rows[0]) { await client.query("ROLLBACK"); return null; }
    await client.query("COMMIT");
    return {caseId:String(result.rows[0].case_id),caseNumber:String(result.rows[0].case_number),purpose:String(result.rows[0].purpose)};
  } catch(error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; }
  finally { client.release(); }
}

export async function revokeSupportEmailGrantsForCase(caseId: string): Promise<void> {
  await pool.query("UPDATE support_email_access_grants SET status='revoked',revoked_at=now() WHERE case_id=$1 AND status='active'",[caseId]);
}

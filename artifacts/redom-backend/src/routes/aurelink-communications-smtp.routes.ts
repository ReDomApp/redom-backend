import { Router } from "express";
import { randomBytes, createCipheriv, createHash } from "node:crypto";
import bcrypt from "bcrypt";
import { pool } from "../database/db";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import { createAurelinkResendSmtpKey, revokeAurelinkResendSmtpKey } from "../services/aurelink/communications-smtp.service";

const router = Router();
const CUSTOMER_SMTP = {
  host: "smtp.aurelink.org",
  port: 465,
  encryption: "SSL/TLS",
  alternativePort: 587,
  alternativeEncryption: "STARTTLS",
  username: "aurelink",
  provider: "Aurelink SMTP",
};

async function workspaceId(userId: string, projectId?: string): Promise<string> {
  if (projectId) {
    await pool.query("INSERT INTO aurelink_communications_workspaces(user_id,project_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [userId, projectId]);
    const row = (await pool.query("SELECT id FROM aurelink_communications_workspaces WHERE user_id=$1 AND project_id=$2 AND status='active'", [userId, projectId])).rows[0];
    if (!row) throw new Error("Aurelink project communications workspace is unavailable.");
    return String(row.id);
  }
  await pool.query("INSERT INTO aurelink_communications_workspaces(user_id) VALUES($1) ON CONFLICT DO NOTHING", [userId]);
  const row = (await pool.query("SELECT id FROM aurelink_communications_workspaces WHERE user_id=$1 AND project_id IS NULL AND status='active'", [userId])).rows[0];
  if (!row) throw new Error("Aurelink communications workspace is unavailable.");
  return String(row.id);
}

function encryptionKey(): Buffer {
  const secret = process.env.AURELINK_COMMUNICATIONS_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) throw new Error("Aurelink SMTP credential encryption is not configured.");
  return createHash("sha256").update(secret).digest();
}
function encryptProviderKey(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
function newCustomerPassword(): string {
  return randomBytes(32).toString("base64url");
}
async function saveCredential(input: {
  workspaceId: string; label: string; domain: any; providerKeyId: string; providerToken: string;
}) {
  const password = newCustomerPassword();
  const passwordHash = await bcrypt.hash(password, 12);
  const tokenPrefix = password.slice(0, 16);
  const encryptedProviderKey = encryptProviderKey(input.providerToken);
  const saved = await pool.query(
    "INSERT INTO aurelink_smtp_credentials(workspace_id,username,password_hash,label,status,provider_key_id,provider_domain_id,email_domain_id,token_prefix,provider_key_encrypted) VALUES($1,'aurelink',$2,$3,'active',$4,$5,$6,$7,$8) RETURNING id,label,status,token_prefix,created_at",
    [input.workspaceId, passwordHash, input.label, input.providerKeyId, input.domain.provider_domain_id, input.domain.id, tokenPrefix, encryptedProviderKey],
  );
  return { ...saved.rows[0], domain: input.domain.domain, username: "aurelink", password };
}

router.get("/aurelink/communications/smtp/credentials", aurelinkAuthMiddleware, async (req, res) => {
  const wid = await workspaceId(req.user!.userId, (req as any).aurelinkProjectId);
  const rows = await pool.query(
    "SELECT c.id,c.label,c.status,c.token_prefix,c.created_at,c.updated_at,d.id AS domain_id,d.domain,d.status AS domain_status,c.last_used_at FROM aurelink_smtp_credentials c LEFT JOIN aurelink_email_domains d ON d.id=c.email_domain_id WHERE c.workspace_id=$1 AND c.provider_key_id IS NOT NULL ORDER BY c.created_at DESC",
    [wid],
  );
  return res.json({ success: true, provider: "aurelink", smtp: CUSTOMER_SMTP, credentials: rows.rows });
});

router.post("/aurelink/communications/smtp/credentials", aurelinkAuthMiddleware, async (req, res) => {
  const wid = await workspaceId(req.user!.userId, (req as any).aurelinkProjectId);
  const domainId = String(req.body.domainId || "").trim();
  const label = String(req.body.label || "SMTP credential").trim().slice(0, 120) || "SMTP credential";
  if (!domainId) return res.status(400).json({ success: false, code: "VERIFIED_RESEND_DOMAIN_REQUIRED", message: "Select an Aurelink sending domain verified with the internal email delivery provider." });
  const domain = (await pool.query(
    "SELECT id,domain,provider_domain_id,status FROM aurelink_email_domains WHERE id=$1 AND workspace_id=$2 AND provider='resend' LIMIT 1",
    [domainId, wid],
  )).rows[0];
  if (!domain) return res.status(404).json({ success: false, message: "Sending domain not found in this Aurelink workspace." });
  if (domain.status !== "verified" || !domain.provider_domain_id) return res.status(409).json({ success: false, code: "EMAIL_DOMAIN_NOT_VERIFIED", message: "The selected sending domain must be verified before SMTP credentials can be issued." });

  let remote: { providerKeyId: string; token: string } | undefined;
  try {
    remote = await createAurelinkResendSmtpKey({ workspaceId: wid, domainId: String(domain.provider_domain_id), label });
    try {
      const credential = await saveCredential({ workspaceId: wid, label, domain, providerKeyId: remote.providerKeyId, providerToken: remote.token });
      return res.status(201).json({
        success: true,
        provider: "aurelink",
        credential,
        smtp: CUSTOMER_SMTP,
        warning: "The Aurelink SMTP password is displayed once. Store it securely; it cannot be retrieved later.",
      });
    } catch (databaseError) {
      await revokeAurelinkResendSmtpKey(remote.providerKeyId).catch(() => undefined);
      throw databaseError;
    }
  } catch (error) {
    return res.status(502).json({ success: false, message: error instanceof Error ? error.message : "Unable to issue Aurelink SMTP credentials." });
  }
});

router.post("/aurelink/communications/smtp/credentials/:id/rotate", aurelinkAuthMiddleware, async (req, res) => {
  const wid = await workspaceId(req.user!.userId, (req as any).aurelinkProjectId);
  const old = (await pool.query(
    "SELECT c.id,c.label,c.provider_key_id,c.provider_domain_id,c.email_domain_id,d.domain,d.status AS domain_status FROM aurelink_smtp_credentials c JOIN aurelink_email_domains d ON d.id=c.email_domain_id AND d.workspace_id=c.workspace_id WHERE c.id=$1 AND c.workspace_id=$2 AND c.status='active' AND c.provider_key_id IS NOT NULL FOR UPDATE OF c",
    [req.params.id, wid],
  )).rows[0];
  if (!old) return res.status(404).json({ success: false, message: "Active Aurelink SMTP credential not found." });
  if (old.domain_status !== "verified") return res.status(409).json({ success: false, code: "EMAIL_DOMAIN_NOT_VERIFIED", message: "Restore sending-domain verification before rotating this credential." });

  let replacement: { providerKeyId: string; token: string } | undefined;
  let insertedId: string | undefined;
  try {
    replacement = await createAurelinkResendSmtpKey({ workspaceId: wid, domainId: String(old.provider_domain_id), label: String(old.label || "SMTP credential") });
    const credential = await saveCredential({
      workspaceId: wid, label: String(old.label || "SMTP credential"),
      domain: { id: old.email_domain_id, domain: old.domain, provider_domain_id: old.provider_domain_id },
      providerKeyId: replacement.providerKeyId, providerToken: replacement.token,
    });
    insertedId = String(credential.id);
    try {
      await revokeAurelinkResendSmtpKey(String(old.provider_key_id));
    } catch (revokeError) {
      await pool.query("UPDATE aurelink_smtp_credentials SET status='revoked',updated_at=NOW() WHERE id=$1", [insertedId]);
      await revokeAurelinkResendSmtpKey(replacement.providerKeyId).catch(() => undefined);
      throw revokeError;
    }
    await pool.query("UPDATE aurelink_smtp_credentials SET status='revoked',updated_at=NOW() WHERE id=$1 AND workspace_id=$2", [old.id, wid]);
    return res.status(201).json({
      success: true, provider: "aurelink", credential,
      revokedCredentialId: old.id, smtp: CUSTOMER_SMTP,
      warning: "The replacement Aurelink SMTP password is displayed once. The previous credential and its internal provider key have been revoked.",
    });
  } catch (error) {
    if (replacement && !insertedId) await revokeAurelinkResendSmtpKey(replacement.providerKeyId).catch(() => undefined);
    return res.status(502).json({ success: false, message: error instanceof Error ? error.message : "Unable to rotate Aurelink SMTP credentials." });
  }
});

router.delete("/aurelink/communications/smtp/credentials/:id", aurelinkAuthMiddleware, async (req, res) => {
  const wid = await workspaceId(req.user!.userId, (req as any).aurelinkProjectId);
  const row = (await pool.query(
    "SELECT id,provider_key_id FROM aurelink_smtp_credentials WHERE id=$1 AND workspace_id=$2 AND status='active' AND provider_key_id IS NOT NULL",
    [req.params.id, wid],
  )).rows[0];
  if (!row) return res.status(404).json({ success: false, message: "Active Aurelink SMTP credential not found." });
  try {
    await revokeAurelinkResendSmtpKey(String(row.provider_key_id));
    const updated = await pool.query(
      "UPDATE aurelink_smtp_credentials SET status='revoked',updated_at=NOW() WHERE id=$1 AND workspace_id=$2 RETURNING id,status,updated_at",
      [row.id, wid],
    );
    return res.json({ success: true, credential: updated.rows[0], provider: "aurelink" });
  } catch (error) {
    return res.status(502).json({ success: false, message: error instanceof Error ? error.message : "Unable to revoke Aurelink SMTP credentials." });
  }
});

export default router;

import { Router } from "express";
import { pool } from "../database/db";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import { createAurelinkResendSmtpKey, revokeAurelinkResendSmtpKey } from "../services/aurelink/communications-smtp.service";

const router = Router();

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

const smtpSettings = {
  host: "smtp.resend.com",
  port: 465,
  security: "SSL/TLS",
  username: "resend",
  alternatePort: 587,
  alternateSecurity: "STARTTLS",
  provider: "resend",
};

router.get("/aurelink/communications/smtp/credentials", aurelinkAuthMiddleware, async (req, res) => {
  const wid = await workspaceId(req.user!.userId, (req as any).aurelinkProjectId);
  const rows = await pool.query(
    "SELECT c.id,c.label,c.status,c.token_prefix,c.created_at,c.updated_at,d.id AS domain_id,d.domain,d.status AS domain_status,c.last_used_at FROM aurelink_smtp_credentials c LEFT JOIN aurelink_email_domains d ON d.id=c.email_domain_id WHERE c.workspace_id=$1 AND c.provider_key_id IS NOT NULL ORDER BY c.created_at DESC",
    [wid],
  );
  return res.json({ success: true, provider: "resend", smtp: smtpSettings, credentials: rows.rows });
});

router.post("/aurelink/communications/smtp/credentials", aurelinkAuthMiddleware, async (req, res) => {
  const wid = await workspaceId(req.user!.userId, (req as any).aurelinkProjectId);
  const domainId = String(req.body.domainId || "").trim();
  const label = String(req.body.label || "SMTP credential").trim().slice(0, 120) || "SMTP credential";
  if (!domainId) return res.status(400).json({ success: false, code: "VERIFIED_RESEND_DOMAIN_REQUIRED", message: "Select an Aurelink domain that has been verified with Resend before creating SMTP credentials." });

  const domain = (await pool.query(
    "SELECT id,domain,provider_domain_id,status FROM aurelink_email_domains WHERE id=$1 AND workspace_id=$2 AND provider='resend' LIMIT 1",
    [domainId, wid],
  )).rows[0];
  if (!domain) return res.status(404).json({ success: false, message: "Resend domain not found in this Aurelink workspace." });
  if (domain.status !== "verified" || !domain.provider_domain_id) {
    return res.status(409).json({ success: false, code: "EMAIL_DOMAIN_NOT_VERIFIED", message: "The selected domain must be verified and authenticated by Resend before SMTP credentials can be issued." });
  }

  let remote: { providerKeyId: string; token: string } | undefined;
  try {
    remote = await createAurelinkResendSmtpKey({ workspaceId: wid, domainId: String(domain.provider_domain_id), label });
    try {
      const saved = await pool.query(
        "INSERT INTO aurelink_smtp_credentials(workspace_id,username,password_hash,label,status,provider_key_id,provider_domain_id,email_domain_id,token_prefix) VALUES($1,$2,NULL,$3,'active',$4,$5,$6,$7) RETURNING id,label,status,token_prefix,created_at",
        [wid, "resend:" + remote.providerKeyId, label, remote.providerKeyId, domain.provider_domain_id, domain.id, remote.token.slice(0, 8)],
      );
      return res.status(201).json({
        success: true,
        provider: "resend",
        credential: { ...saved.rows[0], domain: domain.domain, username: "resend", password: remote.token },
        smtp: smtpSettings,
        warning: "The Resend SMTP password is shown once. Aurelink does not store the token. Save it securely before leaving this screen.",
      });
    } catch (databaseError) {
      await revokeAurelinkResendSmtpKey(remote.providerKeyId).catch(() => undefined);
      throw databaseError;
    }
  } catch (error) {
    return res.status(502).json({ success: false, message: error instanceof Error ? error.message : "Unable to create Resend SMTP credentials." });
  }
});

router.post("/aurelink/communications/smtp/credentials/:id/rotate", aurelinkAuthMiddleware, async (req, res) => {
  const wid = await workspaceId(req.user!.userId, (req as any).aurelinkProjectId);
  const old = (await pool.query(
    "SELECT c.id,c.label,c.provider_key_id,c.provider_domain_id,c.email_domain_id,d.domain,d.status AS domain_status FROM aurelink_smtp_credentials c JOIN aurelink_email_domains d ON d.id=c.email_domain_id AND d.workspace_id=c.workspace_id WHERE c.id=$1 AND c.workspace_id=$2 AND c.status='active' AND c.provider_key_id IS NOT NULL FOR UPDATE OF c",
    [req.params.id, wid],
  )).rows[0];
  if (!old) return res.status(404).json({ success: false, message: "Active Resend SMTP credential not found." });
  if (old.domain_status !== "verified") return res.status(409).json({ success: false, code: "EMAIL_DOMAIN_NOT_VERIFIED", message: "The associated Resend domain is no longer verified. Restore domain verification before rotating this credential." });

  let replacement: { providerKeyId: string; token: string } | undefined;
  try {
    replacement = await createAurelinkResendSmtpKey({ workspaceId: wid, domainId: String(old.provider_domain_id), label: String(old.label || "SMTP credential") });
    const inserted = await pool.query(
      "INSERT INTO aurelink_smtp_credentials(workspace_id,username,password_hash,label,status,provider_key_id,provider_domain_id,email_domain_id,token_prefix) VALUES($1,$2,NULL,$3,'active',$4,$5,$6,$7) RETURNING id,label,status,token_prefix,created_at",
      [wid, "resend:" + replacement.providerKeyId, String(old.label || "SMTP credential"), replacement.providerKeyId, old.provider_domain_id, old.email_domain_id, replacement.token.slice(0, 8)],
    );
    try {
      await revokeAurelinkResendSmtpKey(String(old.provider_key_id));
    } catch (revokeError) {
      await pool.query("UPDATE aurelink_smtp_credentials SET status='revoked',updated_at=NOW() WHERE id=$1", [inserted.rows[0].id]);
      await revokeAurelinkResendSmtpKey(replacement.providerKeyId).catch(() => undefined);
      throw revokeError;
    }
    await pool.query("UPDATE aurelink_smtp_credentials SET status='revoked',updated_at=NOW() WHERE id=$1 AND workspace_id=$2", [old.id, wid]);
    return res.status(201).json({
      success: true,
      provider: "resend",
      credential: { ...inserted.rows[0], domain: old.domain, username: "resend", password: replacement.token },
      revokedCredentialId: old.id,
      smtp: smtpSettings,
      warning: "The replacement Resend SMTP password is shown once. Save it securely; the previous provider key has been revoked.",
    });
  } catch (error) {
    return res.status(502).json({ success: false, message: error instanceof Error ? error.message : "Unable to rotate Resend SMTP credentials." });
  }
});

router.delete("/aurelink/communications/smtp/credentials/:id", aurelinkAuthMiddleware, async (req, res) => {
  const wid = await workspaceId(req.user!.userId, (req as any).aurelinkProjectId);
  const row = (await pool.query(
    "SELECT id,provider_key_id FROM aurelink_smtp_credentials WHERE id=$1 AND workspace_id=$2 AND status='active' AND provider_key_id IS NOT NULL",
    [req.params.id, wid],
  )).rows[0];
  if (!row) return res.status(404).json({ success: false, message: "Active Resend SMTP credential not found." });
  try {
    await revokeAurelinkResendSmtpKey(String(row.provider_key_id));
    const updated = await pool.query(
      "UPDATE aurelink_smtp_credentials SET status='revoked',updated_at=NOW() WHERE id=$1 AND workspace_id=$2 RETURNING id,status,updated_at",
      [row.id, wid],
    );
    return res.json({ success: true, credential: updated.rows[0], provider: "resend" });
  } catch (error) {
    return res.status(502).json({ success: false, message: error instanceof Error ? error.message : "Unable to revoke Resend SMTP credentials." });
  }
});

export default router;

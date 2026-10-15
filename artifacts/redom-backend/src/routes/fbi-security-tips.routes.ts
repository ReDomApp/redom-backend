import { Router } from "express";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { pool } from "../database/db";

const router = Router();
const keyText = () => process.env.FBI_SECURITY_TIP_ENCRYPTION_KEY?.trim() ?? "";
const adminKey = () => process.env.REDOM_FBI_SECURITY_ADMIN_KEY?.trim() ?? "";

function requireAdmin(req: any, res: any, next: any): void {
  const expected = adminKey();
  const supplied = req.header("x-redom-fbi-security-key") ?? "";
  if (expected.length < 32) {
    res.status(503).json({ success: false, message: "FBI Security admin access is disabled until REDOM_FBI_SECURITY_ADMIN_KEY is configured." });
    return;
  }
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  if (!supplied || a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ success: false, message: "Unauthorized." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
}
function encryptionKey(): Buffer {
  const raw = keyText();
  if (!raw) throw new Error("FBI_SECURITY_TIP_ENCRYPTION_KEY is not configured");
  let key: Buffer;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
  else key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("FBI_SECURITY_TIP_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key");
  return key;
}
function encrypt(plain: string): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
function decrypt(ciphertext: string, iv: string, tag: string): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}
async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS redom_fbi_security_tips (
      id bigserial PRIMARY KEY,
      reference text NOT NULL UNIQUE,
      encrypted_payload text NOT NULL,
      encryption_iv text NOT NULL,
      encryption_tag text NOT NULL,
      payload_sha256 text NOT NULL,
      status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','under_review','accepted_for_public_source_review','closed','rejected')),
      analyst_label text,
      analyst_note text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS redom_fbi_security_tips_queue_idx ON redom_fbi_security_tips(status, created_at DESC);
    CREATE TABLE IF NOT EXISTS redom_fbi_security_tip_sources (
      id bigserial PRIMARY KEY,
      tip_id bigint NOT NULL REFERENCES redom_fbi_security_tips(id) ON DELETE CASCADE,
      source_url text NOT NULL,
      source_label text NOT NULL DEFAULT '',
      source_sha256 text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tip_id, source_url)
    );
    ALTER TABLE redom_fbi_security_tip_sources ADD COLUMN IF NOT EXISTS publisher text;
    ALTER TABLE redom_fbi_security_tip_sources ADD COLUMN IF NOT EXISTS headline text;
    ALTER TABLE redom_fbi_security_tip_sources ADD COLUMN IF NOT EXISTS excerpt text NOT NULL DEFAULT '';
    ALTER TABLE redom_fbi_security_tip_sources ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified';
    ALTER TABLE redom_fbi_security_tip_sources ADD COLUMN IF NOT EXISTS retrieved_at timestamptz;
    ALTER TABLE redom_fbi_security_tip_sources ADD COLUMN IF NOT EXISTS content_sha256 text;
    CREATE INDEX IF NOT EXISTS redom_fbi_security_tip_sources_tip_idx ON redom_fbi_security_tip_sources(tip_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS redom_fbi_security_audit_events (
      id bigserial PRIMARY KEY,
      event_type text NOT NULL,
      record_id text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}
async function audit(eventType: string, recordId: string, metadata: Record<string, unknown>): Promise<void> {
  await pool.query("INSERT INTO redom_fbi_security_audit_events(event_type,record_id,metadata,created_at) VALUES($1,$2,$3::jsonb,now())", [eventType, recordId, JSON.stringify(metadata)]);
}
function cleanString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function sourceUrl(value: unknown): string | null {
  const raw = cleanString(value, 2000);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;
    const hosts = new Set([
      "www.fbi.gov","tips.fbi.gov","www.justice.gov","www.sec.gov","www.ftc.gov","reportfraud.ftc.gov",
      "www.usmarshals.gov","www.consumerfinance.gov","www.cftc.gov","www.fdic.gov",
      "www.sos.ca.gov","sos.oregon.gov","www.sos.wa.gov","dos.fl.gov","www.nass.org",
      "www.realtor.com","www.npr.org","www.pbs.org","apnews.com","www.apnews.com",
      "reuters.com","www.reuters.com","abcnews.go.com","www.cbsnews.com","www.nbcnews.com",
      "www.cnn.com","www.nytimes.com","www.washingtonpost.com","www.usatoday.com","www.bbc.com"
    ]);
    return hosts.has(url.hostname.toLowerCase()) ? url.toString() : null;
  } catch { return null; }
}

/**
 * Encrypted tip intake is admin-key protected. This endpoint stores submitted
 * statements for review; it does not resolve identities or search private systems.
 */
router.post("/admin/tips", requireAdmin, async (req, res) => {
  const body = req.body ?? {};
  const payload = {
    subjectLabel: cleanString(body.subjectLabel, 200),
    incidentSummary: cleanString(body.incidentSummary, 8000),
    approximateLocation: cleanString(body.approximateLocation, 300),
    reportedAt: cleanString(body.reportedAt, 80),
    submitterReference: cleanString(body.submitterReference, 120),
    analystProvidedContext: cleanString(body.analystProvidedContext, 3000)
  };
  if (!payload.subjectLabel || !payload.incidentSummary) return res.status(400).json({ success: false, message: "subjectLabel and incidentSummary are required." });
  if (Object.values(payload).some((v) => v.length > 8000)) return res.status(400).json({ success: false, message: "A field exceeds its permitted length." });
  const serialized = JSON.stringify(payload);
  const hash = createHash("sha256").update(serialized, "utf8").digest("hex");
  try {
    await ensureSchema();
    const encrypted = encrypt(serialized);
    const reference = "TIP-" + randomBytes(8).toString("hex").toUpperCase();
    const saved = await pool.query(
      "INSERT INTO redom_fbi_security_tips(reference,encrypted_payload,encryption_iv,encryption_tag,payload_sha256) VALUES($1,$2,$3,$4,$5) RETURNING id,reference,payload_sha256,status,created_at",
      [reference, encrypted.ciphertext, encrypted.iv, encrypted.tag, hash]
    );
    const id = String(saved.rows[0].id);
    await audit("encrypted_tip_received", id, { reference, payloadSha256: hash });
    return res.status(201).json({ success: true, tip: saved.rows[0], message: "Encrypted tip stored for administrative review. No identity lookup or external submission was performed." });
  } catch (error) {
    return res.status(503).json({ success: false, message: error instanceof Error && error.message.includes("FBI_SECURITY_TIP_ENCRYPTION_KEY") ? "Tip encryption is unavailable until FBI_SECURITY_TIP_ENCRYPTION_KEY is configured correctly." : "Unable to store encrypted tip." });
  }
});

router.get("/admin/tips", requireAdmin, async (req, res) => {
  try {
    await ensureSchema();
    const rawLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.floor(rawLimit))) : 50;
    const status = cleanString(req.query.status, 50);
    const valid = new Set(["pending_review","under_review","accepted_for_public_source_review","closed","rejected"]);
    const result = valid.has(status)
      ? await pool.query("SELECT id,reference,payload_sha256,status,analyst_label,created_at,updated_at FROM redom_fbi_security_tips WHERE status=$1 ORDER BY created_at DESC LIMIT $2", [status, limit])
      : await pool.query("SELECT id,reference,payload_sha256,status,analyst_label,created_at,updated_at FROM redom_fbi_security_tips ORDER BY created_at DESC LIMIT $1", [limit]);
    await audit("encrypted_tip_queue_viewed", "queue", { count: result.rows.length, status: valid.has(status) ? status : "all" });
    return res.json({ success: true, tips: result.rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve tip queue." });
  }
});

router.get("/admin/tips/:tipId", requireAdmin, async (req, res) => {
  const id = Number(req.params.tipId);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Invalid tip ID." });
  try {
    await ensureSchema();
    const result = await pool.query("SELECT * FROM redom_fbi_security_tips WHERE id=$1", [id]);
    if (!result.rows[0]) return res.status(404).json({ success: false, message: "Tip not found." });
    const row = result.rows[0];
    const payload = JSON.parse(decrypt(row.encrypted_payload, row.encryption_iv, row.encryption_tag));
    const sources = await pool.query("SELECT id,source_url,source_label,source_sha256,created_at FROM redom_fbi_security_tip_sources WHERE tip_id=$1 ORDER BY created_at DESC", [id]);
    await audit("encrypted_tip_decrypted_for_review", String(id), { reference: row.reference });
    return res.setHeader("Cache-Control", "no-store").json({ success: true, tip: { id: row.id, reference: row.reference, payload, payloadSha256: row.payload_sha256, status: row.status, analystLabel: row.analyst_label, analystNote: row.analyst_note, createdAt: row.created_at, updatedAt: row.updated_at }, sources: sources.rows });
  } catch (error) {
    return res.status(503).json({ success: false, message: error instanceof Error && error.message.includes("FBI_SECURITY_TIP_ENCRYPTION_KEY") ? "Tip decryption is unavailable; check the configured encryption key." : "Unable to retrieve tip." });
  }
});

router.patch("/admin/tips/:tipId", requireAdmin, async (req, res) => {
  const id = Number(req.params.tipId);
  const status = cleanString(req.body?.status, 60);
  const analystLabel = cleanString(req.body?.analystLabel, 100);
  const analystNote = cleanString(req.body?.analystNote, 2000);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Invalid tip ID." });
  if (!["pending_review","under_review","accepted_for_public_source_review","closed","rejected"].includes(status)) return res.status(400).json({ success: false, message: "Unsupported review status." });
  if (/\b(?:SSN|social security number|TIN|taxpayer identification|bank account|routing number|password|access token)\b/i.test(analystNote)) return res.status(400).json({ success: false, message: "Analyst notes must not contain restricted identity, financial, or credential data." });
  try {
    await ensureSchema();
    const updated = await pool.query("UPDATE redom_fbi_security_tips SET status=$2,analyst_label=$3,analyst_note=$4,updated_at=now() WHERE id=$1 RETURNING id,reference,payload_sha256,status,analyst_label,analyst_note,created_at,updated_at", [id,status,analystLabel || null,analystNote || null]);
    if (!updated.rows[0]) return res.status(404).json({ success: false, message: "Tip not found." });
    await audit("encrypted_tip_review_status_changed", String(id), { status });
    return res.json({ success: true, tip: updated.rows[0] });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to update tip." });
  }
});

router.post("/admin/tips/:tipId/sources", requireAdmin, async (req, res) => {
  const id = Number(req.params.tipId);
  const rawSources = Array.isArray(req.body?.sources) ? req.body.sources.slice(0, 20) : [];
  if (!Number.isSafeInteger(id) || id < 1 || rawSources.length === 0) return res.status(400).json({ success: false, message: "A valid tip ID and at least one source are required." });
  const parsed = rawSources.map((s: any) => ({ url: sourceUrl(s?.url), label: cleanString(s?.label, 200) }));
  if (parsed.some((s: any) => !s.url)) return res.status(400).json({ success: false, message: "Every source must be an HTTPS URL on the configured public-source allowlist." });
  try {
    await ensureSchema();
    const exists = await pool.query("SELECT id FROM redom_fbi_security_tips WHERE id=$1", [id]);
    if (!exists.rows[0]) return res.status(404).json({ success: false, message: "Tip not found." });
    const saved = [];
    for (const source of parsed) {
      const hash = createHash("sha256").update(source.url + "\n" + source.label, "utf8").digest("hex");
      const row = await pool.query(
        "INSERT INTO redom_fbi_security_tip_sources(tip_id,source_url,source_label,source_sha256) VALUES($1,$2,$3,$4) ON CONFLICT(tip_id,source_url) DO UPDATE SET source_label=EXCLUDED.source_label,source_sha256=EXCLUDED.source_sha256 RETURNING id,tip_id,source_url,source_label,source_sha256,created_at",
        [id, source.url, source.label, hash]
      );
      saved.push(row.rows[0]);
    }
    await audit("public_sources_attached_to_tip", String(id), { count: saved.length });
    return res.status(201).json({ success: true, sources: saved, message: "Source references attached. The URLs have not been fetched or independently verified." });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to attach public sources." });
  }
});


function extractMeta(html: string, key: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const keyMatch = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
    const valueMatch = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (keyMatch?.[1]?.toLowerCase() === key.toLowerCase() && valueMatch?.[1]) {
      return cleanMarkup(valueMatch[1], 1500);
    }
  }
  return "";
}
function cleanMarkup(text: string, max: number): string {
  return text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Verify only URLs explicitly attached to this tip. No name-based search,
 * person matching, or discovery of additional personal records is performed.
 */
router.post("/admin/tips/:tipId/verify-sources", requireAdmin, async (req, res) => {
  const id = Number(req.params.tipId);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Invalid tip ID." });
  const timeoutMs = 8000;
  try {
    await ensureSchema();
    const exists = await pool.query("SELECT id,reference FROM redom_fbi_security_tips WHERE id=$1", [id]);
    if (!exists.rows[0]) return res.status(404).json({ success: false, message: "Tip not found." });
    const sources = await pool.query("SELECT id,source_url,source_label FROM redom_fbi_security_tip_sources WHERE tip_id=$1 ORDER BY id ASC LIMIT 20", [id]);
    if (!sources.rows.length) return res.status(400).json({ success: false, message: "Attach public-source URLs before running verification." });
    const results = [];
    for (const source of sources.rows) {
      const checkedUrl = sourceUrl(source.source_url);
      if (!checkedUrl || checkedUrl !== source.source_url) {
        await pool.query("UPDATE redom_fbi_security_tip_sources SET verification_status='rejected_url',retrieved_at=now() WHERE id=$1 AND tip_id=$2", [source.id,id]);
        results.push({ sourceId: source.id, status: "rejected_url" });
        continue;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(checkedUrl, {
          method: "GET", redirect: "manual", signal: controller.signal,
          headers: { "User-Agent": "ReDom-FBI-Security-PublicSourceReview/1.0", "Accept": "text/html,application/xhtml+xml" }
        });
        if (response.status >= 300 && response.status < 400) {
          await pool.query("UPDATE redom_fbi_security_tip_sources SET verification_status='redirect_rejected',retrieved_at=now() WHERE id=$1 AND tip_id=$2", [source.id,id]);
          results.push({ sourceId: source.id, status: "redirect_rejected" });
          continue;
        }
        if (!response.ok) {
          await pool.query("UPDATE redom_fbi_security_tip_sources SET verification_status=$3,retrieved_at=now() WHERE id=$1 AND tip_id=$2", [source.id,id,"http_" + response.status]);
          results.push({ sourceId: source.id, status: "http_error", httpStatus: response.status });
          continue;
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!/text\/html|application\/xhtml\+xml/i.test(contentType) || !response.body) {
          await pool.query("UPDATE redom_fbi_security_tip_sources SET verification_status='unsupported_content_type',retrieved_at=now() WHERE id=$1 AND tip_id=$2", [source.id,id]);
          results.push({ sourceId: source.id, status: "unsupported_content_type" });
          continue;
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        let tooLarge = false;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 1_000_000) { tooLarge = true; await reader.cancel(); break; }
          chunks.push(part.value);
        }
        if (tooLarge) {
          await pool.query("UPDATE redom_fbi_security_tip_sources SET verification_status='size_limit_exceeded',retrieved_at=now() WHERE id=$1 AND tip_id=$2", [source.id,id]);
          results.push({ sourceId: source.id, status: "size_limit_exceeded" });
          continue;
        }
        const html = new TextDecoder().decode(Buffer.concat(chunks));
        const headline = extractMeta(html,"og:title") || cleanMarkup(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",500);
        const publisher = extractMeta(html,"og:site_name") || new URL(checkedUrl).hostname.replace(/^www\./,"");
        const excerpt = extractMeta(html,"og:description") || extractMeta(html,"description");
        const digest = createHash("sha256").update([checkedUrl,headline,publisher,excerpt].join("\n"),"utf8").digest("hex");
        const status = headline ? "retrieved_needs_review" : "retrieved_no_headline";
        await pool.query(
          "UPDATE redom_fbi_security_tip_sources SET publisher=$3,headline=$4,excerpt=$5,content_sha256=$6,source_sha256=$6,verification_status=$7,retrieved_at=now() WHERE id=$1 AND tip_id=$2",
          [source.id,id,publisher,headline,excerpt,digest,status]
        );
        results.push({ sourceId: source.id, status, publisher, headline, excerpt, contentSha256: digest, sourceUrl: checkedUrl });
      } catch (error) {
        const status = error instanceof Error && error.name === "AbortError" ? "timeout" : "fetch_failed";
        await pool.query("UPDATE redom_fbi_security_tip_sources SET verification_status=$3,retrieved_at=now() WHERE id=$1 AND tip_id=$2", [source.id,id,status]);
        results.push({ sourceId: source.id, status });
      } finally {
        clearTimeout(timer);
      }
    }
    await audit("tip_public_sources_verified", String(id), { reference: exists.rows[0].reference, sourceCount: results.length, successfulCount: results.filter((x: any) => String(x.status).startsWith("retrieved_")).length });
    return res.setHeader("Cache-Control","no-store").json({
      success: true, tip: exists.rows[0], results,
      warning: "Verification confirms only that allowlisted pages were retrieved and metadata was extracted. It does not prove identity, ownership, allegations, or a match to the tip subject. An analyst must confirm relevance and record uncertainty."
    });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to verify public-source references." });
  }
});

router.get("/admin/tips/:tipId/sources", requireAdmin, async (req,res) => {
  const id = Number(req.params.tipId);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({success:false,message:"Invalid tip ID."});
  try {
    await ensureSchema();
    const exists = await pool.query("SELECT id,reference FROM redom_fbi_security_tips WHERE id=$1",[id]);
    if (!exists.rows[0]) return res.status(404).json({success:false,message:"Tip not found."});
    const rows = await pool.query("SELECT id,source_url,source_label,source_sha256,publisher,headline,excerpt,verification_status,content_sha256,retrieved_at,created_at FROM redom_fbi_security_tip_sources WHERE tip_id=$1 ORDER BY created_at DESC LIMIT 100",[id]);
    await audit("tip_public_sources_viewed",String(id),{count:rows.rows.length});
    return res.setHeader("Cache-Control","no-store").json({success:true,tip:exists.rows[0],sources:rows.rows});
  } catch {
    return res.status(500).json({success:false,message:"Unable to retrieve public-source verification results."});
  }
});

export default router;

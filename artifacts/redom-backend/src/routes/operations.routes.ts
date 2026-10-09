import { Router, type Request, type Response, type NextFunction } from "express";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { recordOpsAdminAudit, recordOpsEmailEvent } from "../services/operations/daily-ops-intelligence.service";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(obj[key])).join(",") + "}";
}
import { pool } from "../database/db";

const router = Router();

function verifyResendWebhook(raw: Buffer, id: string, timestamp: string, signature: string, secret: string): boolean {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret);
  const expected = createHmac("sha256", key).update(id + "." + timestamp + "." + raw.toString("utf8")).digest("base64");
  return signature.split(" ").some((part) => {
    const pieces = part.split(",");
    if (pieces.length !== 2 || pieces[0] !== "v1") return false;
    const supplied = Buffer.from(pieces[1]);
    const calculated = Buffer.from(expected);
    return supplied.length === calculated.length && timingSafeEqual(supplied, calculated);
  });
}

/**
 * Provider callbacks must be authenticated by Resend's signed webhook, not by
 * the private administrator key. Keep this route before the archive guard.
 */
router.post("/email/webhook", async (req, res) => {
  const secret = env.email.resend.webhookSecret;
  if (!secret) return res.status(503).json({ success: false, message: "Resend delivery webhook secret is not configured." });
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ success: false, message: "Expected raw webhook payload." });
  const id = req.header("svix-id") ?? "";
  const timestamp = req.header("svix-timestamp") ?? "";
  const signature = req.header("svix-signature") ?? "";
  if (!id || !timestamp || !signature || !verifyResendWebhook(req.body, id, timestamp, signature, secret)) {
    return res.status(400).json({ success: false, message: "Invalid webhook signature." });
  }

  let event: any;
  try { event = JSON.parse(req.body.toString("utf8")); } catch { return res.status(400).json({ success: false, message: "Invalid JSON payload." }); }
  const eventType = String(event?.type ?? "");
  const typeMap: Record<string, "accepted" | "delivered" | "deferred" | "bounced" | "rejected" | "failed" | "complained"> = {
    "email.sent": "accepted",
    "email.delivered": "delivered",
    "email.delivery_delayed": "deferred",
    "email.bounced": "bounced",
    "email.rejected": "rejected",
    "email.failed": "failed",
    "email.complained": "complained",
  };
  const mapped = typeMap[eventType];
  const messageId = String(event?.data?.email_id ?? event?.data?.id ?? "");
  if (!mapped || !messageId) return res.status(200).json({ received: true, ignored: true });
  const toValue = event?.data?.to;
  const recipient = Array.isArray(toValue) ? String(toValue[0] ?? "") : String(toValue ?? "");

  try {
    // Provider webhook IDs are unique and idempotent. The ledger insert and
    // report state update are deliberately both retriable.
    await recordOpsEmailEvent({
      logicalEmailId: messageId,
      providerMessageId: messageId,
      subsystem: "resend-webhook",
      eventType: mapped,
      recipient,
      idempotencyKey: "resend-webhook:" + id,
      metadata: { providerEventType: eventType, webhookId: id, createdAt: event?.created_at ?? null },
    });
    if (mapped === "delivered") {
      await pool.query("UPDATE redom_ops_report_runs SET delivery_status='delivered',delivered_at=COALESCE(delivered_at,now()),updated_at=now() WHERE provider_message_id=$1", [messageId]);
    } else if (mapped === "bounced" || mapped === "rejected" || mapped === "failed" || mapped === "complained") {
      await pool.query("UPDATE redom_ops_report_runs SET delivery_status='failed',updated_at=now() WHERE provider_message_id=$1", [messageId]);
    }
    return res.status(200).json({ received: true });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to persist delivery event." });
  }
});

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.REDOM_OPS_ADMIN_KEY;
  const supplied = req.header("x-redom-ops-key") ?? "";
  if (!expected) {
    void recordOpsAdminAudit("auth.denied", null, "disabled").catch(() => undefined);
    res.status(503).json({ success: false, message: "Operations report archive is disabled until REDOM_OPS_ADMIN_KEY is configured." });
    return;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (!supplied || a.length !== b.length || !timingSafeEqual(a, b)) {
    void recordOpsAdminAudit("auth.denied", null, "unauthorized").catch(() => undefined);
    res.status(401).json({ success: false, message: "Unauthorized." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
}

router.get("/reports", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(`SELECT report_key, period_start, period_end, timezone, status, delivery_status,
      provider_message_id, pdf_sha256, report_signature, signature_payload_hash, signature_key_id,
      generated_at, delivered_at, attempt_count, error_message, created_at
      FROM redom_ops_report_runs ORDER BY period_end DESC LIMIT 100`);
    await recordOpsAdminAudit("reports.list", null).catch(() => undefined);
    return res.json({ success: true, reports: result.rows });
  } catch {
    await recordOpsAdminAudit("reports.list", null, "failed").catch(() => undefined);
    return res.status(500).json({ success: false, message: "Unable to retrieve operations reports." });
  }
});

router.get("/reports/:reportKey/verify", requireAdmin, async (req, res) => {
  const reportKey = String(req.params.reportKey ?? "");
  if (!/^daily-ops-\d{1,12}$/.test(reportKey)) return res.status(400).json({ success: false, message: "Invalid report key." });
  try {
    const result = await pool.query(`SELECT report_key,generated_at,pdf_base64,pdf_sha256,metrics,analysis,
      report_signature,signature_payload_hash,signature_key_id FROM redom_ops_report_runs WHERE report_key=$1 LIMIT 1`, [reportKey]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ success: false, message: "Report not found." });
    const pdfHash = row.pdf_base64 ? createHash("sha256").update(Buffer.from(String(row.pdf_base64), "base64")).digest("hex") : null;
    const pdfIntegrity = Boolean(pdfHash && pdfHash === row.pdf_sha256);
    const key = process.env.REDOM_OPS_REPORT_SIGNING_KEY ?? "";
    let signatureValid = false;
    if (key && row.report_signature && row.signature_payload_hash && row.generated_at) {
      const actualPayloadHash = createHash("sha256").update(canonicalJson({ metrics: row.metrics, analysis: row.analysis })).digest("hex");
      const expected = createHmac("sha256", key).update(String(row.report_key) + "|" + new Date(row.generated_at).toISOString() + "|" + String(row.signature_payload_hash)).digest("hex");
      const a = Buffer.from(expected), b = Buffer.from(String(row.report_signature));
      signatureValid = actualPayloadHash === String(row.signature_payload_hash) &&
        a.length === b.length && timingSafeEqual(a, b) &&
        String(row.signature_key_id ?? "") === createHash("sha256").update(key).digest("hex").slice(0, 12);
    }
    await recordOpsAdminAudit("report.verify", reportKey, pdfIntegrity && signatureValid ? "success" : "warning").catch(() => undefined);
    return res.json({ success: true, reportKey, signed: Boolean(row.report_signature), signatureValid,
      pdfIntegrity, pdfSha256: pdfHash, signatureKeyId: row.signature_key_id ?? null,
      verificationStatus: signatureValid && pdfIntegrity ? "VERIFIED" : !row.report_signature ? "UNSIGNED — configure REDOM_OPS_REPORT_SIGNING_KEY" : "VERIFICATION FAILED" });
  } catch {
    await recordOpsAdminAudit("report.verify", reportKey, "failed").catch(() => undefined);
    return res.status(500).json({ success: false, message: "Unable to verify report." });
  }
});

router.get("/reports/:reportKey", requireAdmin, async (req, res) => {
  const reportKey = String(req.params.reportKey ?? "");
  if (!/^daily-ops-\d{1,12}$/.test(reportKey)) return res.status(400).json({ success: false, message: "Invalid report key." });
  try {
    const result = await pool.query(`SELECT report_key,period_start,period_end,timezone,status,delivery_status,
      metrics,analysis,data_coverage,pdf_sha256,report_signature,signature_payload_hash,signature_key_id,
      provider_message_id,generated_at,delivered_at,attempt_count,error_message,created_at
      FROM redom_ops_report_runs WHERE report_key=$1 LIMIT 1`, [reportKey]);
    if (!result.rows[0]) return res.status(404).json({ success: false, message: "Report not found." });
    await recordOpsAdminAudit("report.detail", reportKey).catch(() => undefined);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ success: true, report: result.rows[0] });
  } catch {
    await recordOpsAdminAudit("report.detail", reportKey, "failed").catch(() => undefined);
    return res.status(500).json({ success: false, message: "Unable to retrieve report details." });
  }
});

router.get("/reports/:reportKey.pdf", requireAdmin, async (req, res) => {
  const reportKey = String(req.params.reportKey ?? "");
  if (!/^daily-ops-\d{1,12}$/.test(reportKey)) return res.status(400).json({ success: false, message: "Invalid report key." });
  try {
    const result = await pool.query("SELECT period_end, pdf_base64, pdf_sha256 FROM redom_ops_report_runs WHERE report_key=$1 AND pdf_base64 IS NOT NULL LIMIT 1", [reportKey]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ success: false, message: "Report PDF not found." });
    const pdf = Buffer.from(String(row.pdf_base64), "base64");
    await recordOpsAdminAudit("report.pdf.download", reportKey).catch(() => undefined);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="ReDom-Daily-Operations-' + new Date(row.period_end).toISOString().slice(0, 10) + '.pdf"');
    res.setHeader("X-Content-SHA256", String(row.pdf_sha256 ?? ""));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(pdf);
  } catch {
    return res.status(500).json({ success: false, message: "Unable to retrieve operations report PDF." });
  }
});

router.get("/admin", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  return res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ReDom Operations Intelligence</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f0f2f5;color:#1c1e21;font:14px Arial,sans-serif}.top{background:#1877f2;color:white;padding:22px 5vw}.wrap{max-width:1200px;margin:24px auto;padding:0 16px}.panel{background:white;border:1px solid #dadde1;border-radius:12px;padding:18px;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.metric{padding:15px;border:1px solid #dadde1;border-radius:9px}.num{font-size:25px;font-weight:700;margin-top:7px}.muted{color:#65676b;font-size:12px}.pill{display:inline-block;padding:5px 9px;border-radius:14px;background:#e7f3ff;color:#0866ff;font-size:12px}button,select,input{padding:10px;border:1px solid #ccd0d5;border-radius:7px;background:white}button{background:#1877f2;color:white;border:0;cursor:pointer;margin:4px}table{width:100%;border-collapse:collapse;overflow-wrap:anywhere}th,td{text-align:left;padding:10px;border-bottom:1px solid #eee;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f8fa;padding:12px;border-radius:8px}.scroll{overflow:auto}.danger{color:#b42318}.good{color:#067647}@media(max-width:600px){th,td{padding:6px;font-size:12px}}</style></head><body><header class="top"><div style="letter-spacing:2px;font-size:11px">REDOM · ADMINISTRATIVE INTELLIGENCE</div><h1 style="margin:9px 0">Daily Operations Control Room</h1><div>Read-only executive reporting · audited access · no production mutations</div></header><main class="wrap"><section class="panel"><h2>Secure administrator access</h2><p class="muted">Enter REDOM_OPS_ADMIN_KEY. It is held only in this page's memory and is not saved in local storage or the URL.</p><input id="key" type="password" autocomplete="off" placeholder="Operations admin key" style="width:min(100%,460px)"><button id="connect">Connect securely</button><span id="status" class="muted"></span></section><section id="dashboard" hidden><section class="panel"><h2>Report history</h2><div id="summary" class="grid"></div><p class="muted">Select a report to inspect its full metrics, fraud-review leads, case numbers, monthly delivery percentages, data coverage and digital signature verification.</p><div class="scroll"><table><thead><tr><th>Reporting period</th><th>Status</th><th>Delivery</th><th>Signature</th><th>Actions</th></tr></thead><tbody id="reports"></tbody></table></div></section><section class="panel"><h2>Selected report</h2><div id="detail" class="muted">Choose a report above.</div></section></section></main><script>
let secret="";const $=id=>document.getElementById(id);async function api(path){const r=await fetch(path,{headers:{"x-redom-ops-key":secret},cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.message||("HTTP "+r.status));return j}function el(tag,text){const n=document.createElement(tag);n.textContent=text;return n}function button(label,fn){const b=el("button",label);b.onclick=fn;return b}function pretty(v){return JSON.stringify(v,null,2)}async function load(){const j=await api("/ops/reports");const body=$("reports");body.replaceChildren();$("summary").replaceChildren();const list=j.reports||[];[["Reports archived",list.length],["Delivered",list.filter(r=>r.delivery_status==="delivered").length],["Failed",list.filter(r=>r.delivery_status==="failed").length],["Digitally signed",list.filter(r=>!!r.report_signature).length]].forEach(([label,value])=>{const d=el("div","");d.className="metric";d.append(el("div",label));const n=el("div",value);n.className="num";d.append(n);$("summary").append(d)});for(const r of list){const tr=el("tr","");tr.append(el("td",r.period_start+" — "+r.period_end));tr.append(el("td",r.status));tr.append(el("td",r.delivery_status));tr.append(el("td",r.report_signature?"Signed":"Unsigned"));const td=el("td","");td.append(button("Inspect",()=>detail(r.report_key)));td.append(button("PDF",async()=>{try{const x=await fetch("/ops/reports/"+encodeURIComponent(r.report_key)+".pdf",{headers:{"x-redom-ops-key":secret},cache:"no-store"});if(!x.ok)throw Error("PDF unavailable");const blob=await x.blob();const a=el("a","Download PDF");a.href=URL.createObjectURL(blob);a.download="ReDom-Operations-"+r.report_key+".pdf";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}catch(e){$("status").textContent=String(e)}}));tr.append(td);body.append(tr)}}async function detail(key){try{const [d,v]=await Promise.all([api("/ops/reports/"+encodeURIComponent(key)),api("/ops/reports/"+encodeURIComponent(key)+"/verify")]);$("detail").replaceChildren();const badge=el("div",v.verificationStatus);badge.className="pill";$("detail").append(badge);$("detail").append(el("p","PDF integrity: "+v.pdfIntegrity+" · Signature valid: "+v.signatureValid+" · PDF SHA-256: "+(v.pdfSha256||"N/A")));$("detail").append(el("h3","Complete report metrics, support case lifecycle, repeat contacts, suspicious review signals and Gemini analysis"));$("detail").append(el("pre",pretty(d.report)));}catch(e){$("detail").textContent=String(e)}}$("connect").onclick=async()=>{secret=$("key").value.trim();if(!secret){$("status").textContent="Enter the admin key.";return}try{await load();$("dashboard").hidden=false;$("status").textContent="Authenticated. Read-only access."; $("key").value="";}catch(e){secret="";$("status").textContent=String(e)}};</script></body></html>`);
});

export default router;

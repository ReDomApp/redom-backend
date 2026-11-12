import axios from "axios";
import { pool } from "../../database/db";

export type AurelinkFxQuote = {
  countryCode: string; currency: string; rate: string; source: string;
  asOf: string; expiresAt: string; amountMinor: number; minorUnit: number;
};

let ratesCache: { rates: Record<string, number>; asOf: number; expiresAt: number } | null = null;
const countryCurrencyCache = new Map<string, string>();

export async function ensureAurelinkMailSecuritySchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE aurelink_email_billing_payments
      ADD COLUMN IF NOT EXISTS pricing_country CHAR(2),
      ADD COLUMN IF NOT EXISTS pricing_currency CHAR(3),
      ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(24,12),
      ADD COLUMN IF NOT EXISTS fx_source TEXT,
      ADD COLUMN IF NOT EXISTS fx_as_of TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS fx_expires_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS aurelink_email_credit_confirmation_outbox (
      id BIGSERIAL PRIMARY KEY,
      payment_reference TEXT NOT NULL UNIQUE REFERENCES aurelink_email_billing_payments(reference),
      recipient_email TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS aurelink_email_credit_confirmation_due_idx
      ON aurelink_email_credit_confirmation_outbox(next_attempt_at)
      WHERE status <> 'sent';
  `);
}

async function currencyForCountry(countryCode: string): Promise<string> {
  const code = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new Error("A valid two-letter pricing country is required.");
  const cached = countryCurrencyCache.get(code);
  if (cached) return cached;
  const response = await axios.get("https://restcountries.com/v3.1/alpha/" + encodeURIComponent(code) + "?fields=currencies", {
    timeout: 8000, maxRedirects: 0, validateStatus: status => status === 200
  });
  const record = Array.isArray(response.data) ? response.data[0] : response.data;
  const currencies = Object.keys(record?.currencies || {}).filter(value => /^[A-Z]{3}$/.test(value)).sort();
  if (currencies.length !== 1) throw new Error("A single supported settlement currency could not be determined for the selected country.");
  countryCurrencyCache.set(code, currencies[0]);
  return currencies[0];
}

async function usdRates(): Promise<{ rates: Record<string, number>; asOf: number; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  if (ratesCache && ratesCache.expiresAt > now && ratesCache.asOf > now - 36 * 3600) return ratesCache;
  const response = await axios.get("https://open.er-api.com/v6/latest/USD", {
    timeout: 10000, maxRedirects: 0, validateStatus: status => status === 200
  });
  const data = response.data;
  const asOf = Number(data?.time_last_update_unix);
  const expiresAt = Number(data?.time_next_update_unix);
  if (data?.result !== "success" || data?.base_code !== "USD" ||
      !Number.isSafeInteger(asOf) || !Number.isSafeInteger(expiresAt) ||
      asOf > now + 300 || asOf < now - 36 * 3600 || expiresAt <= now) {
    throw new Error("The live USD exchange-rate feed is unavailable or stale. Checkout has been stopped.");
  }
  const rates: Record<string, number> = {};
  for (const [code, raw] of Object.entries(data.rates || {})) {
    const rate = Number(raw);
    if (/^[A-Z]{3}$/.test(code) && Number.isFinite(rate) && rate > 0) rates[code] = rate;
  }
  ratesCache = { rates, asOf, expiresAt };
  return ratesCache;
}

export async function quoteAurelinkMailUsd(
  usdMinor: number, countryCode: string
): Promise<AurelinkFxQuote> {
  await ensureAurelinkMailSecuritySchema();
  if (!Number.isSafeInteger(usdMinor) || usdMinor < 1) throw new Error("Invalid USD catalogue amount.");
  const currency = await currencyForCountry(countryCode);
  const feed = await usdRates();
  const rate = currency === "USD" ? 1 : feed.rates[currency];
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("No live USD exchange rate is available for " + currency + ". Checkout has been stopped.");
  let minorUnit = 2;
  try {
    minorUnit = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  } catch { throw new Error("Unsupported ISO currency for selected country."); }
  if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 4) throw new Error("Unsupported currency precision.");
  const amountMinor = Math.round((usdMinor / 100) * rate * Math.pow(10, minorUnit));
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Live FX conversion produced an invalid amount.");
  return {
    countryCode: countryCode.toUpperCase(), currency, rate: rate.toFixed(12),
    source: "ExchangeRate-API open.er-api.com", asOf: new Date(feed.asOf * 1000).toISOString(),
    expiresAt: new Date(feed.expiresAt * 1000).toISOString(), amountMinor, minorUnit
  };
}

export async function processAurelinkMailCreditConfirmationOutbox(batchSize = 10): Promise<void> {
  await ensureAurelinkMailSecuritySchema();
  const limit = Math.max(1, Math.min(25, Math.floor(batchSize)));
  for (let i = 0; i < limit; i++) {
    const client = await pool.connect();
    let row: any;
    try {
      await client.query("BEGIN");
      const claimed = await client.query(`
        SELECT id, payment_reference, recipient_email, payload, attempts
          FROM aurelink_email_credit_confirmation_outbox
         WHERE status <> 'sent' AND next_attempt_at <= NOW()
           AND (status <> 'processing' OR locked_at < NOW() - INTERVAL '5 minutes')
         ORDER BY created_at
         LIMIT 1 FOR UPDATE SKIP LOCKED
      `);
      row = claimed.rows[0];
      if (!row) { await client.query("COMMIT"); break; }
      await client.query("UPDATE aurelink_email_credit_confirmation_outbox SET status='processing',locked_at=NOW(),attempts=attempts+1,updated_at=NOW() WHERE id=$1", [row.id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }

    try {
      const apiKey = String(process.env.RESEND_API_KEY || "").trim();
      const from = String(process.env.AURELINK_MAIL_BILLING_FROM || process.env.AURELINK_RECEIPT_FROM || "").trim();
      if (!apiKey || !from) throw new Error("Resend confirmation email configuration is missing.");
      const p = row.payload || {};
      const money = String(p.amount || "");
      const textBody = [
        "Aurelink Mail payment successful",
        "Your payment has been verified and the purchased credits have been added to your Aurelink wallet.",
        "Aurelink Account ID: " + String(p.accountId || ""),
        "Purchase reference: " + String(row.payment_reference),
        "Provider: " + String(p.provider || ""),
        "Package: " + String(p.credits || "") + " email credits",
        "Amount paid: " + money,
        "Pricing country: " + String(p.country || ""),
        "FX rate (USD to " + String(p.currency || "") + "): " + String(p.fxRate || "1"),
        "FX source: " + String(p.fxSource || "USD"),
        "FX rate timestamp: " + String(p.fxAsOf || ""),
        "Rates by ExchangeRate-API: https://www.exchangerate-api.com",
        "Wallet balance before: " + String(p.previousBalance || ""),
        "Credits added: " + String(p.credits || ""),
        "Wallet balance after: " + String(p.newBalance || ""),
        "Ledger reference: " + String(p.ledgerReference || ""),
        "Payment status: SUCCESS",
        "Credit fulfillment status: SUCCESS",
        "Completed at: " + String(p.completedAt || "")
      ].join("\n");
      const html = "<h2>Aurelink Mail payment successful</h2><p>Your payment has been verified and the purchased credits have been added to your Aurelink wallet.</p>" +
        "<table>" + [
          ["Aurelink Account ID",p.accountId],["Purchase reference",row.payment_reference],["Provider",p.provider],
          ["Package",String(p.credits || "")+" credits"],["Amount paid",money],["Pricing country",p.country],
          ["FX rate",p.fxRate],["FX source",p.fxSource],["FX timestamp",p.fxAsOf],
          ["Wallet balance before",p.previousBalance],["Credits added",p.credits],
          ["Wallet balance after",p.newBalance],["Ledger reference",p.ledgerReference],
          ["Payment status","SUCCESS"],["Credit fulfillment status","SUCCESS"],["Completed at",p.completedAt]
        ].map(([k,v])=>"<tr><td>"+String(k)+"</td><td>"+String(v ?? "").replace(/[&<>"]/g,ch=>ch==="&"?"&amp;":ch==="<"?"&lt;":ch===">"?"&gt;":"&quot;")+"</td></tr>").join("")+"</table><p><a href='https://www.exchangerate-api.com'>Rates by ExchangeRate-API</a></p>";
      const sent = await axios.post("https://api.resend.com/emails", {
        from, to: [row.recipient_email], subject: "Aurelink Mail payment confirmed — credits added", text: textBody, html
      }, { headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json", "Idempotency-Key": "aurelink-mail-credit-confirmation/" + String(row.payment_reference) }, timeout: 15000 });
      if (!sent.data?.id) throw new Error("Resend did not confirm acceptance of the credit receipt.");
      await pool.query("UPDATE aurelink_email_credit_confirmation_outbox SET status='sent',delivered_at=NOW(),locked_at=NULL,last_error=NULL,updated_at=NOW() WHERE id=$1", [row.id]);
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1;
      const delaySeconds = Math.min(86400, Math.pow(2, Math.min(attempts, 10)) * 30);
      const safeError = error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed.";
      await pool.query("UPDATE aurelink_email_credit_confirmation_outbox SET status='pending',locked_at=NULL,next_attempt_at=NOW()+($2::text||' seconds')::interval,last_error=$3,updated_at=NOW() WHERE id=$1", [row.id, delaySeconds, safeError]);
    }
  }
}

let workerStarted = false;
export function startAurelinkMailCreditConfirmationWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  const timer = setInterval(() => {
    void processAurelinkMailCreditConfirmationOutbox(10).catch(() => undefined);
  }, 30000);
  timer.unref?.();
}

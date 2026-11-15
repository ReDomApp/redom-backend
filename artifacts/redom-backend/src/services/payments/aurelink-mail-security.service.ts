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
      ADD COLUMN IF NOT EXISTS fx_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS credit_ledger_reference TEXT,
      ADD COLUMN IF NOT EXISTS provider_transaction_reference TEXT,
      ADD COLUMN IF NOT EXISTS reference_format_version SMALLINT NOT NULL DEFAULT 1;
    ALTER TABLE aurelink_email_credit_ledger
      ADD COLUMN IF NOT EXISTS reference_format_version SMALLINT NOT NULL DEFAULT 1;
    UPDATE aurelink_email_billing_payments p
       SET credit_ledger_reference=l.reference
      FROM aurelink_email_credit_ledger l
     WHERE l.payment_reference=p.reference
       AND l.entry_type='purchase' AND l.direction='credit'
       AND p.credit_ledger_reference IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_payment_ledger_reference_uq
      ON aurelink_email_billing_payments(credit_ledger_reference)
      WHERE credit_ledger_reference IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_credit_ledger_purchase_payment_uq
      ON aurelink_email_credit_ledger(payment_reference)
      WHERE payment_reference IS NOT NULL AND entry_type='purchase' AND direction='credit';
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_payment_provider_transaction_uq
      ON aurelink_email_billing_payments(payment_provider, provider_transaction_reference)
      WHERE provider_transaction_reference IS NOT NULL;
    CREATE TABLE IF NOT EXISTS aurelink_email_payment_reference_reservations (
      reference TEXT PRIMARY KEY,
      reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS aurelink_email_payment_reference_events (
      id BIGSERIAL PRIMARY KEY,
      payment_reference TEXT NOT NULL REFERENCES aurelink_email_billing_payments(reference),
      event_type TEXT NOT NULL,
      provider TEXT,
      provider_event_id TEXT,
      provider_transaction_reference TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS aurelink_email_payment_reference_provider_event_uq
      ON aurelink_email_payment_reference_events(provider, provider_event_id)
      WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS aurelink_email_payment_reference_events_payment_idx
      ON aurelink_email_payment_reference_events(payment_reference, created_at);
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
    minorUnit = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
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
        SELECT o.id, o.payment_reference, o.recipient_email, o.payload, o.attempts, p.amount_minor AS usd_amount_minor
          FROM aurelink_email_credit_confirmation_outbox o
          JOIN aurelink_email_billing_payments p ON p.reference=o.payment_reference
         WHERE o.status <> 'sent' AND o.next_attempt_at <= NOW()
           AND (o.status <> 'processing' OR o.locked_at < NOW() - INTERVAL '5 minutes')
         ORDER BY o.created_at
         LIMIT 1 FOR UPDATE OF o SKIP LOCKED
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
      const htmlEntities:Record<string,string> = { "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" };
      const esc = (value: unknown) => String(value ?? "Not available").replace(/[&<>"']/g, ch => htmlEntities[ch]);
      const money = String(p.amount || "Not available");
      const usd = "$" + Number(p.usdAmount ?? (Number(row.usd_amount_minor || 0) / 100)).toFixed(2) + " USD";
      const credits = Number(p.credits || 0).toLocaleString("en-US");
      const accountId = String(p.accountId || "Not available");
      const packageName = String(p.packageName || ("Aurelink Mail Prepaid Email Credit Package · " + String(p.packageSize || credits)));
      const provider = String(p.provider || "Not available");
      const paymentMethod = String(p.paymentMethod || "Not provided by payment provider");
      const providerReference = String(p.providerTransactionReference || row.payment_reference);
      const currency = String(p.currency || "USD");
      const fxRate = String(p.fxRate || "1");
      const fxSource = String(p.fxSource || "USD catalogue");
      const fxAsOf = String(p.fxAsOf || "Not available");
      const previousBalance = Number(p.previousBalance || 0).toLocaleString("en-US");
      const newBalance = Number(p.newBalance || 0).toLocaleString("en-US");
      const ledgerReference = String(p.ledgerReference || "Not available");
      const completedAt = String(p.completedAt || "Not available");
      const countryValue = String(p.paymentCountry || p.accountCountry || "Not available");
      const accountCountry = /^[A-Z]{2}$/i.test(countryValue)
        ? (new Intl.DisplayNames(["en"],{type:"region"}).of(countryValue.toUpperCase()) || countryValue)
        : countryValue;
      const pricingCountry = String(p.country || accountCountry);
      const paymentRows: Array<[string,string]> = [
        ["Payment provider",provider],["Method",paymentMethod],["Card number",String(p.cardNumber || "Not provided by payment provider")],
        ["Country",accountCountry],["Card type",String(p.cardType || "Not provided by payment provider")],
        ["Package purchased",packageName],["Credits purchased",credits],
        ["Amount paid",money],["USD equivalent",usd],
        ["Exchange rate used","1 USD = "+fxRate+" "+currency],
        ["Payment status",String(p.paymentStatus || "SUCCESSFUL")]
      ];
      const currencyRows: Array<[string,string]> = [
        ["Original payment",money],["Applied exchange rate","1 USD = "+fxRate+" "+currency],
        ["Converted amount",usd],["Pricing country",pricingCountry],
        ["Rate source",fxSource],["Rate timestamp",fxAsOf]
      ];
      const balanceRows: Array<[string,string]> = [
        ["Previous balance",previousBalance],["Credits purchased","+"+credits],["New balance",newBalance]
      ];
      const ledgerRows: Array<[string,string]> = [
        ["Credit ledger reference",ledgerReference],["Allocation source","Verified payment"],
        ["Allocation amount",credits+" credits"],["Transaction integrity",String(p.transactionIntegrity || "VERIFIED")],
        ["Provider transaction reference",providerReference],["Purchase reference",String(row.payment_reference)]
      ];
      const table = (rows:Array<[string,string]>) => "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;border:1px solid #DADDE1'>" +
        rows.map(([k,v])=>"<tr><td style='padding:11px 14px;border-bottom:1px solid #DADDE1;color:#65676B'>"+esc(k)+"</td><td style='padding:11px 14px;border-bottom:1px solid #DADDE1;text-align:right;font-weight:600'>"+esc(v)+"</td></tr>").join("")+"</table>";
      const html = "<!doctype html><html><body style='margin:0;background:#F0F2F5;color:#1C1E21;font-family:Arial,Helvetica,sans-serif'><table role='presentation' width='100%' cellpadding='0' cellspacing='0'><tr><td align='center' style='padding:24px 10px'><table role='presentation' width='100%' style='max-width:660px;background:#fff;border:1px solid #DADDE1;border-collapse:collapse'><tr><td style='padding:24px 28px;border-bottom:1px solid #DADDE1;text-align:center;color:#1877F2;font-size:23px;font-weight:700'>Aurelink</td></tr><tr><td style='padding:28px'><div style='font-size:12px;color:#65676B;font-weight:700;letter-spacing:1px'>PAYMENTS &amp; BILLING</div><h1 style='font-size:25px;margin:10px 0'>Payment Successful</h1><p style='font-size:16px;line-height:1.6'>Your credits have been added successfully.</p><p style='font-size:13px;color:#1877F2;font-weight:700'>Payment verified · Credit allocation confirmed</p><div style='margin:22px 0;padding:18px;background:#F0F2F5'><div style='font-size:11px;color:#65676B;font-weight:700'>PACKAGE PURCHASED</div><div style='font-size:24px;font-weight:700;margin-top:8px'>"+esc(credits)+" Credits</div><div style='font-size:18px;margin-top:5px'>"+esc(usd)+"</div><div style='font-size:13px;color:#65676B;margin-top:5px'>"+esc(packageName)+"</div><div style='font-size:12px;color:#65676B;margin-top:8px'>Account ID "+esc(accountId)+"</div></div><p>Hello,</p><p style='line-height:1.6'>Your payment has been successfully verified and processed. Aurelink has received confirmation from the payment provider and successfully credited your account. Here is your official transaction receipt.</p><h2 style='font-size:16px;margin:26px 0 10px'>ACCOUNT INFORMATION</h2>"+table(paymentRows)+"<h2 style='font-size:16px;margin:26px 0 10px'>CURRENCY CONVERSION</h2>"+table(currencyRows)+"<p style='font-size:12px;color:#65676B;line-height:1.5'>The exchange rate shown is the rate locked and recorded for this transaction, not a live FX quotation. USD equivalent reflects the original USD catalogue price.</p><h2 style='font-size:16px;margin:26px 0 10px'>CREDIT BALANCE SUMMARY</h2>"+table(balanceRows)+"<div style='padding:18px 0'><div style='font-size:12px;color:#65676B'>NEW AVAILABLE BALANCE</div><div style='font-size:28px;font-weight:700;margin-top:5px'>"+esc(newBalance)+" Credits</div><p style='font-size:13px;color:#65676B'>Your wallet balance has been updated successfully.</p></div><h2 style='font-size:16px;margin:26px 0 10px'>CREDIT LEDGER INFORMATION</h2>"+table(ledgerRows)+"<h2 style='font-size:16px;margin:26px 0 10px'>FINAL TRANSACTION STATUS</h2><p style='line-height:1.8'>Payment successfully verified<br>Payment provider confirmation received<br>Currency conversion completed<br>Credit ledger entry committed<br>Account balance updated</p><p><strong>Payment: SUCCESSFUL</strong><br><strong>Credit Allocation: SUCCESSFUL</strong></p><p>Both operations have been confirmed.</p><p>Thank you for choosing Aurelink.<br>Aurelink Billing &amp; Payments Team</p><p style='font-size:11px;color:#65676B'>Automated transaction confirmation. Please do not reply to this email.</p></td></tr><tr><td style='padding:18px 28px;border-top:1px solid #DADDE1;text-align:center;font-size:11px;color:#65676B'>© 2026 Aurelink. All rights reserved. Official Payment Receipt<br>Completed: "+esc(completedAt)+"</td></tr></table></td></tr></table></body></html>";
      const textBody = [
        "Payments & Billing","Payment Successful","Your credits have been added successfully.",
        "Payment verified · Credit allocation confirmed","","PACKAGE PURCHASED",
        "Account ID: "+accountId,credits+" Credits",usd,packageName,
        "","Hello,","Your payment has been successfully verified and processed. Aurelink has received confirmation from the payment provider and successfully credited your account.",
        "Here is your official transaction receipt.","","ACCOUNT INFORMATION",
        ...paymentRows.map(([k,v])=>k+": "+v),"","CURRENCY CONVERSION",
        ...currencyRows.map(([k,v])=>k+": "+v),
        "The exchange rate shown is the rate locked and recorded for this transaction, not a live FX quotation.",
        "","CREDIT BALANCE SUMMARY",...balanceRows.map(([k,v])=>k+": "+v),
        "","NEW AVAILABLE BALANCE",newBalance+" Credits","Your wallet balance has been updated successfully.",
        "","CREDIT LEDGER INFORMATION",...ledgerRows.map(([k,v])=>k+": "+v),
        "","FINAL TRANSACTION STATUS","Payment successfully verified","Payment provider confirmation received",
        "Currency conversion completed","Credit ledger entry committed","Account balance updated",
        "Payment: SUCCESSFUL","Credit Allocation: SUCCESSFUL","Both operations have been confirmed.",
        "","Thank you for choosing Aurelink.","Aurelink Billing & Payments Team",
        "Automated transaction confirmation. Please do not reply to this email.",
        "© 2026 Aurelink. All rights reserved. Official Payment Receipt"
      ].join("\n");
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

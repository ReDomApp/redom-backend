import { env } from "../../config/env";
import { pool } from "../../database/db";
import type { SupportAccountContext } from "./support.service";

export type SupportEmailResolvedAction = {
  label: string;
  url: string;
};

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_DOCS = "https://docs.stripe.com";
const STRIPE_ROOT = "https://stripe.com";
const REDOM_DOCS = env.email.supportDocsUrl.replace(/\/+$/, "");
const REDOM_HELP = env.email.supportHelpUrl.replace(/\/+$/, "");

const STRIPE_DOC_PATHS: Record<string, string> = {
  currencies: "/currencies",
  "payment-methods": "/api/payment_methods",
  "payment-methods-guide": "/payments/payment-methods",
  checkout: "/payments/checkout",
  refunds: "/api/refunds",
  "refunds-guide": "/refunds",
  "payment-intents": "/payments/payment-intents",
  "setup-intents": "/payments/save-and-reuse",
};

const REDOM_POLICY_PATHS: Record<string, string> = {
  terms: "/policies/terms",
  privacy: "/policies/privacy",
  community: "/policies/community",
  messaging: "/policies/messaging",
  media: "/policies/media",
  calls: "/policies/calls",
  notifications: "/policies/notifications",
  security: "/policies/security",
  verification: "/policies/verification",
  ai: "/policies/ai",
  regional: "/policies/regional",
  refunds: "/policies/refunds",
  support: "/policies/support",
  link_history: "/policies/link-history",
  payments: "/policies/payments",
};

const REDOM_HELP_PATHS: Record<string, string> = {
  payments: "/payments",
  refunds: "/payments/refunds",
  account: "/account",
  security: "/security",
  verification: "/verification",
  messaging: "/messaging",
  marketplace: "/marketplace",
};
const PAYMENT_WORDS = /payment|pay|paid|charge|charged|invoice|receipt|refund|refunds|billing|card|transaction|checkout|subscription/i;
const LINK_REQUEST_WORDS = /\b(?:link|url|website|page|open|where|documentation|docs|policy|terms|conditions|receipt|invoice|view|access|see|show)\b/i;

function explicitlyRequestsLink(message: string): boolean {
  return LINK_REQUEST_WORDS.test(String(message ?? ""));
}

function explicitlyRequestsInvoice(message: string): boolean {
  return /\b(?:invoice|receipt|payment receipt|proof of payment)\b/i.test(String(message ?? ""));
}

function explicitlyRequestsPaymentDocs(message: string): boolean {
  return /\b(?:stripe|payment|refund|billing|checkout)\b/i.test(String(message ?? ""))
    && /\b(?:link|url|website|documentation|docs|guide|information|info|policy|how does)\b/i.test(String(message ?? ""));
}

function redomUrl(path: string): string {
  const base = env.email.webBaseUrl.replace(/\/+$/, "");
  const normalized = path.startsWith("/") ? path : "/" + path;
  return base + normalized;
}

function isRedomSupportUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === new URL(REDOM_DOCS).origin || url.origin === new URL(REDOM_HELP).origin;
  } catch {
    return false;
  }
}

function isStripeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com");
  } catch {
    return false;
  }
}

export function isAllowedSupportEmailUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const web = new URL(env.email.webBaseUrl);
    if (url.origin === web.origin) return true;
    return isRedomSupportUrl(value) || isStripeUrl(value);
  } catch {
    return false;
  }
}

function action(label: string, url: string): SupportEmailResolvedAction | null {
  return isAllowedSupportEmailUrl(url) ? { label, url } : null;
}

function extractPaymentIdentifiers(message: string): string[] {
  const values = new Set<string>();
  const text = String(message ?? "");
  for (const match of text.matchAll(/\b(?:R-?\d{7,20}|RP-[7-9]\d{6,11}|RS-[1-3]\d{12,15})\b/gi)) {
    const raw = match[0].toUpperCase();
    values.add(raw);
    if (/^R-/.test(raw)) values.add(raw.replace("-", ""));
  }
  return [...values].slice(0, 8);
}

async function getOwnedStripePayment(userId: string, message: string): Promise<{ providerTransactionId: string | null; metadata: any } | null> {
  const identifiers = extractPaymentIdentifiers(message);
  if (!identifiers.length) return null;

  const result = await pool.query(
    `SELECT provider_transaction_id, metadata, payment_provider
       FROM payment_transactions
      WHERE user_id = $1
        AND (
          upper(COALESCE(redom_transaction_id, '')) = ANY($2::text[])
          OR upper(COALESCE(reference, '')) = ANY($2::text[])
          OR upper(COALESCE(provider_transaction_id, '')) = ANY($2::text[])
        )
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, identifiers],
  );
  if (!result.rows[0] || String(result.rows[0].payment_provider ?? "").toLowerCase() !== "stripe") return null;

  let metadata: any = {};
  try {
    metadata = typeof result.rows[0].metadata === "string"
      ? JSON.parse(result.rows[0].metadata)
      : (result.rows[0].metadata ?? {});
  } catch {
    metadata = {};
  }
  return {
    providerTransactionId: result.rows[0].provider_transaction_id ? String(result.rows[0].provider_transaction_id) : null,
    metadata,
  };
}

async function stripeGet(path: string): Promise<any | null> {
  if (!env.stripe.secretKey) return null;
  try {
    const response = await fetch(STRIPE_API + path, {
      headers: { Authorization: "Bearer " + env.stripe.secretKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function resolveStripeCustomerUrl(providerTransactionId: string, metadata: any): Promise<string | null> {
  const metadataInvoice = metadata?.stripeInvoiceId ?? metadata?.invoiceId ?? metadata?.paymentDetails?.invoiceId;
  if (typeof metadataInvoice === "string" && /^in_[A-Za-z0-9]+$/.test(metadataInvoice)) {
    const invoice = await stripeGet("/invoices/" + encodeURIComponent(metadataInvoice));
    const url = typeof invoice?.hosted_invoice_url === "string" ? invoice.hosted_invoice_url : null;
    if (url && isStripeUrl(url)) return url;
  }

  if (/^in_[A-Za-z0-9]+$/.test(providerTransactionId)) {
    const invoice = await stripeGet("/invoices/" + encodeURIComponent(providerTransactionId));
    const url = typeof invoice?.hosted_invoice_url === "string" ? invoice.hosted_invoice_url : null;
    if (url && isStripeUrl(url)) return url;
  }

  if (/^pi_[A-Za-z0-9]+$/.test(providerTransactionId)) {
    const paymentIntent = await stripeGet(
      "/payment_intents/" + encodeURIComponent(providerTransactionId) + "?expand[]=latest_charge&expand[]=invoice",
    );
    const invoiceUrl = typeof paymentIntent?.invoice?.hosted_invoice_url === "string"
      ? paymentIntent.invoice.hosted_invoice_url
      : null;
    if (invoiceUrl && isStripeUrl(invoiceUrl)) return invoiceUrl;

    const receiptUrl = typeof paymentIntent?.latest_charge?.receipt_url === "string"
      ? paymentIntent.latest_charge.receipt_url
      : null;
    if (receiptUrl && isStripeUrl(receiptUrl)) return receiptUrl;
  }

  if (/^ch_[A-Za-z0-9]+$/.test(providerTransactionId)) {
    const charge = await stripeGet("/charges/" + encodeURIComponent(providerTransactionId));
    const receiptUrl = typeof charge?.receipt_url === "string" ? charge.receipt_url : null;
    if (receiptUrl && isStripeUrl(receiptUrl)) return receiptUrl;
  }

  return null;
}

export async function buildSupportEmailActions(input: {
  account: SupportAccountContext | null;
  message: string;
  category: string;
  caseNumber: string;
  policySlug?: string | null;
}): Promise<SupportEmailResolvedAction[]> {
  const actions: SupportEmailResolvedAction[] = [];
  const paymentRelated = input.category === "refund_payment"
    || input.category === "payment_transaction_problem"
    || input.category === "payment_method_problem"
    || PAYMENT_WORDS.test(input.message)
    || input.policySlug === "payments"
    || input.policySlug === "refunds";
  const wantsLink = explicitlyRequestsLink(input.message);
  const wantsPaymentDocs = explicitlyRequestsPaymentDocs(input.message);
  const wantsInvoice = explicitlyRequestsInvoice(input.message);

  if (input.policySlug && REDOM_POLICY_PATHS[input.policySlug]) {
    const policyLabel = input.policySlug === "payments"
      ? "Understanding ReDom Payment Policy"
      : input.policySlug === "refunds"
        ? "Understanding ReDom Refund Policy"
        : "Understanding ReDom " + input.policySlug.replace(/_/g, " ") + " Policy";
    const policy = action(policyLabel, REDOM_DOCS + REDOM_POLICY_PATHS[input.policySlug]);
    if (policy) actions.push(policy);
  }

  if (paymentRelated && wantsPaymentDocs) {
    const lower = input.message.toLowerCase();
    let key = "payment-methods-guide";
    if (/currency|currencies|supported currency|charge in .*currency|ngn|usd|eur|gbp/.test(lower)) key = "currencies";
    else if (/refund/.test(lower)) key = "refunds-guide";
    else if (/checkout/.test(lower)) key = "checkout";
    const stripeDocs = action(
      key === "currencies" ? "View Stripe Supported Currencies" :
      key === "refunds-guide" ? "View Stripe Refund Information" :
      key === "checkout" ? "View Stripe Checkout Documentation" :
      "View Stripe Payment Methods",
      STRIPE_DOCS + STRIPE_DOC_PATHS[key],
    );
    if (stripeDocs) actions.push(stripeDocs);
  }

  // Account-specific destinations are only emitted for an authenticated, currently active
  // ReDom account. The account must be the same account that owns the resource.
  if (input.account?.accountStatus === "active" && input.account.userId) {
    const supportCase = await pool.query(
      "SELECT 1 FROM support_cases WHERE case_number=$1 AND user_id=$2 LIMIT 1",
      [input.caseNumber.toUpperCase(), input.account.userId],
    );
    if (supportCase.rows[0] && (wantsLink || /\b(?:case|status|conversation|ticket)\b/i.test(input.message))) {
      const viewCase = action(
        "View Your Support Case",
        redomUrl("/support/cases/" + encodeURIComponent(input.caseNumber)),
      );
      if (viewCase) actions.push(viewCase);
    }

    if (paymentRelated && wantsInvoice) {
      const stripePayment = await getOwnedStripePayment(input.account.userId, input.message);
      if (stripePayment?.providerTransactionId) {
        const stripeUrl = await resolveStripeCustomerUrl(
          stripePayment.providerTransactionId,
          stripePayment.metadata,
        );
        if (stripeUrl) {
          const invoice = action(
            "View Your Payment Invoice",
            stripeUrl,
          );
          if (invoice) actions.push(invoice);
        }
      }
    }
  }

  return actions;
}

export const SUPPORT_EMAIL_LINK_RULES = {
  reDomOrigin: new URL(env.email.webBaseUrl).origin,
  reDomDocsOrigin: new URL(REDOM_DOCS).origin,
  reDomHelpOrigin: new URL(REDOM_HELP).origin,
  stripeRoot: STRIPE_ROOT,
  stripeDocsRoot: STRIPE_DOCS,
  accountSpecificRequiresActiveAccount: true,
} as const;

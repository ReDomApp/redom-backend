import type { PoolClient } from "pg";
import { walletCredit, walletDebit } from "./aurelink-wallet.service";

type QueryClient = Pick<PoolClient, "query">;\n
/**
 * Count billable SMS segments using GSM-7 septet rules, including extension
 * characters, or UCS-2 UTF-16 code units when any character is outside GSM-7.
 * Concatenated messages use the standard 153/67 unit capacities.
 */
export function countSmsSegments(message: string): number {
  const value = String(message ?? "");
  if (!value.length) return 1;
  const gsmBasic = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]*$/;
  const gsmExtension = new Set(["^", "{", "}", "\\", "[", "]", "~", "|", "€"]);
  if (gsmBasic.test(value)) {
    let septets = 0;
    for (const character of value) septets += gsmExtension.has(character) ? 2 : 1;
    return septets <= 160 ? 1 : Math.ceil(septets / 153);
  }
  const units = value.length;
  return units <= 70 ? 1 : Math.ceil(units / 67);
}


export async function chargeAurelinkUsage(
  client: QueryClient,
  input: {
    userId: string;
    workspaceId: string;
    messageId: string;
    service: "sms_segment" | "email_message" | "smtp_message" | string;
    units: number;
    countryCode?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ unitPriceMinor: number; amountMinor: string; reference: string; priceId: string }> {
  if (!Number.isInteger(input.units) || input.units < 1) throw new Error("AURELINK_INVALID_USAGE_UNITS");
  const country = String(input.countryCode || "*").toUpperCase();
  const provider = String(input.metadata?.provider || "*").toLowerCase();
  const category = String(input.metadata?.category || "*").toLowerCase();
  const result = await client.query(
    `SELECT id,unit_price_minor,currency
       FROM aurelink_communications_price_catalog
      WHERE service=$1 AND active=TRUE
        AND (country_code=$2 OR country_code='*')
        AND (provider=$3 OR provider='*')
        AND (category=$4 OR category='*')
        AND (workspace_id=$5 OR workspace_id IS NULL)
        AND effective_from<=NOW()
        AND (effective_until IS NULL OR effective_until>NOW())
      ORDER BY
        (country_code=$2)::int DESC,
        (provider=$3)::int DESC,
        (category=$4)::int DESC,
        COALESCE((workspace_id=$5)::int,0) DESC,
        effective_from DESC
      LIMIT 1`,
    [input.service, country, provider, category, input.workspaceId],
  );
  const price = result.rows[0];
  if (!price) {
    throw Object.assign(new Error("No active Aurelink price is configured for this service, destination and route."), {
      code: "AURELINK_PRICE_NOT_CONFIGURED",
    });
  }
  const unitPriceMinor = Number(price.unit_price_minor);
  if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor <= 0 || String(price.currency) !== "USD") {
    throw Object.assign(new Error("The configured Aurelink price is invalid or uses an unsupported currency."), {
      code: "AURELINK_INVALID_PRICE",
    });
  }
  const amountMinor = (BigInt(unitPriceMinor) * BigInt(input.units)).toString();
  const reference = "AL-COMM-" + input.messageId;
  const existing = await client.query(
    "SELECT wallet_reference,unit_price_minor,amount_minor,price_id FROM aurelink_communications_billing_ledger WHERE message_id=$1 AND entry_type='charge' FOR UPDATE",
    [input.messageId],
  );
  if (existing.rows[0]) {
    return {
      unitPriceMinor: Number(existing.rows[0].unit_price_minor),
      amountMinor: String(existing.rows[0].amount_minor),
      reference: String(existing.rows[0].wallet_reference),
      priceId: String(existing.rows[0].price_id),
    };
  }
  await walletDebit(client, {
    userId: input.userId,
    amountMinor,
    reference,
    type: "purchase",
    description: "Aurelink communications usage",
    metadata: { messageId: input.messageId, service: input.service, units: input.units, ...input.metadata },
  });
  await client.query(
    `INSERT INTO aurelink_communications_billing_ledger
      (user_id,workspace_id,message_id,entry_type,status,price_id,units,unit_price_minor,amount_minor,currency,wallet_reference,metadata)
     VALUES($1,$2,$3,'charge','reserved',$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [input.userId,input.workspaceId,input.messageId,price.id,input.units,unitPriceMinor,amountMinor,price.currency,reference,JSON.stringify(input.metadata || {})],
  );
  return { unitPriceMinor, amountMinor, reference, priceId: String(price.id) };
}

/** Marks a previously reserved charge as captured after provider acceptance. */
export async function captureAurelinkUsage(client: QueryClient, messageId: string): Promise<void> {
  await client.query(
    "UPDATE aurelink_communications_billing_ledger SET status='posted',updated_at=NOW() WHERE message_id=$1 AND entry_type='charge' AND status='reserved'",
    [messageId],
  );
}

/** Idempotently refunds a reserved or captured usage charge. Caller owns transaction. */
export async function refundAurelinkUsage(
  client: QueryClient,
  messageId: string,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const result = await client.query(
    "SELECT id,amount_minor,currency,wallet_reference,status,units,unit_price_minor FROM aurelink_communications_billing_ledger WHERE message_id=$1 AND user_id=$2 AND workspace_id=$3 AND entry_type='charge' FOR UPDATE",
    [messageId,userId,workspaceId],
  );
  const charge = result.rows[0];
  if (!charge || charge.status === "refunded") return;
  const refundReference = String(charge.wallet_reference) + "-R";
  await walletCredit(client, {
    userId,
    amountMinor: String(charge.amount_minor),
    reference: refundReference,
    type: "refund",
    description: "Refund for failed Aurelink communications delivery",
    metadata: { messageId, originalReference: charge.wallet_reference },
  });
  await client.query(
    "INSERT INTO aurelink_communications_billing_ledger(user_id,workspace_id,message_id,entry_type,status,units,unit_price_minor,amount_minor,currency,wallet_reference,metadata) VALUES($1,$2,$3,'refund','posted',$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(message_id,entry_type) DO NOTHING",
    [userId,workspaceId,messageId,Number(charge.units),Number(charge.unit_price_minor),String(charge.amount_minor),String(charge.currency),refundReference,JSON.stringify({ originalChargeId: charge.id })],
  );
  await client.query(
    "UPDATE aurelink_communications_billing_ledger SET status='refunded',updated_at=NOW() WHERE id=$1",
    [charge.id],
  );
}

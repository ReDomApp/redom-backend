export type AurelinkNumberProduct = "short_term" | "long_term" | "dedicated";

export interface AurelinkPriceBreakdown {
  providerAmountMinor: number;
  aurelinkChargeMinor: number;
  checkFeeMinor: number;
  firstPurchaseDiscountMinor: number;
  totalMinor: number;
}

const USD_MINOR = 100;

function readCheckFeeMinor(envName: string): number {
  const raw = process.env[envName];
  const fallback = envName === "AURELINK_SHORT_TERM_CHECK_FEE_USD_CENTS" ? 20 : 100;
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

/**
 * Server-authoritative customer pricing:
 * provider amount + an equal Aurelink charge + the check fee for this product.
 * A zero, negative, or invalid provider price is never quotable.
 */
export function aurelinkPriceBreakdown(
  providerPriceUsd: number,
  product: AurelinkNumberProduct,
  options: { firstPurchase?: boolean } = {},
): AurelinkPriceBreakdown | null {
  if (!Number.isFinite(providerPriceUsd) || providerPriceUsd <= 0) return null;

  const providerAmountMinor = Math.ceil(providerPriceUsd * USD_MINOR - 1e-8);
  const aurelinkChargeMinor = providerAmountMinor;
  const checkFeeMinor = product === "short_term"
    ? readCheckFeeMinor("AURELINK_SHORT_TERM_CHECK_FEE_USD_CENTS")
    : product === "long_term"
      ? readCheckFeeMinor("AURELINK_LONG_TERM_CHECK_FEE_USD_CENTS")
      : readCheckFeeMinor("AURELINK_DEDICATED_CHECK_FEE_USD_CENTS");

  // The agreed introductory example is $1.00 provider cost -> $1.50 total.
  // This is a 50% reduction of the equal Aurelink charge; the introductory
  // offer absorbs the Short-term check fee. Standard pricing retains the fee.
  const firstPurchaseDiscountMinor = product === "short_term" && options.firstPurchase
    ? Math.floor(aurelinkChargeMinor / 2) + checkFeeMinor
    : 0;

  return {
    providerAmountMinor,
    aurelinkChargeMinor,
    checkFeeMinor,
    firstPurchaseDiscountMinor,
    totalMinor: providerAmountMinor + aurelinkChargeMinor + checkFeeMinor - firstPurchaseDiscountMinor,
  };
}

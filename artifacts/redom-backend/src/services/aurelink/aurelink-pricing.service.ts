export type AurelinkNumberProduct = "short_term" | "long_term" | "dedicated";

export interface AurelinkPriceBreakdown {
  providerAmountMinor: number;
  aurelinkChargeMinor: number;
  checkFeeMinor: number;
  totalMinor: number;
}

const USD_MINOR = 100;

function checkFeeMinor(envName: string): number {
  const raw = process.env[envName];
  if (raw == null || raw.trim() === "") return 100;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 100;
}

/**
 * Server-authoritative customer pricing:
 * provider amount + an equal Aurelink charge + the check fee for this product.
 * A zero, negative, or invalid provider price is never quotable.
 */
export function aurelinkPriceBreakdown(
  providerPriceUsd: number,
  product: AurelinkNumberProduct,
): AurelinkPriceBreakdown | null {
  if (!Number.isFinite(providerPriceUsd) || providerPriceUsd <= 0) return null;

  const providerAmountMinor = Math.ceil(providerPriceUsd * USD_MINOR - 1e-8);
  const aurelinkChargeMinor = providerAmountMinor;
  const checkFeeMinor = product === "short_term"
    ? checkFeeMinorFromEnv("AURELINK_SHORT_TERM_CHECK_FEE_USD_CENTS")
    : product === "long_term"
      ? checkFeeMinorFromEnv("AURELINK_LONG_TERM_CHECK_FEE_USD_CENTS")
      : checkFeeMinorFromEnv("AURELINK_DEDICATED_CHECK_FEE_USD_CENTS");

  return {
    providerAmountMinor,
    aurelinkChargeMinor,
    checkFeeMinor,
    totalMinor: providerAmountMinor + aurelinkChargeMinor + checkFeeMinor,
  };
}

function checkFeeMinorFromEnv(envName: string): number {
  return checkFeeMinor(envName);
}

/**
 * Aurelink outbound SMS API commercial package catalog.
 *
 * This is a standalone product catalog. It is intentionally separate from
 * Aurelink Mail credits and the legacy Aurelink number-purchase wallet.
 * Prices are stored as integer USD cents to avoid floating-point arithmetic.
 */
const UNIT_PRICE_CENTS_NUMERATOR = 41;
const UNIT_PRICE_CENTS_DENOMINATOR = 10;

export type AurelinkSmsApiPackage = Readonly<{
  key: string;
  name: string;
  smsQuantity: number;
  priceUsdCents: number;
  priceUsd: string;
  unitPriceUsd: "0.041";
  enterpriseMinimum?: true;
}>;

const PACKAGE_DEFINITIONS = [
  ["individual", "Individual", 100],
  ["starter", "Starter", 1_000],
  ["standard", "Standard", 5_000],
  ["plus", "Plus", 10_000],
  ["pro", "Pro", 30_000],
  ["individual_max", "Individual Max", 50_000],
  ["business", "Business", 100_000],
  ["business_pro", "Business Pro", 300_000],
  ["business_max", "Business Max", 500_000],
  ["enterprise", "Enterprise", 1_000_000],
] as const;

function usd(cents: number): string {
  return (cents / 100).toFixed(2);
}

export const AURELINK_SMS_API_PACKAGES: readonly AurelinkSmsApiPackage[] =
  Object.freeze(PACKAGE_DEFINITIONS.map(([key, name, smsQuantity]) => {
    const priceNumerator = smsQuantity * UNIT_PRICE_CENTS_NUMERATOR;
    if (priceNumerator % UNIT_PRICE_CENTS_DENOMINATOR !== 0) {
      throw new Error(`SMS package ${key} does not resolve to a whole USD cent.`);
    }
    const priceUsdCents = priceNumerator / UNIT_PRICE_CENTS_DENOMINATOR;
    return Object.freeze({
      key,
      name,
      smsQuantity,
      priceUsdCents,
      priceUsd: usd(priceUsdCents),
      unitPriceUsd: "0.041" as const,
      ...(key === "enterprise" ? { enterpriseMinimum: true as const } : {}),
    });
  }));

export function getAurelinkSmsApiPackageCatalog() {
  return Object.freeze({
    product: "sms_api" as const,
    currency: "USD" as const,
    unitPriceUsd: "0.041" as const,
    unitPriceUsdCents: "4.1" as const,
    billingModel: "per_billable_sms" as const,
    funding: "sms_api_packages_only" as const,
    crossProductFunding: false as const,
    packages: AURELINK_SMS_API_PACKAGES,
  });
}

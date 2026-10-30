import test from "node:test";
import assert from "node:assert/strict";
import { aurelinkPriceBreakdown } from "../../redom-backend/src/services/aurelink/aurelink-pricing.service.ts";

test("standard short-term pricing uses the agreed $0.20 check fee", () => {
  delete process.env.AURELINK_SHORT_TERM_CHECK_FEE_USD_CENTS;
  assert.equal(aurelinkPriceBreakdown(1.00, "short_term")?.totalMinor, 220);
});

test("first short-term purchase preserves the agreed $1.00 provider -> $1.50 total example", () => {
  delete process.env.AURELINK_SHORT_TERM_CHECK_FEE_USD_CENTS;
  const quote = aurelinkPriceBreakdown(1.00, "short_term", { firstPurchase: true });
  assert.equal(quote?.totalMinor, 150);
  assert.equal(quote?.firstPurchaseDiscountMinor, 70);
});

test("standard pricing still includes the product-specific check fee", () => {
  process.env.AURELINK_SHORT_TERM_CHECK_FEE_USD_CENTS = "50";
  assert.equal(aurelinkPriceBreakdown(0.50, "short_term")?.totalMinor, 150);
});

test("long-term and dedicated products use independent check-fee settings", () => {
  process.env.AURELINK_LONG_TERM_CHECK_FEE_USD_CENTS = "75";
  process.env.AURELINK_DEDICATED_CHECK_FEE_USD_CENTS = "125";
  assert.equal(aurelinkPriceBreakdown(0.50, "long_term")?.totalMinor, 175);
  assert.equal(aurelinkPriceBreakdown(0.50, "dedicated")?.totalMinor, 225);
});

test("zero, negative, and invalid provider prices are unavailable", () => {
  assert.equal(aurelinkPriceBreakdown(0, "short_term"), null);
  assert.equal(aurelinkPriceBreakdown(-0.50, "long_term"), null);
  assert.equal(aurelinkPriceBreakdown(Number.NaN, "dedicated"), null);
});

test("fractional provider prices are rounded up to cents before doubling", () => {
  process.env.AURELINK_SHORT_TERM_CHECK_FEE_USD_CENTS = "50";
  assert.equal(aurelinkPriceBreakdown(0.505, "short_term")?.totalMinor, 152);
});

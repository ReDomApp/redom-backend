import test from "node:test";
import assert from "node:assert/strict";
import { aurelinkPriceBreakdown } from "../../redom-backend/src/services/aurelink/aurelink-pricing.service.ts";

test("short-term pricing is provider amount plus an equal Aurelink charge plus its check fee", () => {
  process.env.AURELINK_SHORT_TERM_CHECK_FEE_USD_CENTS = "50";
  assert.deepEqual(aurelinkPriceBreakdown(0.50, "short_term"), {
    providerAmountMinor: 50,
    aurelinkChargeMinor: 50,
    checkFeeMinor: 50,
    totalMinor: 150,
  });
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

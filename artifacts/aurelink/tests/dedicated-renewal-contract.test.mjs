import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = new URL("../../redom-backend/src/services/aurelink/aurelink-dedicated-renewal.service.ts", import.meta.url);
const schema = new URL("../../redom-backend/src/services/aurelink/schema-bootstrap.service.ts", import.meta.url);
const wallet = new URL("../../redom-backend/src/services/aurelink/aurelink-wallet.service.ts", import.meta.url);
const [serviceText, schemaText, walletText] = await Promise.all([
  readFile(source, "utf8"), readFile(schema, "utf8"), readFile(wallet, "utf8")
]);

test("renewal attempt is unique per dedicated order and expiry", () => {
  assert.match(schemaText, /UNIQUE\(order_id, scheduled_expiry_at\)/);
});
test("top-up token binds Aurelink UUID, account, order, attempt, amount, currency and Paystack reference", () => {
  for (const field of ["aurelink_user_id", "account_id", "order_id", "renewal_attempt_id", "amount_minor", "currency", "paystack_reference", "token_hash", "expires_at"]) {
    assert.match(schemaText, new RegExp(field));
  }
  assert.match(serviceText, /randomBytes\(32\)/);
  assert.match(serviceText, /createHash\("sha256"\)/);
});
test("checkout link contains an opaque token and redirects only while unexpired and unused", () => {
  assert.match(serviceText, /\/aurelink\/renewal\/topup\//);
  assert.match(serviceText, /consumed_at IS NULL AND revoked_at IS NULL AND expires_at>NOW\(\)/);
});
test("webhook verifies Paystack signature and server-side amount, currency and reference", () => {
  assert.match(serviceText, /createHmac\("sha512"/);
  assert.match(serviceText, /transaction\/verify\//);
  assert.match(serviceText, /token\.amount_minor\).*verified\.requested_amount/);
  assert.match(serviceText, /token\.currency\).*verified\.currency/);
});
test("wallet top-up fulfillment is idempotent and uses Aurelink customer UUID", () => {
  assert.match(serviceText, /userId:String\(token\.aurelink_user_id\)/);
  assert.match(serviceText, /aurelink-renewal-topup:/);
  assert.match(serviceText, /if\(token\.consumed_at\)/);
  assert.match(walletText, /SELECT balance_after_minor FROM aurelink_wallet_ledger WHERE reference=\$1/);
});
test("provider renewal must confirm a later expiry before wallet debit", () => {
  const providerCall = serviceText.indexOf("nonVoipClient.renew");
  const confirmedExpiry = serviceText.indexOf("newExpiry.getTime() <=", providerCall);
  const debit = serviceText.indexOf("await walletDebit", providerCall);
  assert.ok(providerCall >= 0 && confirmedExpiry > providerCall && debit > confirmedExpiry);
  assert.match(serviceText, /reconciliation_required/);
});
test("dedicated renewal worker runs independently of SMSPool configuration", () => {
  assert.match(serviceText, /startAurelinkDedicatedRenewalWorker/);
  assert.doesNotMatch(serviceText, /SMSPOOL_API_KEY/);
});

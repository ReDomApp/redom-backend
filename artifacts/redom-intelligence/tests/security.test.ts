import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorizedBearer, parseServiceKeys, SlidingWindowLimiter } from "../src/security.js";
import { readInferenceConfig } from "../src/inference.js";

test("service keys reject missing and short secrets", () => {
  assert.deepEqual(parseServiceKeys(undefined), []);
  assert.deepEqual(parseServiceKeys("short, " + "a".repeat(32)), ["a".repeat(32)]);
});

test("bearer authorization accepts only configured exact keys", () => {
  const key = "a".repeat(40);
  assert.equal(isAuthorizedBearer(`Bearer ${key}`, [key]), true);
  assert.equal(isAuthorizedBearer(`Bearer ${key}x`, [key]), false);
  assert.equal(isAuthorizedBearer(key, [key]), false);
  assert.equal(isAuthorizedBearer(`Bearer ${key}`, []), false);
});

test("sliding-window limiter enforces a bounded request count", () => {
  const limiter = new SlidingWindowLimiter(2, 1000);
  assert.equal(limiter.consume("svc", 1000), true);
  assert.equal(limiter.consume("svc", 1100), true);
  assert.equal(limiter.consume("svc", 1200), false);
  assert.equal(limiter.consume("svc", 2101), true);
});

test("inference config fails closed and rejects URL credentials/query strings", () => {
  assert.equal(readInferenceConfig({}), null);
  assert.equal(readInferenceConfig({
    INFERENCE_BASE_URL: "https://user:pass@example.com",
    INFERENCE_API_KEY: "key",
    INFERENCE_MODEL: "model",
  }), null);
  assert.equal(readInferenceConfig({
    INFERENCE_BASE_URL: "https://example.com?token=bad",
    INFERENCE_API_KEY: "key",
    INFERENCE_MODEL: "model",
  }), null);
});

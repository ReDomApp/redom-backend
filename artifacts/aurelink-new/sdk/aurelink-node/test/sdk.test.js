import test from "node:test";
import assert from "node:assert/strict";
import { Aurelink, AurelinkError } from "../index.js";

function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

test("rejects missing or malformed credentials", () => {
  assert.throws(() => new Aurelink({}), /requires an API key/);
  assert.throws(() => new Aurelink({ apiKey: "not-a-key" }), /valid Aurelink/);
});

test("sends authenticated versioned requests and query parameters", async () => {
  let seen;
  const client = new Aurelink({ apiKey: "aul_test_example", fetch: async (url, init) => {
    seen = { url: String(url), init }; return response(200, { success: true, services: [] });
  }});
  await client.services.list({ country: "US", active: true });
  assert.match(seen.url, /\/v1\/aurelink\/catalog\/services\?country=US&active=true$/);
  assert.equal(seen.init.headers.Authorization, "Bearer aul_test_example");
});

test("adds idempotency header for live purchases", async () => {
  let seen;
  const client = new Aurelink({ apiKey: "aul_live_example", fetch: async (_url, init) => {
    seen = init; return response(201, { success: true, order: { id: "1" } });
  }});
  await client.activations.create({ service: "telegram" }, { idempotencyKey: "same-order" });
  assert.equal(seen.headers["Idempotency-Key"], "same-order");
});

test("does not require idempotency header for test sandbox purchases", async () => {
  let seen;
  const client = new Aurelink({ apiKey: "aul_test_example", fetch: async (_url, init) => {
    seen = init; return response(201, { success: true });
  }});
  await client.activations.create({ service: "telegram" });
  assert.equal(seen.headers["Idempotency-Key"], undefined);
});

test("surfaces structured API errors and rate limit metadata", async () => {
  const client = new Aurelink({ apiKey: "aul_test_example", fetch: async () => response(429, {
    success: false, code: "RATE_LIMIT_EXCEEDED", message: "Slow down."
  }, { "Retry-After": "60", "X-Aurelink-Request-Id": "req-1" }) });
  await assert.rejects(client.services.list(), (error) => {
    assert.ok(error instanceof AurelinkError);
    assert.equal(error.status, 429);
    assert.equal(error.code, "RATE_LIMIT_EXCEEDED");
    assert.equal(error.retryAfter, "60");
    assert.equal(error.requestId, "req-1");
    return true;
  });
});

test("encodes resource identifiers", async () => {
  let url;
  const client = new Aurelink({ apiKey: "aul_test_example", fetch: async (input) => {
    url = String(input); return response(200, { success: true, messages: [] });
  }});
  await client.activations.messages("a/b");
  assert.match(url, /activations\/a%2Fb\/messages$/);
});

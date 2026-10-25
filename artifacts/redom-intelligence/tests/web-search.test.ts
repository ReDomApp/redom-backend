import test from "node:test";
import assert from "node:assert/strict";
import { searchWeb } from "../src/web-search.js";

test("web search fails closed when provider credentials are absent", async () => {
  await assert.rejects(() => searchWeb("test", ""), (error: unknown) => {
    assert.equal((error as { errorCode?: string }).errorCode, "WEB_SEARCH_NOT_CONFIGURED");
    return true;
  });
});

test("web search sends a bounded query to the fixed provider and filters unsafe results", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedHeaders: HeadersInit | undefined;
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedHeaders = init?.headers;
    return new Response(JSON.stringify({ web: { results: [
      { title: "Official documentation", url: "https://docs.example.org/guide", description: "A useful snippet." },
      { title: "Unsafe HTTP", url: "http://insecure.example.org", description: "Drop me." },
      { title: "Credentials in URL", url: "https://user:pass@example.org/private", description: "Drop me." },
    ] } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const results = await searchWeb("  current docs  ", "unit-test-key");
    const url = new URL(requestedUrl);
    assert.equal(url.origin + url.pathname, "https://api.search.brave.com/res/v1/web/search");
    assert.equal(url.searchParams.get("q"), "current docs");
    assert.equal((requestedHeaders as Record<string, string>)["x-subscription-token"], "unit-test-key");
    assert.deepEqual(results.map((item) => item.title), ["Official documentation"]);
    assert.equal(results[0]?.url, "https://docs.example.org/guide");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { completeChat, type InferenceConfig } from "../src/inference.js";

test("web research tool is executed through the fixed search provider and citations are returned", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.BRAVE_SEARCH_API_KEY;
  process.env.BRAVE_SEARCH_API_KEY = "unit-test-search-key";
  const modelCalls: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.search.brave.com/")) {
      return new Response(JSON.stringify({ web: { results: [{
        title: "Official release notes",
        url: "https://docs.example.org/release-notes",
        description: "Version 2 was released with the documented changes.",
      }] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    modelCalls.push(body);
    if (modelCalls.length === 1) {
      return new Response(JSON.stringify({
        id: "tool-call",
        choices: [{ index: 0, message: {
          role: "assistant", content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name: "web_search", arguments: JSON.stringify({ query: "official release notes version 2" }) } }],
        }, finish_reason: "tool_calls" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const sentMessages = body.messages as Array<{ role: string; content: string | null; tool_call_id?: string }>;
    assert.ok(sentMessages.some((message) => message.role === "tool" && message.tool_call_id === "call_1"));
    return new Response(JSON.stringify({
      id: "final",
      choices: [{ index: 0, message: { role: "assistant", content: "The official release notes document version 2." }, finish_reason: "stop" }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const config: InferenceConfig = { baseUrl: "http://model.test", apiKey: "test-key", model: "actual-model", timeoutMs: 10_000 };
  try {
    const response = await completeChat({
      model: "orex", web_search: true,
      messages: [{ role: "user", content: "What changed in version 2? Use sources." }],
    }, config, "orex");
    const choices = response.choices as Array<{ message: { content: string } }>;
    assert.equal(modelCalls.length, 2);
    assert.match(choices[0]?.message.content ?? "", /Sources:/);
    assert.match(choices[0]?.message.content ?? "", /https:\/\/docs\.example\.org\/release-notes/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = originalKey;
  }
});

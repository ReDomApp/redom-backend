import test from "node:test";
import assert from "node:assert/strict";
import { validateChatRequest } from "../src/validation.js";

test("accepts a valid chat request and pins the configured model", () => {
  assert.deepEqual(validateChatRequest({
    model: "redom-model",
    messages: [{ role: "user", content: "hello" }],
    temperature: 0.7,
    max_tokens: 1024,
  }, "redom-model"), {
    model: "redom-model",
    messages: [{ role: "user", content: "hello" }],
    temperature: 0.7,
    max_tokens: 1024,
  });
});

test("accepts only the explicit built-in web search switch", () => {
  assert.deepEqual(validateChatRequest({
    model: "m",
    web_search: true,
    messages: [{ role: "user", content: "What changed this week?" }],
  }, "m"), {
    model: "m",
    web_search: true,
    messages: [{ role: "user", content: "What changed this week?" }],
  });
  assert.equal(validateChatRequest({ messages: [{ role: "user", content: "x" }], web_search: "yes" }, "m"), null);
  assert.equal(validateChatRequest({ messages: [{ role: "user", content: "x" }], tools: [{ type: "function" }] }, "m")?.web_search, undefined);
});

test("rejects a model not configured by the operator", () => {
  assert.equal(validateChatRequest({
    model: "other-model",
    messages: [{ role: "user", content: "hello" }],
  }, "redom-model"), null);
});

test("rejects empty messages, unsupported roles, and oversized message arrays", () => {
  assert.equal(validateChatRequest({ messages: [] }, "m"), null);
  assert.equal(validateChatRequest({ messages: [{ role: "tool", content: "x" }] }, "m"), null);
  assert.equal(validateChatRequest({ messages: Array.from({ length: 101 }, () => ({ role: "user", content: "x" })) }, "m"), null);
});

test("rejects invalid temperature and token limits", () => {
  const base = { messages: [{ role: "user", content: "hello" }] };
  assert.equal(validateChatRequest({ ...base, temperature: 2.1 }, "m"), null);
  assert.equal(validateChatRequest({ ...base, temperature: Number.NaN }, "m"), null);
  assert.equal(validateChatRequest({ ...base, max_tokens: 0 }, "m"), null);
  assert.equal(validateChatRequest({ ...base, max_tokens: 1.5 }, "m"), null);
  assert.equal(validateChatRequest({ ...base, max_tokens: 32_769 }, "m"), null);
});

test("rejects malformed message shapes and excessive content", () => {
  assert.equal(validateChatRequest({ messages: [null] }, "m"), null);
  assert.equal(validateChatRequest({ messages: [{ role: "user", content: 123 }] }, "m"), null);
  assert.equal(validateChatRequest({ messages: [{ role: "user", content: "x".repeat(200_001) }] }, "m"), null);
  assert.equal(validateChatRequest({ messages: [{ role: "user", content: "x".repeat(200_000) }, { role: "user", content: "y".repeat(200_000) }, { role: "user", content: "z".repeat(100_001) }] }, "m"), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_CATALOG, getConfiguredModels } from "../src/model-registry.js";

test("catalog exposes the three ReDom product identities and intended roles", () => {
  assert.deepEqual(MODEL_CATALOG.map((model) => model.name), ["OREX", "APEX", "ULTRON"]);
  assert.deepEqual(MODEL_CATALOG.map((model) => model.id), ["orex", "apex", "ultron"]);
  assert.ok(MODEL_CATALOG.find((model) => model.id === "ultron")?.capabilities.includes("coding"));
  assert.ok(MODEL_CATALOG.find((model) => model.id === "apex")?.capabilities.includes("reasoning"));
});

test("only explicitly configured model routes are exposed", () => {
  const models = getConfiguredModels({
    OREX_BASE_URL: "http://orex.internal:8000",
    OREX_API_KEY: "test-secret",
    OREX_MODEL: "Qwen/Qwen3-8B",
    ULTRON_BASE_URL: "http://ultron.internal:8000",
    ULTRON_API_KEY: "test-secret",
    ULTRON_MODEL: "Qwen/Qwen2.5-Coder-7B",
  });
  assert.deepEqual(models.map((model) => model.id), ["orex", "ultron"]);
  assert.equal(models[0]?.inference.model, "Qwen/Qwen3-8B");
  assert.equal(models[1]?.inference.model, "Qwen/Qwen2.5-Coder-7B");
  assert.equal(getConfiguredModels({}).length, 0);
});

test("legacy single-model configuration remains supported", () => {
  const models = getConfiguredModels({
    INFERENCE_BASE_URL: "http://vllm:8000",
    INFERENCE_API_KEY: "test-secret",
    INFERENCE_MODEL: "redom-model",
  });
  assert.equal(models.length, 1);
  assert.equal(models[0]?.id, "redom-model");
});

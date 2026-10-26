import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_CATALOG, getConfiguredModels } from "../src/model-registry.js";

test("catalog exposes the agreed ReDom model names and intended roles", () => {
  assert.deepEqual(MODEL_CATALOG.map((model) => model.name), ["AUREX 1.8", "REX 6.8", "AUREX Apex"]);
  assert.deepEqual(MODEL_CATALOG.map((model) => model.id), ["aurex-1.8", "rex-6.8", "aurex-apex"]);
  assert.ok(MODEL_CATALOG.find((model) => model.id === "rex-6.8")?.capabilities.includes("coding"));
  assert.ok(MODEL_CATALOG.find((model) => model.id === "aurex-apex")?.capabilities.includes("reasoning"));
  assert.ok(MODEL_CATALOG.find((model) => model.id === "aurex-1.8")?.capabilities.includes("general-knowledge"));
});

test("only explicitly configured model routes are exposed", () => {
  const models = getConfiguredModels({
    AUREX_18_BASE_URL: "http://aurex.internal:8000",
    AUREX_18_API_KEY: "test-secret",
    AUREX_18_MODEL: "Qwen/Qwen3-8B",
    REX_68_BASE_URL: "http://rex.internal:8000",
    REX_68_API_KEY: "test-secret",
    REX_68_MODEL: "Qwen/Qwen2.5-Coder-7B",
  });
  assert.deepEqual(models.map((model) => model.id), ["aurex-1.8", "rex-6.8"]);
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

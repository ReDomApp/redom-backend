import { readInferenceConfig, type InferenceConfig } from "./inference.js";

export type PublicModel = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  envPrefix: string;
};
export type ConfiguredModel = PublicModel & { inference: InferenceConfig };

/** Product identities are distinct; capability labels describe intended roles, not proof of benchmark quality. */
export const MODEL_CATALOG: PublicModel[] = [
  { id: "orex", name: "OREX", description: "General-purpose assistant for knowledge, writing, analysis, and tool-assisted research", capabilities: ["chat", "general-knowledge", "writing", "analysis", "web-search"], envPrefix: "OREX" },
  { id: "apex", name: "APEX", description: "Advanced reasoning and multi-step analysis", capabilities: ["chat", "reasoning", "analysis", "web-search"], envPrefix: "APEX" },
  { id: "ultron", name: "ULTRON", description: "Software engineering, code generation, debugging, and code review", capabilities: ["chat", "coding", "debugging", "code-review"], envPrefix: "ULTRON" },
];

function routeConfig(model: PublicModel, env: NodeJS.ProcessEnv): ConfiguredModel | null {
  const baseUrl = env[`${model.envPrefix}_BASE_URL`]?.trim();
  const apiKey = env[`${model.envPrefix}_API_KEY`]?.trim();
  const upstreamModel = env[`${model.envPrefix}_MODEL`]?.trim();
  if (!baseUrl || !apiKey || !upstreamModel) return null;
  const inference = readInferenceConfig({
    INFERENCE_BASE_URL: baseUrl,
    INFERENCE_API_KEY: apiKey,
    INFERENCE_MODEL: upstreamModel,
    INFERENCE_TIMEOUT_MS: env[`${model.envPrefix}_TIMEOUT_MS`] ?? env.INFERENCE_TIMEOUT_MS ?? "90000",
  });
  return inference ? { ...model, inference } : null;
}

/** Only returns routes that have explicit, complete configuration. No model silently falls back. */
export function getConfiguredModels(env: NodeJS.ProcessEnv = process.env): ConfiguredModel[] {
  const configured = MODEL_CATALOG.flatMap((model) => {
    const route = routeConfig(model, env);
    return route ? [route] : [];
  });
  if (configured.length === 0) {
    const legacy = readInferenceConfig(env);
    if (legacy) return [{
      id: legacy.model, name: legacy.model, description: "Operator-configured general-purpose model",
      capabilities: ["chat"], envPrefix: "INFERENCE", inference: legacy,
    }];
  }
  return configured;
}

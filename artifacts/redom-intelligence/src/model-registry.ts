import { readInferenceConfig, type InferenceConfig } from "./inference.js";

export type PublicModel = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  envPrefix: string;
};
export type ConfiguredModel = PublicModel & { inference: InferenceConfig };

export const MODEL_CATALOG: PublicModel[] = [
  { id: "aurex-1.8", name: "AUREX 1.8", description: "General-purpose intelligence", capabilities: ["chat", "writing", "research", "analysis"], envPrefix: "AUREX_18" },
  { id: "rex-6.8", name: "REX 6.8", description: "Coding specialist", capabilities: ["chat", "coding", "debugging", "code-review"], envPrefix: "REX_68" },
  { id: "aurex-apex", name: "AUREX Apex", description: "Premium flagship intelligence", capabilities: ["chat", "reasoning", "analysis"], envPrefix: "AUREX_APEX" },
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

/**
 * Registry for ReDom's three cinematic products.
 *
 * Runtime identifiers intentionally match the isolated endpoint profiles used
 * by the video job dispatcher. Configured means configured, not healthy or
 * quality-validated; real GPU acceptance tests remain a separate release gate.
 */
export const REDOM_MODELS = {
  "ReDom-v2.8—Video": {
    modelId: "ReDom-v2.8—Video",
    version: process.env.REDOM_VIDEO_MODEL_VERSION ?? "2.8",
    product: "video",
    runtimeId: "redom-v2.8-native",
    runtimeUrlEnv: "REDOM_VIDEO_ENGINE_URL",
    checkpointEnv: "REDOM_VIDEO_CHECKPOINT_DIR",
    operations: ["generate", "cgi", "text-to-video", "image-to-video", "compose"],
    formats: ["video"],
    genres: ["romance", "love-story", "horror", "psychological-thriller", "action", "comedy", "drama", "crime", "mystery", "adventure", "science-fiction", "fantasy", "historical", "documentary", "family-animation", "multi-genre"],
    maxSingleJobSeconds: 300,
    statusEnv: "REDOM_VIDEO_RUNTIME_ENABLED",
  },
  "Cartoon—R8.0": {
    modelId: "Cartoon—R8.0",
    version: process.env.REDOM_CARTOON_MODEL_VERSION ?? "8.0",
    product: "cartoon",
    runtimeId: "redom-cartoon-r8-native",
    runtimeUrlEnv: "REDOM_CARTOON_ENGINE_URL",
    checkpointEnv: "REDOM_CARTOON_CHECKPOINT_DIR",
    operations: ["generate", "cgi", "text-to-animation", "image-to-animation", "compose"],
    formats: ["cartoon"],
    genres: ["romance", "love-story", "horror", "psychological-thriller", "action", "comedy", "drama", "crime", "mystery", "adventure", "science-fiction", "fantasy", "historical", "documentary", "family-animation", "multi-genre"],
    maxSingleJobSeconds: 300,
    statusEnv: "REDOM_CARTOON_RUNTIME_ENABLED",
  },
  "Studio—Ultron 8.0R": {
    modelId: "Studio—Ultron 8.0R",
    version: process.env.REDOM_STUDIO_MODEL_VERSION ?? "8.0R",
    product: "studio",
    runtimeId: "redom-studio-ultron-8r-native",
    runtimeUrlEnv: "REDOM_STUDIO_ENGINE_URL",
    checkpointEnv: "REDOM_STUDIO_CHECKPOINT_DIR",
    operations: ["plan", "research", "storyboard", "produce", "revise", "compose", "generate"],
    formats: ["movie", "cartoon", "episode", "series", "trailer", "documentary"],
    genres: ["romance", "love-story", "horror", "psychological-thriller", "action", "comedy", "drama", "crime", "mystery", "adventure", "science-fiction", "fantasy", "historical", "documentary", "family-animation", "multi-genre"],
    maxSingleJobSeconds: null,
    statusEnv: "REDOM_STUDIO_RUNTIME_ENABLED",
  },
} as const;

export type ReDomModelId = keyof typeof REDOM_MODELS;
export type ReDomProduct = (typeof REDOM_MODELS)[ReDomModelId]["product"];

export class ReDomModelRoutingError extends Error {
  readonly code = "REDOM_MODEL_ROUTING_REJECTED";
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ReDomModelRoutingError";
  }
}

export function getReDomModel(modelId: string) {
  if (!Object.prototype.hasOwnProperty.call(REDOM_MODELS, modelId)) {
    throw new ReDomModelRoutingError("Unknown ReDom model identifier. Select one of the registered ReDom products.");
  }
  return REDOM_MODELS[modelId as ReDomModelId];
}

export function resolveReDomModelRuntime(modelId: string, requestedRuntime?: string) {
  const model = getReDomModel(modelId);
  if (requestedRuntime && requestedRuntime !== model.runtimeId) {
    throw new ReDomModelRoutingError(
      `Model/runtime mismatch: ${model.modelId} requires runtime ${model.runtimeId}; received ${requestedRuntime}.`,
    );
  }

  const runtimeUrl = process.env[model.runtimeUrlEnv];
  const checkpointPath = process.env[model.checkpointEnv];
  const enabled = process.env[model.statusEnv] === "true";
  const configured = Boolean(runtimeUrl && enabled);

  return {
    ...model,
    configured,
    runtimeUrl: runtimeUrl || null,
    checkpointProvisionedAtWorker: Boolean(checkpointPath),
    enabled,
    readiness: configured ? "configured_unprobed" as const : "not_configured" as const,
    dispatchable: configured,
  };
}

export function listReDomModels() {
  return Object.values(REDOM_MODELS).map((model) => {
    const runtime = resolveReDomModelRuntime(model.modelId);
    return {
      modelId: runtime.modelId,
      version: runtime.version,
      product: runtime.product,
      runtimeId: runtime.runtimeId,
      operations: runtime.operations,
      formats: runtime.formats,
      genres: runtime.genres,
      maxSingleJobSeconds: runtime.maxSingleJobSeconds,
      configured: runtime.configured,
      readiness: runtime.readiness,
      dispatchable: runtime.dispatchable,
    };
  });
}

export function assertReDomModelSupports(modelId: string, operation: string, format?: string) {
  const model = getReDomModel(modelId);
  if (!(model.operations as readonly string[]).includes(operation)) {
    throw new ReDomModelRoutingError(`${model.modelId} does not support operation "${operation}".`);
  }
  if (format && !(model.formats as readonly string[]).includes(format)) {
    throw new ReDomModelRoutingError(`${model.modelId} does not support product format "${format}".`);
  }
  const runtime = resolveReDomModelRuntime(modelId);
  if (!runtime.dispatchable) {
    const missing = [
      !runtime.runtimeUrl && model.runtimeUrlEnv,
      !runtime.enabled && model.statusEnv + "=true",
    ].filter(Boolean);
    const error = new Error(
      `${model.modelId} runtime is not configured; missing: ${missing.join(", ")}. No fallback model will be used.`,
    ) as Error & { code: string; status: number };
    error.code = "REDOM_MODEL_RUNTIME_UNAVAILABLE";
    error.status = 503;
    throw error;
  }
  return runtime;
}

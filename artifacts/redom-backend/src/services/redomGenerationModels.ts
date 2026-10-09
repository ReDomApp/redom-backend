/**
 * Canonical identities and routing contract for ReDom's three independent
 * generation models. Infrastructure may be shared; inference runtimes must not.
 *
 * An endpoint is intentionally considered unavailable until both its URL and
 * its matching secret token are configured. Never silently fall back to the
 * video model for cartoon or Movie Studio requests.
 */
export const REDOM_GENERATION_MODELS = {
  video: {
    id: "ReDom-v2.8—Video",
    runtime: "redom-v2.8-native",
    format: "video",
    endpointUrlEnv: "REDOM_VIDEO_ENGINE_URL",
    endpointTokenEnv: "REDOM_VIDEO_ENGINE_TOKEN",
    checkpointMount: "/models/redom-v2.8-video",
    purpose: "General video generation only",
  },
  cartoon: {
    id: "Cartoon—R8.0",
    runtime: "redom-cartoon-r8-native",
    format: "cartoon",
    endpointUrlEnv: "REDOM_CARTOON_ENGINE_URL",
    endpointTokenEnv: "REDOM_CARTOON_ENGINE_TOKEN",
    checkpointMount: "/models/cartoon-r8",
    purpose: "Cartoon and animation generation only",
  },
  studio: {
    id: "Studio—Ultron 8.0R",
    runtime: "redom-studio-ultron-8r-native",
    format: "movie",
    endpointUrlEnv: "REDOM_STUDIO_ENGINE_URL",
    endpointTokenEnv: "REDOM_STUDIO_ENGINE_TOKEN",
    checkpointMount: "/models/ultron-8r",
    purpose: "Multi-shot, episode and full Movie Studio production",
  },
} as const;

export type ReDomGenerationModelKey = keyof typeof REDOM_GENERATION_MODELS;

export function getReDomGenerationModel(key: ReDomGenerationModelKey) {
  return REDOM_GENERATION_MODELS[key];
}

export function resolveReDomGenerationModel(format: "video" | "movie" | "cartoon") {
  if (format === "video") return REDOM_GENERATION_MODELS.video;
  if (format === "cartoon") return REDOM_GENERATION_MODELS.cartoon;
  return REDOM_GENERATION_MODELS.studio;
}

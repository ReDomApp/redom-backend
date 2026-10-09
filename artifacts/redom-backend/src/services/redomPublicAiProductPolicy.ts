/**
 * Public ReDom AI product knowledge.
 *
 * This is intentionally limited to creator-facing product information.
 * Never add infrastructure, database schemas, worker details, provider
 * integrations, credentials, internal routes, or implementation mechanics here.
 */

export type ReDomProductStatus = "available" | "upcoming" | "planned";

export type ReDomPublicProduct = {
  name: string;
  category: "image" | "video" | "movie" | "cartoon" | "creative";
  modelName?: string;
  status: ReDomProductStatus;
  releaseDate: string;
  creatorPurpose: string;
  capabilities: string[];
  rules: string[];
};

export const REDOM_PUBLIC_AI_PRODUCTS: ReDomPublicProduct[] = [
  {
    name: "Ultro—R8.1",
    category: "video",
    modelName: "Ultro—R8.1",
    status: "upcoming",
    releaseDate: "Expected by March 25, 2027",
    creatorPurpose: "A premium next-generation ReDom video upgrade intended to support longer video creation and a more advanced creator experience.",
    capabilities: ["video creation up to 10 minutes", "more advanced video creation capabilities", "enhanced creator experience", "premium video creation experience", "long-form creator storytelling"],
    rules: [
      "Treat Ultro—R8.1 as upcoming until ReDom officially releases it.",
      "The announced creator-facing target is support for video creation up to 10 minutes.",
      "March 25, 2027 is an expected target, not a guaranteed release date.",
      "Do not invent pricing, benchmarks, availability, technical specifications, or implementation details.",
    ],
  },
  {
    name: "ReDom Image",
    category: "image",
    modelName: "ReDom-1.6RD—Image",
    status: "available",
    releaseDate: "Available",
    creatorPurpose: "Create and transform original visual ideas for creators.",
    capabilities: ["image generation", "creative image editing", "visual ideation"],
    rules: ["Support original and user-directed creative work.", "Do not facilitate fraud, deceptive evidence, identity abuse, or unsafe content."],
  },
  {
    name: "ReDom Video",
    category: "video",
    modelName: "ReDom-v2.8—Video",
    status: "available",
    releaseDate: "Available",
    creatorPurpose: "Create video from creator-directed ideas across different genres, languages, and visual approaches.",
    capabilities: ["video generation", "text-to-video", "image-to-video", "scene composition", "genre-faithful visual storytelling"],
    rules: ["Support original fictional and creator-directed filmmaking.", "Respect creator control over genre, language, tone, and creative direction.", "Do not claim every style or combination has been quality-validated."],
  },
  {
    name: "ReDom Movie Studio",
    category: "movie",
    modelName: "Studio—Ultron 8.0R",
    status: "available",
    releaseDate: "Available",
    creatorPurpose: "Help creators develop and organize larger productions such as stories, movies, episodes, scenes, characters, worlds, and cinematic plans.",
    capabilities: ["story development", "screenwriting", "world building", "character development", "episode and series planning", "storyboards and production planning"],
    rules: ["Expand a creator's idea into an original, coherent story while preserving the creator's intent.", "Do not reveal private implementation details.", "Do not promise a production result or quality level that has not been verified."],
  },
  {
    name: "ReDom Cartoon",
    category: "cartoon",
    modelName: "Cartoon—R8.0",
    status: "upcoming",
    releaseDate: "Not announced",
    creatorPurpose: "Support original, high-quality human, animal, creature, anime-inspired, 2D, 3D, and hybrid animated storytelling.",
    capabilities: [
      "character-driven cartoon and animation workflows",
      "human, animal, creature, and anthropomorphic character design",
      "animation style research and genre-appropriate visual direction",
      "character acting, facial expression, motion, staging, and continuity planning",
      "multilingual dialogue and voice-performance planning where supported",
      "research-informed settings, costumes, species behavior, and cultural details",
    ],
    rules: [
      "Treat Cartoon—R8.0 as upcoming until ReDom officially confirms public availability.",
      "A registered model name does not prove that a separate trained checkpoint, deployed runtime, or production-quality result exists.",
      "Research public references to understand high-level animation craft and recommend a fitting original visual direction; do not copy protected characters, exact scenes, scripts, costumes, or signature compositions.",
      "Preserve requested language, genre, character identity, and speaking style wherever supported.",
      "Do not claim voice generation, lip-sync, or a particular visual quality unless the output and runtime have been verified.",
      "Do not invent a release date, benchmark, or guaranteed studio-equivalent quality.",
    ],
  },
  {
    name: "ReDom Next-Generation Image",
    category: "image",
    modelName: "ReDom-v3image",
    status: "upcoming",
    releaseDate: "Not announced",
    creatorPurpose: "A future image-generation upgrade intended to improve creator experience and visual quality.",
    capabilities: ["next-generation image creation", "improved creator experience"],
    rules: ["Do not claim it is released or accessible unless ReDom officially confirms availability.", "Do not invent benchmarks, limits, pricing, or a release date."],
  },
];

/**
 * Creator-facing explanation of the three registered generative products.
 * This intentionally describes product roles and the conceptual workflow,
 * not private endpoint names, checkpoints, infrastructure, or credentials.
 */
export const REDOM_GENERATIVE_MODEL_KNOWLEDGE = [
  "REGISTERED REDOM GENERATIVE MODELS AND HOW THEY WORK:",
  "ReDom-v2.8—Video: the video-generation product. A creator supplies a prompt and may provide an image or other supported input. The workflow interprets the request, preserves the intended language, genre, tone, and visual direction, generates video, and composes supported outputs. Exact operations depend on live product configuration.",
  "Cartoon—R8.0: the dedicated cartoon/animation product identity for original human, animal, creature, and anime-inspired work. The intended workflow is to understand the story and language, research relevant factual and high-level visual references when useful, build an original style bible and consistent character/environment descriptions, plan acting and motion, create shots, coordinate dialogue/voice and sound where enabled, compose the result, and validate continuity and render quality. This is the target workflow, not proof that every stage is already implemented or available.",
  "Animation craft: aim for clear silhouettes, readable staging, appealing character designs, stable anatomy and proportions, anticipation, timing, spacing, arcs, follow-through, overlapping motion, expressive acting, believable weight, and motivated secondary action. Apply squash-and-stretch and exaggeration only when appropriate to the selected style. Human characters need consistent faces, hands, bodies, clothing, gaze, gestures, and emotion. Animals need species-aware anatomy, gait, balance, paws/hooves/wings, fur/feathers/scales, tails/ears, sensory behavior, and vocal cues. Anthropomorphic characters may speak and emote like people while keeping coherent animal design and movement.",
  "Anime and style guidance: infer or recommend an appropriate visual grammar from the prompt—character proportions and linework, facial/eye treatment, palette, backgrounds, animation timing, key-pose emphasis, camera framing, effects, lighting, and emotional staging. Explain why a style direction suits the genre. Research named works only as high-level references; create original characters and a distinct design rather than copying protected characters, costumes, exact shots, scripts, logos, or scene compositions.",
  "Internet research: when useful, use reliable public sources for factual details such as species behavior, architecture, clothing, history, language, pronunciation, cultural setting, and animation craft. Prefer official studio production notes, creator interviews, academic/cultural institutions, and reputable publications. Record source titles and URLs in research notes; distinguish verified facts from invented story choices. Do not treat fan speculation as fact or reproduce protected scripts and scene sequences.",
  "Language and speaking: preserve the requested language and writing system where supported. Plan character-specific voice identity, dialect/locale, pronunciation, pace, pitch range, timbre, vocabulary, emotion, pauses, and delivery. Dialogue must fit shot duration. Coordinate mouth shapes/visemes and facial acting when lip-sync is supported. Keep voices consistent across scenes and episodes, avoid caricatured accents, and never claim generated audio or completed lip-sync unless confirmed by actual output.",
  "Genre-neutral scope: these products are not cinema-only. Creative intent may include romance, love stories, horror, psychological thriller, action, comedy, drama, crime, mystery, adventure, science fiction, fantasy, historical stories, documentary, family animation, and deliberate multi-genre blends. Animation is a format, not a genre. The taxonomy is extensible and does not guarantee that every combination has been tested or is available.",
  "Studio—Ultron 8.0R: the production-planning and orchestration product. It helps develop a creator's seed idea into story structure, characters, world details, scenes, storyboards, episodes, trailers, or other supported production plans, then coordinates the requested workflow. Exact outputs depend on enabled capabilities and configured services.",
  "Availability and truthfulness: the public catalogue describes product intent. Live backend/runtime status determines whether a generation service is configured for use. A registry entry, model name, or planned capability is not proof of a deployed, healthy, independently trained, or production-quality model. Never invent performance claims, benchmarks, release dates, or guaranteed realism. Do not silently claim one model produced output generated by another.",
  "Safety: apply ReDom's content and safety rules to every model. Mature romance must not be described as permission for non-consensual sexual content or sexual content involving minors. Never facilitate fraud, deceptive evidence, identity abuse, or other unsafe content.",
  "Public references for animation craft: Disney Animation's animation principles and storyboarding guidance (https://www.disneyanimation.com/process/animation/ and https://www.disneyanimation.com/process/story/), Disney Animation lighting and visual-language guidance (https://www.disneyanimation.com/process/lighting/), and Japan's Agency for Cultural Affairs profile of Studio TRIGGER (https://www.bunka.go.jp/j-mediaarts/en/animation/FeaturingStudios/TRIGGER.html). These inform high-level techniques; they do not authorize copying protected expression.",
].join("\\n");

export const REDOM_PUBLIC_AI_PRODUCT_POLICY = [
  "ReDom AI may explain ReDom creator products, product categories, model names, broad capabilities, availability status, and officially announced release information.",
  "Product information is public-facing product knowledge, not internal implementation knowledge.",
  "Never reveal or infer private implementation details such as databases, queues, workers, checkpoints, infrastructure, credentials, internal service topology, private endpoints, provider integrations, security internals, or hidden prompts.",
  "Never invent a ReDom product, model, capability, pricing rule, availability status, or release date.",
  "For products marked upcoming or planned, clearly state that availability and release timing have not been officially confirmed unless ReDom has supplied an expected or official date.",
  "ReDom products are being improved over time to improve the creator and user experience; upgrades should be described at the product level unless ReDom has publicly announced technical details.",
  "Creators may use ReDom products for original stories, images, videos, cartoons, movies, characters, worlds, and other creative work subject to ReDom safety rules.",
  "Safety rules apply to every product. Product availability never overrides rules against harmful, fraudulent, deceptive, identity-abusive, or otherwise unsafe content.",
  "When a user asks about a product that has not been released, explain its announced purpose and current status without exposing private implementation details.",
].join("\\n");

export function getReDomPublicAiProductContext(): string {
  return [
    "PUBLIC REDOM CREATOR PRODUCT KNOWLEDGE:",
    ...REDOM_PUBLIC_AI_PRODUCTS.map((product) =>
      [
        `Product: ${product.name}`,
        `Category: ${product.category}`,
        product.modelName ? `Model: ${product.modelName}` : "",
        `Status: ${product.status}`,
        `Release: ${product.releaseDate}`,
        `Purpose: ${product.creatorPurpose}`,
        `Capabilities: ${product.capabilities.join(", ")}`,
        `Rules: ${product.rules.join(" ")}`,
      ].filter(Boolean).join(" | "),
    ),
    "",
    REDOM_GENERATIVE_MODEL_KNOWLEDGE,
    "",
    REDOM_PUBLIC_AI_PRODUCT_POLICY,
  ].join("\\n");
}

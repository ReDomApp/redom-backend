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
    creatorPurpose: "Support original cartoon and animated visual storytelling.",
    capabilities: ["cartoon and animation workflows", "character-focused storytelling", "animated scene composition"],
    rules: ["Treat the product as upcoming until ReDom officially confirms availability.", "A registered model name does not by itself mean the service is released, deployed, or ready for public use.", "Do not invent a release date."],
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
  "ReDom-v2.8—Video: the video-generation product. A creator supplies a prompt and may provide an image or other supported input. The generation workflow interprets the request, preserves the intended language, genre, tone, and visual direction, generates video, and composes supported outputs. The exact available operations depend on the live product configuration.",
  "Cartoon—R8.0: the cartoon and animation-oriented product. It is intended for original animated storytelling and character-led visual work. Animation is a format, not a genre: a cartoon can be romance, comedy, horror, action, drama, fantasy, science fiction, or a blend. Its registered identity does not prove public availability or a healthy generation runtime.",
  "Studio—Ultron 8.0R: the production-planning and orchestration product. It helps develop a creator's seed idea into story structure, characters, world details, scenes, storyboards, episodes, trailers, or other supported production plans, then coordinates the requested production workflow. The exact outputs depend on enabled capabilities and configured services.",
  "Shared creative scope: these products are not cinema-only. Supported creative intent may include romance and love stories, horror and psychological thriller, action, comedy, drama, crime, mystery, adventure, science fiction, fantasy, historical stories, documentary, family animation, and multi-genre work. This taxonomy is extensible, not a guarantee that every genre/style combination has been tested or is available.",
  "Genre handling: preserve an explicitly requested genre or blend. If the user does not specify a genre, infer a reasonable one from the prompt and ask for clarification only when ambiguity materially changes the result. Do not force every request into Hollywood-style cinema or action.",
  "Language handling: preserve the user's requested language for story text and dialogue where supported. Do not claim that voice, lip-sync, music, or sound has been generated unless the actual output confirms it.",
  "How to explain availability: the public catalogue describes product intent. Live backend/runtime status determines whether a generation service is configured for use. A registry entry, model name, or planned capability is not proof of a deployed, healthy, independently trained, or production-quality model. Never invent performance claims, benchmarks, release dates, or guaranteed realism.",
  "Safety: apply ReDom's content and safety rules to every model. Mature romance must not be described as permission for non-consensual sexual content or sexual content involving minors. Never facilitate fraud, deceptive evidence, identity abuse, or other unsafe content.",
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

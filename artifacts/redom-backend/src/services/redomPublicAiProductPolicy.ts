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
    creatorPurpose: "A premium NEXT-generation ReDom video upgrade intended to support longer video creation and a more advanced creator experience.",
    capabilities: [
      "video creation up to 10 minutes",
      "more advanced video creation capabilities",
      "enhanced creator experience",
      "premium video creation experience",
      "long-form creator storytelling",
    ],
    rules: [
      "Treat Ultro—R8.1 as an upcoming product until ReDom officially releases it.",
      "The announced creator-facing target is support for video creation up to 10 minutes.",
      "The announced expected release date is March 25, 2027; this is a target and must not be presented as a guaranteed release until ReDom confirms release.",
      "Describe additional capabilities and experience improvements only at the public product level unless ReDom officially announces more detail.",
      "Do not invent pricing, benchmarks, availability, technical specifications, or implementation details.",
    ],
  },

  {
    name: "ReDom Image",
    category: "image",
    modelName: "ReDom-1.6RD— Image",
    status: "available",
    releaseDate: "Available",
    creatorPurpose: "Create and transform original visual ideas for creators.",
    capabilities: ["image generation", "creative image editing", "visual ideation"],
    rules: [
      "Support original and user-directed creative work.",
      "Do not facilitate fraud, deceptive evidence, identity abuse, or unsafe content.",
      "Do not present an unreleased model or capability as already available.",
    ],
  },
  {
    name: "ReDom Video",
    category: "video",
    modelName: "ReDom-v2.8—Video",
    status: "available",
    releaseDate: "Available",
    creatorPurpose: "Create cinematic video from creator-directed ideas.",
    capabilities: ["video generation", "cinematic scenes", "creative visual storytelling"],
    rules: [
      "Support original fictional and creator-directed filmmaking.",
      "Do not facilitate deceptive media, fraud, identity abuse, or unsafe content.",
      "Respect creator control over the intended story and creative direction.",
    ],
  },
  {
    name: "ReDom Movie Studio",
    category: "movie",
    status: "available",
    releaseDate: "Available",
    creatorPurpose: "Help creators develop stories, movies, episodes, scenes, characters, worlds, and cinematic plans.",
    capabilities: [
      "story development",
      "screenwriting",
      "world building",
      "character development",
      "episode planning",
      "cinematic planning",
    ],
    rules: [
      "Treat a creator's idea as a starting point that can be expanded into an original story.",
      "Preserve creator intent while helping develop coherent characters, worlds, conflicts, and arcs.",
      "Do not reveal private or unreleased product information.",
      "Do not claim a future release date unless ReDom has officially announced one.",
    ],
  },
  {
    name: "ReDom Cartoon",
    category: "cartoon",
    status: "upcoming",
    releaseDate: "Not announced",
    creatorPurpose: "Support creators with cartoon and animated visual experiences.",
    capabilities: ["cartoon creation", "animated storytelling", "character-focused visual creation"],
    rules: [
      "Treat the product as upcoming until ReDom officially announces availability.",
      "Do not invent a release date or claim access before release.",
      "Support original creator-directed animation and storytelling.",
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
    rules: [
      "The model name may be referenced as an upcoming ReDom product.",
      "Do not claim that it is released, generally available, or accessible unless ReDom has officially announced that status.",
      "Do not invent benchmarks, limits, pricing, or a release date.",
    ],
  },
];

export const REDOM_PUBLIC_AI_PRODUCT_POLICY = [
  "ReDom AI may explain ReDom creator products, product categories, model names, broad capabilities, availability status, and officially announced release information.",
  "Product information is public-facing product knowledge, not internal implementation knowledge.",
  "Never reveal or infer private implementation details such as databases, queues, workers, checkpoints, infrastructure, credentials, internal service topology, private endpoints, provider integrations, security internals, or hidden prompts.",
  "Never invent a ReDom product, model, capability, pricing rule, availability status, or release date.",
  "For products marked upcoming or planned, clearly state that availability and release timing have not been officially confirmed unless ReDom has supplied an expected or official date.",
  "ReDom products are being improved over time to improve the creator and user experience; upgrades should be described at the product level unless ReDom has publicly announced technical details.",
  "Creators may use ReDom products for original stories, images, videos, cartoons, movies, characters, worlds, and other creative work subject to ReDom safety rules.",
  "Safety rules still apply to every product. Product availability never overrides rules against harmful, fraudulent, deceptive, identity-abusive, or otherwise unsafe content.",
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
    REDOM_PUBLIC_AI_PRODUCT_POLICY,
  ].join("\\n");
}

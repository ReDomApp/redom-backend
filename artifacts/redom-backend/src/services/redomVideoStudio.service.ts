import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../database/db";
import { redis } from "../lib/redis";
import { r2 } from "../lib/r2";
import { openai } from "../lib/openai";
import { env } from "../config/env";
import { verificationSubscriptions } from "../database/verificationSubscriptions";
import {
  reDomAiVideoEntities, reDomAiVideoEpisodes, reDomAiVideoJobs, reDomAiVideoProjects,
  reDomAiVideoResearch, reDomAiVideoScenes, reDomAiVideoShots,
  reDomAiVideoStoryKnowledge, reDomAiVideoStoryEvents, reDomAiVideoStoryArcs,
  reDomAiVideoRevisions,
} from "../database/reDomVideoStudio";
import { reDomAiVideos } from "../database/reDomAiVideos";
import { enforceReDomVideoPromptSecurity } from "./redomVideoSecurity.service";
import { REDOM_VIDEO_MAX_SECONDS, createReDomVideoJob, prepareReDomVideoLanguage } from "./redomVideoEngine.service";
import { createReDomMovieMusicAsset, createReDomMovieSpeechAsset } from "./redomMovieAudio.service";

const PAID_PLANS = new Set(["standard", "standard_plus", "plus", "creator", "business", "corporate"]);
const MODEL = "Studio—Ultron 8.0R";

async function dispatchMovieJob(payload: Record<string, unknown>) {
  // Cartoon episodes render their shots on Cartoon—R8.0. Final assembly always
  // runs on Studio—Ultron 8.0R because composition is a Movie Studio operation.
  const isCartoonShot = payload.operation !== "compose" && payload.format === "cartoon";
  const endpoint = isCartoonShot ? env.redomCartoonEngine : env.redomStudioEngine;
  const model = isCartoonShot ? "Cartoon—R8.0" : "Studio—Ultron 8.0R";
  const runtime = isCartoonShot ? "redom-cartoon-r8-native" : "redom-studio-ultron-8r-native";
  if (!endpoint.url || !endpoint.token) {
    throw Object.assign(new Error(model + " runtime is not configured."), { status: 503, code: "REDOM_MODEL_ENDPOINT_UNAVAILABLE" });
  }
  payload.model = model;
  payload.runtime = runtime;
  payload.callbackToken = endpoint.token;
  const response = await fetch(endpoint.url.replace(/\/$/, "") + "/v1/jobs", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + endpoint.token },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(endpoint.timeoutMs),
  });
  if (!response.ok) {
    throw Object.assign(new Error(model + " worker rejected a production job."), { status: 503, code: "REDOM_MODEL_JOB_REJECTED" });
  }
}

type Knowledge = {
  scope: "author" | "character" | "audience";
  subjectKey?: string;
  fact: string;
  knowledgeState?: string;
  revealEpisode?: number;
  revealScene?: number;
};
type StoryEvent = {
  eventType: "secret" | "foreshadowing" | "reveal" | "conflict" | "turning_point" | "payoff";
  title: string;
  description: string;
  episodeNumber?: number;
  sceneNumber?: number;
  audienceState?: "hidden" | "hinted" | "suspected" | "revealed";
  planted?: boolean;
  payoffEpisode?: number;
  payoffScene?: number;
  relatedEntityNames?: string[];
};
type StoryArc = {
  name: string;
  arcType: string;
  objective: string;
  startingState: string;
  turningPoints?: unknown[];
  resolution?: string;
  entityNames?: string[];
};
type PlanEntity = {
  kind: string;
  name: string;
  identityProfile?: Record<string, unknown>;
  state?: Record<string, unknown>;
};
type PlanShot = {
  shotNumber: number;
  durationSeconds: number;
  action: string;
  camera?: Record<string, unknown>;
  lighting?: Record<string, unknown>;
  motion?: Record<string, unknown>;
  dialogue?: Record<string, unknown>[];
  sound?: Record<string, unknown>;
};
type PlanScene = {
  sceneNumber: number;
  title: string;
  synopsis: string;
  durationSeconds: number;
  location?: string;
  characters?: string[];
  action: string;
  camera?: Record<string, unknown>;
  lighting?: Record<string, unknown>;
  motion?: Record<string, unknown>;
  directorNotes?: string;
  shots?: PlanShot[];
};
type PlanEpisode = {
  episodeNumber: number;
  title: string;
  synopsis: string;
  targetDurationSeconds: number;
  storyStateBefore?: Record<string, unknown>;
  storyStateAfter?: Record<string, unknown>;
  scenes: PlanScene[];
};
type MoviePlan = {
  title: string;
  genre?: string[];
  format?: string;
  estimatedRuntimeSeconds?: number;
  episodeCount?: number;
  bible: Record<string, unknown>;
  entities: PlanEntity[];
  knowledge?: Knowledge[];
  storyEvents?: StoryEvent[];
  storyArcs?: StoryArc[];
  episodes: PlanEpisode[];
  research?: Array<{ sourceType: string; title: string; url?: string; summary: string; claims?: string[]; rightsBasis?: string }>;
  trailerBeats?: Array<Record<string, unknown>>;
  trailerPrompt?: string;
  soundtrackDirection?: string;
  soundscape?: Record<string, unknown> | string;
  dialogueDirection?: Record<string, unknown> | string;
  narrationDirection?: string;
  songConcepts?: Array<Record<string, unknown> | string>;
};

function safeDuration(value: number) {
  return Math.max(4, Math.min(REDOM_VIDEO_MAX_SECONDS, Math.floor(value)));
}

async function requirePaid(userId: string) {
  const rows = await db.select({ subscriptionType: verificationSubscriptions.subscriptionType })
    .from(verificationSubscriptions)
    .where(and(eq(verificationSubscriptions.userId, userId), eq(verificationSubscriptions.subscriptionStatus, "active")));
  if (!rows.some((row) => PAID_PLANS.has(row.subscriptionType))) {
    throw Object.assign(new Error("ReDom-v2.8—Video is a paid ReDom AI feature. An active paid ReDom AI plan is required."), { code: "VIDEO_PAID_FEATURE_REQUIRED", status: 402 });
  }
}

function parseJson(text: string): MoviePlan {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("ReDom Movie Studio planner returned no structured plan.");
  let parsed: MoviePlan;
  try { parsed = JSON.parse(text.slice(first, last + 1)) as MoviePlan; }
  catch { throw new Error("ReDom Movie Studio planner returned invalid structured story data."); }
  if (!parsed.title || !parsed.bible || !Array.isArray(parsed.entities) || !Array.isArray(parsed.episodes)) {
    throw new Error("ReDom Movie Studio planner returned an incomplete story architecture.");
  }
  return parsed;
}

function plannerInstructions(durationSeconds: number, style: string, quality: string, aspectRatio: string, requestedEpisodeCount?: number) {
  const episodeTarget = requestedEpisodeCount ?? (durationSeconds >= 180 ? Math.min(12, Math.max(4, Math.ceil(durationSeconds / 45))) : Math.min(10, Math.max(3, Math.ceil(durationSeconds / 30))));
  return [
    "You are the ReDom Creative Director, Showrunner, Screenwriter, World Builder and Director's Planner for ReDom-v2.8—Video.",
    "The user's prompt is a STORY SEED, not a finished screenplay. Expand it into an original, coherent, genre-faithful production while preserving the user's explicit intent.",
    ...(style.toLowerCase().includes("cartoon") || style.toLowerCase().includes("anime") || style.toLowerCase().includes("animation") ? [
      "CARTOON—R8.0 ANIMATION DIRECTOR: treat every shot as authored animation, not live-action footage with a cartoon filter. Choose and consistently maintain the requested animation language: 2D hand-drawn, 3D stylized feature animation, anime, cel-shaded, stop-motion-inspired, painterly, or a deliberate hybrid. If the creator names a reference anime or studio, research its public high-level visual grammar (linework, shape language, palette, effects, timing, composition and mood), cite useful source URLs in research, and translate those traits into an original visual direction. Do not reproduce protected characters, exact frames, costumes, logos, scripts or scene sequences without rights context.",
      "ANIMATED CHARACTER PERFORMANCE: define a reusable model sheet for every recurring human, animal and creature: silhouette, proportions, face/eye design, markings, fur/feathers/scales, palette, wardrobe, accessories, rig constraints, expression range, signature poses, gait, emotional tells and scale relative to other characters. Repeat identity anchors in every relevant shot prompt; do not redesign a character between shots.",
      "STRUCTURED MODEL SHEETS: for each recurring animated entity, populate identityProfile with concrete stable fields (species/type, age impression, body proportions, silhouette, face/eye shape, fur/feather/scale or skin markings, exact palette, hair, clothing/accessories, height/scale, movement signature, voice/personality cues and invariant details). Keep temporary emotional expression and pose in state, not identityProfile. Shot prompts must carry forward the relevant identityProfile so each separate render remains visually consistent.",
      "ANIMATION CRAFT: plan readable posing, silhouette clarity, anticipation, squash-and-stretch only where stylistically appropriate, arcs, overlap/follow-through, weight, contact, foot planting, believable animal locomotion, facial acting, eye-lines, hand/paw contact, secondary action, expression holds and deliberate timing. Specify what changes frame-to-frame and what must remain locked. Avoid morphing anatomy, extra limbs, sliding feet, flicker, texture crawl and inconsistent proportions.",
      "ANIMATED WORLD AND CINEMATOGRAPHY: backgrounds must feel inhabited and spatially coherent. Plan layered foreground/midground/background, parallax, environmental motion, weather, particles, crowd/animal behavior, motivated lighting, depth, shadows, color scripting and shot-to-shot screen direction. Match camera movement and editing rhythm to genre, emotion and animation style.",
      "ANIME AND VOICE PERFORMANCE: when anime is requested, specify original character archetypes, expressive facial poses, readable eye highlights, graphic effects, impact frames, speed lines and controlled exaggeration only when appropriate to the requested subgenre. Dialogue must specify language, dialect/locale, register, age-appropriate vocal quality, emotion, pace, pauses, pronunciation and phonetic guidance for names. Keep dialogue length feasible for the shot; align mouth shapes and timing to the actual language/audio pipeline where supported.",
      "ANIMATION QA: include explicit continuity checks for character model, costume/markings, props, lighting, palette, scale, screen direction, locomotion, mouth timing and background geography. The storyboard and prompt should give the renderer enough concrete direction to produce consistent, inspectable shots; never promise a Disney-equivalent result unless real render acceptance tests prove it."
    ] : []),
    "Do not merely paraphrase the prompt. Invent whatever non-conflicting kingdoms, factions, characters, locations, rules, conflicts, secrets, motivations, power systems, relationships, mysteries, betrayals, comedy, romance, battles and reveals are necessary to make the story work.",
    "Build a reviewable production proposal BEFORE rendering. Never plan five minutes as one generation call. Break the production into episodes, scenes and 4-10 second shots.",
    "PERSISTENT MOVIE MEMORY: the movie is a permanent object. Names, identities, visual traits, world rules, powers, relationships, timeline, unresolved questions and story state must remain stable.",
    "KNOWLEDGE SEPARATION IS MANDATORY. Maintain three different layers: author knowledge (everything true), character knowledge (what each character knows/believes), and audience knowledge (what the audience has actually been shown or told). A secret known to the author must not appear in dialogue, narration, generation prompts or visuals before its planned reveal unless the event is explicitly a clue/foreshadowing.",
    "MYSTERY ARCHITECTURE: create secrets, clues, foreshadowing and payoffs. Every major reveal should have earlier evidence. Do not reveal hidden identities early just because the model knows them.",
    "CHARACTER ARCS: each major character needs an initial state, motivation, internal conflict, relationship changes, turning points and intended resolution.",
    "WORLD LOGIC: establish rules and enforce them. Power escalation must have causes and consequences.",
    "LANGUAGE: honor the language or languages explicitly requested by the creator. Write dialogue, pronunciation notes, and subtitle text in the requested language; do not silently switch to English. Keep each character's voice and speaking style consistent.",
    "USER CONTROL: structure the result so a later revision such as 'reveal Ethan in episode 9', 'make the villain stronger', or 'give Ethan three forms' can be applied without losing continuity.",
    "RESEARCH AND ADAPTATION: when the user names a movie, book, franchise, historical event, or real-world subject, use web search to research reliable high-level facts and cite source URLs in research. Clearly separate verified facts from invented story choices. For copyrighted fictional works, do not reproduce scripts, dialogue, scene-by-scene plots, or protected character expression; create a meaningfully original adaptation using high-level themes and a transformed setting, cast, names, relationships, designs, and plot. Respect user-provided rights/licensing context without assuming it.",
    "TRAILER-READY STORYTELLING: include a strong hook in the first seconds, readable character introductions, escalating visual beats, an emotional or musical turn, and a memorable final reveal without spoiling the ending. Include trailerBeats and a trailerPrompt suitable for a separate 15-25 second preview generation.",
    "SOUND AND MUSIC DIRECTION: plan an original score with scene-level cues for warmth, romance, wonder, tension, action, grief and resolution as appropriate. Include soundtrackDirection, soundscape, dialogueDirection, narrationDirection, and optional original song/lyric concepts. Never claim that audio or singing has been rendered unless the audio pipeline actually generated it.",
    "Create exactly " + episodeTarget + " episodes for the requested project structure. Use 3-12 scenes per episode as needed and enough shots to make the visual edit coherent. Keep total planned duration at or below " + durationSeconds + " seconds.",
    "Visual target: " + style + "; quality: " + quality + "; aspect ratio: " + aspectRatio + ".",
    "Return JSON only with: title, genre, format, estimatedRuntimeSeconds, episodeCount, bible, entities, knowledge, storyEvents, storyArcs, episodes, research, trailerBeats, trailerPrompt, soundtrackDirection, soundscape, dialogueDirection, narrationDirection, songConcepts.",
    "bible MUST include: logline, premise, themes, tone, audienceContract, worldRules, powerSystem, timelineRules, visualIdentity, storyQuestion, endingIntent, and characterArcs.",
    "knowledge entries MUST include scope (author|character|audience), subjectKey, fact, knowledgeState, and revealEpisode/revealScene where relevant.",
    "storyEvents MUST model secrets, foreshadowing, reveals, conflicts, turning points and payoffs. Include planted=true for planted clues and payoffEpisode/payoffScene when a clue pays off.",
    "storyArcs MUST include name, arcType, objective, startingState, turningPoints, resolution and entityNames.",
    "Each scene MUST include location, characters, action, directorNotes and 1-3 shots. Each shot MUST include shotNumber, durationSeconds, action, camera, lighting, motion, dialogue and sound. Dialogue entries must include speaker (matching a named character), text, emotion, delivery, and optional startSeconds; keep spoken words short enough to fit the shot duration. Prefer one speaking character per shot when close-up lip sync is needed.",
  ].join("\n");
}

async function generatePlan(seed: string, durationSeconds: number, style: string, quality: string, aspectRatio: string, revisionContext = "", requestedEpisodeCount?: number): Promise<MoviePlan> {
  const instructions = plannerInstructions(durationSeconds, style, quality, aspectRatio, requestedEpisodeCount);
  const input = seed + (revisionContext ? "\n\nCURRENT PROJECT STATE AND USER REVISION:\n" + revisionContext : "") +
    "\n\nTarget duration: " + durationSeconds + " seconds.";
  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    instructions,
    input,
    tools: [{ type: "web_search" } as any],
    safety_identifier: "redom-movie-planner",
  });
  return parseJson(response.output_text || "");
}

async function clearPlanChildren(projectId: string) {
  await db.delete(reDomAiVideoJobs).where(eq(reDomAiVideoJobs.projectId, projectId));
  const episodeRows = await db.select({ id: reDomAiVideoEpisodes.id }).from(reDomAiVideoEpisodes).where(eq(reDomAiVideoEpisodes.projectId, projectId));
  if (episodeRows.length) {
    await db.delete(reDomAiVideoScenes).where(inArray(reDomAiVideoScenes.episodeId, episodeRows.map((r) => r.id)));
  }
  await db.delete(reDomAiVideoEpisodes).where(eq(reDomAiVideoEpisodes.projectId, projectId));
  await db.delete(reDomAiVideoEntities).where(eq(reDomAiVideoEntities.projectId, projectId));
  await db.delete(reDomAiVideoStoryKnowledge).where(eq(reDomAiVideoStoryKnowledge.projectId, projectId));
  await db.delete(reDomAiVideoStoryEvents).where(eq(reDomAiVideoStoryEvents.projectId, projectId));
  await db.delete(reDomAiVideoStoryArcs).where(eq(reDomAiVideoStoryArcs.projectId, projectId));
  await db.delete(reDomAiVideoResearch).where(eq(reDomAiVideoResearch.projectId, projectId));
}

async function persistPlan(projectId: string, project: typeof reDomAiVideoProjects.$inferSelect, plan: MoviePlan) {
  await clearPlanChildren(projectId);
  const entityMap = new Map<string, string>();

  for (const entity of plan.entities.slice(0, 300)) {
    const [row] = await db.insert(reDomAiVideoEntities).values({
      projectId,
      kind: entity.kind,
      name: entity.name.trim().slice(0, 180),
      identityProfile: entity.identityProfile || {},
      state: entity.state || {},
      referenceAssetKeys: [],
    }).returning();
    if (row) entityMap.set(entity.name, row.id);
  }

  for (const knowledge of (plan.knowledge || []).slice(0, 1000)) {
    await db.insert(reDomAiVideoStoryKnowledge).values({
      projectId,
      scope: knowledge.scope,
      subjectKey: knowledge.subjectKey?.slice(0, 240),
      fact: knowledge.fact,
      knowledgeState: knowledge.knowledgeState || "known",
      revealEpisode: knowledge.revealEpisode,
      revealScene: knowledge.revealScene,
    });
  }

  for (const event of (plan.storyEvents || []).slice(0, 1000)) {
    await db.insert(reDomAiVideoStoryEvents).values({
      projectId,
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      episodeNumber: event.episodeNumber,
      sceneNumber: event.sceneNumber,
      audienceState: event.audienceState || "hidden",
      planted: event.planted === true,
      payoffEpisode: event.payoffEpisode,
      payoffScene: event.payoffScene,
      relatedEntityIds: (event.relatedEntityNames || []).map((name) => entityMap.get(name)).filter((id): id is string => Boolean(id)),
    });
  }

  for (const arc of (plan.storyArcs || []).slice(0, 100)) {
    await db.insert(reDomAiVideoStoryArcs).values({
      projectId,
      name: arc.name,
      arcType: arc.arcType,
      objective: arc.objective,
      startingState: arc.startingState,
      turningPoints: arc.turningPoints || [],
      resolution: arc.resolution,
      entityIds: (arc.entityNames || []).map((name) => entityMap.get(name)).filter((id): id is string => Boolean(id)),
    });
  }

  for (const research of (plan.research || []).slice(0, 200)) {
    await db.insert(reDomAiVideoResearch).values({
      projectId,
      sourceType: research.sourceType,
      title: research.title,
      url: research.url,
      summary: research.summary,
      claims: research.claims || [],
      rightsBasis: research.rightsBasis || "factual_reference",
    });
  }

  for (const episode of plan.episodes.slice(0, 12)) {
    const [episodeRow] = await db.insert(reDomAiVideoEpisodes).values({
      projectId,
      episodeNumber: episode.episodeNumber,
      title: episode.title.slice(0, 240),
      synopsis: episode.synopsis,
      targetDurationSeconds: Math.min(project.targetDurationSeconds, Math.max(4, episode.targetDurationSeconds)),
      storyStateBefore: episode.storyStateBefore || {},
      storyStateAfter: episode.storyStateAfter || {},
    }).returning();
    if (!episodeRow) continue;

    for (const scene of episode.scenes.slice(0, 120)) {
      const locationEntityId = scene.location ? entityMap.get(scene.location) : undefined;
      const characterEntityIds = (scene.characters || []).map((name) => entityMap.get(name)).filter((id): id is string => Boolean(id));
      const [sceneRow] = await db.insert(reDomAiVideoScenes).values({
        episodeId: episodeRow.id,
        sceneNumber: scene.sceneNumber,
        title: scene.title.slice(0, 240),
        synopsis: scene.synopsis,
        durationSeconds: Math.max(4, Math.min(12, scene.durationSeconds)),
        locationEntityId: locationEntityId || null,
        characterEntityIds,
        continuityState: {
          episode: episode.episodeNumber,
          scene: scene.sceneNumber,
          characters: characterEntityIds,
          location: locationEntityId || null,
          audienceContract: "Do not expose author-only knowledge.",
        },
        directorNotes: scene.directorNotes,
      }).returning();
      if (!sceneRow) continue;

      const shots = scene.shots?.length ? scene.shots.slice(0, 3) : [{
        shotNumber: 1,
        durationSeconds: Math.max(4, Math.min(10, scene.durationSeconds)),
        action: scene.action,
        camera: scene.camera,
        lighting: scene.lighting,
        motion: scene.motion,
        dialogue: [],
        sound: {},
      }];

      for (const shot of shots) {
        const entityIds = characterEntityIds.concat(locationEntityId ? [locationEntityId] : []);
        await db.insert(reDomAiVideoShots).values({
          sceneId: sceneRow.id,
          shotNumber: shot.shotNumber,
          durationSeconds: Math.max(4, Math.min(10, shot.durationSeconds)),
          action: shot.action || scene.action,
          camera: shot.camera || scene.camera || {},
          lighting: shot.lighting || scene.lighting || {},
          motion: shot.motion || scene.motion || {},
          dialogue: shot.dialogue || [],
          sound: shot.sound || { ambient: project.audioEnabled, voice: project.voiceEnabled },
          entityIds,
          generationPrompt: [
            project.style,
            project.format === "cartoon"
              ? "Cartoon—R8.0 animated shot. Preserve the established character model sheets, silhouette, face, proportions, markings, costume, palette, rig limits, screen direction and scene geography. Use deliberate animation timing, expressive posing, anticipation, arcs, weight, contact, overlap/follow-through and genre-appropriate facial acting. Keep movement coherent and avoid morphing, flicker, texture crawl, foot sliding and anatomy drift. Background layers should feel alive but must not distract from the action. Respect the chosen 2D/3D/anime/cel-shaded/painterly style; do not convert the design to photoreal live action."
              : "Studio—Ultron 8.0R cinematic shot.",
            shot.action || scene.action,
            JSON.stringify(shot.camera || scene.camera || {}),
            JSON.stringify(shot.lighting || scene.lighting || {}),
            JSON.stringify(shot.motion || scene.motion || {}),
            "Dialogue and language direction: " + JSON.stringify(shot.dialogue || []),
            "Sound design direction: " + JSON.stringify(shot.sound || {}),
            ...(project.format === "cartoon" ? ["Recurring character model anchors: " + JSON.stringify(plan.entities.filter((entity) => (scene.characters || []).includes(entity.name)).map((entity) => ({ name: entity.name, identityProfile: entity.identityProfile || {}, state: entity.state || {} }))).slice(0, 4500)] : []),
            "Preserve all referenced entity identities and world rules.",
            "Do not reveal author-only knowledge before its planned reveal.",
          ].join("\n"),
          continuityWarnings: [],
        });
      }
    }
  }

  await db.update(reDomAiVideoProjects).set({
    title: plan.title.slice(0, 240),
    bible: {
      ...(plan.bible || {}),
      genre: plan.genre || [],
      format: plan.format || "episodic cinematic movie",
      estimatedRuntimeSeconds: plan.estimatedRuntimeSeconds || project.targetDurationSeconds,
      episodeCount: plan.episodeCount || plan.episodes.length,
    },
    research: { ...(project.research || {}), entries: plan.research || [], plannedBy: MODEL, trailerBeats: plan.trailerBeats || [], soundtrackDirection: plan.soundtrackDirection || project.research?.soundtrackStyle || "Original cinematic score", soundscape: plan.soundscape || {}, dialogueDirection: plan.dialogueDirection || {}, narrationDirection: plan.narrationDirection || "", songConcepts: plan.songConcepts || [], audioRenderingStatus: "planned_not_rendered" },
    state: "ready",
    continuityVersion: project.continuityVersion + 1,
    updatedAt: new Date(),
  }).where(eq(reDomAiVideoProjects.id, projectId));
}

export async function createReDomMovieTrailerPreview(userId: string, input: { prompt: string; format: "movie" | "cartoon"; durationSeconds?: number; episodeCount?: number; style?: string; aspectRatio?: "16:9" | "9:16" | "1:1"; soundtrackStyle?: string; language?: string }) {
  await requirePaid(userId);
  if (!env.redomVideoEngine.url || !env.redomVideoEngine.token) {
    throw Object.assign(new Error("The native GPU video worker is not configured, so ReDom cannot render a trailer yet."), { status: 503, code: "MOVIE_VIDEO_WORKER_NOT_CONFIGURED" });
  }
  if (!env.redomMovieAudio.elevenLabsApiKey) {
    throw Object.assign(new Error("ReDom Movie Audio is not configured. Set ELEVENLABS_API_KEY to generate trailer music."), { status: 503, code: "MOVIE_AUDIO_PROVIDER_NOT_CONFIGURED" });
  }
  const security = await enforceReDomVideoPromptSecurity(userId, input.prompt);
  const previewDuration = Math.max(15, Math.min(25, Math.floor(input.durationSeconds ?? 20)));
  const episodeCount = Math.max(1, Math.min(12, Math.floor(input.episodeCount ?? 6)));
  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    instructions: [
      "You are the shared ReDom Video creative intelligence director for Movie Intelligence and Cartoon Intelligence, as well as the Movie Studio showrunner, trailer editor and music supervisor.",
      "Build recommendations by combining the creator's current prompt, authorized ReDom project memory (approved characters, continuity, language/dialect, genres and accepted/rejected creative directions), and relevant public internet research. Research public short-form creative trends and craft patterns from sources about platforms such as Facebook and TikTok when useful; never imply access to private feeds or private recommendation signals.",
      "Separate sourced facts, source URLs and retrieval context from creative interpretation. If live research is unavailable, do not invent current trends. Use research to create original hooks, shot rhythm, character actions, camera/edit choices and an ending; never copy a creator's exact video, protected characters, dialogue, music, logo or shot sequence.",
      "Research named source material with web_search when useful. Return JSON only with title, logline, adaptationApproach, research, characters, episodeOptions, trailerBeats, trailerPrompt, soundtrackDirection, narrationDirection, narrationText, songConcepts, language.",
      "Use reliable high-level facts and include source URLs in research. Separate verified facts from creative invention. For social trend context, prefer public, accessible sources and do not claim verified rankings without evidence.",
      "When adapting copyrighted fiction, do not copy scripts, dialogue, or scene-by-scene plots. Propose a meaningfully original transformation with new names, character designs, relationships, setting and events, unless the user provides rights context. Do not imply official affiliation.",
      "Trailer should be a teaser, not the whole story: hook immediately, introduce distinct character silhouettes, escalate stakes, include one emotional beat, and end on a strong question. Every finished export must fit the hard 00:59 (59-second) ceiling. Avoid legible text in generated frames; titles can be composited separately.",
      "Propose a coherent season/episode outline and respect the requested episode count. Music direction must describe an original score and any optional song concept; do not claim audio has been rendered.",
      "Keep the trailer prompt visual, scene-specific and feasible for a short text-to-video generation. No copyrighted song lyrics or imitation of a living artist's voice."
    ].join("\n"),
    input: JSON.stringify({
      creatorPrompt: input.prompt,
      format: input.format,
      visualStyle: input.style || (input.format === "cartoon" ? "cinematic animation" : "cinematic"),
      aspectRatio: input.aspectRatio || "16:9",
      plannedEpisodeCount: episodeCount,
      trailerDurationSeconds: previewDuration,
      soundtrackPreference: input.soundtrackStyle || "original cinematic score",
      requestedLanguage: input.language || "detect from creator prompt"
    }),
    tools: [{ type: "web_search" } as any],
    safety_identifier: "redom-movie-trailer-proposal",
  });
  let proposal: Record<string, any>;
  try {
    const output = response.output_text || "";
    const first = output.indexOf("{");
    const last = output.lastIndexOf("}");
    if (first < 0 || last <= first) throw new Error("missing JSON");
    proposal = JSON.parse(output.slice(first, last + 1));
  } catch {
    throw Object.assign(new Error("ReDom could not prepare the trailer proposal."), { code: "MOVIE_TRAILER_PROPOSAL_FAILED", status: 502 });
  }
  if (typeof proposal.title !== "string" || typeof proposal.logline !== "string" || typeof proposal.trailerPrompt !== "string" || proposal.trailerPrompt.length < 20) {
    throw Object.assign(new Error("ReDom returned an incomplete trailer proposal."), { code: "MOVIE_TRAILER_PROPOSAL_INCOMPLETE", status: 502 });
  }
  const language = await prepareReDomVideoLanguage(input.prompt, input.format);
  const previewProjectId = "trailer-preview-" + randomUUID();
  const score = await createReDomMovieMusicAsset({
    userId,
    projectId: previewProjectId,
    trackName: "trailer-score",
    durationSeconds: previewDuration,
    instrumental: true,
    prompt: "Original trailer score for " + String(proposal.title) + ". " + String(proposal.soundtrackDirection || input.soundtrackStyle || "Beautiful cinematic music with an emotional hook, rising wonder, a brief tender moment and a powerful final sting.").slice(0, 1800) + " Do not imitate any existing film score or known composer.",
  });
  let narrationTrack: Record<string, unknown> | undefined;
  if (typeof proposal.narrationText === "string" && proposal.narrationText.trim() && env.redomMovieAudio.defaultVoiceId) {
    const narration = await createReDomMovieSpeechAsset({
      userId, projectId: previewProjectId, shotId: "trailer-narration", lineIndex: 1,
      text: proposal.narrationText.trim().slice(0, 1200), voiceId: env.redomMovieAudio.defaultVoiceId,
      languageCode: typeof proposal.language === "string" ? proposal.language : language.languageCode,
    });
    narrationTrack = { assetKey: narration.key, startSeconds: 0, volume: 1, characterName: "Trailer Narrator", voiceId: narration.voiceId, durationSeconds: narration.durationSeconds };
  }
  const trailer = await createReDomVideoJob(userId, {
    prompt: proposal.trailerPrompt.slice(0, 8000),
    durationSeconds: previewDuration,
    resolution: "720p",
    aspectRatio: input.aspectRatio || "16:9",
    format: input.format,
    watermark: true,
    audioEnabled: true,
    audioTracks: narrationTrack ? [narrationTrack] : [],
    musicTracks: [{ assetKey: score.key, startSeconds: 0, volume: 0.45, kind: "trailer-score" }],
    lipSyncEnabled: false,
    languageName: language.languageName,
    languageCode: language.languageCode,
    caption: language.caption,
    generationDirection: language.generationDirection,
  });
  return {
    previewOnly: true,
    projectCreated: false,
    trailerJobId: trailer.jobId,
    trailerStatus: trailer.status,
    model: MODEL,
    proposal: {
      title: String(proposal.title).slice(0, 240),
      logline: String(proposal.logline).slice(0, 1200),
      adaptationApproach: proposal.adaptationApproach,
      research: Array.isArray(proposal.research) ? proposal.research.slice(0, 20) : [],
      characters: Array.isArray(proposal.characters) ? proposal.characters.slice(0, 40) : [],
      episodeOptions: Array.isArray(proposal.episodeOptions) ? proposal.episodeOptions.slice(0, 12) : [],
      episodeCount,
      trailerBeats: Array.isArray(proposal.trailerBeats) ? proposal.trailerBeats.slice(0, 12) : [],
      soundtrackDirection: proposal.soundtrackDirection || input.soundtrackStyle || "Original cinematic score",
      narrationDirection: proposal.narrationDirection || "Optional trailer narration",
      narrationText: typeof proposal.narrationText === "string" ? proposal.narrationText.slice(0, 1200) : undefined,
      songConcepts: Array.isArray(proposal.songConcepts) ? proposal.songConcepts.slice(0, 8) : [],
      language: proposal.language || language.languageName,
      audioRenderingStatus: narrationTrack ? "original_score_and_narration_generated" : "original_score_generated_narration_not_configured",
    },
    maxDurationSeconds: REDOM_VIDEO_MAX_SECONDS,
  };
}

export async function approveReDomMovieTrailerAndCreateProject(userId: string, trailerJobId: string, input: { prompt: string; referenceImageDataUri?: string; durationSeconds: number; episodeCount?: number; quality?: string; style?: string; aspectRatio?: string; audio?: boolean; voice?: boolean; title?: string; format?: "movie" | "cartoon"; soundtrackStyle?: string; singingVoiceStyle?: string; voiceAssignments?: Record<string, string>; singingEnabled?: boolean }) {
  await requirePaid(userId);
  const trailer = (await db.select({ jobId: reDomAiVideos.jobId, status: reDomAiVideos.status, userId: reDomAiVideos.userId })
    .from(reDomAiVideos)
    .where(and(eq(reDomAiVideos.jobId, trailerJobId), eq(reDomAiVideos.userId, userId)))
    .limit(1))[0];
  if (!trailer) throw Object.assign(new Error("Trailer preview not found for this account."), { status: 404, code: "MOVIE_TRAILER_NOT_FOUND" });
  if (trailer.status !== "completed") throw Object.assign(new Error("The trailer must finish successfully before the movie project can be created."), { status: 409, code: "MOVIE_TRAILER_NOT_READY" });
  const project = await createReDomMovieProject(userId, { ...input, approvedTrailerJobId: trailerJobId });
  return { ...project, approvedTrailerJobId: trailerJobId, approvalRequired: false };
}

export async function createReDomMovieProject(userId: string, input: { prompt: string; referenceImageDataUri?: string; durationSeconds: number; episodeCount?: number; quality?: string; style?: string; aspectRatio?: string; audio?: boolean; voice?: boolean; title?: string; format?: "movie" | "cartoon"; soundtrackStyle?: string; singingVoiceStyle?: string; voiceAssignments?: Record<string, string>; singingEnabled?: boolean; approvedTrailerJobId?: string }) {
  await requirePaid(userId);
  if (!input.approvedTrailerJobId) {
    throw Object.assign(new Error("Create and approve a completed trailer preview before adding this movie to the project list."), { status: 409, code: "MOVIE_TRAILER_APPROVAL_REQUIRED" });
  }
  const security = await enforceReDomVideoPromptSecurity(userId, input.prompt);
  const format = input.format || "movie";
  const language = await prepareReDomVideoLanguage(input.prompt, format === "cartoon" ? "cartoon" : "movie");
  const durationSeconds = safeDuration(input.durationSeconds);
  const referenceMatch = input.referenceImageDataUri?.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/) || null;
  if (input.referenceImageDataUri && !referenceMatch) throw Object.assign(new Error("Reference image must be a PNG, JPEG, or WebP data URI."), { code: "INVALID_VIDEO_REFERENCE_IMAGE", status: 400 });
  const referenceBytes = referenceMatch ? Buffer.from(referenceMatch[2], "base64") : undefined;
  if (referenceBytes && (referenceBytes.length < 32 || referenceBytes.length > 15 * 1024 * 1024)) throw Object.assign(new Error("Reference image is outside the supported size range."), { code: "INVALID_VIDEO_REFERENCE_IMAGE", status: 400 });
  const [project] = await db.insert(reDomAiVideoProjects).values({
    userId,
    title: input.title?.trim().slice(0, 240) || "Untitled ReDom Movie",
    prompt: input.prompt.trim(),
    format,
    targetDurationSeconds: durationSeconds,
    quality: input.quality || "high",
    style: input.format === "cartoon" ? "cartoon animation, " + (input.style || "cinematic") : (input.style || "cinematic"),
    aspectRatio: input.aspectRatio || "16:9",
    audioEnabled: input.audio !== false,
    voiceEnabled: input.voice !== false,
    state: "planning",
    research: { securityRequestId: security.requestId, languageName: language.languageName, languageCode: language.languageCode, captionText: language.caption, requestedEpisodeCount: input.episodeCount, soundtrackStyle: input.soundtrackStyle, singingVoiceStyle: input.singingVoiceStyle, voiceAssignments: input.voiceAssignments || {}, singingEnabled: input.singingEnabled !== false, approvedTrailerJobId: input.approvedTrailerJobId },
  }).returning();
  if (!project) throw new Error("Could not create ReDom movie project.");
  if (referenceMatch && referenceBytes) {
    const extension = referenceMatch[1] === "jpeg" ? "jpg" : referenceMatch[1];
    const referenceAssetKey = `redom-ai/video-references/${userId}/movie-project-${project.id}/reference.${extension}`;
    await r2.send(new PutObjectCommand({ Bucket: env.cloudflare.r2.bucketName, Key: referenceAssetKey, Body: referenceBytes, ContentType: "image/" + referenceMatch[1], CacheControl: "private, max-age=900" }));
    await db.update(reDomAiVideoProjects).set({ research: { securityRequestId: security.requestId, languageName: language.languageName, languageCode: language.languageCode, captionText: language.caption, requestedEpisodeCount: input.episodeCount, soundtrackStyle: input.soundtrackStyle, singingVoiceStyle: input.singingVoiceStyle, voiceAssignments: input.voiceAssignments || {}, singingEnabled: input.singingEnabled !== false, approvedTrailerJobId: input.approvedTrailerJobId, referenceAssetKey } }).where(eq(reDomAiVideoProjects.id, project.id));
  }
  return { projectId: project.id, state: project.state, model: MODEL, maxDurationSeconds: REDOM_VIDEO_MAX_SECONDS };
}

export async function planReDomMovieProject(userId: string, projectId: string) {
  await requirePaid(userId);
  const project = (await db.select().from(reDomAiVideoProjects).where(and(eq(reDomAiVideoProjects.id, projectId), eq(reDomAiVideoProjects.userId, userId))).limit(1))[0];
  if (!project) throw Object.assign(new Error("Movie project not found."), { status: 404 });
  if (!["planning", "draft"].includes(project.state)) throw Object.assign(new Error("This movie is not available for planning."), { status: 409 });

  const plan = await generatePlan(project.prompt, project.targetDurationSeconds, project.style, project.quality, project.aspectRatio, "", typeof project.research?.requestedEpisodeCount === "number" ? Math.max(1, Math.min(12, Math.floor(project.research.requestedEpisodeCount))) : undefined);
  await persistPlan(projectId, project, plan);
  return getReDomMovieProject(userId, projectId);
}

export async function reviseReDomMovieProject(userId: string, projectId: string, instruction: string) {
  await requirePaid(userId);
  const project = (await db.select().from(reDomAiVideoProjects).where(and(eq(reDomAiVideoProjects.id, projectId), eq(reDomAiVideoProjects.userId, userId))).limit(1))[0];
  if (!project) throw Object.assign(new Error("Movie project not found."), { status: 404 });
  if (!["planning", "ready", "draft"].includes(project.state)) throw Object.assign(new Error("Creative revisions are locked after production begins."), { status: 409 });

  const current = await getReDomMovieProject(userId, projectId);
  const revisionContext = JSON.stringify({
    bible: current.project.bible,
    entities: current.entities.map((e) => ({ kind: e.kind, name: e.name, identityProfile: e.identityProfile, state: e.state })),
    knowledge: current.knowledge,
    storyEvents: current.storyEvents,
    storyArcs: current.storyArcs,
    episodes: current.episodes.map((e) => ({ episodeNumber: e.episodeNumber, title: e.title, synopsis: e.synopsis, storyStateBefore: e.storyStateBefore, storyStateAfter: e.storyStateAfter })),
  }).slice(0, 120000);

  const security = await enforceReDomVideoPromptSecurity(userId, instruction);
  const revisedPlan = await generatePlan(project.prompt + "\n\nUSER CREATIVE REVISION:\n" + instruction, project.targetDurationSeconds, project.style, project.quality, project.aspectRatio, revisionContext);
  const nextVersion = project.continuityVersion + 1;
  await db.insert(reDomAiVideoRevisions).values({
    projectId,
    version: nextVersion,
    instruction,
    reason: "user_revision",
    affectedScope: ["story", "characters", "world", "knowledge", "foreshadowing", "reveals", "episodes", "scenes", "shots"],
    planSnapshot: { title: revisedPlan.title, bible: revisedPlan.bible, episodeCount: revisedPlan.episodes.length, securityRequestId: security.requestId },
  });
  await persistPlan(projectId, { ...project, continuityVersion: nextVersion }, revisedPlan);
  return getReDomMovieProject(userId, projectId);
}

export async function getReDomMovieProject(userId: string, projectId: string) {
  const project = (await db.select().from(reDomAiVideoProjects).where(and(eq(reDomAiVideoProjects.id, projectId), eq(reDomAiVideoProjects.userId, userId))).limit(1))[0];
  if (!project) throw Object.assign(new Error("Movie project not found."), { status: 404 });
  const entities = await db.select().from(reDomAiVideoEntities).where(eq(reDomAiVideoEntities.projectId, projectId));
  const episodes = await db.select().from(reDomAiVideoEpisodes).where(eq(reDomAiVideoEpisodes.projectId, projectId)).orderBy(asc(reDomAiVideoEpisodes.episodeNumber));
  const scenes = episodes.length
    ? await db.select().from(reDomAiVideoScenes)
      .where(inArray(reDomAiVideoScenes.episodeId, episodes.map((e) => e.id)))
      .orderBy(asc(reDomAiVideoScenes.sceneNumber))
    : [];
  const shots = scenes.length
    ? await db.select().from(reDomAiVideoShots)
      .where(inArray(reDomAiVideoShots.sceneId, scenes.map((s) => s.id)))
      .orderBy(asc(reDomAiVideoShots.sceneId), asc(reDomAiVideoShots.shotNumber))
    : [];
  const knowledge = await db.select().from(reDomAiVideoStoryKnowledge).where(eq(reDomAiVideoStoryKnowledge.projectId, projectId));
  const storyEvents = await db.select().from(reDomAiVideoStoryEvents).where(eq(reDomAiVideoStoryEvents.projectId, projectId));
  const storyArcs = await db.select().from(reDomAiVideoStoryArcs).where(eq(reDomAiVideoStoryArcs.projectId, projectId));
  const revisions = await db.select().from(reDomAiVideoRevisions).where(eq(reDomAiVideoRevisions.projectId, projectId)).orderBy(asc(reDomAiVideoRevisions.version));
  const research = await db.select().from(reDomAiVideoResearch).where(eq(reDomAiVideoResearch.projectId, projectId)).orderBy(asc(reDomAiVideoResearch.createdAt));
  return { project, entities, episodes, scenes, shots, knowledge, storyEvents, storyArcs, revisions, research, model: MODEL };
}

export async function runReDomMovieContinuityCheck(userId: string, projectId: string) {
  const current = await getReDomMovieProject(userId, projectId);
  const warnings: Array<{ sceneId?: string; type: string; message: string }> = [];
  const hiddenFacts = current.knowledge.filter((k) => k.scope === "author" && k.knowledgeState !== "revealed" && k.fact.trim().length >= 12);
  const revealMap = hiddenFacts.map((k) => ({ fact: k.fact.trim(), revealEpisode: k.revealEpisode || Number.MAX_SAFE_INTEGER }));

  for (const scene of current.scenes) {
    if (scene.durationSeconds < 4 || scene.durationSeconds > 12) warnings.push({ sceneId: scene.id, type: "duration", message: "Scene duration is outside the preferred planning range." });
    const shots = current.shots.filter((shot) => shot.sceneId === scene.id);
    for (const shot of shots) {
      const text = [shot.action, shot.generationPrompt, ...shot.dialogue.map((d) => JSON.stringify(d))].join(" ").toLowerCase();
      for (const item of revealMap) {
        const normalizedFact = item.fact.toLowerCase();
        const episode = current.episodes.find((e) => e.id === scene.episodeId)?.episodeNumber || 0;
        if (normalizedFact.length <= 220 && text.includes(normalizedFact) && episode < item.revealEpisode) {
          warnings.push({ sceneId: scene.id, type: "knowledge_leak", message: "Shot contains author-only story knowledge before its planned reveal." });
        }
      }
    }
  }

  for (const event of current.storyEvents) {
    if (event.planted && event.payoffEpisode && event.episodeNumber && event.payoffEpisode < event.episodeNumber) {
      warnings.push({ type: "payoff_order", message: "Foreshadowing payoff occurs before its planted event: " + event.title });
    }
    if (event.eventType === "reveal" && event.audienceState !== "revealed") {
      warnings.push({ type: "reveal_state", message: "Reveal event is scheduled but audience state is not marked revealed: " + event.title });
    }
  }

  for (const scene of current.scenes) {
    const sceneWarnings = warnings.filter((w) => w.sceneId === scene.id).map((w) => w.message);
    await db.update(reDomAiVideoScenes).set({ continuityState: { ...(scene.continuityState || {}), warnings: sceneWarnings } }).where(eq(reDomAiVideoScenes.id, scene.id));
  }

  const nextVersion = current.project.continuityVersion + 1;
  await db.update(reDomAiVideoProjects).set({ continuityVersion: nextVersion, updatedAt: new Date() }).where(eq(reDomAiVideoProjects.id, projectId));
  return { projectId, continuityVersion: nextVersion, blockingWarnings: warnings.filter((w) => w.type === "knowledge_leak"), warnings };
}

async function generateOriginalSongLyrics(projectTitle: string, concept: string, languageName: string, characters: string[]) {
  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    instructions: [
      "Write original, singable lyrics for a fictional movie character song.",
      "Use a clear verse and chorus, short lines, memorable emotional imagery, and a natural vocal rhythm.",
      "Do not imitate a named singer, copy existing lyrics, or refer to copyrighted songs.",
      "Return only the lyrics, with section labels such as [Verse 1] and [Chorus].",
    ].join("\n"),
    input: JSON.stringify({ projectTitle, concept, language: languageName, characters }),
    safety_identifier: "redom-movie-original-song-lyrics",
  });
  const lyrics = (response.output_text || "").trim();
  if (lyrics.length < 40) throw Object.assign(new Error("ReDom could not prepare original song lyrics."), { status: 502, code: "MOVIE_SONG_LYRICS_FAILED" });
  return lyrics.slice(0, 3000);
}

async function prepareReDomMovieAudio(userId: string, project: typeof reDomAiVideoProjects.$inferSelect, shotRows: Array<{ redom_ai_video_shots: typeof reDomAiVideoShots.$inferSelect }>) {
  const shotTracks = new Map<string, Array<Record<string, unknown>>>();
  if (!project.audioEnabled) return { shotTracks, musicTracks: [] as Array<Record<string, unknown>>, audioStatus: "disabled" };
  const research = (project.research || {}) as Record<string, any>;
  const score = await createReDomMovieMusicAsset({
    userId,
    projectId: project.id,
    trackName: "original-score",
    durationSeconds: project.targetDurationSeconds,
    instrumental: true,
    prompt: [
      "Original feature-film score for " + project.title + ".",
      String(research.soundtrackDirection || research.soundtrackStyle || "A beautiful, emotionally rich cinematic orchestral score."),
      "Shape a coherent musical journey with warm themes, wonder, romance, suspense, action and a satisfying emotional resolution where the story calls for them.",
      "Use original melodies and motifs, dynamic orchestration, clear scene transitions, tasteful silence, and professional film-score mixing.",
      "Avoid imitating existing movie soundtracks, known composers, or recognizable melodies.",
    ].join(" "),
  });
  const musicTracks: Array<Record<string, unknown>> = [{ assetKey: score.key, startSeconds: 0, volume: 0.24, kind: "score" }];
  const songConcepts = research.singingEnabled !== false && Array.isArray(research.songConcepts)
    ? research.songConcepts.slice(0, 2)
    : [];
  let songIndex = 0;
  for (const rawConcept of songConcepts) {
    songIndex += 1;
    const concept = typeof rawConcept === "string" ? rawConcept : JSON.stringify(rawConcept);
    const details = rawConcept && typeof rawConcept === "object" ? rawConcept as Record<string, unknown> : {};
    const lyrics = typeof details.lyrics === "string" && details.lyrics.trim()
      ? details.lyrics.trim().slice(0, 3000)
      : await generateOriginalSongLyrics(project.title, concept, String(research.languageName || "the story's primary language"), typeof details.singerCharacter === "string" ? [details.singerCharacter] : Array.isArray(details.characters) ? details.characters.filter((name): name is string => typeof name === "string").slice(0, 8) : []);
    const songDuration = Math.max(15, Math.min(60, Number(details.durationSeconds) || 40));
    const song = await createReDomMovieMusicAsset({
      userId,
      projectId: project.id,
      trackName: "character-song-" + songIndex,
      durationSeconds: songDuration,
      instrumental: false,
      lyrics,
      vocalStyle: String(details.vocalStyle || research.singingVoiceStyle || "expressive, warm musical-theatre lead vocal with clear diction"),
      prompt: "Original character song for " + project.title + ". Story purpose: " + concept + ". Use a distinct, expressive lead vocal and memorable original melody.",
    });
    const requestedStart = Number(details.startSeconds);
    musicTracks.push({
      assetKey: song.key,
      startSeconds: Number.isFinite(requestedStart) ? Math.max(0, Math.min(project.targetDurationSeconds - 1, requestedStart)) : Math.max(0, Math.min(project.targetDurationSeconds - songDuration, 20 + (songIndex - 1) * 70)),
      volume: 0.9,
      kind: "song",
      singerCharacter: typeof details.singerCharacter === "string" ? details.singerCharacter : undefined,
      singerIdentityNote: "Music-model vocal style is not guaranteed to match a character's spoken voice.",
    });
  }

  const voiceAssignments = research.voiceAssignments && typeof research.voiceAssignments === "object" ? research.voiceAssignments as Record<string, unknown> : {};
  const resolveVoice = (character: string) => {
    const match = Object.entries(voiceAssignments).find(([name]) => name.trim().toLowerCase() === character.trim().toLowerCase());
    const assigned = match && typeof match[1] === "string" ? match[1].trim() : "";
    return assigned || env.redomMovieAudio.defaultVoiceId;
  };
  if (project.voiceEnabled) {
    for (const item of shotRows) {
      const shot = item.redom_ai_video_shots;
      const lines = Array.isArray(shot.dialogue) ? shot.dialogue as Array<Record<string, unknown>> : [];
      const tracks: Array<Record<string, unknown>> = [];
      let cursor = 0;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const text = [line.text, line.line, line.dialogue].find((value) => typeof value === "string" && value.trim()) as string | undefined;
        if (!text) continue;
        const character = String(line.speaker || line.character || line.characterName || "Narrator").trim().slice(0, 120);
        const voiceId = resolveVoice(character);
        if (!voiceId) throw Object.assign(new Error("Assign a ReDom Voices voice ID to character '" + character + "' or set REDOM_DEFAULT_VOICE_ID before production."), { status: 503, code: "MOVIE_CHARACTER_VOICE_NOT_ASSIGNED" });
        const clip = await createReDomMovieSpeechAsset({
          userId, projectId: project.id, shotId: shot.id, lineIndex: index + 1,
          text, voiceId, languageCode: typeof research.languageCode === "string" ? research.languageCode : undefined,
          previousText: index > 0 ? String(lines[index - 1].text || lines[index - 1].line || "") : undefined,
          nextText: index + 1 < lines.length ? String(lines[index + 1].text || lines[index + 1].line || "") : undefined,
        });
        const requestedStart = Number(line.startSeconds);
        const startSeconds = Number.isFinite(requestedStart) ? Math.max(0, requestedStart) : cursor;
        tracks.push({ assetKey: clip.key, startSeconds, characterName: character, voiceId, durationSeconds: clip.durationSeconds, alignment: clip.alignment });
        cursor = startSeconds + clip.durationSeconds;
      }
      shotTracks.set(shot.id, tracks);
    }
  }
  await db.update(reDomAiVideoProjects).set({
    research: {
      ...research,
      musicTracks,
      audioProduction: {
        provider: "elevenlabs",
        status: "assets_generated",
        generatedAt: new Date().toISOString(),
        dialogueShotCount: [...shotTracks.values()].filter((tracks) => tracks.length > 0).length,
        generatedDialogueClipCount: [...shotTracks.values()].reduce((total, tracks) => total + tracks.length, 0),
        singingEnabled: research.singingEnabled !== false,
        lipSyncStatus: "pending_sync_lipsync_worker",
      },
    },
    updatedAt: new Date(),
  }).where(eq(reDomAiVideoProjects.id, project.id));
  return { shotTracks, musicTracks, audioStatus: "assets_generated" };
}

export async function startReDomMovieProduction(userId: string, projectId: string) {
  await requirePaid(userId);
  const project = (await db.select().from(reDomAiVideoProjects).where(and(eq(reDomAiVideoProjects.id, projectId), eq(reDomAiVideoProjects.userId, userId))).limit(1))[0];
  if (!project) throw Object.assign(new Error("Movie project not found."), { status: 404 });
  if (project.state !== "ready") throw Object.assign(new Error("Review and approve the ReDom story plan before production."), { status: 409 });
  // Preflight every required runtime before creating audio assets or enqueueing
  // any shots, so a missing model endpoint cannot leave a half-started project.
  if (!env.redomStudioEngine.url || !env.redomStudioEngine.token) {
    throw Object.assign(new Error("Studio—Ultron 8.0R is not configured."), { status: 503, code: "STUDIO_ENGINE_UNAVAILABLE" });
  }
  if (project.format === "cartoon" && (!env.redomCartoonEngine.url || !env.redomCartoonEngine.token)) {
    throw Object.assign(new Error("Cartoon—R8.0 is not configured for cartoon episode shots."), { status: 503, code: "CARTOON_ENGINE_UNAVAILABLE" });
  }

  const continuity = await runReDomMovieContinuityCheck(userId, projectId);
  if (continuity.blockingWarnings.length) throw Object.assign(new Error("Production blocked: the story plan contains audience-knowledge leaks. Revise the story before rendering."), { status: 409, code: "MOVIE_CONTINUITY_BLOCKED" });

  const shots = await db.select().from(reDomAiVideoShots)
    .innerJoin(reDomAiVideoScenes, eq(reDomAiVideoShots.sceneId, reDomAiVideoScenes.id))
    .innerJoin(reDomAiVideoEpisodes, eq(reDomAiVideoScenes.episodeId, reDomAiVideoEpisodes.id))
    .where(eq(reDomAiVideoEpisodes.projectId, projectId))
    .orderBy(asc(reDomAiVideoEpisodes.episodeNumber), asc(reDomAiVideoScenes.sceneNumber), asc(reDomAiVideoShots.shotNumber));
  if (!shots.length) throw Object.assign(new Error("The movie has no planned shots."), { status: 409 });

  const audioPlan = await prepareReDomMovieAudio(userId, project, shots);

  const existing = await db.select({ id: reDomAiVideos.id }).from(reDomAiVideos).where(eq(reDomAiVideos.jobId, "movie_project_" + projectId)).limit(1);
  if (!existing.length) {
    await db.insert(reDomAiVideos).values({
      userId,
      jobId: "movie_project_" + projectId,
      status: "processing",
      prompt: project.prompt,
      targetDurationSeconds: project.targetDurationSeconds,
      resolution: project.quality === "pro" ? "1080p" : "720p",
      aspectRatio: project.aspectRatio,
      runtime: "redom-studio-ultron-8r-native",
      model: "Studio—Ultron 8.0R",
      operation: "generate",
      securityRequestId: typeof project.research?.securityRequestId === "string" ? project.research.securityRequestId : undefined,
    });
  }

  const callbackUrl = env.redomBackendUrl.replace(/\/$/, "") + "/ai/video/callback";
  const referenceAssetKey = typeof project.research?.referenceAssetKey === "string" ? project.research.referenceAssetKey : undefined;
  for (const item of shots) {
    const shot = item.redom_ai_video_shots;
    const jobId = "movie_shot_" + randomUUID().replace(/-/g, "");
    const payload = {
      jobId,
      runtime: "redom-studio-ultron-8r-native",
      model: MODEL,
      operation: "generate",
      format: project.format === "cartoon" ? "cartoon" : "movie",
      watermark: false,
      referenceAssetKey,
      cleanupReferenceAsset: false,
      languageName: typeof project.research?.languageName === "string" ? project.research.languageName : undefined,
      languageCode: typeof project.research?.languageCode === "string" ? project.research.languageCode : undefined,
      generationDirection: "Use " + String(project.research?.languageName || "the language detected from the creator prompt") + " for visible text and story details; preserve consistent character names and dialogue direction.",
      prompt: shot.generationPrompt,
      durationSeconds: shot.durationSeconds,
      resolution: project.quality === "pro" ? "1080p" : "720p",
      aspectRatio: project.aspectRatio,
      callbackUrl,
      callbackToken: env.redomStudioEngine.token,
      audioEnabled: project.audioEnabled,
      audioTracks: audioPlan.shotTracks.get(shot.id) || [],
      lipSyncEnabled: Boolean((audioPlan.shotTracks.get(shot.id) || []).length),
    };
    await db.insert(reDomAiVideoJobs).values({ projectId, shotId: shot.id, jobId, kind: "shot_generation", status: "queued", priority: 100, payload });
    await dispatchMovieJob(payload);
  }
  await db.update(reDomAiVideoProjects).set({ state: "producing", updatedAt: new Date() }).where(eq(reDomAiVideoProjects.id, projectId));
  return { projectId, status: "processing", shotCount: shots.length, model: MODEL, runtime: "redom-studio-ultron-8r-native" };
}

export async function registerReDomMovieJobCallback(jobId: string, status: string, storageKey?: string, error?: string) {
  const job = (await db.select().from(reDomAiVideoJobs).where(eq(reDomAiVideoJobs.jobId, jobId)).limit(1))[0];
  if (!job) return false;

  if (status === "processing") {
    await db.update(reDomAiVideoJobs).set({ status: "processing", startedAt: new Date() }).where(eq(reDomAiVideoJobs.id, job.id));
    if (job.shotId) await db.update(reDomAiVideoShots).set({ status: "processing" }).where(eq(reDomAiVideoShots.id, job.shotId));
    return true;
  }

  if (status === "failed" || status === "blocked") {
    await db.update(reDomAiVideoJobs).set({ status, error: error?.slice(0, 1000), completedAt: new Date() }).where(eq(reDomAiVideoJobs.id, job.id));
    await db.update(reDomAiVideoProjects).set({ state: status === "blocked" ? "blocked" : "failed", updatedAt: new Date() }).where(eq(reDomAiVideoProjects.id, job.projectId));
    return true;
  }

  if (status !== "completed" || !storageKey) return false;
  await db.update(reDomAiVideoJobs).set({ status: "completed", outputAssetKey: storageKey, completedAt: new Date() }).where(eq(reDomAiVideoJobs.id, job.id));
  if (job.shotId) await db.update(reDomAiVideoShots).set({ status: "completed", outputAssetKey: storageKey }).where(eq(reDomAiVideoShots.id, job.shotId));

  if (job.kind === "final_composition") {
    const project = (await db.select().from(reDomAiVideoProjects).where(eq(reDomAiVideoProjects.id, job.projectId)).limit(1))[0];
    if (!project) throw new Error("Movie project disappeared before finalization.");
    await db.update(reDomAiVideoProjects).set({ state: "completed", updatedAt: new Date() }).where(eq(reDomAiVideoProjects.id, job.projectId));
    await db.update(reDomAiVideos).set({
      status: "completed",
      storageKey,
      completedAt: new Date(),
      generationMs: Date.now() - project.createdAt.getTime(),
    }).where(eq(reDomAiVideos.jobId, "movie_project_" + job.projectId));
    return true;
  }

  const remaining = await db.select({ id: reDomAiVideoJobs.id }).from(reDomAiVideoJobs).where(and(eq(reDomAiVideoJobs.projectId, job.projectId), eq(reDomAiVideoJobs.status, "queued")));
  const processing = await db.select({ id: reDomAiVideoJobs.id }).from(reDomAiVideoJobs).where(and(eq(reDomAiVideoJobs.projectId, job.projectId), eq(reDomAiVideoJobs.status, "processing")));
  const composerAlreadyQueued = await db.select({ id: reDomAiVideoJobs.id }).from(reDomAiVideoJobs).where(and(eq(reDomAiVideoJobs.projectId, job.projectId), eq(reDomAiVideoJobs.kind, "final_composition")));
  if (!remaining.length && !processing.length && !composerAlreadyQueued.length) {
    const completedShots = await db.select({ outputAssetKey: reDomAiVideoJobs.outputAssetKey }).from(reDomAiVideoJobs).where(and(eq(reDomAiVideoJobs.projectId, job.projectId), eq(reDomAiVideoJobs.kind, "shot_generation"), eq(reDomAiVideoJobs.status, "completed")));
    const shotKeys = completedShots.map((row) => row.outputAssetKey).filter((key): key is string => Boolean(key));
    const project = (await db.select().from(reDomAiVideoProjects).where(eq(reDomAiVideoProjects.id, job.projectId)).limit(1))[0];
    if (!project || !shotKeys.length) return true;
    const referenceAssetKey = typeof project.research?.referenceAssetKey === "string" ? project.research.referenceAssetKey : undefined;
    const composeJobId = "movie_compose_" + randomUUID().replace(/-/g, "");
    const callbackUrl = env.redomBackendUrl.replace(/\/$/, "") + "/ai/video/callback";
    const payload = { jobId: composeJobId, runtime: "redom-studio-ultron-8r-native", model: MODEL, operation: "compose", format: project.format === "cartoon" ? "cartoon" : "movie", watermark: true, audioEnabled: project.audioEnabled, musicTracks: Array.isArray(project.research?.musicTracks) ? project.research.musicTracks : [], lipSyncEnabled: false, referenceAssetKey, cleanupReferenceAsset: true, languageName: typeof project.research?.languageName === "string" ? project.research.languageName : undefined, languageCode: typeof project.research?.languageCode === "string" ? project.research.languageCode : undefined, captionText: typeof project.research?.captionText === "string" ? project.research.captionText : undefined, generationDirection: project.format === "cartoon" ? "Movie Studio final assembly for Cartoon—R8.0: preserve the approved animation style, character designs, palette, proportions, shot continuity, scene geography, frame pacing, dialogue timing and original-language captions. Enhance edit rhythm, transitions, soundtrack balance, color continuity and narrative flow without restyling characters or replacing animation with live action." : "Preserve language " + String(project.research?.languageName || "detected from the creator prompt") + " in visible text and story details.", prompt: project.format === "cartoon" ? "Movie Studio finishing pass for animated production: " + project.title + ". Maintain all approved Cartoon—R8.0 character models and visual style; improve shot ordering, transitions, pacing, color continuity, audio mix and story clarity. Do not regenerate or redesign characters during composition." : project.title, durationSeconds: project.targetDurationSeconds, resolution: project.quality === "pro" ? "1080p" : "720p", quality: project.quality, aspectRatio: project.aspectRatio, shotKeys, callbackUrl, callbackToken: env.redomStudioEngine.token };
    await db.insert(reDomAiVideoJobs).values({ projectId: job.projectId, kind: "final_composition", jobId: composeJobId, status: "queued", priority: 10, payload });
    await dispatchMovieJob(payload);
  }
  return true;
}

export async function getReDomMovieJobContext(jobId: string) {
  const row = (await db.select({ projectId: reDomAiVideoJobs.projectId, kind: reDomAiVideoJobs.kind, userId: reDomAiVideoProjects.userId })
    .from(reDomAiVideoJobs)
    .innerJoin(reDomAiVideoProjects, eq(reDomAiVideoJobs.projectId, reDomAiVideoProjects.id))
    .where(eq(reDomAiVideoJobs.jobId, jobId)).limit(1))[0];
  return row || null;
}

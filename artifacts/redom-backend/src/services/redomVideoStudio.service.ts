import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../database/db";
import { redis } from "../lib/redis";
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
import { REDOM_VIDEO_MAX_SECONDS } from "./redomVideoEngine.service";

const PAID_PLANS = new Set(["standard", "standard_plus", "plus", "creator", "business", "corporate"]);
const MODEL = "ReDom-v2.8—Video";
const JOB_QUEUE = process.env.REDOM_VIDEO_QUEUE || "redom:video:jobs";

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

function plannerInstructions(durationSeconds: number, style: string, quality: string, aspectRatio: string) {
  const episodeTarget = durationSeconds >= 180 ? Math.min(12, Math.max(4, Math.ceil(durationSeconds / 45))) : Math.min(10, Math.max(3, Math.ceil(durationSeconds / 30)));
  return [
    "You are the ReDom Creative Director, Showrunner, Screenwriter, World Builder and Director's Planner for ReDom-v2.8—Video.",
    "The user's prompt is a STORY SEED, not a finished screenplay. Expand it into an original, coherent, cinematic story while preserving the user's explicit intent.",
    "Do not merely paraphrase the prompt. Invent whatever non-conflicting kingdoms, factions, characters, locations, rules, conflicts, secrets, motivations, power systems, relationships, mysteries, betrayals, comedy, romance, battles and reveals are necessary to make the story work.",
    "Build a reviewable production proposal BEFORE rendering. Never plan five minutes as one generation call. Break the production into episodes, scenes and 4-10 second shots.",
    "PERSISTENT MOVIE MEMORY: the movie is a permanent object. Names, identities, visual traits, world rules, powers, relationships, timeline, unresolved questions and story state must remain stable.",
    "KNOWLEDGE SEPARATION IS MANDATORY. Maintain three different layers: author knowledge (everything true), character knowledge (what each character knows/believes), and audience knowledge (what the audience has actually been shown or told). A secret known to the author must not appear in dialogue, narration, generation prompts or visuals before its planned reveal unless the event is explicitly a clue/foreshadowing.",
    "MYSTERY ARCHITECTURE: create secrets, clues, foreshadowing and payoffs. Every major reveal should have earlier evidence. Do not reveal hidden identities early just because the model knows them.",
    "CHARACTER ARCS: each major character needs an initial state, motivation, internal conflict, relationship changes, turning points and intended resolution.",
    "WORLD LOGIC: establish rules and enforce them. Power escalation must have causes and consequences.",
    "USER CONTROL: structure the result so a later revision such as 'reveal Ethan in episode 9', 'make the villain stronger', or 'give Ethan three forms' can be applied without losing continuity.",
    "RESEARCH: use web search only when factual/reference research improves the story. Research is separate from movie memory. Do not reproduce copyrighted passages or existing fictional works; use factual, public-domain, licensed or user-provided material as appropriate.",
    "Create approximately " + episodeTarget + " episodes for this runtime. Use 3-12 scenes per episode as needed and enough shots to make the visual edit coherent. Keep the total planned duration at or below " + durationSeconds + " seconds.",
    "Visual target: " + style + "; quality: " + quality + "; aspect ratio: " + aspectRatio + ".",
    "Return JSON only with: title, genre, format, estimatedRuntimeSeconds, episodeCount, bible, entities, knowledge, storyEvents, storyArcs, episodes, research.",
    "bible MUST include: logline, premise, themes, tone, audienceContract, worldRules, powerSystem, timelineRules, visualIdentity, storyQuestion, endingIntent, and characterArcs.",
    "knowledge entries MUST include scope (author|character|audience), subjectKey, fact, knowledgeState, and revealEpisode/revealScene where relevant.",
    "storyEvents MUST model secrets, foreshadowing, reveals, conflicts, turning points and payoffs. Include planted=true for planted clues and payoffEpisode/payoffScene when a clue pays off.",
    "storyArcs MUST include name, arcType, objective, startingState, turningPoints, resolution and entityNames.",
    "Each scene MUST include location, characters, action, directorNotes and 1-3 shots. Each shot MUST include shotNumber, durationSeconds, action, camera, lighting, motion, dialogue and sound.",
  ].join("\n");
}

async function generatePlan(seed: string, durationSeconds: number, style: string, quality: string, aspectRatio: string, revisionContext = ""): Promise<MoviePlan> {
  const instructions = plannerInstructions(durationSeconds, style, quality, aspectRatio);
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
            "ReDom-v2.8—Video cinematic shot.",
            shot.action || scene.action,
            JSON.stringify(shot.camera || scene.camera || {}),
            JSON.stringify(shot.lighting || scene.lighting || {}),
            JSON.stringify(shot.motion || scene.motion || {}),
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
    research: { entries: plan.research || [], plannedBy: MODEL },
    state: "ready",
    continuityVersion: project.continuityVersion + 1,
    updatedAt: new Date(),
  }).where(eq(reDomAiVideoProjects.id, projectId));
}

export async function createReDomMovieProject(userId: string, input: { prompt: string; durationSeconds: number; quality?: string; style?: string; aspectRatio?: string; audio?: boolean; voice?: boolean; title?: string; format?: "movie" | "cartoon" }) {
  await requirePaid(userId);
  const security = await enforceReDomVideoPromptSecurity(userId, input.prompt);
  const durationSeconds = safeDuration(input.durationSeconds);
  const [project] = await db.insert(reDomAiVideoProjects).values({
    userId,
    title: input.title?.trim().slice(0, 240) || "Untitled ReDom Movie",
    prompt: input.prompt.trim(),
    format: input.format || "movie",
    targetDurationSeconds: durationSeconds,
    quality: input.quality || "high",
    style: input.format === "cartoon" ? "cartoon animation, " + (input.style || "cinematic") : (input.style || "cinematic"),
    aspectRatio: input.aspectRatio || "16:9",
    audioEnabled: input.audio !== false,
    voiceEnabled: input.voice !== false,
    state: "planning",
    research: { securityRequestId: security.requestId },
  }).returning();
  if (!project) throw new Error("Could not create ReDom movie project.");
  return { projectId: project.id, state: project.state, model: MODEL, maxDurationSeconds: REDOM_VIDEO_MAX_SECONDS };
}

export async function planReDomMovieProject(userId: string, projectId: string) {
  await requirePaid(userId);
  const project = (await db.select().from(reDomAiVideoProjects).where(and(eq(reDomAiVideoProjects.id, projectId), eq(reDomAiVideoProjects.userId, userId))).limit(1))[0];
  if (!project) throw Object.assign(new Error("Movie project not found."), { status: 404 });
  if (!["planning", "draft"].includes(project.state)) throw Object.assign(new Error("This movie is not available for planning."), { status: 409 });

  const plan = await generatePlan(project.prompt, project.targetDurationSeconds, project.style, project.quality, project.aspectRatio);
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

export async function startReDomMovieProduction(userId: string, projectId: string) {
  await requirePaid(userId);
  const project = (await db.select().from(reDomAiVideoProjects).where(and(eq(reDomAiVideoProjects.id, projectId), eq(reDomAiVideoProjects.userId, userId))).limit(1))[0];
  if (!project) throw Object.assign(new Error("Movie project not found."), { status: 404 });
  if (project.state !== "ready") throw Object.assign(new Error("Review and approve the ReDom story plan before production."), { status: 409 });

  const continuity = await runReDomMovieContinuityCheck(userId, projectId);
  if (continuity.blockingWarnings.length) throw Object.assign(new Error("Production blocked: the story plan contains audience-knowledge leaks. Revise the story before rendering."), { status: 409, code: "MOVIE_CONTINUITY_BLOCKED" });

  const shots = await db.select().from(reDomAiVideoShots)
    .innerJoin(reDomAiVideoScenes, eq(reDomAiVideoShots.sceneId, reDomAiVideoScenes.id))
    .innerJoin(reDomAiVideoEpisodes, eq(reDomAiVideoScenes.episodeId, reDomAiVideoEpisodes.id))
    .where(eq(reDomAiVideoEpisodes.projectId, projectId))
    .orderBy(asc(reDomAiVideoEpisodes.episodeNumber), asc(reDomAiVideoScenes.sceneNumber), asc(reDomAiVideoShots.shotNumber));
  if (!shots.length) throw Object.assign(new Error("The movie has no planned shots."), { status: 409 });

  const existing = await db.select({ id: reDomAiVideos.id }).from(reDomAiVideos).where(eq(reDomAiVideos.jobId, "movie_project_" + projectId)).limit(1);
  if (!existing.length) {
    await db.insert(reDomAiVideos).values({
      userId,
      jobId: "movie_project_" + projectId,
      status: "processing",
      prompt: project.prompt,
      durationSeconds: project.targetDurationSeconds,
      resolution: project.quality === "pro" ? "1080p" : "720p",
      aspectRatio: project.aspectRatio,
      runtime: "redom-v2.8-native",
      model: MODEL,
      operation: "generate",
      securityRequestId: typeof project.research?.securityRequestId === "string" ? project.research.securityRequestId : undefined,
      startedAt: new Date(),
    });
  }

  const callbackUrl = env.email.webBaseUrl.replace(/\/$/, "") + "/api/ai/video/callback";
  for (const item of shots) {
    const shot = item.redom_ai_video_shots;
    const jobId = "movie_shot_" + randomUUID().replace(/-/g, "");
    const payload = {
      jobId,
      runtime: "redom-v2.8-native",
      model: MODEL,
      operation: "generate",
      format: project.format === "cartoon" ? "cartoon" : "movie",
      watermark: true,
      prompt: shot.generationPrompt,
      durationSeconds: shot.durationSeconds,
      resolution: project.quality === "pro" ? "1080p" : "720p",
      aspectRatio: project.aspectRatio,
      callbackUrl,
      callbackToken: env.redomVideoEngine.token,
    };
    await db.insert(reDomAiVideoJobs).values({ projectId, shotId: shot.id, jobId, kind: "shot_generation", status: "queued", priority: 100, payload });
    await redis.lpush(JOB_QUEUE, JSON.stringify(payload));
  }
  await db.update(reDomAiVideoProjects).set({ state: "producing", updatedAt: new Date() }).where(eq(reDomAiVideoProjects.id, projectId));
  return { projectId, status: "processing", shotCount: shots.length, model: MODEL, runtime: "redom-v2.8-native" };
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

  const remaining = await db.select({ id: reDomAiVideoJobs.id }).from(reDomAiVideoJobs).where(and(eq(reDomAiVideoJobs.projectId, job.projectId), eq(reDomAiVideoJobs.status, "queued")));
  const processing = await db.select({ id: reDomAiVideoJobs.id }).from(reDomAiVideoJobs).where(and(eq(reDomAiVideoJobs.projectId, job.projectId), eq(reDomAiVideoJobs.status, "processing")));
  const composerAlreadyQueued = await db.select({ id: reDomAiVideoJobs.id }).from(reDomAiVideoJobs).where(and(eq(reDomAiVideoJobs.projectId, job.projectId), eq(reDomAiVideoJobs.kind, "final_composition")));
  if (!remaining.length && !processing.length && !composerAlreadyQueued.length) {
    const completedShots = await db.select({ outputAssetKey: reDomAiVideoJobs.outputAssetKey }).from(reDomAiVideoJobs).where(and(eq(reDomAiVideoJobs.projectId, job.projectId), eq(reDomAiVideoJobs.kind, "shot_generation"), eq(reDomAiVideoJobs.status, "completed")));
    const shotKeys = completedShots.map((row) => row.outputAssetKey).filter((key): key is string => Boolean(key));
    const project = (await db.select().from(reDomAiVideoProjects).where(eq(reDomAiVideoProjects.id, job.projectId)).limit(1))[0];
    if (!project || !shotKeys.length) return true;
    const composeJobId = "movie_compose_" + randomUUID().replace(/-/g, "");
    const callbackUrl = env.email.webBaseUrl.replace(/\/$/, "") + "/api/ai/video/callback";
    const payload = { jobId: composeJobId, runtime: "redom-v2.8-native", model: MODEL, operation: "compose", format: project.format === "cartoon" ? "cartoon" : "movie", watermark: true, prompt: project.title, durationSeconds: project.targetDurationSeconds, resolution: project.quality === "pro" ? "1080p" : "720p", aspectRatio: project.aspectRatio, shotKeys, callbackUrl, callbackToken: env.redomVideoEngine.token };
    await db.insert(reDomAiVideoJobs).values({ projectId: job.projectId, kind: "final_composition", jobId: composeJobId, status: "queued", priority: 10, payload });
    await redis.lpush(JOB_QUEUE, JSON.stringify(payload));
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

import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../database/db";
import { redis } from "../lib/redis";
import { openai } from "../lib/openai";
import { env } from "../config/env";
import { verificationSubscriptions } from "../database/verificationSubscriptions";
import { reDomAiVideoEntities, reDomAiVideoEpisodes, reDomAiVideoJobs, reDomAiVideoProjects, reDomAiVideoScenes, reDomAiVideoShots } from "../database/reDomVideoStudio";
import { enforceReDomVideoPromptSecurity } from "./redomVideoSecurity.service";
import { REDOM_VIDEO_MAX_SECONDS } from "./redomVideoEngine.service";

const PAID_PLANS = new Set(["standard", "standard_plus", "plus", "creator", "business", "corporate"]);
const MODEL = "ReDom-v2.8—Video";
const JOB_QUEUE = process.env.REDOM_VIDEO_QUEUE || "redom:video:jobs";

type PlanEntity = { kind: string; name: string; identityProfile?: Record<string, unknown>; state?: Record<string, unknown> };
type PlanEpisode = { episodeNumber: number; title: string; synopsis: string; targetDurationSeconds: number; scenes: Array<{ sceneNumber: number; title: string; synopsis: string; durationSeconds: number; location?: string; characters?: string[]; action: string; camera?: Record<string, unknown>; lighting?: Record<string, unknown>; motion?: Record<string, unknown>; directorNotes?: string }> };
type MoviePlan = { title: string; bible: Record<string, unknown>; entities: PlanEntity[]; episodes: PlanEpisode[]; research: Array<{ sourceType: string; title: string; url?: string; summary: string; claims?: string[]; rightsBasis?: string }> };

async function requirePaid(userId: string) {
  const rows = await db.select({ subscriptionType: verificationSubscriptions.subscriptionType }).from(verificationSubscriptions).where(and(eq(verificationSubscriptions.userId, userId), eq(verificationSubscriptions.subscriptionStatus, "active")));
  if (!rows.some((row) => PAID_PLANS.has(row.subscriptionType))) throw Object.assign(new Error("ReDom-v2.8—Video is a paid ReDom AI feature. An active paid ReDom AI plan is required."), { code: "VIDEO_PAID_FEATURE_REQUIRED", status: 402 });
}
function safeDuration(value: number) { return Math.max(4, Math.min(REDOM_VIDEO_MAX_SECONDS, Math.floor(value))); }
function parseJson(text: string): MoviePlan {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("ReDom Movie Studio planner returned no structured plan.");
  const parsed = JSON.parse(match[0]) as MoviePlan;
  if (!parsed.title || !parsed.bible || !Array.isArray(parsed.entities) || !Array.isArray(parsed.episodes)) throw new Error("ReDom Movie Studio planner returned an incomplete plan.");
  return parsed;
}

async function generatePlan(prompt: string, durationSeconds: number, style: string, quality: string, aspectRatio: string): Promise<MoviePlan> {
  const sceneTarget = Math.min(60, Math.max(8, Math.ceil(durationSeconds / 8)));
  const instructions = [
    "You are the ReDom Movie Studio showrunner and production planner. You are planning a fictional production, not generating its video. Return JSON only.",
    "Build a persistent cinematic movie bible and a production-ready scene plan for ReDom-v2.8—Video.",
    "The movie is a permanent object: characters, locations, props, costumes, world rules, timeline and visual rules must remain stable across every episode and scene.",
    "Target approximately " + sceneTarget + " scenes total for a " + durationSeconds + "-second production. Each scene should normally be 4-12 seconds and the total must not exceed " + durationSeconds + " seconds.",
    "Use 1-3 episodes depending on story scope. Create reusable named entities instead of repeating descriptions.",
    "Include character identity details, location identity, props, costumes, visual style, dialogue style, world rules, story arc, continuity rules and director notes.",
    "Do not reproduce copyrighted text. Research entries should be factual/reference-oriented and use rightsBasis values such as factual_reference, public_domain, licensed, or user_provided.",
    "The visual target is " + style + ", " + quality + " quality, " + aspectRatio + ".",
    "Return JSON with title, bible, entities, episodes and research. Each episode contains scenes. Each scene contains sceneNumber, title, synopsis, durationSeconds, location, characters, action, camera, lighting, motion and directorNotes.",
  ].join("\n");
  const response = await openai.responses.create({ model: "gpt-5.6-luna", instructions, input: prompt + "\n\nTarget duration: " + durationSeconds + " seconds.", safety_identifier: "redom-movie-planner" });
  return parseJson(response.output_text || "");
}

export async function createReDomMovieProject(userId: string, input: { prompt: string; durationSeconds: number; quality?: string; style?: string; aspectRatio?: string; audio?: boolean; voice?: boolean; title?: string }) {
  await requirePaid(userId);
  const security = await enforceReDomVideoPromptSecurity(userId, input.prompt);
  const durationSeconds = safeDuration(input.durationSeconds);
  const [project] = await db.insert(reDomAiVideoProjects).values({ userId, title: input.title?.trim().slice(0, 240) || "Untitled ReDom Movie", prompt: input.prompt.trim(), targetDurationSeconds: durationSeconds, quality: input.quality || "high", style: input.style || "cinematic", aspectRatio: input.aspectRatio || "16:9", audioEnabled: input.audio !== false, voiceEnabled: input.voice !== false, state: "planning", research: { securityRequestId: security.requestId } }).returning();
  if (!project) throw new Error("Could not create ReDom movie project.");
  return { projectId: project.id, state: project.state, model: MODEL, maxDurationSeconds: REDOM_VIDEO_MAX_SECONDS };
}

export async function planReDomMovieProject(userId: string, projectId: string) {
  await requirePaid(userId);
  const project = (await db.select().from(reDomAiVideoProjects).where(and(eq(reDomAiVideoProjects.id, projectId), eq(reDomAiVideoProjects.userId, userId))).limit(1))[0];
  if (!project) throw Object.assign(new Error("Movie project not found."), { status: 404 });
  if (project.state !== "planning" && project.state !== "draft") throw Object.assign(new Error("This movie is not available for planning."), { status: 409 });
  const plan = await generatePlan(project.prompt, project.targetDurationSeconds, project.style, project.quality, project.aspectRatio);
  const entityMap = new Map<string, string>();
  for (const entity of plan.entities.slice(0, 200)) {
    const [row] = await db.insert(reDomAiVideoEntities).values({ projectId, kind: entity.kind, name: entity.name.trim().slice(0, 180), identityProfile: entity.identityProfile || {}, state: entity.state || {}, referenceAssetKeys: [] }).onConflictDoNothing().returning();
    if (row) entityMap.set(entity.name, row.id);
  }
  for (const episode of plan.episodes.slice(0, 12)) {
    const [episodeRow] = await db.insert(reDomAiVideoEpisodes).values({ projectId, episodeNumber: episode.episodeNumber, title: episode.title, synopsis: episode.synopsis, targetDurationSeconds: Math.min(project.targetDurationSeconds, Math.max(4, episode.targetDurationSeconds)), storyStateBefore: {}, storyStateAfter: {} }).onConflictDoNothing().returning();
    if (!episodeRow) continue;
    for (const scene of episode.scenes.slice(0, 60)) {
      const locationEntityId = scene.location ? entityMap.get(scene.location) : undefined;
      const characterEntityIds = (scene.characters || []).map((name) => entityMap.get(name)).filter((id): id is string => Boolean(id));
      const [sceneRow] = await db.insert(reDomAiVideoScenes).values({ episodeId: episodeRow.id, sceneNumber: scene.sceneNumber, title: scene.title, synopsis: scene.synopsis, durationSeconds: Math.max(4, Math.min(12, scene.durationSeconds)), locationEntityId: locationEntityId || null, characterEntityIds, continuityState: { characters: characterEntityIds, location: locationEntityId || null, previousScene: scene.sceneNumber > 1 ? scene.sceneNumber - 1 : null }, directorNotes: scene.directorNotes }).onConflictDoNothing().returning();
      if (!sceneRow) continue;
      await db.insert(reDomAiVideoShots).values({ sceneId: sceneRow.id, shotNumber: 1, durationSeconds: Math.max(4, Math.min(10, scene.durationSeconds)), action: scene.action, camera: scene.camera || {}, lighting: scene.lighting || {}, motion: scene.motion || {}, dialogue: [], sound: { ambient: project.audioEnabled, voice: project.voiceEnabled }, entityIds: characterEntityIds.concat(locationEntityId ? [locationEntityId] : []), generationPrompt: [project.style, scene.action, "Persistent ReDom character and world continuity is mandatory.", JSON.stringify(scene.camera || {}), JSON.stringify(scene.lighting || {}), JSON.stringify(scene.motion || {})].join("\n"), continuityWarnings: [] }).onConflictDoNothing();
    }
  }
  await db.update(reDomAiVideoProjects).set({ title: plan.title.slice(0, 240), bible: plan.bible, research: { entries: plan.research, plannedBy: MODEL }, state: "ready", continuityVersion: 2, updatedAt: new Date() }).where(eq(reDomAiVideoProjects.id, projectId));
  return getReDomMovieProject(userId, projectId);
}

export async function getReDomMovieProject(userId: string, projectId: string) {
  const project = (await db.select().from(reDomAiVideoProjects).where(and(eq(reDomAiVideoProjects.id, projectId), eq(reDomAiVideoProjects.userId, userId))).limit(1))[0];
  if (!project) throw Object.assign(new Error("Movie project not found."), { status: 404 });
  const entities = await db.select().from(reDomAiVideoEntities).where(eq(reDomAiVideoEntities.projectId, projectId));
  const episodes = await db.select().from(reDomAiVideoEpisodes).where(eq(reDomAiVideoEpisodes.projectId, projectId)).orderBy(asc(reDomAiVideoEpisodes.episodeNumber));
  const scenes = episodes.length ? await db.select().from(reDomAiVideoScenes).where(eq(reDomAiVideoScenes.episodeId, episodes[0].id)).orderBy(asc(reDomAiVideoScenes.sceneNumber)) : [];
  return { project, entities, episodes, scenes, model: MODEL };
}

export async function runReDomMovieContinuityCheck(userId: string, projectId: string) {
  const project = (await db.select().from(reDomAiVideoProjects).where(and(eq(reDomAiVideoProjects.id, projectId), eq(reDomAiVideoProjects.userId, userId))).limit(1))[0];
  if (!project) throw Object.assign(new Error("Movie project not found."), { status: 404 });
  const scenes = await db.select().from(reDomAiVideoScenes).innerJoin(reDomAiVideoEpisodes, eq(reDomAiVideoScenes.episodeId, reDomAiVideoEpisodes.id)).where(eq(reDomAiVideoEpisodes.projectId, projectId)).orderBy(asc(reDomAiVideoEpisodes.episodeNumber), asc(reDomAiVideoScenes.sceneNumber));
  const warnings: Array<{ sceneId: string; message: string }> = [];
  for (const item of scenes) {
    if (item.redom_ai_video_scenes.durationSeconds < 4 || item.redom_ai_video_scenes.durationSeconds > 12) warnings.push({ sceneId: item.redom_ai_video_scenes.id, message: "Scene duration is outside the preferred shot-planning range." });
  }
  for (const warning of warnings) await db.update(reDomAiVideoScenes).set({ continuityState: { warnings: [warning.message] } }).where(eq(reDomAiVideoScenes.id, warning.sceneId));
  await db.update(reDomAiVideoProjects).set({ continuityVersion: project.continuityVersion + 1, updatedAt: new Date() }).where(eq(reDomAiVideoProjects.id, projectId));
  return { projectId, continuityVersion: project.continuityVersion + 1, warnings };
}

export async function startReDomMovieProduction(userId: string, projectId: string) {
  const project = (await db.select().from(reDomAiVideoProjects).where(and(eq(reDomAiVideoProjects.id, projectId), eq(reDomAiVideoProjects.userId, userId))).limit(1))[0];
  if (!project) throw Object.assign(new Error("Movie project not found."), { status: 404 });
  if (project.state !== "ready") throw Object.assign(new Error("Approve or finish the movie plan before production."), { status: 409 });
  const shots = await db.select().from(reDomAiVideoShots).innerJoin(reDomAiVideoScenes, eq(reDomAiVideoShots.sceneId, reDomAiVideoScenes.id)).innerJoin(reDomAiVideoEpisodes, eq(reDomAiVideoScenes.episodeId, reDomAiVideoEpisodes.id)).where(eq(reDomAiVideoEpisodes.projectId, projectId));
  if (!shots.length) throw Object.assign(new Error("The movie has no production shots."), { status: 409 });
  const callbackUrl = env.email.webBaseUrl.replace(/\/$/, "") + "/api/ai/video/callback";
  for (const item of shots) {
    const shot = item.redom_ai_video_shots;
    const jobId = "movie_shot_" + randomUUID().replace(/-/g, "");
    const payload = { jobId, runtime: "redom-v2.8-native", model: MODEL, operation: "generate", prompt: shot.generationPrompt, durationSeconds: shot.durationSeconds, resolution: project.quality === "pro" ? "1080p" : "720p", aspectRatio: project.aspectRatio, callbackUrl, callbackToken: env.redomVideoEngine.token };
    await db.insert(reDomAiVideoJobs).values({ projectId, shotId: shot.id, jobId, kind: "shot_generation", status: "queued", priority: 100, payload });
    await redis.lpush(JOB_QUEUE, JSON.stringify(payload));
  }
  await db.update(reDomAiVideoProjects).set({ state: "producing", updatedAt: new Date() }).where(eq(reDomAiVideoProjects.id, projectId));
  return { projectId, status: "processing", shotCount: shots.length, model: MODEL };
}
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar, boolean } from "drizzle-orm/pg-core";
import { users } from "./schema";

export type ReDomVideoEntityKind = "character" | "location" | "prop" | "vehicle" | "creature" | "costume" | "faction" | "style";
export type ReDomVideoProjectState = "draft" | "planning" | "ready" | "producing" | "completed" | "failed" | "blocked";
export type ReDomVideoJobState = "queued" | "processing" | "completed" | "failed" | "blocked";

export const reDomAiVideoProjects = pgTable("redom_ai_video_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 240 }).notNull(),
  prompt: text("prompt").notNull(),
  format: varchar("format", { length: 32 }).notNull().default("movie"),
  targetDurationSeconds: integer("target_duration_seconds").notNull(),
  quality: varchar("quality", { length: 24 }).notNull().default("high"),
  style: varchar("style", { length: 64 }).notNull().default("cinematic"),
  aspectRatio: varchar("aspect_ratio", { length: 16 }).notNull().default("16:9"),
  audioEnabled: boolean("audio_enabled").notNull().default(true),
  voiceEnabled: boolean("voice_enabled").notNull().default(true),
  state: varchar("state", { length: 24 }).notNull().default("draft"),
  bible: jsonb("bible").$type<Record<string, unknown>>(),
  research: jsonb("research").$type<Record<string, unknown>>(),
  continuityVersion: integer("continuity_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userCreated: index("redom_ai_video_projects_user_created_idx").on(table.userId, table.createdAt),
}));

export const reDomAiVideoEntities = pgTable("redom_ai_video_entities", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => reDomAiVideoProjects.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 32 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  identityProfile: jsonb("identity_profile").$type<Record<string, unknown>>().notNull(),
  state: jsonb("state").$type<Record<string, unknown>>().notNull(),
  referenceAssetKeys: jsonb("reference_asset_keys").$type<string[]>().notNull().default([]),
  embeddingRef: varchar("embedding_ref", { length: 600 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  projectName: uniqueIndex("redom_ai_video_entities_project_name_unique").on(table.projectId, table.name),
  projectKind: index("redom_ai_video_entities_project_kind_idx").on(table.projectId, table.kind),
}));

export const reDomAiVideoEpisodes = pgTable("redom_ai_video_episodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => reDomAiVideoProjects.id, { onDelete: "cascade" }),
  episodeNumber: integer("episode_number").notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  synopsis: text("synopsis").notNull(),
  targetDurationSeconds: integer("target_duration_seconds").notNull(),
  storyStateBefore: jsonb("story_state_before").$type<Record<string, unknown>>().notNull(),
  storyStateAfter: jsonb("story_state_after").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  projectEpisode: uniqueIndex("redom_ai_video_episodes_project_number_unique").on(table.projectId, table.episodeNumber),
}));

export const reDomAiVideoScenes = pgTable("redom_ai_video_scenes", {
  id: uuid("id").defaultRandom().primaryKey(),
  episodeId: uuid("episode_id").notNull().references(() => reDomAiVideoEpisodes.id, { onDelete: "cascade" }),
  sceneNumber: integer("scene_number").notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  synopsis: text("synopsis").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  locationEntityId: uuid("location_entity_id").references(() => reDomAiVideoEntities.id, { onDelete: "set null" }),
  characterEntityIds: jsonb("character_entity_ids").$type<string[]>().notNull().default([]),
  continuityState: jsonb("continuity_state").$type<Record<string, unknown>>().notNull(),
  directorNotes: text("director_notes"),
  status: varchar("status", { length: 24 }).notNull().default("planned"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  episodeScene: uniqueIndex("redom_ai_video_scenes_episode_number_unique").on(table.episodeId, table.sceneNumber),
}));

export const reDomAiVideoShots = pgTable("redom_ai_video_shots", {
  id: uuid("id").defaultRandom().primaryKey(),
  sceneId: uuid("scene_id").notNull().references(() => reDomAiVideoScenes.id, { onDelete: "cascade" }),
  shotNumber: integer("shot_number").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  action: text("action").notNull(),
  camera: jsonb("camera").$type<Record<string, unknown>>().notNull(),
  lighting: jsonb("lighting").$type<Record<string, unknown>>().notNull(),
  motion: jsonb("motion").$type<Record<string, unknown>>().notNull(),
  dialogue: jsonb("dialogue").$type<Record<string, unknown>[]>().notNull().default([]),
  sound: jsonb("sound").$type<Record<string, unknown>>().notNull(),
  entityIds: jsonb("entity_ids").$type<string[]>().notNull().default([]),
  generationPrompt: text("generation_prompt").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("planned"),
  outputAssetKey: varchar("output_asset_key", { length: 600 }),
  continuityWarnings: jsonb("continuity_warnings").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sceneShot: uniqueIndex("redom_ai_video_shots_scene_number_unique").on(table.sceneId, table.shotNumber),
}));

export const reDomAiVideoJobs = pgTable("redom_ai_video_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => reDomAiVideoProjects.id, { onDelete: "cascade" }),
  shotId: uuid("shot_id").references(() => reDomAiVideoShots.id, { onDelete: "set null" }),
  jobId: varchar("job_id", { length: 100 }).notNull(),
  kind: varchar("kind", { length: 32 }).notNull().default("shot_generation"),
  status: varchar("status", { length: 24 }).notNull().default("queued"),
  priority: integer("priority").notNull().default(100),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  outputAssetKey: varchar("output_asset_key", { length: 600 }),
  error: varchar("error", { length: 1000 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  jobUnique: uniqueIndex("redom_ai_video_jobs_job_id_unique").on(table.jobId),
  projectStatus: index("redom_ai_video_jobs_project_status_idx").on(table.projectId, table.status),
}));

export const reDomAiVideoResearch = pgTable("redom_ai_video_research", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => reDomAiVideoProjects.id, { onDelete: "cascade" }),
  sourceType: varchar("source_type", { length: 32 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  url: varchar("url", { length: 1200 }),
  summary: text("summary").notNull(),
  claims: jsonb("claims").$type<string[]>().notNull().default([]),
  rightsBasis: varchar("rights_basis", { length: 64 }).notNull().default("factual_reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  projectCreated: index("redom_ai_video_research_project_created_idx").on(table.projectId, table.createdAt),
}));


export type ReDomStoryKnowledgeScope = "author" | "character" | "audience";
export type ReDomStoryEventType = "secret" | "foreshadowing" | "reveal" | "conflict" | "turning_point" | "payoff";
export type ReDomStoryAudienceState = "hidden" | "hinted" | "suspected" | "revealed";

export const reDomAiVideoStoryKnowledge = pgTable("redom_ai_video_story_knowledge", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => reDomAiVideoProjects.id, { onDelete: "cascade" }),
  scope: varchar("scope", { length: 24 }).notNull(),
  subjectKey: varchar("subject_key", { length: 240 }),
  fact: text("fact").notNull(),
  knowledgeState: varchar("knowledge_state", { length: 24 }).notNull().default("known"),
  revealEpisode: integer("reveal_episode"),
  revealScene: integer("reveal_scene"),
  source: varchar("source", { length: 32 }).notNull().default("story_engine"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  projectScope: index("redom_ai_video_story_knowledge_project_scope_idx").on(table.projectId, table.scope),
  reveal: index("redom_ai_video_story_knowledge_reveal_idx").on(table.projectId, table.revealEpisode, table.revealScene),
}));

export const reDomAiVideoStoryEvents = pgTable("redom_ai_video_story_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => reDomAiVideoProjects.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 32 }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description").notNull(),
  episodeNumber: integer("episode_number"),
  sceneNumber: integer("scene_number"),
  audienceState: varchar("audience_state", { length: 24 }).notNull().default("hidden"),
  planted: boolean("planted").notNull().default(false),
  payoffEpisode: integer("payoff_episode"),
  payoffScene: integer("payoff_scene"),
  relatedEntityIds: jsonb("related_entity_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  projectType: index("redom_ai_video_story_events_project_type_idx").on(table.projectId, table.eventType),
  payoff: index("redom_ai_video_story_events_payoff_idx").on(table.projectId, table.payoffEpisode, table.payoffScene),
}));

export const reDomAiVideoStoryArcs = pgTable("redom_ai_video_story_arcs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => reDomAiVideoProjects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 240 }).notNull(),
  arcType: varchar("arc_type", { length: 48 }).notNull(),
  objective: text("objective").notNull(),
  startingState: text("starting_state").notNull(),
  turningPoints: jsonb("turning_points").$type<unknown[]>().notNull().default([]),
  resolution: text("resolution"),
  entityIds: jsonb("entity_ids").$type<string[]>().notNull().default([]),
  status: varchar("status", { length: 24 }).notNull().default("planned"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  projectName: uniqueIndex("redom_ai_video_story_arcs_project_name_unique").on(table.projectId, table.name),
}));

export const reDomAiVideoRevisions = pgTable("redom_ai_video_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => reDomAiVideoProjects.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  instruction: text("instruction").notNull(),
  reason: varchar("reason", { length: 48 }).notNull().default("user_revision"),
  affectedScope: jsonb("affected_scope").$type<string[]>().notNull().default([]),
  planSnapshot: jsonb("plan_snapshot").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  projectVersion: uniqueIndex("redom_ai_video_revisions_project_version_unique").on(table.projectId, table.version),
}));

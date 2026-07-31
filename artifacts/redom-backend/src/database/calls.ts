import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { conversations } from "./conversations";
import { userProfiles } from "./userProfiles";

export const calls = pgTable("calls", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // RELATIONSHIPS
  // ==================================================

  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),

  startedByUserId: uuid("started_by_user_id")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // CALL TYPE
  // ==================================================

  /**
   * voice
   * video
   */
  callType: varchar("call_type", {
    length: 20,
  })
    .notNull(),

  /**
   * direct
   * group
   */
  conversationType: varchar(
    "conversation_type",
    {
      length: 20,
    },
  )
    .notNull(),

  // ==================================================
  // STATUS
  // ==================================================

  /**
   * ringing
   * connecting
   * active
   * ended
   * declined
   * missed
   * cancelled
   * failed
   */
  callStatus: varchar(
    "call_status",
    {
      length: 30,
    },
  )
    .default("ringing")
    .notNull(),

  active: boolean("active")
    .default(true)
    .notNull(),

  deleted: boolean("deleted")
    .default(false)
    .notNull(),

  // ==================================================
  // PARTICIPANTS
  // ==================================================

  participantCount: integer(
    "participant_count",
  )
    .default(1)
    .notNull(),

  maxParticipants: integer(
    "max_participants",
  )
    .default(2)
    .notNull(),

  // ==================================================
  // CALL CONTROLS
  // ==================================================

  microphoneEnabled: boolean(
    "microphone_enabled",
  )
    .default(true)
    .notNull(),

  speakerEnabled: boolean(
    "speaker_enabled",
  )
    .default(true)
    .notNull(),

  cameraEnabled: boolean(
    "camera_enabled",
  )
    .default(false)
    .notNull(),

  usingFrontCamera: boolean(
    "using_front_camera",
  )
    .default(true)
    .notNull(),

  screenSharing: boolean(
    "screen_sharing",
  )
    .default(false)
    .notNull(),

  // ==================================================
  // QUALITY
  // ==================================================

  /**
   * excellent
   * good
   * fair
   * poor
   */
  connectionQuality: varchar(
    "connection_quality",
    {
      length: 20,
    },
  ),

  /**
   * wifi
   * mobile
   */
  networkType: varchar(
    "network_type",
    {
      length: 20,
    },
  ),

  encrypted: boolean("encrypted")
    .default(true)
    .notNull(),

  // ==================================================
  // MODERATION
  // ==================================================

  aiReviewed: boolean(
    "ai_reviewed",
  )
    .default(false)
    .notNull(),

  spamDetected: boolean(
    "spam_detected",
  )
    .default(false)
    .notNull(),

  abuseReported: boolean(
    "abuse_reported",
  )
    .default(false)
    .notNull(),

  reportCount: integer(
    "report_count",
  )
    .default(0)
    .notNull(),

  // ==================================================
  // TIMING
  // ==================================================

  startedAt: timestamp("started_at", {
    withTimezone: true,
  }),

  answeredAt: timestamp("answered_at", {
    withTimezone: true,
  }),

  endedAt: timestamp("ended_at", {
    withTimezone: true,
  }),

  durationSeconds: integer(
    "duration_seconds",
  )
    .default(0)
    .notNull(),

  // ==================================================
  // SYSTEM
  // ==================================================

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

});
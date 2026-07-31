import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./schema";

export const userProfiles = pgTable("user_profiles", {
  // Internal profile ID
  id: uuid("id").defaultRandom().primaryKey(),

  // Links to account
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // Permanent 16-digit ReDom ID
  redomId: varchar("redom_id", {
    length: 16,
  })
    .notNull()
    .unique(),

  // RD ID visibility
  redomIdVisibility: boolean("redom_id_visibility")
    .default(true)
    .notNull(),

  // Personal / Creator / Business / Government / Organization
  profileType: varchar("profile_type", {
    length: 30,
  })
    .default("personal")
    .notNull(),

  // Public display name
  displayName: varchar("display_name", {
    length: 100,
  }).notNull(),

  // About user
  bio: text("bio"),

  // Profile picture
  profilePhoto: varchar("profile_photo", {
    length: 500,
  }),

  // Cover photo
  coverPhoto: varchar("cover_photo", {
    length: 500,
  }),

  // Personal website
  website: varchar("website", {
    length: 255,
  }),

  // Occupation
  occupation: varchar("occupation", {
    length: 150,
  }),

  // Education
  education: varchar("education", {
    length: 150,
  }),

  // Hometown
  hometown: varchar("hometown", {
    length: 100,
  }),

  // Current city
  currentCity: varchar("current_city", {
    length: 100,
  }),

  // Relationship status
  relationshipStatus: varchar("relationship_status", {
    length: 50,
  }),

  // Pronouns
  pronouns: varchar("pronouns", {
    length: 30,
  }),

  // Profile visibility
  profileVisibility: varchar("profile_visibility", {
    length: 20,
  })
    .default("public")
    .notNull(),

  // Verified badge
  verified: boolean("verified")
    .default(false)
    .notNull(),

  // Show joined date on profile
  displayJoinDate: boolean("display_join_date")
    .default(true)
    .notNull(),

  // Automatically calculated profile completion
  profileCompletion: integer("profile_completion")
    .default(0)
    .notNull(),

  // Cached statistics
  followerCount: integer("follower_count")
    .default(0)
    .notNull(),

  followingCount: integer("following_count")
    .default(0)
    .notNull(),

  friendCount: integer("friend_count")
    .default(0)
    .notNull(),

  postCount: integer("post_count")
    .default(0)
    .notNull(),

  // Dates
  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull(),
});
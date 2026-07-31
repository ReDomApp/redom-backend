import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./userProfiles";

export const saves = pgTable("saves", {

  // ==================================================
  // INTERNAL ID
  // ==================================================

  id: uuid("id")
    .defaultRandom()
    .primaryKey(),

  // ==================================================
  // USER
  // ==================================================

  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id),

  // ==================================================
  // CONTENT
  // ==================================================

  /**
   * post
   * video
   * photo
   * reel
   * page_post
   */

  contentType: varchar("content_type", {
    length: 30,
  }).notNull(),

  /**
   * ID of the saved content.
   */

  contentId: uuid("content_id")
    .notNull(),

  // ==================================================
  // COLLECTION
  // ==================================================

  /**
   * all_saves
   * favorites
   * watch_later
   * custom
   */

  collectionType: varchar("collection_type", {
    length: 30,
  })
    .default("all_saves")
    .notNull(),

  /**
   * Used only when
   * collectionType = custom
   */

  customFolderName: varchar("custom_folder_name", {
    length: 100,
  }),

  // ==================================================
  // FAVORITE
  // ==================================================

  favorite: boolean("favorite")
    .default(false)
    .notNull(),

  // ==================================================
  // STATUS
  // ==================================================

  active: boolean("active")
    .default(true)
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
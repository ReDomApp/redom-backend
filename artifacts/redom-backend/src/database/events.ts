import { pgTable, uuid, varchar, text, boolean, timestamp, doublePrecision, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  creatorUserId: uuid("creator_user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }),
  timezone: varchar("timezone", { length: 80 }).default("UTC").notNull(),
  eventType: varchar("event_type", { length: 20 }).default("in_person").notNull(),
  privacy: varchar("privacy", { length: 20 }).default("public").notNull(),
  locationName: varchar("location_name", { length: 255 }),
  locationCity: varchar("location_city", { length: 160 }),
  locationLat: doublePrecision("location_lat"),
  locationLng: doublePrecision("location_lng"),
  locationRadiusMiles: integer("location_radius_miles"),
  locationMode: varchar("location_mode", { length: 20 }).default("suggested").notNull(),
  virtualUrl: text("virtual_url"),
  repeatRule: varchar("repeat_rule", { length: 20 }).default("none").notNull(),
  coverKey: text("cover_key"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  discoveryIdx: index("events_discovery_idx").on(table.status, table.privacy, table.startAt),
  creatorIdx: index("events_creator_idx").on(table.creatorUserId, table.startAt),
}));

export const eventResponses = pgTable("event_responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  eventUserUq: uniqueIndex("event_responses_event_user_uq").on(table.eventId, table.userId),
  userIdx: index("event_responses_user_idx").on(table.userId, table.updatedAt),
}));

export const eventSettings = pgTable("event_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  addEventsToCalendar: boolean("add_events_to_calendar").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
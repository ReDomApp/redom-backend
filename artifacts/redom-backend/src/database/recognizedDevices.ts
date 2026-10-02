import { boolean, index, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const recognizedDevices = pgTable("recognized_devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  credentialHash: varchar("credential_hash", { length: 128 }).notNull(),
  deviceType: varchar("device_type", { length: 30 }).notNull().default("unknown"),
  platform: varchar("platform", { length: 50 }),
  browser: varchar("browser", { length: 100 }),
  deviceName: varchar("device_name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => ({
  credentialUnique: uniqueIndex("recognized_devices_credential_hash_unique").on(table.credentialHash),
  activeCredential: index("recognized_devices_active_credential_idx").on(table.credentialHash, table.revokedAt),
}));

export const recognizedDeviceAccounts = pgTable("recognized_device_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  deviceId: uuid("device_id").notNull().references(() => recognizedDevices.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (table) => ({
  deviceUserUnique: uniqueIndex("recognized_device_accounts_device_user_unique").on(table.deviceId, table.userId),
  deviceLookup: index("recognized_device_accounts_device_lookup_idx").on(table.deviceId, table.active),
}));
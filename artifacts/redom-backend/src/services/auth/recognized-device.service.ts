import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../database/db";
import { recognizedDeviceAccounts, recognizedDevices } from "../../database/recognizedDevices";
import { userProfiles } from "../../database/userProfiles";
import { users } from "../../database/schema";

export type RecognizedAccount = {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  username: string;
  profilePhoto: string | null;
};

function hashCredential(credential: string) {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

function newCredential() {
  return randomBytes(32).toString("base64url");
}

export class RecognizedDeviceService {
  async ensureDevice(input: { credential?: string; deviceType?: string; platform?: string; browser?: string; deviceName?: string }) {
    const credential = input.credential?.trim() || newCredential();
    const credentialHash = hashCredential(credential);
    const existing = await db.query.recognizedDevices.findFirst({ where: and(eq(recognizedDevices.credentialHash, credentialHash), isNull(recognizedDevices.revokedAt)) });
    if (existing) {
      await db.update(recognizedDevices).set({ lastUsedAt: new Date(), deviceType: input.deviceType ?? existing.deviceType, platform: input.platform ?? existing.platform, browser: input.browser ?? existing.browser, deviceName: input.deviceName ?? existing.deviceName }).where(eq(recognizedDevices.id, existing.id));
      return { deviceId: existing.id, credential, created: false };
    }
    const [created] = await db.insert(recognizedDevices).values({ credentialHash, deviceType: input.deviceType ?? "unknown", platform: input.platform ?? null, browser: input.browser ?? null, deviceName: input.deviceName ?? null }).returning({ id: recognizedDevices.id });
    if (!created) throw new Error("Unable to initialize the recognized device.");
    return { deviceId: created.id, credential, created: true };
  }

  async list(credential: string) {
    const hash = hashCredential(credential);
    const device = await db.query.recognizedDevices.findFirst({ where: and(eq(recognizedDevices.credentialHash, hash), isNull(recognizedDevices.revokedAt)) });
    if (!device) return { deviceId: null, accounts: [] as RecognizedAccount[] };
    await db.update(recognizedDevices).set({ lastUsedAt: new Date() }).where(eq(recognizedDevices.id, device.id));
    const rows = await db.select({
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      displayName: userProfiles.displayName,
      profilePhoto: userProfiles.profilePhoto,
    }).from(recognizedDeviceAccounts)
      .innerJoin(users, eq(users.id, recognizedDeviceAccounts.userId))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(recognizedDeviceAccounts.deviceId, device.id), eq(recognizedDeviceAccounts.active, true), isNull(recognizedDeviceAccounts.removedAt)))
      .orderBy(desc(recognizedDeviceAccounts.lastUsedAt));
    return { deviceId: device.id, accounts: rows.map(row => ({ ...row, displayName: row.displayName || [row.firstName, row.lastName].filter(Boolean).join(" ") })) };
  }

  async remember(credential: string, userId: string, device?: { deviceType?: string; platform?: string; browser?: string; deviceName?: string }) {
    const ensured = await this.ensureDevice({ credential, ...device });
    const now = new Date();
    const existing = await db.query.recognizedDeviceAccounts.findFirst({ where: and(eq(recognizedDeviceAccounts.deviceId, ensured.deviceId), eq(recognizedDeviceAccounts.userId, userId)) });
    if (existing) {
      await db.update(recognizedDeviceAccounts).set({ active: true, removedAt: null, lastUsedAt: now }).where(eq(recognizedDeviceAccounts.id, existing.id));
    } else {
      await db.insert(recognizedDeviceAccounts).values({ deviceId: ensured.deviceId, userId, active: true, createdAt: now, lastUsedAt: now });
    }
    return ensured;
  }

  async removeAccount(credential: string, userId: string) {
    const hash = hashCredential(credential);
    const device = await db.query.recognizedDevices.findFirst({ where: and(eq(recognizedDevices.credentialHash, hash), isNull(recognizedDevices.revokedAt)) });
    if (!device) throw new Error("Recognized device not found.");
    await db.update(recognizedDeviceAccounts).set({ active: false, removedAt: new Date() }).where(and(eq(recognizedDeviceAccounts.deviceId, device.id), eq(recognizedDeviceAccounts.userId, userId)));
    return { success: true };
  }

  async detail(credential: string, userId: string) {
    const result = await this.list(credential);
    const account = result.accounts.find(item => item.userId === userId);
    if (!account) throw new Error("That account is not recognized on this device.");
    return account;
  }
}
export const recognizedDeviceService = new RecognizedDeviceService();
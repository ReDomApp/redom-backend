import { and, eq } from "drizzle-orm";

import { db } from "../../database/db";
import { loginHistory } from "../../database/loginHistory";

export class LoginHistoryService {
  async create(data: {
    userId: string;
    sessionId: string;
    flowId?: string;
    deviceName?: string;
    deviceType?: string;
    loginSource?: string;
    appVersion?: string;
    ipAddress?: string;
    country?: string;
    region?: string;
    city?: string;
  }) {
    const [record] = await db.insert(loginHistory).values({
      userId: data.userId,
      sessionId: data.sessionId,
      flowId: data.flowId ?? null,
      deviceName: data.deviceName ?? "Unknown Device",
      deviceType: data.deviceType ?? "unknown",
      loginSource: data.loginSource ?? "web",
      appVersion: data.appVersion ?? null,
      ipAddress: data.ipAddress ?? "Unknown",
      country: data.country ?? null,
      region: data.region ?? null,
      city: data.city ?? null,
      loginTime: new Date(),
      active: true,
      sessionStatus: "active",
      hiddenByUser: false,
      updatedAt: new Date(),
    }).returning();
    return record;
  }

  async logout(sessionId: string) {
    await db.update(loginHistory).set({ logoutTime: new Date(), active: false, sessionStatus: "ended", updatedAt: new Date() }).where(eq(loginHistory.sessionId, sessionId));
  }

  async hide(userId: string, id: string) {
    const [record] = await db.update(loginHistory).set({ hiddenByUser: true, updatedAt: new Date() }).where(and(eq(loginHistory.id, id), eq(loginHistory.userId, userId))).returning();
    if (!record) throw new Error("Login history record not found.");
    return record;
  }

  async getBySessionId(userId: string, sessionId: string) {
    const [record] = await db.select().from(loginHistory).where(and(eq(loginHistory.sessionId, sessionId), eq(loginHistory.userId, userId))).limit(1);
    return record ?? null;
  }

  async getHistory(userId: string) {
    return db.select().from(loginHistory).where(eq(loginHistory.userId, userId));
  }
}

export const loginHistoryService = new LoginHistoryService();

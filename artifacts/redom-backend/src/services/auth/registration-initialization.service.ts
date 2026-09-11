import { and, eq, gt } from "drizzle-orm";

import { db } from "../../database/db";
import { users } from "../../database/schema";
import { userProfiles } from "../../database/userProfiles";
import { userSettings } from "../../database/userSettings";
import { userPrivacy } from "../../database/userPrivacy";
import { accountSecurity } from "../../database/accountSecurity";
import { registrationChallenges } from "../../database/registration-challenges.schema";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { verifications } from "../../database/verifications.schema";
import { sessionService } from "./session.service";
import { loginHistoryService } from "./login-history.service";
import { checkIP } from "../../lib/ipapi";

export class RegistrationInitializationService {
  async initialize(params: {
    verificationChallengeId: string;
    language?: string;
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
    platform?: string;
    browser?: string;
    loginSource?: string;
    appVersion?: string;
  }) {
    const verification = await db.query.verifications.findFirst({ where: and(eq(verifications.id, params.verificationChallengeId), eq(verifications.status, "verified"), gt(verifications.expiresAt, new Date())) });
    if (!verification || !["EMAIL_VERIFICATION", "PHONE_VERIFICATION"].includes(verification.purpose)) throw new Error("Registration verification is not complete or has expired.");
    if (!verification.sessionId) throw new Error("Registration flow is missing.");
    const challenge = await db.query.registrationChallenges.findFirst({ where: eq(registrationChallenges.id, verification.sessionId) });
    if (!challenge) throw new Error("Registration flow is no longer available.");
    const reservation = await db.query.registrationFlowReservations.findFirst({ where: and(eq(registrationFlowReservations.flowId, challenge.flowId), eq(registrationFlowReservations.status, "active")) });
    if (!reservation) throw new Error("Registration Flow ID is no longer active.");

    let user = verification.userId ? await db.query.users.findFirst({ where: eq(users.id, verification.userId) }) : null;
    if (!user) {
      const email = challenge.email ?? (challenge.contactType === "email" ? challenge.normalizedTarget : null);
      const phone = challenge.phoneNumber ?? (challenge.contactType === "phone" ? challenge.normalizedTarget : null);
      user = await db.query.users.findFirst({ where: email ? eq(users.email, email) : phone ? eq(users.phoneNumber, phone) : eq(users.username, challenge.username!) });
    }
    if (!user || user.accountStatus !== "active") throw new Error("Verified ReDom account could not be loaded.");

    const ip = params.ipAddress ?? verification.requestIp ?? challenge.requestIp ?? "";
    let geo: Awaited<ReturnType<typeof checkIP>> | null = null;
    if (ip) { try { geo = await checkIP(ip); } catch { geo = null; } }
    const country = geo?.location?.country ?? null;
    const region = geo?.location?.state ?? null;
    const city = geo?.location?.city ?? null;

    const [profile] = await db.insert(userProfiles).values({ userId: user.id, displayName: `${user.firstName} ${user.lastName}`.trim(), profileType: "personal", profileVisibility: "public", verified: false, displayJoinDate: true, profileCompletion: 100, followerCount: 0, followingCount: 0, friendCount: 0, postCount: 0, updatedAt: new Date() }).onConflictDoNothing({ target: userProfiles.userId }).returning();
    const actualProfile = profile ?? await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, user.id) });
    if (!actualProfile) throw new Error("Unable to initialize the user profile.");

    const existingSettings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, user.id) });
    if (!existingSettings) await db.insert(userSettings).values({ userId: user.id, language: params.language?.trim() || "system", updatedAt: new Date() });
    else if (params.language?.trim()) await db.update(userSettings).set({ language: params.language.trim(), updatedAt: new Date() }).where(eq(userSettings.userId, user.id));
    const existingPrivacy = await db.query.userPrivacy.findFirst({ where: eq(userPrivacy.userId, user.id) });
    if (!existingPrivacy) await db.insert(userPrivacy).values({ userId: user.id, updatedAt: new Date() });
    const existingSecurity = await db.query.accountSecurity.findFirst({ where: eq(accountSecurity.userId, user.id) });
    if (!existingSecurity) await db.insert(accountSecurity).values({ userId: user.id, updatedAt: new Date() });

    const session = await sessionService.createSession({ userId: user.id, ipAddress: ip || undefined, country: country ?? undefined, region: region ?? undefined, city: city ?? undefined, userAgent: params.userAgent ?? verification.userAgent ?? challenge.userAgent ?? undefined, platform: params.platform, browser: params.browser, deviceName: params.deviceName, deviceId: params.deviceId ?? verification.deviceId ?? challenge.deviceId ?? undefined, deviceType: params.deviceType, loginSource: params.loginSource ?? "registration", appVersion: params.appVersion });
    await loginHistoryService.create({ userId: user.id, sessionId: session.sessionId, flowId: challenge.flowId, deviceName: params.deviceName, deviceType: params.deviceType, loginSource: params.loginSource ?? "registration", appVersion: params.appVersion, ipAddress: ip || "Unknown", country: country ?? undefined, region: region ?? undefined, city: city ?? undefined });

    const now = new Date();
    const setupMemory = { setup: { status: "completed", userId: user.id, sessionId: session.sessionId, flowId: challenge.flowId, profileId: user.profileId, publicId: user.publicId, language: params.language?.trim() || "system", completedAt: now.toISOString() } };
    await db.update(registrationFlowReservations).set({ status: "completed", registeredTables: [], memory: setupMemory as any }).where(eq(registrationFlowReservations.id, reservation.id));
    await db.delete(registrationChallenges).where(eq(registrationChallenges.id, challenge.id));
    await db.delete(verifications).where(eq(verifications.id, verification.id));

    return { success: true, flowId: challenge.flowId, user, session, language: params.language?.trim() || "system", location: { country, region, city, timezone: geo?.location?.timezone ?? null }, profileId: user.profileId, publicId: user.publicId };
  }
}

export const registrationInitializationService = new RegistrationInitializationService();

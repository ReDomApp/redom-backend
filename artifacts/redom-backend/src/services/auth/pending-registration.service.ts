import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../../database/db";
import { users } from "../../database/schema";
import { accountSecurity } from "../../database/accountSecurity";
import { userProfiles } from "../../database/userProfiles";
import { userPrivacy } from "../../database/userPrivacy";
import { userSettings } from "../../database/userSettings";
import { feedPreferences } from "../../database/feedPreferences";
import { activityLog } from "../../database/activityLog";
import { searchHistory } from "../../database/searchHistory";
import { friends } from "../../database/friends";
import { following } from "../../database/following";
import { followers } from "../../database/followers";
import { friendRequests } from "../../database/friendRequests";
import { blockedUsers } from "../../database/blockedUsers";
import { restrictedUsers } from "../../database/restrictedUsers";
import { mutedUsers } from "../../database/mutedUsers";
import { verificationSubscriptions } from "../../database/verificationSubscriptions";
import { registrationChallenges } from "../../database/registration-challenges.schema";
import { registrationFlowReservations } from "../../database/registration-flow-reservations.schema";
import { verifications } from "../../database/verifications.schema";
import { verificationService } from "./verification.service";
import { passwordService } from "./password.service";
import { emailService } from "./email.service";

type PendingUser = typeof users.$inferSelect;
type Channel = "email" | "sms";
function normalizeIdentifier(value: string) { const trimmed = value.trim(); if (trimmed.includes("@")) return { type: "email" as const, value: emailService.validate(trimmed) }; return { type: "phone" as const, value: trimmed }; }
function maskEmail(value: string) { const [local, domain] = value.split("@"); return !local || !domain ? "••••" : local.length <= 2 ? `${local[0] ?? "•"}••@${domain}` : `${local.slice(0, 2)}••••${local.slice(-1)}@${domain}`; }
function maskPhone(value: string) { const compact = value.replace(/\s/g, ""); return compact.length <= 4 ? "••••" : `${compact.slice(0, 3)}••••••${compact.slice(-2)}`; }
function assertPending(user: PendingUser | undefined): PendingUser { if (!user || user.accountStatus !== "pending" || user.emailVerified || user.phoneVerified) throw new Error("This account is not a pending registration."); return user; }

export class PendingRegistrationService {
  private async findPending(identifier: string, password: string) {
    const normalized = normalizeIdentifier(identifier);
    const user = normalized.type === "email" ? await db.query.users.findFirst({ where: eq(users.email, normalized.value) }) : await db.query.users.findFirst({ where: eq(users.phoneNumber, normalized.value) });
    const pending = assertPending(user);
    if (!await passwordService.verify(password, pending.passwordHash)) throw new Error("Invalid credentials.");
    return pending;
  }
  async options(identifier: string, password: string) {
    const user = await this.findPending(identifier, password);
    const methods: Array<{ channel: Channel; target: string; maskedTarget: string }> = [];
    if (user.email) methods.push({ channel: "email", target: user.email, maskedTarget: maskEmail(user.email) });
    if (user.phoneNumber) methods.push({ channel: "sms", target: user.phoneNumber, maskedTarget: maskPhone(user.phoneNumber) });
    if (!methods.length) throw new Error("No pending verification contact is available for this registration.");
    return { success: true, firstName: user.firstName, methods };
  }
  async sendCode(params: { identifier: string; password: string; channel: Channel; deviceId?: string; requestIp?: string; userAgent?: string }) {
    const user = await this.findPending(params.identifier, params.password);
    const target = params.channel === "email" ? user.email : user.phoneNumber;
    if (!target) throw new Error(`No ${params.channel === "email" ? "email address" : "phone number"} is available for this pending registration.`);
    const verification = await verificationService.createVerification({ userId: user.id, purpose: "PENDING_REGISTRATION_INVALIDATION", target, channel: params.channel, requestedLength: 8, firstName: user.firstName, requestIp: params.requestIp, userAgent: params.userAgent, deviceId: params.deviceId, sessionId: user.id });
    return { success: true, challengeId: verification.challengeId, channel: params.channel, target, maskedTarget: params.channel === "email" ? maskEmail(target) : maskPhone(target), codeLength: 8, expiresAt: verification.expiresAt.toISOString() };
  }
  async verifyAndInvalidate(params: { challengeId: string; code: string; deviceId?: string; requestIp?: string; userAgent?: string }) {
    const challenge = await db.query.verifications.findFirst({ where: eq(verifications.id, params.challengeId) });
    if (!challenge || challenge.purpose !== "PENDING_REGISTRATION_INVALIDATION") throw new Error("Pending registration verification challenge not found.");
    if (challenge.deviceId && params.deviceId && challenge.deviceId !== params.deviceId) throw new Error("This verification code belongs to another device.");
    if (!challenge.userId) throw new Error("Pending registration is not associated with an account.");
    const user = assertPending(await db.query.users.findFirst({ where: eq(users.id, challenge.userId) }));
    await verificationService.verifyVerification({ challengeId: params.challengeId, code: params.code, purpose: "PENDING_REGISTRATION_INVALIDATION" });

    const email = user.email;
    const phone = user.phoneNumber;
    const targetConditions = [email ? eq(registrationChallenges.email, email) : undefined, phone ? eq(registrationChallenges.phoneNumber, phone) : undefined].filter(Boolean) as any[];
    const oldFlowRows = targetConditions.length ? await db.query.registrationChallenges.findMany({ where: or(...targetConditions) }) : [];
    const flowIds = [...new Set(oldFlowRows.map((row) => row.flowId).filter(Boolean))];
    const invalidatedAt = new Date();

    await db.transaction(async (tx) => {
      await tx.delete(verificationSubscriptions).where(eq(verificationSubscriptions.userId, user.id));
      await tx.delete(accountSecurity).where(eq(accountSecurity.userId, user.id));
      await tx.delete(feedPreferences).where(eq(feedPreferences.userId, user.id));
      await tx.delete(userPrivacy).where(eq(userPrivacy.userId, user.id));
      await tx.delete(userSettings).where(eq(userSettings.userId, user.id));
      await tx.delete(activityLog).where(eq(activityLog.userId, user.id));
      await tx.delete(searchHistory).where(eq(searchHistory.userId, user.id));
      await tx.delete(friends).where(or(eq(friends.userId, user.id), eq(friends.friendUserId, user.id)));
      await tx.delete(following).where(or(eq(following.userId, user.id), eq(following.followingId, user.id)));
      await tx.delete(followers).where(or(eq(followers.userId, user.id), eq(followers.followerId, user.id)));
      await tx.delete(friendRequests).where(or(eq(friendRequests.senderId, user.id), eq(friendRequests.receiverId, user.id)));
      await tx.delete(blockedUsers).where(or(eq(blockedUsers.userId, user.id), eq(blockedUsers.blockedUserId, user.id)));
      await tx.delete(restrictedUsers).where(or(eq(restrictedUsers.userId, user.id), eq(restrictedUsers.restrictedUserId, user.id)));
      await tx.delete(mutedUsers).where(or(eq(mutedUsers.userId, user.id), eq(mutedUsers.mutedUserId, user.id)));
      await tx.delete(userProfiles).where(eq(userProfiles.userId, user.id));
      await tx.delete(verifications).where(eq(verifications.userId, user.id));
      for (const flowId of flowIds) { await tx.delete(registrationChallenges).where(eq(registrationChallenges.flowId, flowId)); await tx.delete(registrationFlowReservations).where(eq(registrationFlowReservations.flowId, flowId)); }
      if (email) await tx.delete(registrationFlowReservations).where(sql`${registrationFlowReservations.memory}->'email'->>'address' = ${email}`);
      if (phone) await tx.delete(registrationFlowReservations).where(eq(registrationFlowReservations.phoneNumber, phone));
      await tx.delete(users).where(and(eq(users.id, user.id), eq(users.accountStatus, "pending"), eq(users.emailVerified, false), eq(users.phoneVerified, false)));
    });

    let emailNotification: "sent" | "delivery_failed" | "not_applicable" = "not_applicable";
    if (email) {
      try {
        await emailService.sendPendingRegistrationInvalidation({ firstName: user.firstName, lastName: user.lastName, email, phone, flowIds, invalidatedAt, requestIp: params.requestIp, userAgent: params.userAgent || challenge.userAgent || undefined });
        emailNotification = "sent";
      } catch {
        // The account deletion has already completed. Notification failure must not
        // recreate or roll back the deleted pending registration.
        emailNotification = "delivery_failed";
      }
    }

    return { success: true, invalidated: true, emailNotification, message: "Your pending registration has been invalidated and all data associated with this unverified registration has been deleted. You can now create a new ReDom account." };
  }
}
export const pendingRegistrationService = new PendingRegistrationService();
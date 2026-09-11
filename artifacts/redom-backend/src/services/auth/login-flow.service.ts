import { and, eq, or } from "drizzle-orm";
import { db } from "../../database/db";
import { users } from "../../database/schema";
import { sessions } from "../../database/sessions.schema";
import { verifications } from "../../database/verifications.schema";
import { accountSecurity } from "../../database/accountSecurity";
import { totpLoginChallenges } from "../../database/totp-login-challenges.schema";
import { checkIP, type IPAPIResult } from "../../lib/ipapi";
import { passwordService } from "./password.service";
import { fraudService } from "./fraud.service";
import { verificationService } from "./verification.service";
import { sessionService } from "./session.service";
import { loginHistoryService } from "./login-history.service";
import { loginNotificationService } from "./login-notification.service";
import { totpService } from "./totp.service";

export interface LoginRequest { identifier: string; password: string; ipAddress?: string; country?: string; region?: string; city?: string; userAgent?: string; platform?: string; browser?: string; deviceName?: string; deviceId?: string; deviceType?: string; loginSource?: string; appVersion?: string; }
export interface LoginFlowResult { success: true; message: string; requiresVerification: boolean; requiresTwoFactor?: boolean; user?: PublicUser; session?: LoginSession; verification?: LoginVerification; twoFactorVerification?: LoginVerification; }
type PublicUser = { id: string; username: string; publicId: string; profileId: string; firstName: string; lastName: string; email: string | null; phoneNumber: string | null; emailVerified: boolean; phoneVerified: boolean; accountStatus: string; };
type LoginSession = { sessionId: string; accessToken: string; refreshToken: string; expiresAt: Date };
type LoginVerification = { challengeId: string; channel: "sms" | "email" | "whatsapp" | "authenticator"; target: string; maskedTarget: string; codeLength: number; expiresAt: Date };
function maskPhone(phone: string) { const n = phone.trim(); return n.length <= 4 ? n : n.slice(0, 3) + "*".repeat(Math.max(0, n.length - 5)) + n.slice(-2); }
function maskEmail(email: string) { const n = email.trim(); const at = n.indexOf("@"); if (at <= 0) return "***"; const local = n.slice(0, at), domain = n.slice(at); if (local.length === 1) return `*${domain}`; if (local.length === 2) return `${local[0]}*${domain}`; return local[0] + "*".repeat(Math.max(1, local.length - 2)) + local.slice(-1) + domain; }
function publicUser(user: typeof users.$inferSelect): PublicUser { return { id: user.id, username: user.username, publicId: user.publicId, profileId: user.profileId, firstName: user.firstName, lastName: user.lastName, email: user.email, phoneNumber: user.phoneNumber, emailVerified: user.emailVerified, phoneVerified: user.phoneVerified, accountStatus: user.accountStatus }; }

export class LoginFlowService {
  private async inspectIp(ipAddress?: string): Promise<IPAPIResult | null> { if (!ipAddress) return null; try { return await checkIP(ipAddress); } catch { return null; } }
  private async securitySettings(userId: string) { return db.query.accountSecurity.findFirst({ where: eq(accountSecurity.userId, userId) }); }
  private async createTwoFactorChallenge(user: typeof users.$inferSelect, security: typeof accountSecurity.$inferSelect, request: { ipAddress?: string; userAgent?: string; deviceId?: string }): Promise<LoginVerification> {
    if (!security.twoFactorEnabled || security.twoFactorMethod === "off") throw new Error("Two-factor authentication is not enabled.");
    if (security.twoFactorMethod === "authenticator") {
      const challenge = await totpService.createLoginChallenge({ userId: user.id, deviceId: request.deviceId, requestIp: request.ipAddress, userAgent: request.userAgent });
      return { challengeId: challenge.challengeId, channel: "authenticator", target: "Authenticator app", maskedTarget: "Authenticator app", codeLength: 6, expiresAt: challenge.expiresAt };
    }
    let channel: "sms" | "email"; let target: string;
    if (security.twoFactorMethod === "email") { if (!user.email || !user.emailVerified) throw new Error("Two-factor authentication requires a verified email address."); channel = "email"; target = user.email; }
    else if (security.twoFactorMethod === "phone") { if (!user.phoneNumber || !user.phoneVerified) throw new Error("Two-factor authentication requires a verified phone number."); channel = "sms"; target = user.phoneNumber; }
    else throw new Error("Two-factor authentication method is invalid.");
    const challenge = await verificationService.createVerification({ userId: user.id, purpose: "TWO_FACTOR_AUTHENTICATION", target, channel, requestedLength: 6, firstName: user.firstName, requestIp: request.ipAddress, userAgent: request.userAgent, deviceId: request.deviceId });
    return { challengeId: challenge.challengeId, channel, target, maskedTarget: channel === "sms" ? maskPhone(target) : maskEmail(target), codeLength: challenge.codeLength, expiresAt: challenge.expiresAt };
  }
  private async finishLogin(user: typeof users.$inferSelect, data: LoginRequest, ipapi: IPAPIResult | null, deviceId?: string) {
    const session = await sessionService.createSession({ userId: user.id, ipAddress: data.ipAddress, country: ipapi?.location?.country ?? data.country, region: ipapi?.location?.state ?? data.region, city: ipapi?.location?.city ?? data.city, userAgent: data.userAgent, platform: data.platform, browser: data.browser, deviceName: data.deviceName, deviceId, deviceType: data.deviceType, loginSource: data.loginSource ?? "mobile", appVersion: data.appVersion });
    await loginHistoryService.create({ userId: user.id, sessionId: session.sessionId, ipAddress: data.ipAddress, country: ipapi?.location?.country ?? data.country, region: ipapi?.location?.state ?? data.region, city: ipapi?.location?.city ?? data.city, deviceName: data.deviceName, deviceType: data.deviceType, loginSource: data.loginSource ?? "mobile", appVersion: data.appVersion });
    if (user.email) { try { await loginNotificationService.send({ email: user.email, firstName: user.firstName, lastName: user.lastName, ipAddress: data.ipAddress ?? "Unknown", eventAt: new Date(), deviceName: data.deviceName, deviceUserAgent: data.userAgent, ipapi }); } catch { } }
    return session;
  }
  private async completeAfterSecurity(user: typeof users.$inferSelect, data: LoginRequest, deviceId?: string, ipapi?: IPAPIResult | null): Promise<LoginFlowResult> {
    const security = await this.securitySettings(user.id); const network = ipapi ?? await this.inspectIp(data.ipAddress);
    if (security?.twoFactorEnabled) { const twoFactorVerification = await this.createTwoFactorChallenge(user, security, { ipAddress: data.ipAddress, userAgent: data.userAgent, deviceId }); return { success: true, message: security.twoFactorMethod === "authenticator" ? "Authenticator verification is required." : "Two-factor authentication is required.", requiresVerification: false, requiresTwoFactor: true, user: publicUser(user), twoFactorVerification }; }
    const session = await this.finishLogin(user, data, network, deviceId); return { success: true, message: "Login successful.", requiresVerification: false, requiresTwoFactor: false, user: publicUser(user), session };
  }
  async login(data: LoginRequest): Promise<LoginFlowResult> {
    const identifier = data.identifier.trim(); if (!identifier) throw new Error("Login identifier is required.");
    if (/^\d{15}$/.test(identifier)) throw new Error("Please use your mobile number or email address to log in.");
    const user = await db.query.users.findFirst({ where: or(eq(users.email, identifier.toLowerCase()), eq(users.phoneNumber, identifier)) });
    if (!user) throw new Error("Please create an account if you're not a ReDom user.");
    if (!await passwordService.verify(data.password, user.passwordHash)) throw new Error("Invalid credentials.");
    if (user.accountStatus === "suspended") throw new Error("Your account has been suspended.");
    if (user.accountStatus === "banned") throw new Error("Your account has been banned.");
    if (user.accountStatus === "pending") throw new Error("Your account is pending verification. Please verify your email address or phone number before logging in.");
    const ipapi = await this.inspectIp(data.ipAddress); await fraudService.checkLogin({ userId: user.id, ipAddress: data.ipAddress, country: ipapi?.location?.country ?? data.country, userAgent: data.userAgent });
    const deviceId = data.deviceId?.trim(); const knownDevice = Boolean(deviceId) && Boolean(await db.query.sessions.findFirst({ where: and(eq(sessions.userId, user.id), eq(sessions.deviceId, deviceId!)) }));
    if (!knownDevice) {
      const channel = user.phoneNumber && user.phoneVerified ? "sms" : "email"; const target = channel === "sms" ? user.phoneNumber! : user.email!;
      if (channel === "email" && (!user.email || !user.emailVerified)) throw new Error("A verified email address or phone number is required to verify this device.");
      const challenge = await verificationService.createVerification({ userId: user.id, purpose: "LOGIN_DEVICE_VERIFICATION", target, channel, requestedLength: 6, firstName: user.firstName, requestIp: data.ipAddress, userAgent: data.userAgent, deviceId });
      return { success: true, message: "New device detected. Verification is required.", requiresVerification: true, requiresTwoFactor: false, verification: { challengeId: challenge.challengeId, channel, target, maskedTarget: channel === "sms" ? maskPhone(target) : maskEmail(target), codeLength: challenge.codeLength, expiresAt: challenge.expiresAt } };
    }
    return this.completeAfterSecurity(user, data, deviceId, ipapi);
  }
  async verifyNewDevice(params: { challengeId: string; code: string; ipAddress?: string; deviceId: string; deviceName?: string; deviceType?: string; platform?: string; browser?: string; userAgent?: string; country?: string; region?: string; city?: string; loginSource?: string; appVersion?: string; }) {
    const challenge = await db.query.verifications.findFirst({ where: eq(verifications.id, params.challengeId) }); if (!challenge) throw new Error("Verification challenge not found.");
    if (challenge.purpose !== "LOGIN_DEVICE_VERIFICATION") throw new Error("Invalid login verification challenge.");
    if (challenge.deviceId && challenge.deviceId !== params.deviceId) throw new Error("This verification belongs to another device.");
    if (challenge.requestIp && params.ipAddress && challenge.requestIp !== params.ipAddress) throw new Error("The verification request originated from a different network address.");
    const verification = await verificationService.verifyVerification({ challengeId: params.challengeId, code: params.code, purpose: "LOGIN_DEVICE_VERIFICATION" }); if (!verification.userId) throw new Error("Verification is not associated with an account.");
    const user = await db.query.users.findFirst({ where: eq(users.id, verification.userId) }); if (!user) throw new Error("User not found.");
    if (user.accountStatus === "suspended") throw new Error("Your account has been suspended."); if (user.accountStatus === "banned") throw new Error("Your account has been banned.");
    const data: LoginRequest = { identifier: user.email ?? user.phoneNumber ?? "", password: "", ipAddress: params.ipAddress, country: params.country, region: params.region, city: params.city, userAgent: params.userAgent, platform: params.platform, browser: params.browser, deviceName: params.deviceName, deviceId: params.deviceId, deviceType: params.deviceType, loginSource: params.loginSource ?? "mobile", appVersion: params.appVersion };
    const ipapi = await this.inspectIp(params.ipAddress); await fraudService.checkLogin({ userId: user.id, ipAddress: params.ipAddress, country: ipapi?.location?.country ?? params.country, userAgent: params.userAgent });
    return this.completeAfterSecurity(user, data, params.deviceId, ipapi);
  }
  async verifyTwoFactor(params: { challengeId: string; code: string; deviceId: string; deviceName?: string; deviceType?: string; platform?: string; browser?: string; userAgent?: string; ipAddress?: string; country?: string; region?: string; city?: string; loginSource?: string; appVersion?: string; }) {
    const totpChallenge = await db.query.totpLoginChallenges.findFirst({ where: eq(totpLoginChallenges.id, params.challengeId) });
    if (totpChallenge) {
      const user = await db.query.users.findFirst({ where: eq(users.id, totpChallenge.userId) }); if (!user) throw new Error("User not found.");
      await totpService.verifyLoginChallenge({ challengeId: params.challengeId, userId: user.id, code: params.code, deviceId: params.deviceId, requestIp: params.ipAddress });
      const data: LoginRequest = { identifier: user.email ?? user.phoneNumber ?? "", password: "", ipAddress: params.ipAddress, country: params.country, region: params.region, city: params.city, userAgent: params.userAgent, platform: params.platform, browser: params.browser, deviceName: params.deviceName, deviceId: params.deviceId, deviceType: params.deviceType, loginSource: params.loginSource ?? "mobile", appVersion: params.appVersion };
      const ipapi = await this.inspectIp(params.ipAddress); await fraudService.checkLogin({ userId: user.id, ipAddress: params.ipAddress, country: ipapi?.location?.country ?? params.country, userAgent: params.userAgent });
      const session = await this.finishLogin(user, data, ipapi, params.deviceId);
      return { success: true as const, message: "Authenticator verified and login successful.", requiresVerification: false, requiresTwoFactor: false, user: publicUser(user), session };
    }
    const challenge = await db.query.verifications.findFirst({ where: eq(verifications.id, params.challengeId) }); if (!challenge) throw new Error("Two-factor verification challenge not found.");
    if (challenge.purpose !== "TWO_FACTOR_AUTHENTICATION") throw new Error("Invalid two-factor authentication challenge.");
    if (challenge.deviceId && challenge.deviceId !== params.deviceId) throw new Error("This two-factor challenge belongs to another device.");
    const verification = await verificationService.verifyVerification({ challengeId: params.challengeId, code: params.code, purpose: "TWO_FACTOR_AUTHENTICATION" }); if (!verification.userId) throw new Error("Two-factor verification is not associated with an account.");
    const user = await db.query.users.findFirst({ where: eq(users.id, verification.userId) }); if (!user) throw new Error("User not found.");
    const data: LoginRequest = { identifier: user.email ?? user.phoneNumber ?? "", password: "", ipAddress: params.ipAddress, country: params.country, region: params.region, city: params.city, userAgent: params.userAgent, platform: params.platform, browser: params.browser, deviceName: params.deviceName, deviceId: params.deviceId, deviceType: params.deviceType, loginSource: params.loginSource ?? "mobile", appVersion: params.appVersion };
    const ipapi = await this.inspectIp(params.ipAddress); await fraudService.checkLogin({ userId: user.id, ipAddress: params.ipAddress, country: ipapi?.location?.country ?? params.country, userAgent: params.userAgent });
    const session = await this.finishLogin(user, data, ipapi, params.deviceId);
    return { success: true as const, message: "Two-factor authentication verified and login successful.", requiresVerification: false, requiresTwoFactor: false, user: publicUser(user), session };
  }
}
export const loginFlowService = new LoginFlowService();

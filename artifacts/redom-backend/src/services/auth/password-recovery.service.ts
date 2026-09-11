import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../database/db";
import { users } from "../../database/schema";
import { verifications } from "../../database/verifications.schema";
import { resend } from "../../lib/resend";
import { openai } from "../../lib/openai";
import { checkIP } from "../../lib/ipapi";
import { passwordService } from "./password.service";
import { phoneService } from "./phone.service";
import { verificationService } from "./verification.service";
import { sessionService } from "./session.service";

type RecoveryChannel = "email" | "sms" | "whatsapp";
type RequestContext = { ipAddress?: string; userAgent?: string; deviceId?: string; deviceName?: string; deviceType?: string; platform?: string; browser?: string; loginSource?: string; appVersion?: string; language?: string };

function maskEmail(email: string): string { const [local, domain] = email.split("@"); if (!local || !domain) return "••••"; return `${local.slice(0, 1)}${"•".repeat(Math.max(4, Math.min(8, local.length + 1)))}@${domain}`; }
function maskPhone(phone: string): string { const normalized = phone.replace(/\s+/g, ""); if (normalized.length <= 7) return `${normalized.slice(0, 3)}••••`; return `${normalized.slice(0, Math.min(4, normalized.length - 6))}${"•".repeat(6)}${normalized.slice(-2)}`; }
function normalizeLookup(value: string): { type: "email" | "phone"; value: string } { const trimmed = value.trim(); if (trimmed.includes("@")) return { type: "email", value: trimmed.toLowerCase() }; return { type: "phone", value: phoneService.validate(trimmed) }; }
function accountPayload(user: typeof users.$inferSelect, searched: { type: "email" | "phone"; value: string }) { const searchedEmail = searched.type === "email" && user.email?.toLowerCase() === searched.value; const searchedPhone = searched.type === "phone" && user.phoneNumber === searched.value; const emailDisplay = user.email ? (searchedEmail ? user.email : maskEmail(user.email)) : null; const phoneDisplay = user.phoneNumber ? (searchedPhone ? user.phoneNumber : maskPhone(user.phoneNumber)) : null; return { firstName: user.firstName, email: emailDisplay, phoneNumber: phoneDisplay, methods: [...(user.email ? [{ channel: "email" as const, maskedTarget: emailDisplay! }] : []), ...(user.phoneNumber ? [{ channel: "sms" as const, maskedTarget: phoneDisplay! }] : []), ...(user.phoneNumber ? [{ channel: "whatsapp" as const, maskedTarget: phoneDisplay! }] : [])] }; }

export class PasswordRecoveryService {
  async findAccount(identifier: string) {
    const value = identifier.trim(); if (!value) throw new Error("Please enter your email address or phone number.");
    let searched: { type: "email" | "phone"; value: string }; try { searched = normalizeLookup(value); } catch { return { success: true, accountFound: false, reason: "invalid_phone", message: "Please enter a valid phone number." }; }
    if (searched.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(searched.value)) return { success: true, accountFound: false, reason: "invalid_email", message: "Please enter a valid email address." };
    const user = searched.type === "email" ? await db.query.users.findFirst({ where: eq(users.email, searched.value) }) : await db.query.users.findFirst({ where: eq(users.phoneNumber, searched.value) });
    if (!user) return { success: true, accountFound: false, reason: "not_found", message: "No ReDom account was found with that information." };
    if (user.accountStatus === "suspended" || user.accountStatus === "banned") return { success: true, accountFound: false, reason: "unavailable", message: "This account is not available for password recovery." };
    return { success: true, accountFound: true, account: accountPayload(user, searched) };
  }

  private async getUserByIdentifier(identifier: string) { const value = identifier.trim(); if (!value) throw new Error("Account identifier is required."); if (value.includes("@")) { const email = value.toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address."); return db.query.users.findFirst({ where: eq(users.email, email) }); } return db.query.users.findFirst({ where: eq(users.phoneNumber, phoneService.validate(value)) }); }

  async sendCode(params: { identifier: string; channel: RecoveryChannel } & RequestContext) {
    const user = await this.getUserByIdentifier(params.identifier); if (!user) throw new Error("No ReDom account was found with that information."); if (user.accountStatus === "suspended" || user.accountStatus === "banned") throw new Error("This account is not available for password recovery.");
    let target: string; if (params.channel === "email") { if (!user.email) throw new Error("No email address is associated with this account."); target = user.email; } else { if (!user.phoneNumber) throw new Error("No phone number is associated with this account."); target = user.phoneNumber; if (!phoneService.supportsChannel(params.channel)) throw new Error("WhatsApp password recovery is not configured for ReDom."); }
    const verification = await verificationService.createVerification({ userId: user.id, purpose: "PASSWORD_RESET", target, channel: params.channel, requestedLength: 5, firstName: user.firstName, requestIp: params.ipAddress, userAgent: params.userAgent, deviceId: params.deviceId });
    return { success: true, challengeId: verification.challengeId, channel: params.channel, maskedTarget: params.channel === "email" ? maskEmail(target) : maskPhone(target), codeLength: 5, expiresAt: verification.expiresAt.toISOString() };
  }

  async verifyCode(params: { challengeId: string; code: string } & RequestContext) {
    const verification = await db.query.verifications.findFirst({ where: eq(verifications.id, params.challengeId) });
    if (!verification || verification.purpose !== "PASSWORD_RESET") throw new Error("Password reset verification was not found.");
    const result = await verificationService.verifyVerification({ challengeId: params.challengeId, code: params.code, purpose: "PASSWORD_RESET" });
    if (!result.userId) throw new Error("Password reset is not associated with an account.");
    const verifiedAt = new Date();
    const resetToken = randomUUID();
    await db.update(verifications).set({ sessionId: resetToken, updatedAt: verifiedAt }).where(eq(verifications.id, params.challengeId));

    let security: { country?: string | null; state?: string | null; city?: string | null; timezone?: string | null; latitude?: number | null; longitude?: number | null } | null = null;
    if (params.ipAddress) { try { const ip = await checkIP(params.ipAddress); security = ip.location ?? null; } catch { security = null; } }
    const user = await db.query.users.findFirst({ where: eq(users.id, result.userId) });
    let notificationStatus: "sent" | "openai_unavailable" | "delivery_failed" | "not_configured" = "not_configured";
    if (user?.email) { try { await this.sendSecurityNotification({ user, context: params, security, eventAt: verifiedAt, stage: "verification" }); notificationStatus = "sent"; } catch (error) { notificationStatus = error instanceof Error && error.message === "OpenAI not responding." ? "openai_unavailable" : "delivery_failed"; } }
    return { success: true, resetToken, notificationStatus, message: notificationStatus === "openai_unavailable" ? "OpenAI not responding. Your verification was successful; you can continue." : "Verification successful. Your security details were collected and your password can now be changed." };
  }

  async changePassword(params: { resetToken: string; password: string } & RequestContext) {
    passwordService.validate(params.password); const now = new Date();
    const verification = await db.query.verifications.findFirst({ where: and(eq(verifications.sessionId, params.resetToken), eq(verifications.purpose, "PASSWORD_RESET"), eq(verifications.status, "consumed"), gt(verifications.verifiedAt, new Date(now.getTime() - 10 * 60 * 1000))) });
    if (!verification?.userId || !verification.verifiedAt) throw new Error("This password reset session has expired. Please request a new code.");
    const user = await db.query.users.findFirst({ where: eq(users.id, verification.userId) }); if (!user) throw new Error("Account not found."); if (user.accountStatus === "suspended" || user.accountStatus === "banned") throw new Error("This account is not available.");
    const location = params.ipAddress ? await checkIP(params.ipAddress).catch(() => null) : null;
    const passwordHash = await passwordService.hash(params.password);
    await db.transaction(async tx => { await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id)); await tx.update(verifications).set({ sessionId: null, updatedAt: now }).where(eq(verifications.id, verification.id)); });
    await sessionService.revokeAllSessions(user.id);
    const session = await sessionService.createSession({ userId: user.id, ipAddress: params.ipAddress, userAgent: params.userAgent, deviceId: params.deviceId, deviceName: params.deviceName, deviceType: params.deviceType, platform: params.platform, browser: params.browser, loginSource: "password-recovery", appVersion: params.appVersion });
    let notificationStatus: "sent" | "openai_unavailable" | "delivery_failed" | "not_configured" = "not_configured";
    if (user.email) { try { await this.sendSecurityNotification({ user, sessionId: session.sessionId, context: params, security: location?.location ?? null, eventAt: now, stage: "changed" }); notificationStatus = "sent"; } catch (error) { notificationStatus = error instanceof Error && error.message === "OpenAI not responding." ? "openai_unavailable" : "delivery_failed"; } }
    return { success: true, notificationStatus, message: notificationStatus === "openai_unavailable" ? "Password changed successfully. OpenAI not responding; continuing to your account." : "Your password has been changed successfully.", user: { id: user.id, username: user.username, publicId: user.publicId, profileId: user.profileId, firstName: user.firstName, lastName: user.lastName, email: user.email, phoneNumber: user.phoneNumber, emailVerified: user.emailVerified, phoneVerified: user.phoneVerified, accountStatus: user.accountStatus }, session };
  }

  private async sendSecurityNotification(params: { user: typeof users.$inferSelect; context: RequestContext; security: { country?: string | null; state?: string | null; city?: string | null; timezone?: string | null; latitude?: number | null; longitude?: number | null } | null; eventAt: Date; stage: "verification" | "changed"; sessionId?: string }) {
    const device = params.context.deviceName || params.context.deviceType || "Unknown device";
    const ip = params.context.ipAddress || "Unavailable";
    const location = [params.security?.city, params.security?.state, params.security?.country].filter(Boolean).join(", ") || "Location unavailable";
    const timezone = params.security?.timezone || "Timezone unavailable";
    const isChanged = params.stage === "changed";

    if (!isChanged) {
      const response = await openai.responses.create({ model: "gpt-5.6-luna", input: `Write a concise ReDom security email in ${params.context.language?.trim() || "English"}. Return JSON only as {"subject":"...","body":"..."}. Do not invent facts. State that the password-reset verification code was successfully verified and the password has not yet been changed. Preserve these exact facts: location=${location}; timezone=${timezone}; ip=${ip}; device=${device}.` }).catch(() => { throw new Error("OpenAI not responding."); });
      let subject: string; let body: string;
      try { const parsed = JSON.parse(response.output_text) as { subject?: unknown; body?: unknown }; if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") throw new Error(); subject = parsed.subject; body = parsed.body; } catch { throw new Error("OpenAI not responding."); }
      const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><h2>${this.escapeHtml(subject)}</h2><p>${this.escapeHtml(body).replace(/\n/g, "<br>")}</p><p style="margin-top:24px">ReDom Platforms, Inc.</p></div>`;
      await resend.emails.send({ from: "ReDom <noreply@wnncompany.com>", to: params.user.email!, replyTo: "support@redomapp.com", subject, html });
      return;
    }

    const subject = "Your ReDom password was changed successfully";
    const body = `Dear ${params.user.firstName} ${params.user.lastName},\n\nYou have changed your password successfully on ReDom (${this.formatDateTime(params.security, params.eventAt)}).\n\nHere are some extra details about this recent login:\n\nLocation: ${location} (shown as approximate)\nDevice: ${device}\nIP: ${ip}\nTime: ${this.formatTime(params.security, params.eventAt)}\nDate: ${this.formatDate(params.security, params.eventAt)}\n\nIf this was you, please you can disregard this message.\n\nIf that wasn't you, we highly advise that you change your password as soon as possible and also notify us by replying to this mail.\n\nPlease if you did not initiate this action, contact our customer support on support@redomapp.com. or send us a WhatsApp message at +234 70 1486 5940.\nKind Regards,\nReDom Platforms, Inc.`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.55"><p>${this.escapeHtml(body).replace(/\n/g, "<br>")}</p></div>`;
    await resend.emails.send({ from: "ReDom <noreply@wnncompany.com>", to: params.user.email!, replyTo: "support@redomapp.com", subject, html });
  }

  private getDateParts(security: { timezone?: string | null } | null, eventAt: Date) {
    const timezone = security?.timezone || "UTC";
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(eventAt);
      return Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    } catch { return Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(eventAt).filter(part => part.type !== "literal").map(part => [part.type, part.value])); }
  }
  private formatDateTime(security: { timezone?: string | null } | null, eventAt: Date) { const p = this.getDateParts(security, eventAt); return `${p.weekday}, ${p.month} ${p.day}, ${p.year} ${p.hour}:${p.minute} ${p.dayPeriod}`; }
  private formatTime(security: { timezone?: string | null } | null, eventAt: Date) { const p = this.getDateParts(security, eventAt); return `${p.hour}:${p.minute} ${p.dayPeriod}`; }
  private formatDate(security: { timezone?: string | null } | null, eventAt: Date) { const p = this.getDateParts(security, eventAt); return `${p.month} ${p.day}, ${p.year}`; }

  private escapeHtml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;"); }
}
export const passwordRecoveryService = new PasswordRecoveryService();

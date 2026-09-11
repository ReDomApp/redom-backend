import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../database/db";
import { users } from "../../database/schema";
import { verifications } from "../../database/verifications.schema";
import { resend } from "../../lib/resend";
import { openai } from "../../lib/openai";
import { passwordService } from "./password.service";
import { phoneService } from "./phone.service";
import { verificationService } from "./verification.service";
import { sessionService } from "./session.service";

type RecoveryChannel = "email" | "sms" | "whatsapp";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  deviceName?: string;
  deviceType?: string;
  platform?: string;
  browser?: string;
  loginSource?: string;
  appVersion?: string;
  language?: string;
};

function accountPayload(user: typeof users.$inferSelect) {
  return {
    firstName: user.firstName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    methods: [
      ...(user.email ? [{ channel: "email" as const, maskedTarget: user.email }] : []),
      ...(user.phoneNumber ? [{ channel: "sms" as const, maskedTarget: user.phoneNumber }] : []),
      ...(user.phoneNumber ? [{ channel: "whatsapp" as const, maskedTarget: user.phoneNumber }] : []),
    ],
  };
}

export class PasswordRecoveryService {
  async findAccount(identifier: string) {
    const value = identifier.trim();
    if (!value) throw new Error("Please enter your email address or phone number.");

    let user: typeof users.$inferSelect | undefined;
    if (value.includes("@")) {
      const email = value.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: true, accountFound: false, reason: "invalid_email", message: "Please enter a valid email address." };
      }
      user = await db.query.users.findFirst({ where: eq(users.email, email) });
    } else {
      const phone = phoneService.validate(value);
      user = await db.query.users.findFirst({ where: eq(users.phoneNumber, phone) });
    }

    if (!user) {
      return { success: true, accountFound: false, reason: "not_found", message: "No ReDom account was found with that information." };
    }

    if (user.accountStatus === "suspended" || user.accountStatus === "banned") {
      return { success: true, accountFound: false, reason: "unavailable", message: "This account is not available for password recovery." };
    }

    return { success: true, accountFound: true, account: accountPayload(user) };
  }

  private async getUserByIdentifier(identifier: string) {
    const value = identifier.trim();
    if (!value) throw new Error("Account identifier is required.");
    if (value.includes("@")) {
      const email = value.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address.");
      return db.query.users.findFirst({ where: eq(users.email, email) });
    }
    return db.query.users.findFirst({ where: eq(users.phoneNumber, phoneService.validate(value)) });
  }

  async sendCode(params: { identifier: string; channel: RecoveryChannel } & RequestContext) {
    const user = await this.getUserByIdentifier(params.identifier);
    if (!user) throw new Error("No ReDom account was found with that information.");
    if (user.accountStatus === "suspended" || user.accountStatus === "banned") throw new Error("This account is not available for password recovery.");

    let target: string;
    if (params.channel === "email") {
      if (!user.email) throw new Error("No email address is associated with this account.");
      target = user.email;
    } else {
      if (!user.phoneNumber) throw new Error("No phone number is associated with this account.");
      target = user.phoneNumber;
      if (!phoneService.supportsChannel(params.channel)) throw new Error(`WhatsApp password recovery is not configured for ReDom.`);
    }

    const verification = await verificationService.createVerification({
      userId: user.id,
      purpose: "PASSWORD_RESET",
      target,
      channel: params.channel,
      requestedLength: 5,
      firstName: user.firstName,
      requestIp: params.ipAddress,
      userAgent: params.userAgent,
      deviceId: params.deviceId,
    });

    return {
      success: true,
      challengeId: verification.challengeId,
      channel: params.channel,
      maskedTarget: target,
      codeLength: 5,
      expiresAt: verification.expiresAt.toISOString(),
    };
  }

  async verifyCode(params: { challengeId: string; code: string } & RequestContext) {
    const verification = await db.query.verifications.findFirst({ where: eq(verifications.id, params.challengeId) });
    if (!verification || verification.purpose !== "PASSWORD_RESET") throw new Error("Password reset verification was not found.");

    const result = await verificationService.verifyVerification({ challengeId: params.challengeId, code: params.code, purpose: "PASSWORD_RESET" });
    if (!result.userId) throw new Error("Password reset is not associated with an account.");

    const resetToken = randomUUID();
    await db.update(verifications).set({ sessionId: resetToken, updatedAt: new Date() }).where(eq(verifications.id, params.challengeId));

    return { success: true, resetToken, message: "Verification successful. You can now change your password." };
  }

  async changePassword(params: { resetToken: string; password: string } & RequestContext) {
    passwordService.validate(params.password);
    const now = new Date();
    const verification = await db.query.verifications.findFirst({
      where: and(
        eq(verifications.sessionId, params.resetToken),
        eq(verifications.purpose, "PASSWORD_RESET"),
        eq(verifications.status, "consumed"),
        gt(verifications.verifiedAt, new Date(now.getTime() - 10 * 60 * 1000)),
      ),
    });
    if (!verification?.userId || !verification.verifiedAt) throw new Error("This password reset session has expired. Please request a new code.");

    const user = await db.query.users.findFirst({ where: eq(users.id, verification.userId) });
    if (!user) throw new Error("Account not found.");
    if (user.accountStatus === "suspended" || user.accountStatus === "banned") throw new Error("This account is not available.");

    const passwordHash = await passwordService.hash(params.password);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id));
      await tx.update(verifications).set({ sessionId: null, updatedAt: now }).where(eq(verifications.id, verification.id));
    });

    await sessionService.revokeAllSessions(user.id);
    const session = await sessionService.createSession({
      userId: user.id,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      deviceId: params.deviceId,
      deviceName: params.deviceName,
      deviceType: params.deviceType,
      platform: params.platform,
      browser: params.browser,
      loginSource: "password-recovery",
      appVersion: params.appVersion,
    });

    if (user.email) {
      try {
        await this.sendNewLoginEmail({ user, sessionId: session.sessionId, context: params });
      } catch {
        // Password recovery has already succeeded; notification delivery must not make it appear to fail.
      }
    }

    return {
      success: true,
      message: "Your password has been changed successfully.",
      user: {
        id: user.id,
        username: user.username,
        publicId: user.publicId,
        profileId: user.profileId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        accountStatus: user.accountStatus,
      },
      session,
    };
  }

  private async sendNewLoginEmail(params: { user: typeof users.$inferSelect; sessionId: string; context: RequestContext }) {
    const device = params.context.deviceName || params.context.deviceType || "Unknown device";
    const ip = params.context.ipAddress || "Unavailable";
    const language = params.context.language?.trim() || "English";
    let subject = "New ReDom login detected";
    let body = `A new login was detected after your ReDom password was changed.\n\nDevice: ${device}\nIP address: ${ip}\nSession ID: ${params.sessionId}\n\nIf this was not you, secure your account immediately.`;

    try {
      const response = await openai.responses.create({
        model: "gpt-5.6-luna",
        input: `Write a concise ReDom security notification email in ${language}. The user's password was just changed through account recovery and ReDom created a new login session on the current device. Return JSON only: {"subject":"...","body":"..."}. Do not invent any facts. Preserve exactly these facts: device=${device}; ip=${ip}; sessionId=${params.sessionId}.`,
      });
      const parsed = JSON.parse(response.output_text) as { subject?: unknown; body?: unknown };
      if (typeof parsed.subject === "string" && typeof parsed.body === "string") {
        subject = parsed.subject;
        body = parsed.body;
      }
    } catch {
      // Security notification still sends using the deterministic fallback.
    }

    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><h2>${this.escapeHtml(subject)}</h2><p>${this.escapeHtml(body).replace(/\n/g, "<br>")}</p><p style="margin-top:24px">ReDom Platforms, Inc.</p></div>`;
    await resend.emails.send({ from: "ReDom <noreply@wnncompany.com>", to: params.user.email!, subject, html });
  }

  private escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  }
}

export const passwordRecoveryService = new PasswordRecoveryService();

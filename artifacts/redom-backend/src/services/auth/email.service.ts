import { resend } from "../../lib/resend";
import { checkIP } from "../../lib/ipapi";

export class EmailService {
  private readonly sender = "ReDom <onboarding@resend.dev>";

  normalize(email: string): string { return email.trim().toLowerCase(); }

  validate(email: string): string {
    const normalized = this.normalize(email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) throw new Error("Invalid email address.");
    return normalized;
  }

  async sendOtp(params: { email: string; firstName?: string; code: string; purpose: string; expiresAt: Date }): Promise<{ provider: string; providerReference?: string }> {
    const email = this.validate(params.email);
    const subject = this.getSubject(params.purpose);
    const expiresAtText = params.expiresAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    const result = await resend.emails.send({
      from: this.sender,
      to: email,
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>${params.firstName ? `Hello ${this.escapeHtml(params.firstName)},` : "Hello,"}</h2><p>Your ReDom verification code is:</p><div style="font-size:40px;font-weight:bold;letter-spacing:10px;text-align:center;margin:30px 0">${this.escapeHtml(params.code)}</div><p>This code expires at <strong>${this.escapeHtml(expiresAtText)}</strong>.</p><p>Never share this code with anyone.</p><p>If you did not request this, you can safely ignore this message.</p></div>`,
    });
    if (result.error) throw new Error(`Resend failed to deliver the verification email: ${result.error.message}`);
    return { provider: "resend", providerReference: result.data?.id };
  }

  async sendRegistrationConfirmation(params: { firstName: string; lastName: string; email: string; registeredAt: Date; requestIp: string; userAgent: string }): Promise<{ provider: string; providerReference?: string }> {
    const firstName = params.firstName.trim();
    const lastName = params.lastName.trim();
    const email = this.validate(params.email);
    const requestIp = params.requestIp.trim();
    const userAgent = params.userAgent.trim();
    if (!firstName || !lastName) throw new Error("Registration confirmation requires the verified user's full name.");
    if (!requestIp) throw new Error("Registration confirmation requires the user's registration IP address.");
    if (!userAgent) throw new Error("Registration confirmation requires the user's registration device information.");

    const ip = await checkIP(requestIp);
    const location = ip.location;
    if (!location?.city || !location.country || !location.latitude || !location.longitude || !location.timezone) {
      throw new Error("Registration confirmation could not verify the user's registration location and timezone.");
    }

    const device = this.parseDevice(userAgent);
    const timezone = location.timezone;
    const timeParts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "short", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZoneName: "short" }).formatToParts(params.registeredAt);
    const part = (type: Intl.DateTimeFormatPartTypes) => timeParts.find((item) => item.type === type)?.value ?? "";
    const registeredText = `${part("weekday")}, ${part("month")} ${part("day")}, ${part("year")} ${part("hour")}:${part("minute")}:${part("second")} ${part("dayPeriod")} (${part("timeZoneName")})`;
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Registration confirmation could not verify the user's map coordinates.");

    const delta = 0.04;
    const bbox = `${longitude - delta},${latitude - delta},${longitude + delta},${latitude + delta}`;
    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`;
    const mapLink = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(latitude))}&mlon=${encodeURIComponent(String(longitude))}#map=12/${encodeURIComponent(String(latitude))}/${encodeURIComponent(String(longitude))}`;
    const profileSvg = this.buildProfilePlaceholder(firstName, lastName);
    const subject = "Your ReDom registration was successful";

    const result = await resend.emails.send({
      from: this.sender,
      to: email,
      subject,
      html: `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033"><div style="max-width:680px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.06)"><div style="text-align:center;margin-bottom:24px">${profileSvg}<h2 style="margin:18px 0 6px">Dear ${this.escapeHtml(firstName)} ${this.escapeHtml(lastName)},</h2><p style="margin:0;color:#667085">Your ReDom registration has been successfully verified.</p></div><p>You have registered successfully to ReDom on <strong>${this.escapeHtml(registeredText)}</strong>.</p><p>Here are some extra details about this recent registration:</p><div style="border:1px solid #e4e7ec;border-radius:12px;overflow:hidden;margin:20px 0"><iframe title="Approximate registration location" src="${mapUrl}" width="100%" height="280" frameborder="0" style="border:0;display:block"></iframe><div style="padding:14px 16px;background:#fafbfc"><strong>Location:</strong> ${this.escapeHtml(location.city)}, ${this.escapeHtml(location.country)} (shown as approximate)<br><strong>Device:</strong> ${this.escapeHtml(device)}<br><strong>IP:</strong> ${this.escapeHtml(requestIp)}<br><strong>Time:</strong> ${this.escapeHtml(registeredText)}<br><strong>Timezone:</strong> ${this.escapeHtml(timezone)}</div></div><p style="font-size:13px"><a href="${mapLink}" style="color:#1877f2">View the approximate location on the map</a></p><p>If this was you, you can disregard this message.</p><p>If that wasn't you, we strongly advise that you change your password as soon as possible and notify us by replying to this email.</p><p>If you experience any problems kindly contact us at <a href="mailto:support@redomapp.com">support@redomapp.com</a> or send us a WhatsApp message at +234 701 486 5940.</p><p style="margin-top:28px">ReDom Platforms, Inc.</p></div></div></body></html>`,
    });
    if (result.error) throw new Error(`Resend failed to deliver the registration confirmation email: ${result.error.message}`);
    return { provider: "resend", providerReference: result.data?.id };
  }

  private parseDevice(userAgent: string): string {
    const android = userAgent.match(/Android\s+([^;\)]+)/i)?.[1]?.trim();
    const manufacturer = userAgent.match(/\b(Infinix|TECNO|Techno|Samsung|Xiaomi|Redmi|OPPO|vivo|OnePlus|Google|Huawei|Motorola|Nokia|Sony|Apple)\b/i)?.[1];
    const model = userAgent.match(/Android[^;\)]*;\s*(?:[a-z]{2}-[A-Z]{2};\s*)?(?:wv;\s*)?([^;\)]+?)(?:\s+Build\/[^;\)]*)?[;\)]/i)?.[1]?.trim();
    if (manufacturer && model && !model.toLowerCase().includes(manufacturer.toLowerCase())) return `${manufacturer} ${model}${android ? ` (Android ${android})` : ""}`;
    if (model) return `${model}${android ? ` (Android ${android})` : ""}`;
    return userAgent;
  }

  private buildProfilePlaceholder(firstName: string, lastName: string): string {
    const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    const safe = this.escapeHtml(initials);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${safe}"><circle cx="64" cy="64" r="64" fill="#e9eef7"/><circle cx="64" cy="48" r="22" fill="#8a94a6"/><path d="M25 111c4-25 19-38 39-38s35 13 39 38" fill="#8a94a6"/><text x="64" y="119" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#172033">${safe}</text></svg>`;
  }

  private getSubject(purpose: string): string {
    switch (purpose) {
      case "EMAIL_VERIFICATION": return "Verify your ReDom account";
      case "PASSWORD_RESET": return "Reset your ReDom password";
      case "CHANGE_EMAIL": return "Confirm your ReDom email change";
      case "CHANGE_PASSWORD": return "Confirm your ReDom password change";
      default: return "Your ReDom verification code";
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  }
}

export const emailService = new EmailService();
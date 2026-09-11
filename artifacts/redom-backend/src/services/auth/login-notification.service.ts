import { resend } from "../../lib/resend";
import type { IPAPIResult } from "../../lib/ipapi";

export class LoginNotificationService {
  private readonly sender = "ReDom <noreply@wnncompany.com>";

  async send(params: {
    email: string;
    firstName: string;
    lastName: string;
    ipAddress: string;
    eventAt: Date;
    deviceName?: string;
    deviceUserAgent?: string;
    ipapi?: IPAPIResult | null;
  }) {
    const timezone = params.ipapi?.location?.timezone ?? "UTC";
    const location = [params.ipapi?.location?.city, params.ipapi?.location?.state, params.ipapi?.location?.country]
      .filter(Boolean)
      .join(", ") || "Location unavailable";
    // Prefer the device name supplied by the ReDom client. okhttp/OkHttp is the
    // transport User-Agent and should not be presented to the user as the device.
    const device = params.deviceName?.trim() || this.parseDevice(params.deviceUserAgent ?? "Unknown device");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).formatToParts(params.eventAt);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    const dateText = `${part("month")} ${part("day")}, ${part("year")}`;
    const timeText = `${part("hour")}:${part("minute")} ${part("dayPeriod")} (${part("timeZoneName")})`;
    const whenText = `${part("weekday")}, ${dateText} ${timeText}`;

    const result = await resend.emails.send({
      from: this.sender,
      to: params.email,
      subject: "New login to your ReDom account",
      html: `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033"><div style="max-width:680px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.06)"><h2 style="margin:0 0 12px">Dear ${this.escape(params.firstName)} ${this.escape(params.lastName)},</h2><p>You have successfully logged in to ReDom on <strong>${this.escape(whenText)}</strong>.</p><p>Here are some extra details about this recent login:</p><div style="border:1px solid #e4e7ec;border-radius:12px;padding:16px;line-height:1.8"><strong>Location:</strong> ${this.escape(location)} (shown as approximate)<br><strong>Device:</strong> ${this.escape(device)}<br><strong>IP:</strong> ${this.escape(params.ipAddress)}<br><strong>Time:</strong> ${this.escape(timeText)}<br><strong>Date:</strong> ${this.escape(dateText)}<br><strong>Timezone:</strong> ${this.escape(timezone)}</div><p style="margin-top:22px">If this was you, please you can disregard this message.</p><p>If that wasn't you, we highly advise that you change your password as soon as possible and also notify us by replying to this mail.</p><p>Please if you did not initiate this action, contact our customer support on <a href="mailto:support@redomapp.com">support@redomapp.com</a> or send us a WhatsApp message at +234 70 1486 5940.</p><p style="margin-top:28px">Kind Regards,<br>ReDom Platforms, Inc.</p></div></div></body></html>`,
      replyTo: "support@redomapp.com",
    });
    if (result.error) throw new Error(`Resend failed to deliver the login notification: ${result.error.message}`);
    return { provider: "resend", providerReference: result.data?.id };
  }

  private parseDevice(userAgent: string): string {
    if (/^okhttp\//i.test(userAgent.trim())) return "Android app";
    const android = userAgent.match(/Android\s+([^;\)]+)/i)?.[1]?.trim();
    const manufacturer = userAgent.match(/\b(Infinix|TECNO|Techno|Samsung|Xiaomi|Redmi|OPPO|vivo|OnePlus|Google|Huawei|Motorola|Nokia|Sony|Apple)\b/i)?.[1];
    const model = userAgent.match(/Android[^;\)]*;\s*(?:[a-z]{2}-[A-Z]{2};\s*)?(?:wv;\s*)?([^;\)]+?)(?:\s+Build\/[^;\)]*)?[;\)]/i)?.[1]?.trim();
    if (manufacturer && model && !model.toLowerCase().includes(manufacturer.toLowerCase())) return `${manufacturer} ${model}${android ? ` (Android ${android})` : ""}`;
    if (model) return `${model}${android ? ` (Android ${android})` : ""}`;
    return userAgent;
  }

  private escape(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  }
}

export const loginNotificationService = new LoginNotificationService();

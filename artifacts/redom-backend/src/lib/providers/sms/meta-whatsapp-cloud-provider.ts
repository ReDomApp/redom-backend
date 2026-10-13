import { env } from "../../../config/env";
import type { SmsDeliveryRequest, SmsDeliveryResult, SmsProvider } from "./sms-provider";

type MetaSendResponse = { messages?: Array<{ id?: string }>; error?: { message?: string; code?: number } };

/**
 * Meta WhatsApp Cloud API adapter.
 * OTPs are sent using an approved WhatsApp authentication/utility template;
 * a free-form text message is not reliable outside WhatsApp's 24-hour window.
 */
export class MetaWhatsAppCloudProvider implements SmsProvider {
  readonly name = "meta-whatsapp-cloud-api";

  supportsChannel(channel: "email" | "sms" | "whatsapp"): boolean {
    return channel === "whatsapp" &&
      Boolean(env.whatsappCloud.accessToken && env.whatsappCloud.phoneNumberId);
  }

  async sendOtp(request: SmsDeliveryRequest): Promise<SmsDeliveryResult> {
    if (request.channel !== "whatsapp") {
      throw new Error("Meta WhatsApp Cloud API only supports WhatsApp delivery.");
    }
    const { accessToken, phoneNumberId, graphApiVersion, otpTemplateName } = env.whatsappCloud;
    if (!accessToken || !phoneNumberId) {
      throw new Error("Meta WhatsApp Cloud API is not configured.");
    }

    const endpoint = `https://graph.facebook.com/${graphApiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: request.to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: otpTemplateName,
          language: { code: "en_US" },
          components: [{
            type: "body",
            parameters: [{ type: "text", text: request.code }],
          }],
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    const payload = await response.json().catch(() => ({})) as MetaSendResponse;
    if (!response.ok) {
      const detail = payload.error?.message ?? `HTTP ${response.status}`;
      throw new Error(`Meta WhatsApp delivery failed: ${detail}`);
    }
    const providerReference = payload.messages?.[0]?.id;
    if (!providerReference) {
      throw new Error("Meta WhatsApp API returned no message ID.");
    }
    return { provider: this.name, providerReference, channel: "whatsapp" };
  }
}

export const metaWhatsAppCloudProvider = new MetaWhatsAppCloudProvider();

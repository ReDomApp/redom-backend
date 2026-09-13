import { env } from "../../../config/env";

import type {
  SmsDeliveryRequest,
  SmsDeliveryResult,
  SmsProvider,
} from "./sms-provider";

const MSG91_SMS_FLOW_URL = "https://control.msg91.com/api/v5/flow";

export class Msg91SmsProvider implements SmsProvider {
  readonly name = "msg91";

  supportsChannel(
    channel: "email" | "sms" | "whatsapp",
  ): boolean {
    return channel === "sms";
  }

  async sendOtp(
    request: SmsDeliveryRequest,
  ): Promise<SmsDeliveryResult> {
    if (!this.supportsChannel(request.channel)) {
      throw new Error(
        `MSG91 does not currently support ${request.channel} delivery.`,
      );
    }

    if (!env.msg91.flowId) {
      throw new Error(
        "MSG91 SMS Flow ID is not configured. Set MSG91_FLOW_ID to the approved ReDom OTP SMS flow.",
      );
    }

    const mobiles = request.to.replace(/^\+/, "");
    const recipient = {
      mobiles,
      [env.msg91.otpVariable]: request.code,
    };

    const payload = {
      template_id: env.msg91.flowId,
      sender: env.msg91.senderId,
      short_url: "0",
      recipients: [recipient],
    };

    const response = await fetch(MSG91_SMS_FLOW_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        authkey: env.msg91.authKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    let result: unknown = raw;

    try {
      result = JSON.parse(raw);
    } catch {
      // MSG91 can return a non-JSON response for some API errors.
    }

    if (!response.ok) {
      throw new Error(
        `MSG91 SMS request failed with HTTP ${response.status}: ${raw}`,
      );
    }

    if (
      typeof result !== "object" ||
      result === null ||
      !("type" in result) ||
      (result as { type?: unknown }).type !== "success"
    ) {
      const message =
        typeof result === "object" &&
        result !== null &&
        "message" in result
          ? String((result as { message?: unknown }).message)
          : raw;

      throw new Error(`MSG91 SMS delivery failed: ${message}`);
    }

    return {
      provider: this.name,
      providerReference:
        typeof result === "object" &&
        result !== null &&
        "message" in result
          ? String((result as { message?: unknown }).message)
          : undefined,
      channel: request.channel,
    };
  }
}

export const msg91SmsProvider =
  new Msg91SmsProvider();

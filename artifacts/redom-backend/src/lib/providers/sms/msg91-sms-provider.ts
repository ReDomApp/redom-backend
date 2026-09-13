import { env } from "../../../config/env";

import type {
  SmsDeliveryRequest,
  SmsDeliveryResult,
  SmsProvider,
} from "./sms-provider";

const MSG91_SMS_URL = "https://api.msg91.com/api/v2/sendsms";

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

    const body =
      `Your ReDom verification code is ${request.code}. ` +
      `This code expires at ${request.expiresAt.toISOString()}.`;

    const payload = new URLSearchParams({
      authkey: env.msg91.authKey,
      mobiles: request.to,
      message: body,
      sender: env.msg91.senderId,
      route: "default",
      country: "0",
      response: "json",
    });

    const response = await fetch(MSG91_SMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: payload.toString(),
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

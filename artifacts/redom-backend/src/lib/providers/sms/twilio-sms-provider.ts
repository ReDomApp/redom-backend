import {
  twilioClient,
} from "../../twilio";

import {
  env,
} from "../../../config/env";

import type {
  SmsDeliveryRequest,
  SmsDeliveryResult,
  SmsProvider,
} from "./sms-provider";

export class TwilioSmsProvider
  implements SmsProvider
{
  readonly name =
    "twilio";

  supportsChannel(
    channel:
      | "email"
      | "sms"
      | "whatsapp",
  ): boolean {
    if (
      channel === "sms"
    ) {
      return true;
    }

    if (
      channel === "whatsapp"
    ) {
      return Boolean(
        env.twilio
          .whatsappFrom,
      );
    }

    return false;
  }

  async sendOtp(
    request: SmsDeliveryRequest,
  ): Promise<SmsDeliveryResult> {
    if (
      !this.supportsChannel(
        request.channel,
      )
    ) {
      throw new Error(
        `Twilio does not currently support ${request.channel} delivery.`,
      );
    }

    const body =
      `Your ReDom verification code is ${request.code}. ` +
      `This code expires at ${request.expiresAt.toISOString()}.`;

    const from =
      request.channel ===
      "whatsapp"
        ? env.twilio
            .whatsappFrom
        : env.twilio
            .phoneNumber;

    if (!from) {
      throw new Error(
        `Twilio ${request.channel} sender is not configured.`,
      );
    }

    const destination =
      request.channel ===
      "whatsapp"
        ? `whatsapp:${request.to}`
        : request.to;

    const message =
      await twilioClient.messages.create(
        {
          body,

          from:
            request.channel ===
            "whatsapp"
              ? `whatsapp:${from}`
              : from,

          to:
            destination,
        },
      );

    return {
      provider:
        this.name,

      providerReference:
        message.sid,

      channel:
        request.channel,
    };
  }
}

export const twilioSmsProvider =
  new TwilioSmsProvider();
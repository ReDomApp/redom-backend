import {
  msg91SmsProvider,
} from "../../lib/providers/sms/msg91-sms-provider";

import {
  twilioSmsProvider,
} from "../../lib/providers/sms/twilio-sms-provider";

import type {
  SmsDeliveryRequest,
  SmsDeliveryResult,
} from "../../lib/providers/sms/sms-provider";

export class PhoneService {
  normalize(
    phoneNumber: string,
  ): string {
    return phoneNumber
      .trim()
      .replace(
        /\s+/g,
        "",
      );
  }

  validate(
    phoneNumber: string,
  ): string {
    const normalized =
      this.normalize(
        phoneNumber,
      );

    const phoneRegex =
      /^\+[1-9]\d{7,14}$/;

    if (
      !phoneRegex.test(
        normalized,
      )
    ) {
      throw new Error(
        "Invalid phone number.",
      );
    }

    return normalized;
  }

  async sendOtp(
    params: {
      phoneNumber: string;
      code: string;
      channel:
        | "sms"
        | "whatsapp";
      purpose: string;
      expiresAt: Date;
    },
  ): Promise<SmsDeliveryResult> {
    const phoneNumber =
      this.validate(
        params.phoneNumber,
      );

    const request:
      SmsDeliveryRequest = {
      to: phoneNumber,

      code:
        params.code,

      channel:
        params.channel,

      purpose:
        params.purpose,

      expiresAt:
        params.expiresAt,
    };

    if (
      request.channel === "whatsapp"
    ) {
      return twilioSmsProvider
        .sendOtp(request);
    }

    try {
      return await twilioSmsProvider
        .sendOtp(request);
    } catch (twilioError) {
      console.warn(
        "Twilio SMS delivery failed; falling back to MSG91.",
        twilioError,
      );

      return msg91SmsProvider
        .sendOtp(request);
    }
  }

  supportsChannel(
    channel:
      | "sms"
      | "whatsapp",
  ): boolean {
    if (
      channel === "whatsapp"
    ) {
      return twilioSmsProvider
        .supportsChannel(channel);
    }

    return (
      twilioSmsProvider
        .supportsChannel(channel) ||
      msg91SmsProvider
        .supportsChannel(channel)
    );
  }
}

export const phoneService =
  new PhoneService();

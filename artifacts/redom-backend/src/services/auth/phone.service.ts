import {
  msg91SmsProvider,
} from "../../lib/providers/sms/msg91-sms-provider";

import {
  twilioSmsProvider,
} from "../../lib/providers/sms/twilio-sms-provider";

import { metaWhatsAppCloudProvider } from "../../lib/providers/sms/meta-whatsapp-cloud-provider";

import type {
  SmsDeliveryRequest,
  SmsDeliveryResult,
} from "../../lib/providers/sms/sms-provider";

function providerErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
      .replace(/^MSG91\s*/i, "")
      .replace(/^Twilio\s*/i, "");
  }

  return "SMS delivery failed.";
}

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

    // Meta Cloud API is the only official WhatsApp delivery provider. Never fall back to Twilio.
    if (request.channel === "whatsapp") {
      // Attempt Meta WhatsApp first. If Meta rejects the request or delivery cannot
      // be initiated, fall back to SMS using the SAME code and expiry.
      try {
        if (!metaWhatsAppCloudProvider.supportsChannel("whatsapp")) {
          throw new Error("Meta WhatsApp Cloud API is not configured.");
        }
        return await metaWhatsAppCloudProvider.sendOtp(request);
      } catch (whatsAppError) {
        console.warn("WhatsApp OTP delivery failed; attempting SMS fallback.", whatsAppError);
        const smsRequest: SmsDeliveryRequest = { ...request, channel: "sms" };
        try {
          return await msg91SmsProvider.sendOtp(smsRequest);
        } catch (msg91Error) {
          console.warn("Primary SMS fallback failed; attempting secondary SMS provider.", msg91Error);
          try {
            return await twilioSmsProvider.sendOtp(smsRequest);
          } catch (twilioError) {
            throw new Error(`WhatsApp delivery failed; ReDom 1 SMS: ${providerErrorMessage(msg91Error)}; ReDom 2 SMS fallback: ${providerErrorMessage(twilioError)}`);
          }
        }
      }
    }

    // SMS provider order: ReDom 1 (MSG91) first, ReDom 2 (Twilio) only as fallback.
    try {
      return await msg91SmsProvider
        .sendOtp(request);
    } catch (msg91Error) {
      console.warn(
        "Primary SMS delivery failed; attempting fallback SMS provider.",
        msg91Error,
      );

      try {
        return await twilioSmsProvider
          .sendOtp(request);
      } catch (twilioError) {
        throw new Error(
          `ReDom 1: ${providerErrorMessage(msg91Error)}\nReDom 2 (Fallback): ${providerErrorMessage(twilioError)}`,
        );
      }
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
      return metaWhatsAppCloudProvider.supportsChannel(channel);
    }

    return (
      msg91SmsProvider
        .supportsChannel(channel) ||
      twilioSmsProvider
        .supportsChannel(channel)
    );
  }
}

export const phoneService =
  new PhoneService();

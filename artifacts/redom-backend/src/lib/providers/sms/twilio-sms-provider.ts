import { twilioClient } from "../../twilio";

import { env } from "../../../config/env";

import type {
  SmsVerificationProvider,
} from "./sms-provider";

export class TwilioSmsProvider
  implements SmsVerificationProvider
{
  async sendVerificationCode(
    phoneNumber: string,
  ): Promise<void> {
    await twilioClient.verify.v2
      .services(
        env.twilio
          .verifyServiceSid,
      )
      .verifications.create({
        to: phoneNumber,
        channel: "sms",
      });
  }

  async verifyCode(
    phoneNumber: string,
    code: string,
  ): Promise<boolean> {
    const result =
      await twilioClient.verify.v2
        .services(
          env.twilio
            .verifyServiceSid,
        )
        .verificationChecks.create({
          to: phoneNumber,
          code,
        });

    return (
      result.status ===
      "approved"
    );
  }
}

export const twilioSmsProvider =
  new TwilioSmsProvider();
import { twilioClient } from "../../twilio";

import type {
  SmsVerificationProvider,
} from "./sms-provider";

export class TwilioSmsProvider
  implements SmsVerificationProvider
{
  private getVerifyServiceSid(): string {
    const serviceSid =
      process.env.TWILIO_VERIFY_SERVICE_SID;

    if (!serviceSid) {
      throw new Error(
        "TWILIO_VERIFY_SERVICE_SID is not configured.",
      );
    }

    return serviceSid;
  }

  async sendVerificationCode(
    phoneNumber: string,
  ): Promise<void> {
    await twilioClient.verify.v2
      .services(
        this.getVerifyServiceSid(),
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
          this.getVerifyServiceSid(),
        )
        .verificationChecks.create({
          to: phoneNumber,
          code,
        });

    return result.status === "approved";
  }
}

export const twilioSmsProvider =
  new TwilioSmsProvider();
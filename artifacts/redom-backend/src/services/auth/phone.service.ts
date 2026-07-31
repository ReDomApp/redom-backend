import { twilioClient } from "../../lib/twilio";

export class PhoneService {
  /**
   * Normalize a phone number.
   */
  normalize(phoneNumber: string): string {
    return phoneNumber.replace(/\s+/g, "");
  }

  /**
   * Validate E.164 phone numbers.
   */
  validate(phoneNumber: string): string {
    phoneNumber = this.normalize(phoneNumber);

    const phoneRegex = /^\+[1-9]\d{7,14}$/;

    if (!phoneRegex.test(phoneNumber)) {
      throw new Error("Invalid phone number.");
    }

    return phoneNumber;
  }

  /**
   * Send a verification code using Twilio Verify.
   */
  async sendVerificationCode(
    phoneNumber: string,
  ): Promise<void> {
    await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verifications.create({
        to: phoneNumber,
        channel: "sms",
      });
  }

  /**
   * Verify the code entered by the user.
   */
  async verifyCode(
    phoneNumber: string,
    code: string,
  ): Promise<boolean> {
    const result = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verificationChecks.create({
        to: phoneNumber,
        code,
      });

    return result.status === "approved";
  }

  /**
   * Send a password reset code.
   * Uses the same Twilio Verify flow.
   */
  async sendPasswordResetCode(
    phoneNumber: string,
  ): Promise<void> {
    await this.sendVerificationCode(phoneNumber);
  }
}

export const phoneService = new PhoneService();
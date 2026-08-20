import {
  twilioSmsProvider,
} from "../../lib/providers/sms/twilio-sms-provider";

import type {
  SmsVerificationProvider,
} from "../../lib/providers/sms/sms-provider";

export class PhoneService {
  private readonly provider:
    SmsVerificationProvider;

  constructor(
    provider: SmsVerificationProvider,
  ) {
    this.provider = provider;
  }

  /**
   * Normalize a phone number.
   */
  normalize(
    phoneNumber: string,
  ): string {
    return phoneNumber
      .trim()
      .replace(/\s+/g, "");
  }

  /**
   * Validate E.164 phone numbers.
   */
  validate(
    phoneNumber: string,
  ): string {
    phoneNumber =
      this.normalize(
        phoneNumber,
      );

    const phoneRegex =
      /^\+[1-9]\d{7,14}$/;

    if (
      !phoneRegex.test(
        phoneNumber,
      )
    ) {
      throw new Error(
        "Invalid phone number.",
      );
    }

    return phoneNumber;
  }

  /**
   * Send a phone verification code.
   *
   * Provider-specific implementation remains
   * outside the authentication service.
   */
  async sendVerificationCode(
    phoneNumber: string,
  ): Promise<void> {
    const normalized =
      this.validate(
        phoneNumber,
      );

    await this.provider
      .sendVerificationCode(
        normalized,
      );
  }

  /**
   * Verify a phone verification code.
   */
  async verifyCode(
    phoneNumber: string,
    code: string,
  ): Promise<boolean> {
    const normalized =
      this.validate(
        phoneNumber,
      );

    const verificationCode =
      code.trim();

    if (
      !verificationCode
    ) {
      throw new Error(
        "Verification code is required.",
      );
    }

    return this.provider
      .verifyCode(
        normalized,
        verificationCode,
      );
  }

  /**
   * Send a password-reset verification code.
   *
   * Password-reset delivery uses the same
   * provider abstraction.
   */
  async sendPasswordResetCode(
    phoneNumber: string,
  ): Promise<void> {
    await this.sendVerificationCode(
      phoneNumber,
    );
  }
}

export const phoneService =
  new PhoneService(
    twilioSmsProvider,
  );
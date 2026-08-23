import type {
  OtpChannel,
  OtpLength,
} from "../../utils/otp";

export const VERIFICATION_PURPOSES = [
  "EMAIL_VERIFICATION",
  "PHONE_VERIFICATION",
  "PASSWORD_RESET",
  "CHANGE_EMAIL",
  "CHANGE_PHONE",
  "CHANGE_PASSWORD",
  "SECURITY_SETTING_CHANGE",
  "TWO_FACTOR_AUTHENTICATION",
  "ACCOUNT_RECOVERY",
  "SENSITIVE_ACCOUNT_ACTION",
  "LOGIN_DEVICE_VERIFICATION",
] as const;

export type VerificationPurpose =
  (typeof VERIFICATION_PURPOSES)[number];

export const VERIFICATION_TYPES = [
  "email",
  "phone",
  "security",
] as const;

export type VerificationType =
  (typeof VERIFICATION_TYPES)[number];

export const VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "consumed",
  "expired",
  "failed",
  "invalidated",
  "delivery_failed",
] as const;

export type VerificationStatus =
  (typeof VERIFICATION_STATUSES)[number];

const PURPOSE_LENGTHS: Record<
  VerificationPurpose,
  readonly OtpLength[]
> = {
  EMAIL_VERIFICATION: [4, 5, 6],

  PHONE_VERIFICATION: [4, 5, 6],

  PASSWORD_RESET: [6, 9],

  CHANGE_EMAIL: [6, 9],

  CHANGE_PHONE: [6, 9],

  CHANGE_PASSWORD: [6, 9],

  SECURITY_SETTING_CHANGE: [9],

  TWO_FACTOR_AUTHENTICATION: [6, 9],

  ACCOUNT_RECOVERY: [9],

  SENSITIVE_ACCOUNT_ACTION: [9],

  LOGIN_DEVICE_VERIFICATION: [6],
};

const PURPOSE_TYPES: Record<
  VerificationPurpose,
  VerificationType
> = {
  EMAIL_VERIFICATION: "email",

  PHONE_VERIFICATION: "phone",

  PASSWORD_RESET: "security",

  CHANGE_EMAIL: "email",

  CHANGE_PHONE: "phone",

  CHANGE_PASSWORD: "security",

  SECURITY_SETTING_CHANGE: "security",

  TWO_FACTOR_AUTHENTICATION: "security",

  ACCOUNT_RECOVERY: "security",

  SENSITIVE_ACCOUNT_ACTION: "security",

  LOGIN_DEVICE_VERIFICATION: "security",
};

const PURPOSE_CHANNELS: Record<
  VerificationPurpose,
  readonly OtpChannel[]
> = {
  EMAIL_VERIFICATION: [
    "email",
  ],

  PHONE_VERIFICATION: [
    "sms",
    "whatsapp",
  ],

  PASSWORD_RESET: [
    "email",
    "sms",
    "whatsapp",
  ],

  CHANGE_EMAIL: [
    "email",
  ],

  CHANGE_PHONE: [
    "sms",
    "whatsapp",
  ],

  CHANGE_PASSWORD: [
    "email",
    "sms",
    "whatsapp",
  ],

  SECURITY_SETTING_CHANGE: [
    "email",
    "sms",
  ],

  TWO_FACTOR_AUTHENTICATION: [
    "email",
    "sms",
  ],

  ACCOUNT_RECOVERY: [
    "email",
    "sms",
  ],

  SENSITIVE_ACCOUNT_ACTION: [
    "email",
    "sms",
  ],

  LOGIN_DEVICE_VERIFICATION: [
    "sms",
    "email",
  ],
};

export const DEFAULT_MAX_ATTEMPTS = 5;

export class VerificationPolicyService {
  isPurpose(
    value: string,
  ): value is VerificationPurpose {
    return (
      VERIFICATION_PURPOSES as readonly string[]
    ).includes(value);
  }

  getType(
    purpose: VerificationPurpose,
  ): VerificationType {
    return PURPOSE_TYPES[purpose];
  }

  getAllowedLengths(
    purpose: VerificationPurpose,
  ): readonly OtpLength[] {
    return PURPOSE_LENGTHS[purpose];
  }

  isLengthAllowed(
    purpose: VerificationPurpose,
    length: OtpLength,
  ): boolean {
    return PURPOSE_LENGTHS[
      purpose
    ].includes(length);
  }

  getAllowedChannels(
    purpose: VerificationPurpose,
  ): readonly OtpChannel[] {
    return PURPOSE_CHANNELS[purpose];
  }

  isChannelAllowed(
    purpose: VerificationPurpose,
    channel: OtpChannel,
  ): boolean {
    return PURPOSE_CHANNELS[
      purpose
    ].includes(channel);
  }

  validateLength(
    purpose: VerificationPurpose,
    length: OtpLength,
  ): void {
    if (
      !this.isLengthAllowed(
        purpose,
        length,
      )
    ) {
      throw new Error(
        `OTP length ${length} is not permitted for ${purpose}.`,
      );
    }
  }

  validateChannel(
    purpose: VerificationPurpose,
    channel: OtpChannel,
  ): void {
    if (
      !this.isChannelAllowed(
        purpose,
        channel,
      )
    ) {
      throw new Error(
        `OTP channel ${channel} is not permitted for ${purpose}.`,
      );
    }
  }

  getDefaultLength(
    purpose: VerificationPurpose,
  ): OtpLength {
    const lengths =
      PURPOSE_LENGTHS[purpose];

    return lengths[
      lengths.length - 1
    ];
  }

  getMaxAttempts(): number {
    return DEFAULT_MAX_ATTEMPTS;
  }
}

export const verificationPolicyService =
  new VerificationPolicyService();
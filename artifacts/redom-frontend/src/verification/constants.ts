export const VERIFICATION_ENDPOINTS = {
  verifyEmail: "/auth/verify-email",
  verifyPhone: "/auth/verify-phone",
  resendEmail: "/auth/resend-email-code",
  resendPhone: "/auth/resend-phone-code",
} as const;

export const VERIFICATION_PURPOSES = {
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  PHONE_VERIFICATION: "PHONE_VERIFICATION",
} as const;

export type VerificationPurpose =
  (typeof VERIFICATION_PURPOSES)[keyof typeof VERIFICATION_PURPOSES];

export const VERIFICATION_CHANNELS = {
  EMAIL: "email",
  SMS: "sms",
  WHATSAPP: "whatsapp",
} as const;

export type VerificationChannel =
  (typeof VERIFICATION_CHANNELS)[keyof typeof VERIFICATION_CHANNELS];

export const EMAIL_VERIFICATION_LENGTHS = [
  4,
  5,
  6,
] as const;

export const PHONE_VERIFICATION_LENGTHS = [
  4,
  5,
  6,
] as const;

export const DEFAULT_EMAIL_VERIFICATION_LENGTH = 6;

export const DEFAULT_PHONE_VERIFICATION_LENGTH = 6;

export const MAX_LOCAL_OTP_LENGTH = 9;

export const MIN_LOCAL_OTP_LENGTH = 4;
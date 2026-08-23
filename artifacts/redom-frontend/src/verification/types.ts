import type {
  VerificationChannel,
  VerificationPurpose,
} from "./constants";

export interface VerifyEmailInput {
  userId: string;
  code: string;
}

export interface VerifyPhoneInput {
  userId: string;
  phoneNumber: string;
  code: string;
}

export interface ResendEmailCodeInput {
  userId: string;
}

export interface ResendPhoneCodeInput {
  userId: string;
}

export interface VerificationResponse {
  success: boolean;
  message: string;

  challengeId?: string;

  purpose?: VerificationPurpose | string;

  type?: "email" | "phone" | "security" | string;

  target?: string;

  normalizedTarget?: string;

  channel?: VerificationChannel | string;

  codeLength?: number;

  expiresAt?: string;

  status?: string;

  userId?: string;
}
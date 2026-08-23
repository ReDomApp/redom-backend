import {
  EMAIL_VERIFICATION_LENGTHS,
  PHONE_VERIFICATION_LENGTHS,
  MIN_LOCAL_OTP_LENGTH,
  MAX_LOCAL_OTP_LENGTH,
} from "./constants";

function isNumeric(value: string): boolean {
  return /^\d+$/.test(value);
}

export function normalizeOtp(
  value: string,
): string {
  return value.replace(/\D/g, "");
}

export function validateOtp(
  value: string,
  allowedLengths:
    | readonly number[]
    = [
      ...new Set([
        ...EMAIL_VERIFICATION_LENGTHS,
        ...PHONE_VERIFICATION_LENGTHS,
      ]),
    ],
): string | null {
  const code = normalizeOtp(value);

  if (!code) {
    return "Enter your verification code.";
  }

  if (!isNumeric(code)) {
    return "Verification code must contain numbers only.";
  }

  if (
    code.length < MIN_LOCAL_OTP_LENGTH ||
    code.length > MAX_LOCAL_OTP_LENGTH
  ) {
    return "Enter a valid verification code.";
  }

  if (!allowedLengths.includes(code.length)) {
    return "The verification code has an invalid length.";
  }

  return null;
}

export function validateEmailOtp(
  value: string,
): string | null {
  return validateOtp(
    value,
    EMAIL_VERIFICATION_LENGTHS,
  );
}

export function validatePhoneOtp(
  value: string,
): string | null {
  return validateOtp(
    value,
    PHONE_VERIFICATION_LENGTHS,
  );
}

export function validateUserId(
  value: string,
): string | null {
  const userId = value.trim();

  if (!userId) {
    return "User ID is required.";
  }

  return null;
}

export function validatePhoneNumber(
  value: string,
): string | null {
  const phoneNumber = value.trim();

  if (!phoneNumber) {
    return "Phone number is required.";
  }

  if (
    !/^\+?[1-9]\d{7,14}$/.test(
      phoneNumber,
    )
  ) {
    return "Enter a valid phone number.";
  }

  return null;
}
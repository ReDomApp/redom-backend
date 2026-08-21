import {
  createHash,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

/**
 * ReDom OTP architecture.
 *
 * The backend is the authoritative OTP generator.
 *
 * Supported lengths are intentionally limited.
 */
export const OTP_LENGTHS = [
  4,
  5,
  6,
  9,
] as const;

export type OtpLength =
  (typeof OTP_LENGTHS)[number];

export type OtpChannel =
  | "email"
  | "sms"
  | "whatsapp";

/**
 * OTP lifetime is determined by channel.
 *
 * Email:
 * 10 minutes
 *
 * SMS / WhatsApp:
 * 5 minutes
 */
export const OTP_EXPIRATION_MINUTES: Record<
  OtpChannel,
  number
> = {
  email: 10,
  sms: 5,
  whatsapp: 5,
};

/**
 * Verify that a requested OTP length is
 * supported by ReDom.
 */
export function isOtpLength(
  value: number,
): value is OtpLength {
  return (
    Number.isInteger(value) &&
    (
      OTP_LENGTHS as readonly number[]
    ).includes(value)
  );
}

/**
 * Validate an OTP length.
 */
export function validateOtpLength(
  value: number,
): OtpLength {
  if (!isOtpLength(value)) {
    throw new Error(
      "OTP length must be one of: 4, 5, 6, or 9 digits.",
    );
  }

  return value;
}

/**
 * Generate a cryptographically secure OTP.
 *
 * IMPORTANT:
 *
 * Do NOT replace this with Math.random().
 *
 * randomInt() is provided by Node's cryptographic
 * random-number implementation.
 */
export function generateOtp(
  length: OtpLength,
): string {
  const minimum =
    10 ** (length - 1);

  const maximum =
    10 ** length;

  return randomInt(
    minimum,
    maximum,
  ).toString();
}

/**
 * SHA-256 hash of an OTP.
 *
 * Plaintext OTPs are never stored.
 */
export function hashOtp(
  code: string,
): string {
  return createHash("sha256")
    .update(
      code.trim(),
      "utf8",
    )
    .digest("hex");
}

/**
 * Constant-time OTP comparison.
 *
 * Both values must be SHA-256 hexadecimal
 * digests.
 */
export function verifyOtpHash(
  code: string,
  expectedHash: string,
): boolean {
  const actual =
    Buffer.from(
      hashOtp(code),
      "hex",
    );

  const expected =
    Buffer.from(
      expectedHash,
      "hex",
    );

  if (
    actual.length !==
    expected.length
  ) {
    return false;
  }

  return timingSafeEqual(
    actual,
    expected,
  );
}

/**
 * Calculate expiration from creation time.
 */
export function getOtpExpiration(
  channel: OtpChannel,
  createdAt = new Date(),
): Date {
  return new Date(
    createdAt.getTime() +
      OTP_EXPIRATION_MINUTES[
        channel
      ] *
        60_000,
  );
}

/**
 * Return the number of digits represented
 * by a code.
 */
export function getOtpCodeLength(
  code: string,
): number {
  return code.length;
}
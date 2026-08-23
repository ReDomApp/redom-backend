export type LoginIdentifierType =
  | "email"
  | "phone"
  | "invalid";

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PHONE_PATTERN =
  /^\+?[1-9]\d{7,14}$/;

const NUMERIC_PATTERN =
  /^\d+$/;

const FIFTEEN_DIGIT_PATTERN =
  /^\d{15}$/;

export function classifyLoginIdentifier(
  value: string,
): LoginIdentifierType {
  const identifier = value.trim();

  if (!identifier) {
    return "invalid";
  }

  /*
   * ReDom mobile login intentionally does NOT
   * expose username, public ID, or profile ID login.
   *
   * Any numeric-only identifier is rejected locally.
   * This includes 15-digit public IDs.
   */
  if (
    FIFTEEN_DIGIT_PATTERN.test(identifier) ||
    NUMERIC_PATTERN.test(identifier)
  ) {
    return "invalid";
  }

  if (EMAIL_PATTERN.test(identifier)) {
    return "email";
  }

  if (PHONE_PATTERN.test(identifier)) {
    return "phone";
  }

  return "invalid";
}

export function validateLoginIdentifier(
  value: string,
): string | null {
  const identifier = value.trim();

  if (!identifier) {
    return "Enter your email address or phone number.";
  }

  if (
    classifyLoginIdentifier(identifier) ===
    "invalid"
  ) {
    return "Enter a valid email address or phone number.";
  }

  return null;
}

export function isValidLoginIdentifier(
  value: string,
): boolean {
  return (
    classifyLoginIdentifier(value) !==
    "invalid"
  );
}
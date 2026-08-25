export function validateLoginIdentifier(
  identifier: string,
): string | null {
  const value =
    identifier.trim();

  if (!value) {
    return "Enter your mobile number or email.";
  }

  /*
   * ReDom does not allow Public ID-style
   * login identifiers.
   *
   * Only reject a numeric identifier when:
   *
   *   1. It contains exactly 15 digits
   *   2. It starts with 234
   *
   * Therefore:
   *
   * 234XXXXXXXXXXXX
   * ^^^^^^^^^^^^^^^
   *      15 digits
   *
   * Other phone numbers are NOT rejected
   * by this Public-ID check.
   */
  if (/^234\d{12}$/.test(value)) {
    return "Please use your mobile number or email address to log in.";
  }

  /*
   * Numeric identifiers are otherwise allowed
   * to reach the backend.
   *
   * We only perform basic local length
   * validation here.
   */
  if (/^\d+$/.test(value)) {
    if (
      value.length < 7 ||
      value.length > 20
    ) {
      return "Enter a valid mobile number.";
    }

    return null;
  }

  /*
   * Email validation.
   */
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value,
    )
  ) {
    return "Enter a valid mobile number or email address.";
  }

  return null;
}

export function validatePassword(
  password: string,
): string | null {
  if (!password) {
    return "Enter your password.";
  }

  return null;
}
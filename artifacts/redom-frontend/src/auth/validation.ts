export function validateLoginIdentifier(
  identifier: string,
): string | null {
  const value =
    identifier.trim();

  if (!value) {
    return "Enter your mobile number or email.";
  }

  /*
   * ReDom does not allow Public ID login.
   *
   * Any exactly 15-digit numeric value is
   * rejected before it reaches the backend.
   */
  if (/^\d{15}$/.test(value)) {
    return "Please use your mobile number or email address to log in.";
  }

  if (
    /^\d+$/.test(value)
  ) {
    if (
      value.length < 7 ||
      value.length > 20
    ) {
      return "Enter a valid mobile number.";
    }

    return null;
  }

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
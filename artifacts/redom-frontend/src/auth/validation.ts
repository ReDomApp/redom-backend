export function validateLoginIdentifier(
  identifier: string,
): string | null {
  const value = identifier.trim();
  if (!value) return "Enter your mobile number or email.";
  // Phone input is strict: + followed by digits internationally, or digits only locally.
  // Spaces, brackets, dots and hyphens are intentionally rejected.
  if (value.startsWith("+")) {
    if (!/^\+[1-9]\d{7,14}$/.test(value)) return "Enter your mobile number with + and the country code.";
    return null;
  }
  if (/^\d+$/.test(value)) {
    if (value.length < 7 || value.length > 20) return "Enter a valid mobile number.";
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid mobile number or email address.";
  return null;
}

/** Converts a local number such as 09133140501 to E.164 using the startup IP check. */
export function normalizeLoginIdentifier(identifier: string, callingCode?: string | null): string {
  const value = identifier.trim();
  if (!/^\d+$/.test(value) || !value.startsWith("0")) return value;
  const code = String(callingCode ?? "").replace(/^\+/, "").replace(/\D/g, "");
  return code ? `+${code}${value.slice(1)}` : value;
}

export function validatePassword(
  password: string,
): string | null {
  if (!password) return "Enter your password.";
  return null;
}

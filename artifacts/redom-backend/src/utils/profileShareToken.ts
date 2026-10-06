/**
 * ReDom public profile share tokens.
 *
 * Public profile URLs expose:
 *   /@username?_r=1&_t=ZS-{base62(profileId)}
 *
 * The raw 15-digit profile ID is never placed in the URL. The token is
 * reversible on the server and exists only to resolve the stable profile
 * identity behind a username.
 */

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const PREFIX = "ZS-";
const PROFILE_ID_PATTERN = /^234[1-9][0-9]{11}$/;
const TOKEN_PATTERN = /^ZS-[0-9A-Za-z]{11}$/;

export function encodeProfileShareToken(profileId: string): string {
  const normalized = String(profileId || "").trim();
  if (!PROFILE_ID_PATTERN.test(normalized)) {
    throw new Error("Invalid ReDom profile ID.");
  }

  const profileValue = BigInt(normalized);
  // Reserve two base62 characters for a deterministic integrity suffix.
  let value = profileValue * 3844n + (profileValue % 3844n);
  let encoded = "";
  while (value > 0n) {
    encoded = ALPHABET[Number(value % 62n)] + encoded;
    value /= 62n;
  }

  encoded = encoded.padStart(11, "0");
  return PREFIX + encoded;
}

export function decodeProfileShareToken(token: string): string | null {
  const normalized = String(token || "").trim();
  if (!TOKEN_PATTERN.test(normalized)) return null;

  const encoded = normalized.slice(PREFIX.length);
  let value = 0n;
  for (const character of encoded) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) return null;
    value = value * 62n + BigInt(index);
  }

  const profileValue = value / 3844n;
  const checksum = value % 3844n;
  if (profileValue % 3844n !== checksum) return null;
  const profileId = profileValue.toString();
  return PROFILE_ID_PATTERN.test(profileId) ? profileId : null;
}

export function isProfileShareToken(token: string): boolean {
  return TOKEN_PATTERN.test(String(token || "").trim());
}

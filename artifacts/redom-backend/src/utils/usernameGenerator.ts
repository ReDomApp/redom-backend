import { eq } from "drizzle-orm";

import { db } from "../database/db";
import { users } from "../database/schema";

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "app",
  "contact",
  "help",
  "mod",
  "moderator",
  "official",
  "redom",
  "root",
  "security",
  "support",
  "system",
]);

const PROHIBITED_USERNAMES = new Set([
  "fuck",
  "shit",
  "bitch",
]);

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/**
 * Normalize the username to the canonical
 * ReDom representation.
 *
 * @John_Smith
 * John_Smith
 * JOHN.SMITH
 *
 * all become:
 *
 * john_smith
 * john_smith
 * john.smith
 */
export function normalizeUsername(
  username: string,
): string {
  return username
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

/**
 * Validate username length.
 */
export function validateLength(
  username: string,
): boolean {
  return (
    username.length >=
      USERNAME_MIN_LENGTH &&
    username.length <=
      USERNAME_MAX_LENGTH
  );
}

/**
 * Supported username characters:
 *
 * a-z
 * 0-9
 * _
 * .
 *
 * Username cannot begin/end with . or _.
 */
export function validateCharacters(
  username: string,
): boolean {
  return /^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/.test(
    username,
  );
}

/**
 * Prevent consecutive special characters.
 */
export function validateSpecialCharacters(
  username: string,
): boolean {
  return !/[._]{2,}/.test(username);
}

/**
 * Prevent reserved names.
 */
export function blockReservedUsernames(
  username: string,
): boolean {
  return !RESERVED_USERNAMES.has(
    username,
  );
}

/**
 * Prevent prohibited names.
 */
export function blockProhibitedUsernames(
  username: string,
): boolean {
  return !PROHIBITED_USERNAMES.has(
    username,
  );
}

/**
 * Basic impersonation protection.
 *
 * Reserved/system names are handled separately.
 */
export function detectImpersonation(
  username: string,
): boolean {
  return (
    username === "redomofficial" ||
    username === "officialredom"
  );
}

/**
 * Complete username validation.
 */
export function validateUsername(
  input: string,
): string {
  const username =
    normalizeUsername(input);

  if (!validateLength(username)) {
    throw new Error(
      `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters.`,
    );
  }

  if (!validateCharacters(username)) {
    throw new Error(
      "Username contains unsupported characters.",
    );
  }

  if (
    !validateSpecialCharacters(
      username,
    )
  ) {
    throw new Error(
      "Username cannot contain consecutive special characters.",
    );
  }

  if (
    !blockReservedUsernames(
      username,
    )
  ) {
    throw new Error(
      "Not Supported.",
    );
  }

  if (
    !blockProhibitedUsernames(
      username,
    )
  ) {
    throw new Error(
      "That username is not allowed.",
    );
  }

  if (
    detectImpersonation(username)
  ) {
    throw new Error(
      "That username cannot be used.",
    );
  }

  return username;
}

/**
 * Check username availability.
 */
export async function checkAvailability(
  input: string,
): Promise<boolean> {
  const username =
    validateUsername(input);

  const existing =
    await db.query.users.findFirst({
      where: eq(
        users.username,
        username,
      ),
    });

  return !existing;
}

/**
 * Generate suggestions close to the requested
 * username.
 */
export async function generateSuggestions(
  input: string,
): Promise<string[]> {
  const base =
    validateUsername(input);

  const candidates = [
    `${base}1`,
    `${base}2`,
    `${base}3`,
    `${base}_official`,
    `the${base}`,
  ].filter(
    (candidate) =>
      candidate.length <=
      USERNAME_MAX_LENGTH,
  );

  const suggestions: string[] = [];

  for (const candidate of candidates) {
    try {
      const normalized =
        validateUsername(
          candidate,
        );

      const available =
        await checkAvailability(
          normalized,
        );

      if (available) {
        suggestions.push(
          normalized,
        );
      }

      if (suggestions.length >= 5) {
        break;
      }
    } catch {
      // Invalid candidate; continue.
    }
  }

  return suggestions;
}

/**
 * Generate a username from a display name.
 *
 * This is useful when the registration UI allows
 * ReDom to suggest usernames automatically.
 */
export async function generateUsername(
  displayName: string,
): Promise<string> {
  const normalized =
    normalizeUsername(
      displayName,
    )
      .replace(/[^a-z0-9._]/g, "")
      .replace(/^[._]+|[._]+$/g, "");

  let base = normalized;

  if (!base) {
    base = "user";
  }

  if (
    base.length <
    USERNAME_MIN_LENGTH
  ) {
    base = `${base}user`;
  }

  base = base.slice(
    0,
    USERNAME_MAX_LENGTH,
  );

  try {
    base =
      validateUsername(base);
  } catch {
    base = "user";
  }

  if (
    await checkAvailability(base)
  ) {
    return base;
  }

  const suggestions =
    await generateSuggestions(
      base,
    );

  if (suggestions.length > 0) {
    return suggestions[0];
  }

  for (let index = 1; index <= 9999; index++) {
    const candidate =
      `${base}${index}`;

    if (
      candidate.length >
      USERNAME_MAX_LENGTH
    ) {
      continue;
    }

    if (
      await checkAvailability(
        candidate,
      )
    ) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to generate an available username.",
  );
}

/**
 * Prevent duplicate usernames at the application layer.
 */
export async function preventDuplicates(
  username: string,
): Promise<void> {
  const available =
    await checkAvailability(
      username,
    );

  if (!available) {
    throw new Error(
      "Username is already taken.",
    );
  }
}

/**
 * Registration reservation hook.
 *
 * The actual reservation table will be implemented
 * when the username reservation database domain is traced.
 */
export async function reserveUsername(
  username: string,
): Promise<string> {
  const normalized =
    validateUsername(username);

  await preventDuplicates(
    normalized,
  );

  return normalized;
}

/**
 * Release a username reservation.
 *
 * No persistent reservation table is introduced here
 * until the reservation database architecture exists.
 */
export async function releaseReservedUsername(
  username: string,
): Promise<void> {
  validateUsername(username);
}

/**
 * Username changes are allowed only after the
 * caller has enforced the account's username-change
 * policy/history requirements.
 */
export async function changeUsername(
  userId: string,
  requestedUsername: string,
): Promise<string> {
  const username =
    validateUsername(
      requestedUsername,
    );

  const existing =
    await db.query.users.findFirst({
      where: eq(
        users.username,
        username,
      ),
    });

  if (
    existing &&
    existing.id !== userId
  ) {
    throw new Error(
      "Username is already taken.",
    );
  }

  return username;
}

/**
 * Username history validation hook.
 *
 * The username-history database domain will be
 * connected here once that database file is traced.
 */
export function validateUsernameHistory(
  _userId: string,
  _username: string,
): boolean {
  return true;
}
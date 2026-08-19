export const ACCOUNT_STATUS_VALUES = [
  "pending",
  "active",
  "suspended",
  "banned",
] as const;

export type AccountStatus =
  (typeof ACCOUNT_STATUS_VALUES)[number];

export const PROFILE_ID_VISIBILITY_VALUES = [
  "public",
  "private",
] as const;

export type ProfileIdVisibility =
  (typeof PROFILE_ID_VISIBILITY_VALUES)[number];

export function isAccountStatus(
  value: string,
): value is AccountStatus {
  return (
    ACCOUNT_STATUS_VALUES as readonly string[]
  ).includes(value);
}

export function isProfileIdVisibility(
  value: string,
): value is ProfileIdVisibility {
  return (
    PROFILE_ID_VISIBILITY_VALUES as readonly string[]
  ).includes(value);
}
export const GENDER_VALUES = [
  "male",
  "female",
  "custom",
] as const;

export type Gender =
  (typeof GENDER_VALUES)[number];

export function isGender(
  value: string,
): value is Gender {
  return (
    GENDER_VALUES as readonly string[]
  ).includes(value);
}
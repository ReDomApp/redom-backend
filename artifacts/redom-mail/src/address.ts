import type { MailAddress } from "./types.js";

const EMAIL_RE = /^[^\\s@<>]+@[^\\s@<>]+$/;

export function parseAddress(value: string | MailAddress): MailAddress {
  if (typeof value !== "string") {
    const email = value.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new Error("Invalid email address");
    return { email, name: value.name?.trim() || undefined };
  }

  const input = value.trim();
  const match = input.match(/^(?:"?([^"]*)"?)?\\s*<([^>]+)>$/);
  const email = (match?.[2] ?? input).trim().toLowerCase();
  const name = match?.[2] ? (match[1] ?? "").trim() : undefined;
  if (!EMAIL_RE.test(email)) throw new Error("Invalid email address");
  return { email, name: name || undefined };
}

export function listAddresses(
  value?: string | string[] | MailAddress | MailAddress[],
): MailAddress[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) =>
    typeof item === "string" ? item.split(",").map(parseAddress) : [parseAddress(item)],
  );
}

export function formatAddress(value: MailAddress): string {
  return value.name ? `"${value.name.replace(/"/g, "'")}" <${value.email}>` : value.email;
}

export const REGISTRATION_EMAIL_DOMAINS = {
  google: ["gmail.com", "googlemail.com"],
  microsoft: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
  yahoo: ["yahoo.com", "yahoo.co.uk", "yahoo.ca", "yahoo.com.au", "ymail.com", "rocketmail.com"],
} as const;

const DOMAIN_TO_PROVIDER = new Map<string, keyof typeof REGISTRATION_EMAIL_DOMAINS>([
  ...REGISTRATION_EMAIL_DOMAINS.google.map((domain) => [domain, "google"] as const),
  ...REGISTRATION_EMAIL_DOMAINS.microsoft.map((domain) => [domain, "microsoft"] as const),
  ...REGISTRATION_EMAIL_DOMAINS.yahoo.map((domain) => [domain, "yahoo"] as const),
]);

export type RegistrationEmailProvider = keyof typeof REGISTRATION_EMAIL_DOMAINS;

export function normalizeRegistrationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateRegistrationEmail(email: string) {
  const normalized = normalizeRegistrationEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Please enter a valid email address.");
  }

  const domain = normalized.split("@")[1] ?? "";
  const provider = DOMAIN_TO_PROVIDER.get(domain);
  if (!provider) {
    throw new Error("ReDom only accepts Google, Microsoft, or Yahoo email addresses. Please enter an email ending in @gmail.com, @googlemail.com, @outlook.com, @hotmail.com, @live.com, @msn.com, @yahoo.com, @yahoo.co.uk, @yahoo.ca, @yahoo.com.au, @ymail.com, or @rocketmail.com.");
  }

  return { email: normalized, domain, provider };
}

export const registrationEmailDomainList = [
  ...REGISTRATION_EMAIL_DOMAINS.google,
  ...REGISTRATION_EMAIL_DOMAINS.microsoft,
  ...REGISTRATION_EMAIL_DOMAINS.yahoo,
] as const;

export const REGISTRATION_EMAIL_PROVIDERS = [
  {
    name: "Google",
    domains: ["@gmail.com", "@googlemail.com"],
  },
  {
    name: "Microsoft",
    domains: ["@outlook.com", "@hotmail.com", "@live.com", "@msn.com"],
  },
  {
    name: "Yahoo",
    domains: ["@yahoo.com", "@yahoo.co.uk", "@yahoo.ca", "@yahoo.com.au", "@ymail.com", "@rocketmail.com"],
  },
] as const;

export const REGISTRATION_EMAIL_DOMAINS = REGISTRATION_EMAIL_PROVIDERS.flatMap((provider) => [...provider.domains]);

export function normalizeRegistrationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getRegistrationEmailProvider(email: string) {
  const normalized = normalizeRegistrationEmail(email);
  const domain = normalized.includes("@") ? `@${normalized.split("@").pop() ?? ""}` : "";
  return REGISTRATION_EMAIL_PROVIDERS.find((provider) => provider.domains.includes(domain as never))?.name ?? null;
}

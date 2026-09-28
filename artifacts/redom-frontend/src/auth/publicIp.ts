import { getPublicIp } from "../lib/ipapi";

/**
 * Gets the handset's current public Internet address.
 *
 * Public-IP discovery is handled by the shared fallback chain in lib/ipapi.
 * This keeps the registration flow and startup flow on the same resilient
 * implementation and never exposes an IPAPI API key in the Expo bundle.
 */
export async function detectPublicIp(): Promise<string> {
  return getPublicIp();
}

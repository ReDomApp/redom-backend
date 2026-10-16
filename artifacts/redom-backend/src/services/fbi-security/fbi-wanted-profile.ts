/**
 * FBI Security — public FBI wanted-profile parser.
 * Isolated from the ReDom runtime. Reads one official profile in full and
 * extracts publicly published notice fields with source provenance.
 */
export const FBI_FRAUDSTERS_INDEX = "https://www.fbi.gov/wanted/most-wanted-fraudsters";
export type FbiWantedProfile = {
  sourceUrl: string; fetchedAt: string; title: string; aliases: string[];
  dateOfBirthUsed: string | null; placeOfBirth: string | null;
  hair: string | null; eyes: string | null; height: string | null;
  weight: string | null; sex: string | null; race: string | null;
  reward: { exactText: string | null; amountText: string | null; conditionsText: string | null };
  remarks: string | null; caution: string | null; fieldOffice: string | null;
  tipInstructions: string | null; fullVisibleText: string;
  profileLinks: string[]; extractionWarnings: string[];
};
const MAX_PAGE_BYTES = 2_000_000;
const TIMEOUT_MS = 15_000;
const FBI_HOST = "www.fbi.gov";

function assertFbiWantedUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== FBI_HOST ||
      url.username || url.password || url.port || !url.pathname.toLowerCase().startsWith("/wanted/")) {
    throw new Error("Only HTTPS pages under www.fbi.gov/wanted/ are accepted.");
  }
  return url;
}
function decodeEntities(value: string): string {
  return value.replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
}
function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|section|article|tr|dd|dt|th|td)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[\t\f\v ]+/g, " ").replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}
function escapeRegex(value: string): string {
  const special = new Set([".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]);
  return [...value].map((character) => special.has(character) ? "\\" + character : character).join("");
}
function captureSection(text: string, label: string, nextLabels: string[]): string | null {
  const start = new RegExp("(?:^|\\n)\\s*" + escapeRegex(label) + "\\s*:?\\s*", "i").exec(text);
  if (!start || start.index === undefined) return null;
  const from = start.index + start[0].length;
  let end = text.length;
  for (const next of nextLabels) {
    const match = new RegExp("\\n\\s*" + escapeRegex(next) + "\\s*:?\\s*", "i").exec(text.slice(from));
    if (match && match.index < end - from) end = from + match.index;
  }
  return text.slice(from, end).trim() || null;
}
function firstValue(text: string, label: string): string | null {
  const match = new RegExp("(?:^|\\n)\\s*" + escapeRegex(label) + "\\s*:?\\s*([^\\n]+)", "i").exec(text);
  return match?.[1]?.trim() || null;
}
function uniqueProfileLinks(html: string, base: URL): string[] {
  const results = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    try {
      const link = new URL(decodeEntities(match[1]), base);
      if (link.protocol === "https:" && link.hostname.toLowerCase() === FBI_HOST &&
          !link.username && !link.password && !link.port &&
          /^\/wanted\/(?:[^/]+\/){1,4}[^/]+\/?$/i.test(link.pathname) &&
          !/\/(?:index|search|most-wanted-fraudsters|ten-most-wanted-fugitives|fugitives)\/?$/i.test(link.pathname)) {
        link.hash = ""; results.add(link.toString());
      }
    } catch { /* Ignore malformed/off-host links. */ }
  }
  return [...results];
}
async function fetchHtml(url: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), { redirect: "error", signal: controller.signal,
      headers: { "user-agent": "FBI-Security-Public-Notice-Research/1.0", accept: "text/html,application/xhtml+xml" } });
    if (!response.ok) throw new Error("FBI page fetch failed with HTTP " + response.status);
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!type.includes("text/html") && !type.includes("xhtml")) throw new Error("FBI response was not HTML.");
    if (Number(response.headers.get("content-length") ?? 0) > MAX_PAGE_BYTES) throw new Error("FBI page exceeded size limit.");
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_PAGE_BYTES) throw new Error("FBI page exceeded size limit.");
    return html;
  } finally { clearTimeout(timer); }
}
/** Reads all visible text and extracts structured fields from one individual FBI profile. */
export async function readFbiWantedProfile(inputUrl: string): Promise<FbiWantedProfile> {
  const url = assertFbiWantedUrl(inputUrl);
  const html = await fetchHtml(url);
  return parseFbiWantedProfileHtml(html, url.toString());
}

/** Pure parser entry point used by fixtures and live-page validation. */
export function parseFbiWantedProfileHtml(html: string, inputUrl: string): FbiWantedProfile {
  const url = assertFbiWantedUrl(inputUrl);
  const fullVisibleText = htmlToText(html);
  const title = decodeEntities(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? "")
    .replace(/\s*[|—-]\s*(?:(?:the )?FBI|Federal Bureau of Investigation).*$/i, "").replace(/\s+/g, " ").trim();
  const value = (label: string) => firstValue(fullVisibleText, label);
  const reward = captureSection(fullVisibleText, "Reward", ["Remarks", "Caution", "Submit a Tip", "Field Office"]);
  const remarks = captureSection(fullVisibleText, "Remarks", ["Caution", "Submit a Tip", "Field Office"]);
  const caution = captureSection(fullVisibleText, "Caution", ["Submit a Tip", "Field Office"]);
  const tipInstructions = captureSection(fullVisibleText, "Submit a Tip", ["Field Office"]);
  const aliasText = value("Aliases");
  const aliases = aliasText ? aliasText.split(/\s*,\s*|\s*;\s*/).map(s => s.trim()).filter(Boolean) : [];
  const amount = reward?.match(/(?:up to\s*)?(?:\$|USD\s*)[0-9][0-9,]*(?:\.\d{2})?/i)?.[0] ?? null;
  const extractionWarnings: string[] = [];
  if (!title || title.split(/\s+/).length < 2) extractionWarnings.push("Person-name title needs manual review.");
  if (!reward) extractionWarnings.push("Reward section not extracted; inspect full source text.");
  if (!caution) extractionWarnings.push("Caution section not extracted; inspect full source text.");
  if (fullVisibleText.length < 500) extractionWarnings.push("Page text unexpectedly short; inspect extraction.");
  return {
    sourceUrl: url.toString(), fetchedAt: new Date().toISOString(), title, aliases,
    dateOfBirthUsed: value("Date(s) of Birth Used"), placeOfBirth: value("Place of Birth"),
    hair: value("Hair"), eyes: value("Eyes"), height: value("Height"), weight: value("Weight"),
    sex: value("Sex"), race: value("Race"),
    reward: { exactText: reward, amountText: amount, conditionsText: reward },
    remarks, caution, fieldOffice: value("Field Office"), tipInstructions,
    fullVisibleText, profileLinks: uniqueProfileLinks(html, url), extractionWarnings,
  };
}
/** Discovery is intentionally restricted to the one requested FBI category page. */
export async function discoverIndividualProfiles(indexUrl = FBI_FRAUDSTERS_INDEX): Promise<string[]> {
  const url = assertFbiWantedUrl(indexUrl);
  if (url.pathname !== "/wanted/most-wanted-fraudsters") {
    throw new Error("Discovery is restricted to the Most Wanted Fraudsters index.");
  }
  return uniqueProfileLinks(await fetchHtml(url), url);
}

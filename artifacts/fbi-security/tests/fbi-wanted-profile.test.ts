import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseFbiWantedProfileHtml, readFbiWantedProfile, discoverIndividualProfiles } from "../../redom-backend/src/services/fbi-security/fbi-wanted-profile.ts";

const fixturePath = fileURLToPath(new URL("./fixtures/imer-gomez-profile.html", import.meta.url));
const html = await readFile(fixturePath, "utf8");
const profileUrl = "https://www.fbi.gov/wanted/most-wanted-fraudsters/imer-gomez";

test("extracts the named subject and FBI-published aliases", () => {
  const profile = parseFbiWantedProfileHtml(html, profileUrl);
  assert.equal(profile.title, "IMER GOMEZ");
  assert.deepEqual(profile.aliases, ["Imer Abraham Gomez", "Abe Gomez", "Imer Tovar"]);
  assert.equal(profile.dateOfBirthUsed, "April 4, 1997");
  assert.equal(profile.placeOfBirth, "California");
});

test("extracts reward wording, amount and conditions without losing 'up to'", () => {
  const profile = parseFbiWantedProfileHtml(html, profileUrl);
  assert.match(profile.reward.exactText ?? "", /up to \$150,000/i);
  assert.equal(profile.reward.amountText, "up to $150,000");
  assert.match(profile.reward.conditionsText ?? "", /arrest and conviction/i);
});

test("extracts remarks and caution as separate sections", () => {
  const profile = parseFbiWantedProfileHtml(html, profileUrl);
  assert.match(profile.remarks ?? "", /citizen of the United States and of Mexico/i);
  assert.doesNotMatch(profile.remarks ?? "", /Ponzi scheme/i);
  assert.match(profile.caution ?? "", /Ponzi scheme/i);
  assert.match(profile.caution ?? "", /July 16, 2025/i);
});

test("keeps the full visible notice and only same-host individual profile links", () => {
  const profile = parseFbiWantedProfileHtml(html, profileUrl);
  assert.match(profile.fullVisibleText, /more than 400 individuals/i);
  assert.ok(profile.profileLinks.includes(profileUrl));
  assert.ok(profile.profileLinks.every((link) => new URL(link).hostname === "www.fbi.gov"));
  assert.ok(profile.profileLinks.every((link) => link.includes("/wanted/")));
  assert.ok(!profile.profileLinks.some((link) => link.includes("example.com")));
  assert.ok(!profile.profileLinks.some((link) => link.endsWith("/wanted/most-wanted-fraudsters")));
});

test("rejects off-host, non-HTTPS and non-wanted URLs", () => {
  assert.throws(() => parseFbiWantedProfileHtml(html, "https://example.com/wanted/person"));
  assert.throws(() => parseFbiWantedProfileHtml(html, "http://www.fbi.gov/wanted/person"));
  assert.throws(() => parseFbiWantedProfileHtml(html, "https://www.fbi.gov/news/press-release"));
});

test("optional live smoke test validates current FBI page markup", { skip: process.env.FBI_SECURITY_LIVE_SMOKE !== "1" }, async (t) => {
  let profile;
  try {
    profile = await readFbiWantedProfile(profileUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Do not bypass FBI.gov access controls when shared CI egress is blocked.
    if (/HTTP 403/.test(message)) {
      t.skip("FBI.gov returned HTTP 403 to this CI runner; live HTML was unavailable, so only the checked-in fixture was tested.");
      return;
    }
    throw error;
  }
  assert.equal(profile.title.toUpperCase(), "IMER GOMEZ");
  assert.ok(profile.fullVisibleText.length > 500, "full profile text should be extracted");
  assert.ok(profile.aliases.some((alias) => /Abe Gomez/i.test(alias)), "expected published alias should parse");
  assert.match(profile.reward.exactText ?? "", /\\$150,000/);
  assert.ok(profile.remarks, "remarks should parse");
  assert.ok(profile.caution, "caution should parse");
  const links = await discoverIndividualProfiles();
  assert.ok(links.includes(profileUrl), "index should link to the individual Imer Gomez profile");
});

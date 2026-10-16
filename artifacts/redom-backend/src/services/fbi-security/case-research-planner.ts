/**
 * FBI Security — case-scoped research planner.
 *
 * Converts an extracted official FBI notice into bounded public-record
 * research tasks. "Credentials" means publicly documented professional
 * registrations/claims and business records, never login secrets or restricted
 * identity, tax, banking, or account data.
 */
import type { FbiWantedProfile } from "./fbi-wanted-profile";

export type ResearchTask = {
  id: string;
  category:
    | "criminal_docket"
    | "civil_regulatory_case"
    | "business_registry"
    | "professional_registration"
    | "reward_verification"
    | "independent_reporting";
  objective: string;
  query: string;
  preferredDomains: string[];
  matchingKeys: string[];
  requiredEvidence: string[];
};

export type SourceFinding = {
  sourceTitle: string;
  sourceUrl: string;
  publisher: string;
  publicationDate: string | null;
  sourceType: "official_record" | "court_filing" | "regulator" | "reputable_reporting" | "other_public_source";
  matchedIdentifiers: string[];
  exactSupportedFact: string;
  claimStatus: "allegation" | "procedural_fact" | "court_finding" | "regulatory_finding" | "reporting" | "unresolved";
  confidence: "high" | "medium" | "low";
  limitations: string[];
};

export type RewardAudit = {
  officialAmountText: string | null;
  officialConditionsText: string | null;
  sourcesChecked: Array<{
    url: string;
    publisher: string;
    date: string | null;
    amountText: string | null;
    conditionsText: string | null;
    assessment: "agrees" | "conflicts" | "silent" | "unavailable";
  }>;
  verdict:
    | "VERIFIED_AGAINST_MULTIPLE_SOURCES"
    | "OFFICIAL_SOURCE_ONLY_NOT_INDEPENDENTLY_CORROBORATED"
    | "CONFLICTING_AMOUNTS_HUMAN_REVIEW_REQUIRED"
    | "NO_REWARD_STATED_IN_OFFICIAL_NOTICE"
    | "RESEARCH_INCOMPLETE";
};

export type CaseResearchPlan = {
  subjectName: string;
  officialProfileUrl: string;
  caseAnchor: string;
  knownAliases: string[];
  caseNumbers: string[];
  businessNames: string[];
  tasks: ResearchTask[];
  exclusions: string[];
};

const domains = {
  federalCourts: ["uscourts.gov", "courtlistener.com"],
  doj: ["justice.gov"],
  sec: ["sec.gov"],
  stateBusiness: ["official state secretary of state / corporation registry"],
  professional: ["adviserinfo.sec.gov", "brokercheck.finra.org", "sec.gov"],
  news: ["reuters.com", "apnews.com", "wsj.com", "nytimes.com"],
};

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}
function extractCaseNumbers(text: string): string[] {
  const candidates = text.match(/\b\d{1,2}:\d{2}-(?:cv|cr|mj|mc|md)-\d{3,6}\b/gi) ?? [];
  return [...new Set(candidates)];
}
function extractBusinessNames(text: string): string[] {
  const candidates = text.match(/\b[A-Z][A-Za-z0-9&'. -]{1,90}\b(?:LLC|L\.L\.C\.|Inc\.?|Corporation|Corp\.?|LP|LLP|Ltd\.?|Limited)\b/g) ?? [];
  return [...new Set(candidates.map(s => s.replace(/\s+/g, " ").trim()))].slice(0, 30);
}
function queryFor(profile: FbiWantedProfile, suffix: string): string {
  const aliases = profile.aliases.map(a => '"' + a.replace(/"/g, "") + '"').join(" OR ");
  const name = '"' + profile.title.replace(/"/g, "") + '"';
  const anchor = [name, aliases ? "(" + aliases + ")" : "", suffix].filter(Boolean).join(" ");
  return anchor.slice(0, 800);
}

export function buildCaseResearchPlan(profile: FbiWantedProfile): CaseResearchPlan {
  if (!profile.title || profile.title.split(/\s+/).length < 2) {
    throw new Error("Cannot plan research without a single-person name extracted from an FBI profile.");
  }
  const body = [profile.remarks, profile.caution, profile.fullVisibleText].filter(Boolean).join("\n");
  const caseNumbers = extractCaseNumbers(body);
  const businessNames = extractBusinessNames(body);
  const matchingKeys = [
    "exact published subject name: " + profile.title,
    ...profile.aliases.map(a => "FBI-published alias: " + a),
    ...caseNumbers.map(n => "case number: " + n),
    "same charge/case wording and jurisdiction from FBI notice",
    "overlapping filing dates and alleged conduct",
  ];
  const tasks: ResearchTask[] = [
    {
      id: "criminal-docket", category: "criminal_docket",
      objective: "Locate the criminal indictment and docket for this exact FBI case; extract charges, count descriptions, docket number, unsealing date, procedural status, and court orders.",
      query: queryFor(profile, "indictment criminal docket arrest warrant court"),
      preferredDomains: domains.federalCourts.concat(domains.doj),
      matchingKeys,
      requiredEvidence: ["official court or DOJ URL", "docket/case number", "filing date", "explicit link to the FBI-noticed case"],
    },
    {
      id: "civil-regulatory-case", category: "civil_regulatory_case",
      objective: "Find related SEC/DOJ/regulator complaints and orders; compare amounts, entities, dates and allegations without treating a complaint as a finding.",
      query: queryFor(profile, "SEC complaint civil enforcement DOJ case order"),
      preferredDomains: domains.sec.concat(domains.doj),
      matchingKeys,
      requiredEvidence: ["official complaint or release", "case number", "specific matching allegations/entities", "current procedural status if public"],
    },
    {
      id: "business-registry", category: "business_registry",
      objective: "Verify only business entities explicitly named in the FBI notice or directly matching a case filing. Capture legal name, jurisdiction, registration number, status and public officers when lawfully published.",
      query: queryFor(profile, businessNames.length ? businessNames.join(" OR ") : "company business registry corporate filing"),
      preferredDomains: domains.stateBusiness.concat(domains.sec),
      matchingKeys,
      requiredEvidence: ["official registry or regulator URL", "legal entity identifier", "jurisdiction", "match to a case filing or FBI notice"],
    },
    {
      id: "professional-registration", category: "professional_registration",
      objective: "Check public professional registrations or regulatory history only where relevant to claims made in this case. Record exact legal name, registration ID, status, dates and limitations; absence is not proof of misconduct.",
      query: queryFor(profile, "investment adviser registration broker dealer public regulatory record"),
      preferredDomains: domains.professional,
      matchingKeys,
      requiredEvidence: ["official regulator lookup", "correct identity and jurisdiction", "status and date", "scope limitations"],
    },
    {
      id: "reward-verification", category: "reward_verification",
      objective: "Compare the exact FBI reward amount, conditions and eligibility wording with other official releases and reliable independent reporting. Never infer an amount from unrelated penalties or damages.",
      query: queryFor(profile, "FBI reward official announcement"),
      preferredDomains: ["fbi.gov", "justice.gov", ...domains.news],
      matchingKeys,
      requiredEvidence: ["primary FBI wording", "amount and 'up to' qualifier", "conditions/eligibility if published", "independent comparison or explicit note that none was found"],
    },
    {
      id: "independent-reporting", category: "independent_reporting",
      objective: "Find reputable reporting about this same named subject and exact case; follow sources and linked documents only when they are relevant to this case.",
      query: queryFor(profile, "wire fraud indictment investment scheme court"),
      preferredDomains: domains.news.concat(domains.doj, domains.sec),
      matchingKeys,
      requiredEvidence: ["publication and date", "direct case identifier or matching named entity", "source citations", "clear separation of allegations and findings"],
    },
  ];
  return {
    subjectName: profile.title,
    officialProfileUrl: profile.sourceUrl,
    caseAnchor: [profile.title, ...profile.aliases, ...caseNumbers].join(" | "),
    knownAliases: profile.aliases,
    caseNumbers,
    businessNames,
    tasks,
    exclusions: [
      "Do not collect passwords, authentication tokens, account credentials, SSNs, tax records, bank/brokerage account data, private contact details, private addresses or precise private locations.",
      "Do not query restricted government systems or attempt access-control bypasses.",
      "Do not use people-search/data-broker profiles, family trees, relatives, or unrelated personal records.",
      "Do not treat name-only matches, similar photos, allegations, complaints or unverified AI claims as proof.",
      "Do not submit tips automatically; present source-linked evidence for authorized human review.",
    ],
  };
}

export function buildResearchInstructions(profile: FbiWantedProfile, plan: CaseResearchPlan): string {
  return [
    "ROLE: public-source case research assistant. This is not an official FBI system and must not imply FBI affiliation.",
    "SOLE DISCOVERY ANCHOR: " + profile.sourceUrl,
    "SUBJECT: " + profile.title,
    "FBI-PUBLISHED ALIASES: " + (profile.aliases.join("; ") || "None extracted"),
    "FULL EXTRACTED FBI NOTICE TEXT (preserve as source material; do not silently omit fields):",
    profile.fullVisibleText.slice(0, 18000),
    "RESEARCH PLAN JSON:",
    JSON.stringify(plan, null, 2),
    "PROCESS: Execute each research task separately. Search the wider public web only after reading the full FBI profile. Carry the exact subject/case identifiers into every query. Follow relevant linked court, regulator, company-registry and news sources. Store source title, URL, publisher, publication date, exact supported fact, identifiers that connect it to this case, claim status, confidence and limitations.",
    "MATCH RULE: a same-name result remains unresolved unless at least one strong case identifier or multiple independent matching details connect it to this same person and case. Do not merge records about different people.",
    "CREDENTIALS SCOPE: identify public professional credentials/registrations, publicly documented credential claims, and official business registrations relevant to the alleged conduct. Never obtain login credentials or restricted/private records.",
    "REWARD RULE: the primary FBI notice is authoritative for the advertised wording. Compare other sources; distinguish an official-only match from independent corroboration. 'Up to' is a maximum, not a guaranteed payout. Never mistake a civil penalty, restitution figure, damages demand, or forfeiture amount for a reward.",
    "LEGAL STATUS: separate allegations, charges, indictment, civil complaint, court findings, conviction and current procedural status. Date every status statement and do not imply that a charge is a conviction.",
    "OUTPUT: a case report for one person only, a timeline, source-by-source comparison, reward audit, public professional/business credential findings, discrepancies, unresolved matches and a human-review checklist.",
    "EXCLUSIONS: no SSNs, tax or bank records, passwords, account credentials, private home/contact data, relatives, family-tree/genealogy sources, data brokers, unrelated personal details, private account history, automated tip submission, confrontation, tracking or surveillance.",
  ].join("\n\n");
}

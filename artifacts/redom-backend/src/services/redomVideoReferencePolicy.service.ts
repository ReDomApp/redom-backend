import { randomUUID } from "node:crypto";

/**
 * Defensive policy gates for Movie Studio reference assets.
 * This validates the declared basis before an asset can be attached to a character.
 * It deliberately does not treat a watermark as consent or as a safety control.
 */
export type ReferenceRightsBasis = "original_creator" | "explicit_consent" | "licensed" | "public_domain" | "not_applicable";
export type ReferenceUse = "fictional_character" | "self" | "consenting_adult" | "licensed_performer" | "third_party_person" | "protected_character";
export type ReferenceDeclaration = {
  assetKey: string;
  rightsBasis: ReferenceRightsBasis;
  referenceUse: ReferenceUse;
  subjectIsAdult?: boolean;
  consentRecordId?: string;
  licenseRecordId?: string;
  attribution?: string;
};
export type ReferencePolicyResult = { allowed: true; auditId: string } | { allowed: false; code: string; message: string };

const NON_EMPTY = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/**
 * Fail closed on missing rights declarations. Consent/authorization is an auditable
 * declaration, not a claim that ReDom independently verified a person's identity.
 */
export function evaluateReferenceDeclaration(input: ReferenceDeclaration): ReferencePolicyResult {
  const auditId = "refpolicy_" + randomUUID().replace(/-/g, "");
  if (!NON_EMPTY(input.assetKey) || input.assetKey.length > 600) {
    return { allowed: false, code: "REFERENCE_ASSET_INVALID", message: "Choose a valid uploaded reference asset." };
  }
  if (input.referenceUse === "third_party_person") {
    if (!input.subjectIsAdult) {
      return { allowed: false, code: "REFERENCE_ADULT_CONSENT_REQUIRED", message: "References depicting another person require confirmation that the person is an adult and has explicitly consented to this use." };
    }
    if (input.rightsBasis !== "explicit_consent" || !NON_EMPTY(input.consentRecordId)) {
      return { allowed: false, code: "REFERENCE_CONSENT_REQUIRED", message: "This person reference cannot be used until an explicit-consent record is attached." };
    }
  }
  if (input.referenceUse === "consenting_adult" && (!input.subjectIsAdult || input.rightsBasis !== "explicit_consent" || !NON_EMPTY(input.consentRecordId))) {
    return { allowed: false, code: "REFERENCE_CONSENT_REQUIRED", message: "Confirm the adult subject's explicit consent and attach its record before using this reference." };
  }
  if (input.referenceUse === "licensed_performer" && (input.rightsBasis !== "licensed" || !NON_EMPTY(input.licenseRecordId))) {
    return { allowed: false, code: "REFERENCE_LICENSE_REQUIRED", message: "Attach a valid license record covering this performer's likeness and intended use." };
  }
  if (input.referenceUse === "protected_character" && input.rightsBasis !== "licensed" && input.rightsBasis !== "public_domain") {
    return { allowed: false, code: "CHARACTER_RIGHTS_REQUIRED", message: "This character reference needs documented authorization or a verified public-domain basis. Otherwise, create an original character inspired only by broad genre traits." };
  }
  if (input.rightsBasis === "licensed" && !NON_EMPTY(input.licenseRecordId)) {
    return { allowed: false, code: "REFERENCE_LICENSE_REQUIRED", message: "A license record is required for licensed references." };
  }
  if (input.rightsBasis === "explicit_consent" && !NON_EMPTY(input.consentRecordId)) {
    return { allowed: false, code: "REFERENCE_CONSENT_REQUIRED", message: "An explicit-consent record is required." };
  }
  return { allowed: true, auditId };
}

/** Stable defaults used by the dedicated episodic-cartoon planner. */
export const CARTOON_PRODUCTION_DEFAULTS = {
  format: "episodic_cartoon",
  characterSheetViews: ["front", "three_quarter", "profile", "back", "expression_sheet", "turnaround"],
  continuityFields: ["model_sheet_version", "costume_state", "prop_state", "palette", "proportions", "voice_profile", "injury_state", "location_state", "episode_story_state"],
  animationControls: ["frame_rate", "key_pose_density", "in_betweening", "squash_and_stretch", "anticipation", "follow_through", "camera_motion", "lip_sync", "loop_policy", "hold_frames"],
} as const;

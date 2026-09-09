import { api } from "../api/client";

export interface AiLocalizationResponse {
  language: string;
  translations: string[];
}

/**
 * Sends only visible UI strings to ReDom's backend localization boundary.
 * The OpenAI credential never enters the mobile application.
 */
export async function localizeUiTexts(
  language: string,
  texts: string[],
  context?: string,
): Promise<string[]> {
  const response = await api.post<AiLocalizationResponse>(
    "/ai/localize",
    { language, texts, context },
  );

  if (!Array.isArray(response.translations) || response.translations.length !== texts.length) {
    throw new Error("The localization service returned an invalid response.");
  }

  return response.translations;
}

/**
 * Moderates user-generated text through the backend before publication.
 * The client does not call OpenAI directly.
 */
export async function moderateText(text: string): Promise<{
  flagged: boolean;
  decision: "allow" | "block";
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
}> {
  return api.post("/ai/moderate", { text });
}

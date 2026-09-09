import { openai } from "../lib/openai";

export type SupportedLanguage = string;

export interface TranslationRequest {
  language: SupportedLanguage;
  texts: string[];
  context?: string;
}

export interface TranslationResponse {
  language: SupportedLanguage;
  translations: string[];
}

export interface ModerationResult {
  flagged: boolean;
  decision: "allow" | "block";
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
}

const MODEL = "gpt-5.6-luna";
const MAX_TEXTS = 100;
const MAX_TEXT_LENGTH = 2_000;
const MAX_MODERATION_LENGTH = 20_000;
const translationCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 2_000;

function cacheKey(language: string, text: string, context: string): string {
  return `${language}\u0000${context}\u0000${text}`;
}

function putCache(key: string, value: string): void {
  if (translationCache.size >= MAX_CACHE_ENTRIES) {
    const first = translationCache.keys().next().value;
    if (first) translationCache.delete(first);
  }
  translationCache.set(key, value);
}

function parseTranslationOutput(output: string): string[] {
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("OpenAI localization response was not an array.");
  }

  return parsed.map((value) => {
    if (typeof value !== "string") {
      throw new Error("OpenAI localization response contained a non-text value.");
    }
    return value;
  });
}

/**
 * Localizes only user-visible strings. Application logic, identifiers,
 * routes, code, placeholders, and backend behavior are never submitted
 * as translatable source material.
 */
export async function translateUiTexts({
  language,
  texts,
  context = "ReDom mobile app user interface",
}: TranslationRequest): Promise<TranslationResponse> {
  if (!language.trim()) throw new Error("language is required");
  if (texts.length === 0) return { language, translations: [] };
  if (texts.length > MAX_TEXTS) throw new Error(`A maximum of ${MAX_TEXTS} UI strings may be localized at once.`);

  const cleanTexts = texts.map((text) => {
    if (typeof text !== "string" || text.length === 0 || text.length > MAX_TEXT_LENGTH) {
      throw new Error(`Each UI string must contain 1-${MAX_TEXT_LENGTH} characters.`);
    }
    return text;
  });

  const translations = new Array<string>(cleanTexts.length);
  const pending: Array<{ index: number; text: string; key: string }> = [];

  cleanTexts.forEach((text, index) => {
    const key = cacheKey(language, text, context);
    const cached = translationCache.get(key);
    if (cached !== undefined) translations[index] = cached;
    else pending.push({ index, text, key });
  });

  if (pending.length > 0) {
    const response = await openai.responses.create({
      model: MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are ReDom's UI localization engine. Translate only the supplied visible interface strings into the requested language. Preserve meaning, product names such as ReDom, URLs, interpolation tokens such as {name}, numbers, punctuation intent, and accessibility meaning. Do not add explanations. Return a JSON array with exactly one translated string for each supplied string, in the same order. Never return code or modify non-visible application logic.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                targetLanguage: language,
                context,
                strings: pending.map(({ text }) => text),
              }),
            },
          ],
        },
      ],
    });

    const translated = parseTranslationOutput(response.output_text);
    if (translated.length !== pending.length) {
      throw new Error("OpenAI localization response length did not match the request.");
    }

    pending.forEach(({ index, key }, position) => {
      translations[index] = translated[position];
      putCache(key, translated[position]);
    });
  }

  return { language, translations };
}

/**
 * Server-side content moderation boundary for user-generated text.
 * Callers should run this before publishing content rather than relying
 * on client-side moderation.
 */
export async function moderateContent(text: string): Promise<ModerationResult> {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("Content is required for moderation.");
  }
  if (text.length > MAX_MODERATION_LENGTH) {
    throw new Error(`Content exceeds the ${MAX_MODERATION_LENGTH}-character moderation limit.`);
  }

  const response = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: text,
  });

  const result = response.results[0];
  if (!result) {
    throw new Error("OpenAI moderation returned no result.");
  }

  return {
    flagged: result.flagged,
    decision: result.flagged ? "block" : "allow",
    categories: result.categories as unknown as Record<string, boolean>,
    categoryScores: result.category_scores as unknown as Record<string, number>,
  };
}

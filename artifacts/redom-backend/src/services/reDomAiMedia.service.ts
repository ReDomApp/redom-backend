import { toFile } from "openai/uploads";
import { createHash } from "node:crypto";
import { openai } from "../lib/openai";

const IMAGE_MODEL = "gpt-image-2";
const TRANSCRIBE_MODEL = "gpt-4o-transcribe";

function userIdentifier(userId: string) { return createHash("sha256").update(userId).digest("hex"); }

function decodeDataUri(dataUri: string) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUri.trim());
  if (!match) throw new Error("Invalid audio data URI.");
  return { mimeType: match[1], bytes: Buffer.from(match[2], "base64") };
}

export async function generateReDomAiImage(userId: string, prompt: string) {
  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: "1024x1024",
    n: 1,
    user: userIdentifier(userId),
  });
  const image = response.data?.[0];
  if (!image?.b64_json) throw new Error("The image service did not return image data.");
  return { dataUri: `data:image/png;base64,${image.b64_json}`, model: IMAGE_MODEL };
}

export async function transcribeReDomAiVoice(userId: string, dataUri: string) {
  const { mimeType, bytes } = decodeDataUri(dataUri);
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error("Voice prompt is empty or too large.");
  const extension = mimeType.includes("wav") ? "wav" : mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : mimeType.includes("webm") ? "webm" : "bin";
  const file = await toFile(bytes, `redom-ai-voice.${extension}`, { type: mimeType });
  const response = await openai.audio.transcriptions.create({
    file,
    model: TRANSCRIBE_MODEL,
  });
  return { text: response.text.trim(), model: TRANSCRIBE_MODEL, safetyIdentifier: userIdentifier(userId) };
}

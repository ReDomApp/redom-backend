import { PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../config/env";
import { r2 } from "../lib/r2";

type AudioAsset = { key: string; durationSeconds: number; provider: string; model: string };
type VoiceClipInput = {
  userId: string;
  projectId: string;
  shotId: string;
  lineIndex: number;
  text: string;
  voiceId: string;
  languageCode?: string;
  previousText?: string;
  nextText?: string;
};
type MusicInput = {
  userId: string;
  projectId: string;
  trackName: string;
  prompt: string;
  durationSeconds: number;
  instrumental?: boolean;
  lyrics?: string;
  vocalStyle?: string;
};

function requireAudioProvider() {
  const apiKey = env.redomMovieAudio.elevenLabsApiKey;
  if (!apiKey) {
    throw Object.assign(new Error("ReDom Movie Audio is not configured. Set ELEVENLABS_API_KEY before producing dialogue, songs, or a soundtrack."), {
      status: 503,
      code: "MOVIE_AUDIO_PROVIDER_NOT_CONFIGURED",
    });
  }
  return apiKey;
}

async function uploadAudio(key: string, bytes: Buffer, metadata: Record<string, string>): Promise<void> {
  await r2.send(new PutObjectCommand({
    Bucket: env.cloudflare.r2.bucketName,
    Key: key,
    Body: bytes,
    ContentType: "audio/mpeg",
    CacheControl: "private, max-age=900",
    Metadata: metadata,
  }));
}

export async function createReDomMovieSpeechAsset(input: VoiceClipInput): Promise<AudioAsset & {
  voiceId: string;
  alignment: { characters?: string[]; character_start_times_seconds?: number[]; character_end_times_seconds?: number[] };
}> {
  const apiKey = requireAudioProvider();
  const text = input.text.trim().slice(0, 5000);
  if (!text) throw Object.assign(new Error("Dialogue text is empty."), { status: 400, code: "MOVIE_DIALOGUE_EMPTY" });
  const url = "https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(input.voiceId) +
    "/with-timestamps?output_format=mp3_44100_128";
  const response = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: env.redomMovieAudio.voiceModel,
      voice_settings: { stability: 0.48, similarity_boost: 0.78, style: 0.32, use_speaker_boost: true },
      ...(input.previousText ? { previous_text: input.previousText.slice(-500) } : {}),
      ...(input.nextText ? { next_text: input.nextText.slice(0, 500) } : {}),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw Object.assign(new Error("ReDom Voices could not synthesize dialogue (" + response.status + "): " + detail), {
      status: response.status === 429 ? 429 : 502,
      code: "MOVIE_VOICE_SYNTHESIS_FAILED",
    });
  }
  const payload = await response.json() as {
    audio_base64?: string;
    alignment?: { characters?: string[]; character_start_times_seconds?: number[]; character_end_times_seconds?: number[] };
    normalized_alignment?: { character_end_times_seconds?: number[] };
  };
  if (!payload.audio_base64) throw Object.assign(new Error("The voice provider returned no audio."), { status: 502, code: "MOVIE_VOICE_AUDIO_EMPTY" });
  const bytes = Buffer.from(payload.audio_base64, "base64");
  if (bytes.length < 256) throw Object.assign(new Error("The generated dialogue audio is unexpectedly small."), { status: 502, code: "MOVIE_VOICE_AUDIO_INVALID" });
  const key = `redom-ai/movie-audio/${input.userId}/${input.projectId}/shots/${input.shotId}/line-${input.lineIndex}.mp3`;
  await uploadAudio(key, bytes, { kind: "dialogue", voiceId: input.voiceId, projectId: input.projectId, shotId: input.shotId });
  const times = payload.alignment?.character_end_times_seconds || payload.normalized_alignment?.character_end_times_seconds || [];
  const durationSeconds = times.length ? Math.max(...times) : Math.max(1, text.split(/\\s+/).length / 2.5);
  return { key, durationSeconds, provider: "elevenlabs", model: env.redomMovieAudio.voiceModel, voiceId: input.voiceId, alignment: payload.alignment || {} };
}

export async function createReDomMovieMusicAsset(input: MusicInput): Promise<AudioAsset> {
  const apiKey = requireAudioProvider();
  const durationSeconds = Math.max(3, Math.min(300, Math.floor(input.durationSeconds)));
  const url = "https://api.elevenlabs.io/v1/music/stream?output_format=mp3_44100_128";
  const prompt = [
    input.prompt,
    input.instrumental === false ? "Include original sung vocals where lyrics are supplied; do not imitate any existing recording or known singer." : "Instrumental score only; no vocals.",
    input.vocalStyle ? "Singer profile: " + input.vocalStyle + ". This is a stylistic direction, not a guarantee of matching a spoken character voice." : "",
    "Create an original, professionally arranged cinematic soundtrack with intentional dynamics, emotional phrasing, clear transitions and a polished mix.",
  ].filter(Boolean).join("\n").slice(0, 4000);
  const body: Record<string, unknown> = {
    model_id: env.redomMovieAudio.musicModel,
    music_length_ms: durationSeconds * 1000,
  };
  if (input.instrumental === false && input.lyrics?.trim()) {
    body.composition_plan = {
      chunks: [{
        text: "[Verse]\n" + input.lyrics.trim().slice(0, 3000),
        durationMs: durationSeconds * 1000,
        positiveStyles: ["cinematic musical theatre", "clear lead vocal", "emotional storytelling", ...(input.vocalStyle ? [input.vocalStyle] : [])],
        negativeStyles: ["soundalike", "imitating a known singer"],
        contextAdherence: "high",
      }],
    };
  } else {
    body.prompt = prompt;
    body.force_instrumental = input.instrumental !== false;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw Object.assign(new Error("ReDom Music could not generate the requested track (" + response.status + "): " + detail), {
      status: response.status === 429 ? 429 : 502,
      code: "MOVIE_MUSIC_GENERATION_FAILED",
    });
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024) throw Object.assign(new Error("The music provider returned an unexpectedly small audio track."), { status: 502, code: "MOVIE_MUSIC_AUDIO_INVALID" });
  const safeName = input.trackName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "track";
  const key = `redom-ai/movie-audio/${input.userId}/${input.projectId}/music/${safeName}-${Date.now()}.mp3`;
  await uploadAudio(key, bytes, {
    kind: input.instrumental === false ? "song" : "score",
    projectId: input.projectId,
    provider: "elevenlabs",
    model: env.redomMovieAudio.musicModel,
  });
  return { key, durationSeconds, provider: "elevenlabs", model: env.redomMovieAudio.musicModel };
}

export async function listReDomMovieVoices() {
  const apiKey = requireAudioProvider();
  const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
    headers: { "xi-api-key": apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw Object.assign(new Error("ReDom Voices could not list available voices (" + response.status + ")."), {
      status: response.status === 429 ? 429 : 502,
      code: "MOVIE_VOICE_LIST_FAILED",
    });
  }
  const payload = await response.json() as { voices?: Array<Record<string, unknown>>; has_more?: boolean; next_page_token?: string };
  return {
    voices: (payload.voices || []).map((voice) => ({
      voiceId: typeof voice.voice_id === "string" ? voice.voice_id : "",
      name: typeof voice.name === "string" ? voice.name : "Unnamed voice",
      category: typeof voice.category === "string" ? voice.category : undefined,
      description: typeof voice.description === "string" ? voice.description : undefined,
      labels: voice.labels && typeof voice.labels === "object" ? voice.labels : {},
      previewUrl: typeof voice.preview_url === "string" ? voice.preview_url : undefined,
    })).filter((voice) => voice.voiceId),
    hasMore: payload.has_more === true,
    nextPageToken: typeof payload.next_page_token === "string" ? payload.next_page_token : undefined,
  };
}

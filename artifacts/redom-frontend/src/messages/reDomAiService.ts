import { api } from "../api/client";

export interface ReDomAiTurn { role: "user" | "assistant"; content: string; }
export interface ReDomAiImageQuota { entitlement: string; used: number; limit: number; remaining: number; resetAt: string; }\nexport interface ReDomAiImageResult { success: boolean; image: string; model: string; quota?: ReDomAiImageQuota; }
export interface ReDomAiVideoJob { jobId: string; status: "queued" | "processing" | "completed" | "failed" | "blocked"; runtime?: string; model?: string; operation?: "generate" | "cgi"; durationSeconds?: number; downloadUrl?: string | null; error?: string | null; }
export interface ReDomAiVoiceResult { success: boolean; text: string; model: string; }
export interface ReDomAiFileResult { success: boolean; reply: string; model: string; }
export interface ReDomAiVideoCreate { success: boolean; jobId: string; status: string; model: string; runtime: string; maxDurationSeconds: number; }

export type ReDomAiFeedbackReason = "Not relevant" | "Not accurate" | "Too repetitive" | "Harmful or offensive" | "Something else";

export const reDomAiService = {
  chat(message: string, history: ReDomAiTurn[] = [], language?: string, imageDataUri?: string) {
    return api.post<{ success: boolean; reply: string; model: string }>("/ai/chat", { message, history: history.slice(-20), ...(language ? { language } : {}), ...(imageDataUri ? { imageDataUri } : {}) });
  },
  generateImage(prompt: string) { return api.post<ReDomAiImageResult>("/ai/image", { prompt }); },
  editImage(imageDataUri: string, prompt: string) { return api.post<ReDomAiImageResult>("/ai/image/edit", { imageDataUri, prompt }); },
  transcribeVoice(dataUri: string) { return api.post<ReDomAiVoiceResult>("/ai/voice/transcribe", { dataUri }); },
  analyzeFile(dataUri: string, fileName: string, mimeType: string, prompt = "Analyze this file and summarize the important information.") { return api.post<ReDomAiFileResult>("/ai/file/analyze", { dataUri, fileName, mimeType, prompt }); },
  generateVideo(prompt: string, options: { operation?: "generate" | "cgi"; durationSeconds?: number; resolution?: "720p" | "1080p"; aspectRatio?: "16:9" | "9:16" | "1:1" } = {}) { return api.post<ReDomAiVideoCreate>("/ai/video", { prompt, ...options }); },
  getVideoJob(jobId: string) { return api.get<ReDomAiVideoJob>("/ai/video/" + encodeURIComponent(jobId)); },
  feedback(rating: "good" | "bad", reason?: ReDomAiFeedbackReason) { return api.post<{ success: boolean }>("/ai/feedback", { rating, ...(reason ? { reason } : {}) }); },
};

import { api } from "../api/client";

export interface ReDomAiTurn { role: "user" | "assistant"; content: string; }
export interface ReDomAiImageQuota { entitlement: string; used: number; limit: number; remaining: number; resetAt: string; }\nexport interface ReDomAiImageResult { success: boolean; image: string; model: string; quota?: ReDomAiImageQuota; }
export interface ReDomAiVideoJob { jobId: string; status: "queued" | "processing" | "completed" | "failed" | "blocked"; runtime?: string; model?: string; operation?: "generate" | "cgi"; durationSeconds?: number; downloadUrl?: string | null; error?: string | null; }
export interface ReDomAiVoiceResult { success: boolean; text: string; model: string; }
export interface ReDomAiFileResult { success: boolean; reply: string; model: string; }
export interface ReDomAiVideoCreate { success: boolean; jobId: string; status: string; model: string; runtime: string; maxDurationSeconds: number; }
export interface ReDomMovieProjectCreate { success: boolean; projectId: string; state: string; model: string; maxDurationSeconds: number; }
export interface ReDomMovieProject { success: boolean; project: Record<string, unknown>; entities: Array<Record<string, unknown>>; episodes: Array<Record<string, unknown>>; scenes: Array<Record<string, unknown>>; shots?: Array<Record<string, unknown>>; knowledge?: Array<Record<string, unknown>>; storyEvents?: Array<Record<string, unknown>>; storyArcs?: Array<Record<string, unknown>>; revisions?: Array<Record<string, unknown>>; research?: Array<Record<string, unknown>>; model: string; }

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
  createMovieProject(prompt: string, options: { duration?: number; quality?: "fast" | "standard" | "high" | "pro"; style?: string; aspectRatio?: "16:9" | "9:16" | "1:1"; audio?: boolean; voice?: boolean; title?: string } = {}) { return api.post<ReDomMovieProjectCreate>("/ai/video/projects", { prompt, ...options }); },
  planMovieProject(projectId: string) { return api.post<ReDomMovieProject>("/ai/video/projects/" + encodeURIComponent(projectId) + "/plan", {}); },
  getMovieProject(projectId: string) { return api.get<ReDomMovieProject>("/ai/video/projects/" + encodeURIComponent(projectId)); },
  reviseMovieProject(projectId: string, instruction: string) { return api.post<ReDomMovieProject>("/ai/video/projects/" + encodeURIComponent(projectId) + "/revise", { instruction }); },
  checkMovieContinuity(projectId: string) { return api.post<{ success: boolean; projectId: string; continuityVersion: number; warnings: Array<{ sceneId: string; message: string }> }>("/ai/video/projects/" + encodeURIComponent(projectId) + "/continuity/check", {}); },
  produceMovie(projectId: string) { return api.post<{ success: boolean; projectId: string; status: string; shotCount: number; model: string }>("/ai/video/projects/" + encodeURIComponent(projectId) + "/produce", {}); },
  feedback(rating: "good" | "bad", reason?: ReDomAiFeedbackReason) { return api.post<{ success: boolean }>("/ai/feedback", { rating, ...(reason ? { reason } : {}) }); },
};

import { api } from "../api/client";

export interface ReDomAiTurn { role: "user" | "assistant"; content: string; }
export interface ReDomAiImageResult { success: boolean; image: string; model: string; }
export interface ReDomAiVoiceResult { success: boolean; text: string; model: string; }
export interface ReDomAiFileResult { success: boolean; reply: string; model: string; }
export type ReDomAiFeedbackReason = "Not relevant" | "Not accurate" | "Too repetitive" | "Harmful or offensive" | "Something else";

export const reDomAiService = {
  chat(message: string, history: ReDomAiTurn[] = [], language?: string, imageDataUri?: string) {
    return api.post<{ success: boolean; reply: string; model: string }>("/ai/chat", { message, history: history.slice(-20), ...(language ? { language } : {}), ...(imageDataUri ? { imageDataUri } : {}) });
  },
  generateImage(prompt: string) { return api.post<ReDomAiImageResult>("/ai/image", { prompt }); },
  editImage(imageDataUri: string, prompt: string) { return api.post<ReDomAiImageResult>("/ai/image/edit", { imageDataUri, prompt }); },
  transcribeVoice(dataUri: string) { return api.post<ReDomAiVoiceResult>("/ai/voice/transcribe", { dataUri }); },
  analyzeFile(dataUri: string, fileName: string, mimeType: string, prompt = "Analyze this file and summarize the important information.") { return api.post<ReDomAiFileResult>("/ai/file/analyze", { dataUri, fileName, mimeType, prompt }); },
  feedback(rating: "good" | "bad", reason?: ReDomAiFeedbackReason) { return api.post<{ success: boolean }>("/ai/feedback", { rating, ...(reason ? { reason } : {}) }); },
};

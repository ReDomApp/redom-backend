import { api } from "../api/client";

export interface ReDomAiTurn { role: "user" | "assistant"; content: string; }
export interface ReDomAiImageResult { success: boolean; image: string; model: string; }
export interface ReDomAiVoiceResult { success: boolean; text: string; model: string; }
export type ReDomAiFeedbackReason = "Not relevant" | "Not accurate" | "Too repetitive" | "Harmful or offensive" | "Something else";

export const reDomAiService = {
  chat(message: string, history: ReDomAiTurn[] = [], language?: string, imageDataUri?: string) {
    return api.post<{ success: boolean; reply: string; model: string }>("/ai/chat", { message, history: history.slice(-20), ...(language ? { language } : {}), ...(imageDataUri ? { imageDataUri } : {}) });
  },
  generateImage(prompt: string) { return api.post<ReDomAiImageResult>("/ai/image", { prompt }); },
  transcribeVoice(dataUri: string) { return api.post<ReDomAiVoiceResult>("/ai/voice/transcribe", { dataUri }); },
  feedback(rating: "good" | "bad", reason?: ReDomAiFeedbackReason) { return api.post<{ success: boolean }>("/ai/feedback", { rating, ...(reason ? { reason } : {}) }); },
};

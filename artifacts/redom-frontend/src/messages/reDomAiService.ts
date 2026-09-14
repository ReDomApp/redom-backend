import { api } from "../api/client";

export interface ReDomAiTurn {
  role: "user" | "assistant";
  content: string;
}

export const reDomAiService = {
  chat(message: string, history: ReDomAiTurn[] = [], language?: string) {
    return api.post<{ success: boolean; reply: string; model: string }>("/ai/chat", {
      message,
      history: history.slice(-20),
      ...(language ? { language } : {}),
    });
  },
};

import { api } from "../api/client";

export interface ReDomAiReply {
  success: boolean;
  assistant: "ReDom AI";
  text: string;
  responseId: string;
  webSearchUsed: boolean;
}

export const aiService = {
  chat(message: string, previousResponseId?: string, sharedChatContext?: string) {
    return api.post<ReDomAiReply>("/ai/chat", {
      message,
      ...(previousResponseId ? { previousResponseId } : {}),
      ...(sharedChatContext ? { sharedChatContext } : {}),
    });
  },
};

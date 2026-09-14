import { api } from "../api/client";

export interface ChatContactInfo {
  profileId: string;
  displayName: string;
  bio?: string | null;
  profilePhoto?: string | null;
  website?: string | null;
  occupation?: string | null;
  education?: string | null;
  hometown?: string | null;
  currentCity?: string | null;
  verified: boolean;
  profileVisibility: string;
}

export const contactService = {
  getChatContactInfo(conversationId: string) {
    return api.get<{ success: boolean; conversationId: string; contact: ChatContactInfo; mediaCount: number; sharedLinkCount: number; sharedDocCount: number }>(`/messages/conversations/${encodeURIComponent(conversationId)}/contact-info`);
  },
};

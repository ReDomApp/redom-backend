import { api } from "../api/client";

export interface HomeFeedPost {
  id: string;
  shareId: string;
  content: string | null;
  type: string;
  publishedAt: string;
  authorId: string;
  firstName: string;
  lastName: string;
  username: string;
  publicId: string;
  profileId: string;
  profilePhoto: string | null;
}

export interface HomeFeedProfileSuggestion {
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  publicId: string;
  profileId: string;
  profilePhoto: string | null;
  currentCity: string | null;
  friendCount: number;
  followerCount: number;
}

export interface HomeFeedResult {
  success: boolean;
  refreshedAt: string;
  indexing: {
    provider: string;
    locationSource: string;
    approximate: boolean;
    location: { country: string | null; region: string | null; city: string | null; timezone: string | null };
  };
  posts: HomeFeedPost[];
  suggestedProfiles: HomeFeedProfileSuggestion[];
  friendStories: unknown[];
}

export const feedService = {
  async getHomeFeed(): Promise<HomeFeedResult> {
    return api.get<HomeFeedResult>(`/feed/home?refresh=${Date.now()}`);
  },
};

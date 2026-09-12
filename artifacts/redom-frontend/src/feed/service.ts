import { api } from "../api/client";

export type PostReactionType = "like" | "haha" | "sad" | "love";

export interface PostReactionSummary {
  // All visual reaction variants are counted together as Likes.
  total: number;
  top: Array<{ type: PostReactionType; count: number }>;
  counts: Record<PostReactionType, number>;
  myReaction: PostReactionType | null;
  visibleReactors: Array<{
    userId: string;
    firstName: string;
    lastName: string;
    username: string;
    profilePhoto: string | null;
    reactionType: string;
  }>;
  hiddenReactorCount: number;
}

export interface HomeFeedPost {
  id: string; shareId: string; content: string | null; type: string; visibility?: string; publishedAt: string;
  authorId: string; firstName: string; lastName: string; username: string; publicId: string; profileId: string;
  profilePhoto: string | null; verified?: boolean; commentsEnabled?: boolean; sharingEnabled?: boolean;
  media?: Array<Record<string, unknown>>; poll?: Record<string, unknown> | null;
  reactionSummary?: PostReactionSummary;
  relationship?: { type: string; label: string } | null;
  recommendation?: { type: string; label: string } | null;
}

export interface HomeFeedProfileSuggestion {
  userId: string; firstName: string; lastName: string; username: string; publicId: string; profileId: string;
  profilePhoto: string | null; currentCity: string | null; friendCount: number; followerCount: number;
}

export interface HomeFeedFriendStory {
  id: string; shareId: string; storyText: string | null; storyType: string; expiresAt: string;
  firstName: string; lastName: string; username: string; profilePhoto: string | null;
}

interface HomeFeedApiResponse {
  success: boolean;
  refreshedAt: string;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  indexing: HomeFeedResult["indexing"] & { weights?: Record<string, number> };
  stories: HomeFeedFriendStory[];
  friendSuggestions: HomeFeedProfileSuggestion[];
  posts: HomeFeedPost[];
}

export interface HomeFeedResult {
  success: boolean;
  refreshedAt: string;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  indexing: { provider: string; locationSource: string; approximate: boolean; location: { country: string | null; region: string | null; city: string | null; timezone: string | null } };
  posts: HomeFeedPost[];
  suggestedProfiles: HomeFeedProfileSuggestion[];
  friendStories: HomeFeedFriendStory[];
}

export const feedService = {
  async getHomeFeed(): Promise<HomeFeedResult> {
    const result = await api.get<HomeFeedApiResponse>(`/feed/home?refresh=${Date.now()}`);
    return {
      ...result,
      posts: result.posts ?? [],
      suggestedProfiles: result.friendSuggestions ?? [],
      friendStories: result.stories ?? [],
    };
  },
  async reactToPost(postId: string, reactionType: PostReactionType) {
    return api.post<{ success: boolean; state: string } & PostReactionSummary>("/feed/post-reaction", { postId, reactionType });
  },
  async getPostReactionSummary(postId: string) {
    return api.get<{ success: boolean } & PostReactionSummary>(`/feed/post-reaction/${postId}`);
  },
  async hidePost(postId: string, reason: string) {
    return api.post<{ success: boolean; hidden: boolean }>("/feed/post-hide", { postId, reason });
  },
  async unhidePost(postId: string) {
    return api.post<{ success: boolean; hidden: boolean }>("/feed/post-unhide", { postId });
  },
  async isFollowing(creatorUserId: string) {
    return api.get<{ success: boolean; following: boolean }>(`/feed/post-following?creatorUserId=${encodeURIComponent(creatorUserId)}`);
  },
  async unfollowCreator(creatorUserId: string) {
    return api.post<{ success: boolean; following: boolean; changed: boolean }>("/feed/post-unfollow", { creatorUserId });
  },
  async recordPostView(postId: string) {
    return api.post<{ success: boolean; counted: boolean }>("/feed/post-view", { postId });
  },
};

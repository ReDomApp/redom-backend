import { api } from "../api/client";
import { env } from "../config/env";

export type PostReactionType = "like" | "haha" | "sad" | "love";
export type CommentReactionType = PostReactionType;

export interface PostReactionSummary {
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

export interface CommentReactionSummary {
  total: number;
  top: Array<{ type: CommentReactionType; count: number }>;
  counts: Record<CommentReactionType, number>;
  myReaction: CommentReactionType | null;
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

export interface HomeFeedComment {
  id: string;
  postId: string;
  parentCommentId: string | null;
  publicId: string;
  content: string;
  edited: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  author: { userId: string; firstName: string; lastName: string; username: string; profilePhoto: string | null; verified: boolean };
  isCreatorComment: boolean;
  creatorBadge: string | null;
  reactionSummary: CommentReactionSummary;
  replyCount: number;
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

const mediaUri = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value === "__redom_default__") return `${env.apiBaseUrl}/profile/media/default.svg`;
  if (value.startsWith("profiles/")) return `${env.apiBaseUrl}/profile/media/file/${value.split("/").map(encodeURIComponent).join("/")}`;
  return value;
};

const normalizeReactionSummary = (summary: PostReactionSummary): PostReactionSummary => ({
  ...summary,
  visibleReactors: (summary.visibleReactors ?? []).map((reactor) => ({ ...reactor, profilePhoto: mediaUri(reactor.profilePhoto) })),
});

const normalizeComment = (comment: HomeFeedComment): HomeFeedComment => ({
  ...comment,
  author: { ...comment.author, profilePhoto: mediaUri(comment.author?.profilePhoto) },
  reactionSummary: normalizeReactionSummary(comment.reactionSummary),
});

const normalizePost = (post: HomeFeedPost): HomeFeedPost => ({
  ...post,
  profilePhoto: mediaUri(post.profilePhoto),
  media: (post.media ?? []).map((item) => ({
    ...item,
    objectKey: mediaUri(item.objectKey),
    thumbnailKey: mediaUri(item.thumbnailKey),
  })),
  reactionSummary: post.reactionSummary ? normalizeReactionSummary(post.reactionSummary) : post.reactionSummary,
});

export const feedService = {
  async getHomeFeed(): Promise<HomeFeedResult> {
    const result = await api.get<HomeFeedApiResponse>(`/feed/home?refresh=${Date.now()}`);
    return {
      ...result,
      posts: (result.posts ?? []).map(normalizePost),
      suggestedProfiles: (result.friendSuggestions ?? []).map((profile) => ({ ...profile, profilePhoto: mediaUri(profile.profilePhoto) })),
      friendStories: (result.stories ?? []).map((story) => ({ ...story, profilePhoto: mediaUri(story.profilePhoto) })),
    };
  },
  async reactToPost(postId: string, reactionType: PostReactionType) {
    const result = await api.post<{ success: boolean; state: string } & PostReactionSummary>("/feed/post-reaction", { postId, reactionType });
    return normalizeReactionSummary(result);
  },
  async getPostReactionSummary(postId: string) {
    const result = await api.get<{ success: boolean } & PostReactionSummary>(`/feed/post-reaction/${postId}`);
    return normalizeReactionSummary(result);
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
  async getComments(postId: string, limit = 50, before?: string) {
    const suffix = before ? `&before=${encodeURIComponent(before)}` : "";
    const result = await api.get<{ success: boolean; comments: HomeFeedComment[]; hasMore: boolean }>(`/comments/post/${postId}?limit=${limit}${suffix}`);
    return { ...result, comments: (result.comments ?? []).map(normalizeComment) };
  },
  async createComment(postId: string, content: string, parentCommentId?: string | null) {
    const result = await api.post<{ success: boolean; comment: HomeFeedComment }>(`/comments/post/${postId}`, { content, parentCommentId: parentCommentId ?? null });
    return { ...result, comment: normalizeComment(result.comment) };
  },
  async reactToComment(commentId: string, reactionType: CommentReactionType) {
    const result = await api.post<{ success: boolean } & CommentReactionSummary>(`/comments/${commentId}/reaction`, { reactionType });
    return normalizeReactionSummary(result);
  },
  async pinComment(commentId: string, pinned: boolean) {
    return api.post<{ success: boolean; pinned: boolean }>(`/comments/${commentId}/pin`, { pinned });
  },
  async editComment(commentId: string, content: string) {
    return api.patch<{ success: boolean }>(`/comments/${commentId}`, { content });
  },
  async deleteComment(commentId: string) {
    return api.delete<{ success: boolean }>(`/comments/${commentId}`);
  },
  async shareComment(commentId: string, destination = "external", externalPlatform?: string) {
    return api.post<{ success: boolean; shareId: string; url: string }>(`/comments/${commentId}/share`, { destination, externalPlatform });
  },
};

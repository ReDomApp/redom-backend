import { and, desc, eq, gt, inArray } from "drizzle-orm";

import { db } from "../../database/db";
import { stories } from "../../database/stories";
import { friends } from "../../database/friends";
import { following } from "../../database/following";
import { users } from "../../database/schema";
import { userProfiles } from "../../database/userProfiles";
import { checkIP } from "../../lib/ipapi";
import { feedIndexingService } from "./feed-indexing.service";

const SYSTEM_POSTS = [
  {
    id: "redom-system-welcome",
    shareId: "REDOM00001",
    content: "Welcome to ReDom — connect, share, discover people, communities, pages, videos and conversations.",
    type: "text",
    publishedAt: new Date().toISOString(),
    authorId: "system",
    firstName: "ReDom",
    lastName: "",
    username: "redom",
    publicId: "234000000000001",
    profileId: "system",
    profilePhoto: null,
  },
  {
    id: "redom-system-discover",
    shareId: "REDOM00002",
    content: "As ReDom grows, this feed will continuously index relevant public posts and recommendations for you.",
    type: "text",
    publishedAt: new Date().toISOString(),
    authorId: "system",
    firstName: "ReDom",
    lastName: "",
    username: "redom",
    publicId: "234000000000001",
    profileId: "system",
    profilePhoto: null,
  },
] as const;

export class HomeFeedService {
  async generate(params: { userId: string; ipAddress?: string }) {
    const index = await feedIndexingService.build(params.userId);

    let location = {
      country: index.anchorLogin.country,
      region: index.anchorLogin.region,
      city: index.anchorLogin.city,
      timezone: null as string | null,
    };

    if (!location.country && !location.region && !location.city && params.ipAddress) {
      try {
        const geo = await checkIP(params.ipAddress);
        location = {
          country: geo.location?.country ?? null,
          region: geo.location?.state ?? null,
          city: geo.location?.city ?? null,
          timezone: geo.location?.timezone ?? null,
        };
      } catch {
        // Current IP is only a first-feed fallback, never the established anchor.
      }
    }

    const friendshipRows = await db
      .select({ friendUserId: friends.friendUserId })
      .from(friends)
      .where(and(eq(friends.userId, params.userId), eq(friends.friendshipStatus, "active")))
      .limit(100);
    const friendUserIds = friendshipRows.map((row) => row.friendUserId);

    const followingRows = await db
      .select({ followingId: following.followingId })
      .from(following)
      .where(eq(following.userId, params.userId))
      .limit(100);
    const followingIds = followingRows.map((row) => row.followingId);
    const priorityUserIds = new Set([...friendUserIds, ...followingIds]);

    const indexedPosts = await feedIndexingService.rankPosts(params.userId, index, 100);
    const rankedPosts = indexedPosts
      .map((post) => ({
        ...post,
        socialPriority: priorityUserIds.has(post.authorId) ? 80 : 0,
      }))
      .sort((a, b) => (b.score + b.socialPriority) - (a.score + a.socialPriority))
      .slice(0, 40)
      .map(({ score: _score, socialPriority: _socialPriority, authorCity: _authorCity, ...post }) => post);

    const suggestedProfiles = await feedIndexingService.rankProfiles(params.userId, index, 10);

    let friendStories: Array<{
      id: string;
      shareId: string;
      storyText: string | null;
      storyType: string;
      expiresAt: Date;
      firstName: string;
      lastName: string;
      username: string;
      profilePhoto: string | null;
    }> = [];

    if (friendUserIds.length > 0) {
      const friendProfiles = await db
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(inArray(userProfiles.userId, friendUserIds));
      const friendProfileIds = friendProfiles.map((profile) => profile.id);

      if (friendProfileIds.length > 0) {
        friendStories = await db
          .select({
            id: stories.id,
            shareId: stories.shareId,
            storyText: stories.storyText,
            storyType: stories.storyType,
            expiresAt: stories.expiresAt,
            firstName: users.firstName,
            lastName: users.lastName,
            username: users.username,
            profilePhoto: userProfiles.profilePhoto,
          })
          .from(stories)
          .innerJoin(userProfiles, eq(stories.authorId, userProfiles.id))
          .innerJoin(users, eq(userProfiles.userId, users.id))
          .where(
            and(
              inArray(stories.authorId, friendProfileIds),
              eq(stories.deleted, false),
              eq(stories.moderationStatus, "approved"),
              gt(stories.expiresAt, new Date()),
            ),
          )
          .orderBy(desc(stories.createdAt))
          .limit(30);
      }
    }

    return {
      success: true,
      refreshedAt: new Date().toISOString(),
      indexing: {
        provider: "ReDom Indexing Engine",
        locationSource: index.anchorLogin.loginTime ? "first_login_history" : params.ipAddress ? "current_ip_fallback" : "unavailable",
        approximate: true,
        location,
        weights: {
          firstLoginHistory: 0.7,
          laterLoginHistory: 0.3,
        },
        behaviorSignals: {
          actions: ["comment", "share", "save", "like", "watch_video", "follow", "search"],
          interestsIndexed: index.interests.length,
          contentTypesIndexed: index.contentTypePreferences.length,
        },
        friendsIndexed: friendUserIds.length,
        followingIndexed: followingIds.length,
      },
      posts: rankedPosts.length > 0 ? rankedPosts : SYSTEM_POSTS,
      suggestedProfiles,
      friendStories,
    };
  }
}

export const homeFeedService = new HomeFeedService();

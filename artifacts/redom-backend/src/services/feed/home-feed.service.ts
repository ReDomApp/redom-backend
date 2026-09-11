import { and, desc, eq, ilike, inArray, ne, gt } from "drizzle-orm";

import { db } from "../../database/db";
import { posts } from "../../database/posts";
import { stories } from "../../database/stories";
import { friends } from "../../database/friends";
import { following } from "../../database/following";
import { users } from "../../database/schema";
import { userProfiles } from "../../database/userProfiles";
import { checkIP } from "../../lib/ipapi";

const SYSTEM_POSTS = [
  {
    id: "redom-system-welcome",
    shareId: null,
    content: "Welcome to ReDom — connect, share, discover people, communities, pages, videos and conversations.",
    type: "text",
    publishedAt: new Date().toISOString(),
    authorId: "system",
    firstName: "ReDom",
    lastName: "",
    username: "redom",
    publicId: null,
    profileId: "system",
    profilePhoto: null,
    system: true,
  },
  {
    id: "redom-system-discover",
    shareId: null,
    content: "As ReDom grows, this feed will continuously index relevant public posts and recommendations for you.",
    type: "text",
    publishedAt: new Date().toISOString(),
    authorId: "system",
    firstName: "ReDom",
    lastName: "",
    username: "redom",
    publicId: null,
    profileId: "system",
    profilePhoto: null,
    system: true,
  },
] as const;

export class HomeFeedService {
  async generate(params: { userId: string; ipAddress?: string }) {
    let location: { country: string | null; region: string | null; city: string | null; timezone: string | null } = {
      country: null,
      region: null,
      city: null,
      timezone: null,
    };

    if (params.ipAddress) {
      try {
        const geo = await checkIP(params.ipAddress);
        location = {
          country: geo.location?.country ?? null,
          region: geo.location?.state ?? null,
          city: geo.location?.city ?? null,
          timezone: geo.location?.timezone ?? null,
        };
      } catch {
        // Location is a ranking signal; feed delivery must remain available.
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

    const publicPosts = await db
      .select({
        id: posts.id,
        shareId: posts.shareId,
        content: posts.content,
        type: posts.type,
        publishedAt: posts.publishedAt,
        authorId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        publicId: users.publicId,
        profileId: users.profileId,
        profilePhoto: userProfiles.profilePhoto,
        currentCity: userProfiles.currentCity,
      })
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(posts.deleted, false), eq(posts.visibility, "public"), eq(users.accountStatus, "active")))
      .orderBy(desc(posts.publishedAt))
      .limit(100);

    const rankedPosts = publicPosts
      .map((post) => {
        let score = post.publishedAt.getTime() / 1_000_000_000;
        if (priorityUserIds.has(post.authorId)) score += 1000;
        if (location.city && post.currentCity && post.currentCity.toLowerCase() === location.city.toLowerCase()) score += 500;
        return { post, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map(({ post }) => ({ ...post, system: false }));

    const suggestionWhere = location.city
      ? and(
          ne(userProfiles.userId, params.userId),
          eq(userProfiles.profileVisibility, "public"),
          eq(users.accountStatus, "active"),
          ilike(userProfiles.currentCity, location.city),
        )
      : and(
          ne(userProfiles.userId, params.userId),
          eq(userProfiles.profileVisibility, "public"),
          eq(users.accountStatus, "active"),
        );

    const suggestedProfiles = await db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        publicId: users.publicId,
        profileId: users.profileId,
        profilePhoto: userProfiles.profilePhoto,
        currentCity: userProfiles.currentCity,
        friendCount: userProfiles.friendCount,
        followerCount: userProfiles.followerCount,
      })
      .from(userProfiles)
      .innerJoin(users, eq(userProfiles.userId, users.id))
      .where(suggestionWhere)
      .orderBy(desc(userProfiles.friendCount), desc(userProfiles.followerCount), desc(userProfiles.createdAt))
      .limit(10);

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
          .where(and(inArray(stories.authorId, friendProfileIds), eq(stories.deleted, false), eq(stories.moderationStatus, "approved"), gt(stories.expiresAt, new Date())))
          .orderBy(desc(stories.createdAt))
          .limit(30);
      }
    }

    return {
      success: true,
      refreshedAt: new Date().toISOString(),
      indexing: {
        provider: "ReDom",
        locationSource: params.ipAddress ? "ipapi" : "unavailable",
        approximate: Boolean(params.ipAddress),
        location,
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

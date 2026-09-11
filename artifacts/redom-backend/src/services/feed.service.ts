import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { db } from "../database/db";
import { users } from "../database/schema";
import { userProfiles } from "../database/userProfiles";
import { posts } from "../database/posts";
import { friends } from "../database/friends";
import { following } from "../database/following";
import { stories } from "../database/stories";
import { checkIP } from "../lib/ipapi";

const SYSTEM_POSTS = [
  {
    id: "redom-system-welcome",
    author: { displayName: "ReDom", username: "redom", profileId: "system" },
    content: "Welcome to ReDom — connect, share, discover people, communities, pages, videos and conversations.",
    type: "text",
    visibility: "public",
    publishedAt: new Date().toISOString(),
    system: true,
  },
  {
    id: "redom-system-discover",
    author: { displayName: "ReDom", username: "redom", profileId: "system" },
    content: "Your ReDom feed is getting ready for you. As people and communities join, your feed will continuously index relevant public posts and recommendations.",
    type: "text",
    visibility: "public",
    publishedAt: new Date().toISOString(),
    system: true,
  },
] as const;

export class FeedService {
  async generateHomeFeed(params: { userId: string; ipAddress?: string; limit?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 50);
    let city: string | null = null;
    let country: string | null = null;

    if (params.ipAddress) {
      try {
        const geo = await checkIP(params.ipAddress);
        city = geo.location?.city ?? null;
        country = geo.location?.country ?? null;
      } catch {
        // Location intelligence is a ranking signal, not a requirement for a feed response.
      }
    }

    const friendRows = await db.select({ friendUserId: friends.friendUserId })
      .from(friends)
      .where(and(eq(friends.userId, params.userId), eq(friends.friendshipStatus, "active")));
    const friendIds = friendRows.map((row) => row.friendUserId);

    const followingRows = await db.select({ followingId: following.followingId })
      .from(following)
      .where(eq(following.userId, params.userId));
    const followingIds = followingRows.map((row) => row.followingId);
    const priorityIds = new Set([...friendIds, ...followingIds]);

    const visibility = friendIds.length > 0
      ? or(eq(posts.visibility, "public"), and(eq(posts.visibility, "friends"), inArray(posts.userId, friendIds)))
      : eq(posts.visibility, "public");

    const rows = await db.select({
      id: posts.id,
      shareId: posts.shareId,
      content: posts.content,
      type: posts.type,
      visibility: posts.visibility,
      publishedAt: posts.publishedAt,
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      profileId: users.profileId,
      profilePhoto: userProfiles.profilePhoto,
      currentCity: userProfiles.currentCity,
    })
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(posts.deleted, false), visibility, gt(posts.publishedAt, new Date(0))))
      .orderBy(desc(posts.publishedAt))
      .limit(100);

    const rankedPosts = rows.map((row) => {
      let score = row.publishedAt.getTime() / 1_000_000_000;
      if (priorityIds.has(row.userId)) score += 1000;
      if (city && row.currentCity && row.currentCity.toLowerCase() === city.toLowerCase()) score += 500;
      if (country && row.currentCity) score += 10;
      return { row, score };
    }).sort((a, b) => b.score - a.score).slice(0, limit).map(({ row }) => ({
      id: row.id,
      shareId: row.shareId,
      author: {
        displayName: `${row.firstName} ${row.lastName}`.trim(),
        username: row.username,
        profileId: row.profileId,
        profilePhoto: row.profilePhoto,
      },
      content: row.content,
      type: row.type,
      visibility: row.visibility,
      publishedAt: row.publishedAt.toISOString(),
      system: false,
    }));

    const storyProfileIds = friendIds.length > 0
      ? (await db.select({ id: userProfiles.id }).from(userProfiles).where(inArray(userProfiles.userId, friendIds))).map((row) => row.id)
      : [];
    const storyRows = storyProfileIds.length > 0
      ? await db.select({
          id: stories.id,
          shareId: stories.shareId,
          storyType: stories.storyType,
          storyText: stories.storyText,
          expiresAt: stories.expiresAt,
          displayName: userProfiles.displayName,
          profilePhoto: userProfiles.profilePhoto,
          profileId: users.profileId,
          username: users.username,
        })
          .from(stories)
          .innerJoin(userProfiles, eq(stories.authorId, userProfiles.id))
          .innerJoin(users, eq(userProfiles.userId, users.id))
          .where(and(inArray(stories.authorId, storyProfileIds), eq(stories.deleted, false), eq(stories.moderationStatus, "approved"), gt(stories.expiresAt, new Date())))
          .orderBy(desc(stories.createdAt))
          .limit(25)
      : [];

    const suggestionRows = city
      ? await db.select({
          userId: users.id,
          profileId: users.profileId,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          profilePhoto: userProfiles.profilePhoto,
          currentCity: userProfiles.currentCity,
          followerCount: userProfiles.followerCount,
        })
          .from(userProfiles)
          .innerJoin(users, eq(userProfiles.userId, users.id))
          .where(eq(userProfiles.profileVisibility, "public"))
          .orderBy(desc(userProfiles.followerCount))
          .limit(25)
      : [];

    const suggestions = suggestionRows
      .filter((row) => row.userId !== params.userId && (!city || !row.currentCity || row.currentCity.toLowerCase() === city!.toLowerCase()))
      .slice(0, 10)
      .map((row) => ({
        userId: row.userId,
        profileId: row.profileId,
        username: row.username,
        displayName: `${row.firstName} ${row.lastName}`.trim(),
        profilePhoto: row.profilePhoto,
        currentCity: row.currentCity,
      }));

    return {
      success: true,
      indexing: {
        location: city || country ? { city, country, source: "ipapi", approximate: true } : null,
        friends: friendIds.length,
        following: followingIds.length,
      },
      stories: storyRows.map((row) => ({
        id: row.id,
        shareId: row.shareId,
        author: { displayName: row.displayName, username: row.username, profileId: row.profileId, profilePhoto: row.profilePhoto },
        storyType: row.storyType,
        storyText: row.storyText,
        expiresAt: row.expiresAt.toISOString(),
      })),
      suggestions,
      posts: rankedPosts.length > 0 ? rankedPosts : SYSTEM_POSTS,
    };
  }
}

export const feedService = new FeedService();

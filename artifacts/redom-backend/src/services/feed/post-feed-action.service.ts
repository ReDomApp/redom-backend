import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../database/db";
import { activityLog } from "../../database/activityLog";
import { following } from "../../database/following";
import { posts } from "../../database/posts";
import { userProfiles } from "../../database/userProfiles";
import { users } from "../../database/schema";

export const NOT_INTERESTED_REASONS = [
  "doesnt_match_my_interests",
  "scam",
  "sexual",
  "disturbing",
  "dont_like_creator",
  "other",
] as const;

export type NotInterestedReason = (typeof NOT_INTERESTED_REASONS)[number];

export class PostFeedActionService {
  async hidePost(userId: string, postId: string, reason: NotInterestedReason) {
    const post = await db.query.posts.findFirst({
      where: and(eq(posts.id, postId), eq(posts.deleted, false)),
      columns: { id: true, userId: true },
    });
    if (!post) throw new Error("Post not found.");

    const existing = await db.query.activityLog.findFirst({
      where: and(eq(activityLog.userId, userId), eq(activityLog.targetId, postId), eq(activityLog.targetType, "post"), eq(activityLog.activityType, "hide_post")),
      columns: { id: true },
    });

    if (!existing) {
      await db.insert(activityLog).values({
        userId,
        activityType: "hide_post",
        activityCategory: "feed",
        activityTitle: "Post hidden from feed",
        activityDescription: `Not interested reason: ${reason}`,
        targetId: postId,
        targetType: "post",
        status: "success",
        triggeredBy: "user",
        undoSupported: true,
        hidden: true,
        archived: false,
      });
    }

    // This choice is an explicit recommendation signal and is intentionally
    // stronger than a passive impression.
    await db.insert(activityLog).values({
      userId,
      activityType: "not_interested",
      activityCategory: "feed",
      activityTitle: "Not interested in post",
      activityDescription: `Selected ${reason}.`,
      targetId: postId,
      targetType: "post",
      status: "success",
      triggeredBy: "user",
      undoSupported: false,
      hidden: true,
      archived: false,
    });

    return { hidden: true, postId, reason };
  }

  async unhidePost(userId: string, postId: string) {
    await db.delete(activityLog).where(and(
      eq(activityLog.userId, userId),
      eq(activityLog.targetId, postId),
      eq(activityLog.targetType, "post"),
      eq(activityLog.activityType, "hide_post"),
    ));
    return { hidden: false, postId };
  }

  async getHiddenPostIds(userId: string) {
    const rows = await db.select({ postId: activityLog.targetId })
      .from(activityLog)
      .where(and(eq(activityLog.userId, userId), eq(activityLog.targetType, "post"), eq(activityLog.activityType, "hide_post"), eq(activityLog.status, "success")));
    return new Set(rows.map((row) => row.postId).filter(Boolean) as string[]);
  }

  async getFollowingState(userId: string, creatorUserId: string) {
    const row = await db.query.following.findFirst({
      where: and(eq(following.userId, userId), eq(following.followingId, creatorUserId)),
      columns: { id: true },
    });
    return Boolean(row);
  }

  async unfollowCreator(userId: string, creatorUserId: string) {
    if (userId === creatorUserId) throw new Error("You cannot unfollow yourself.");

    const relation = await db.query.following.findFirst({
      where: and(eq(following.userId, userId), eq(following.followingId, creatorUserId)),
      columns: { id: true },
    });
    if (!relation) return { following: false, changed: false };

    await db.delete(following).where(eq(following.id, relation.id));

    const creatorProfile = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, creatorUserId), columns: { id: true } });
    const viewerProfile = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, userId), columns: { id: true } });

    if (creatorProfile) {
      await db.update(userProfiles).set({ followerCount: sql`GREATEST(0, ${userProfiles.followerCount} - 1)`, updatedAt: new Date() }).where(eq(userProfiles.id, creatorProfile.id));
    }
    if (viewerProfile) {
      await db.update(userProfiles).set({ followingCount: sql`GREATEST(0, ${userProfiles.followingCount} - 1)`, updatedAt: new Date() }).where(eq(userProfiles.id, viewerProfile.id));
    }

    await db.insert(activityLog).values({
      userId,
      activityType: "unfollow",
      activityCategory: "feed",
      activityTitle: "Unfollowed creator",
      activityDescription: "Creator unfollowed from a post action menu.",
      targetId: creatorUserId,
      targetType: "profile",
      status: "success",
      triggeredBy: "user",
      undoSupported: true,
      hidden: true,
      archived: false,
    });

    return { following: false, changed: true };
  }
}

export const postFeedActionService = new PostFeedActionService();

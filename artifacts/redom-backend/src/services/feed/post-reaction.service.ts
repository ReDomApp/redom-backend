import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../database/db";
import { activityLog } from "../../database/activityLog";
import { friends } from "../../database/friends";
import { following } from "../../database/following";
import { posts } from "../../database/posts";
import { reactions } from "../../database/reactions";
import { userProfiles } from "../../database/userProfiles";
import { users } from "../../database/schema";

export const POST_REACTION_TYPES = ["like", "haha", "sad", "love"] as const;
export type PostReactionType = (typeof POST_REACTION_TYPES)[number];

const REACTION_EMOJIS: Record<PostReactionType, string> = {
  like: "👍",
  haha: "😂",
  sad: "😢",
  love: "❤️",
};

export class PostReactionService {
  private async getProfileId(userId: string): Promise<string> {
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
      columns: { id: true },
    });
    if (!profile) throw new Error("User profile not found.");
    return profile.id;
  }

  async react(userId: string, postId: string, reactionType: PostReactionType) {
    if (!POST_REACTION_TYPES.includes(reactionType)) throw new Error("Unsupported post reaction.");

    const post = await db.query.posts.findFirst({
      where: and(eq(posts.id, postId), eq(posts.deleted, false)),
      columns: { id: true },
    });
    if (!post) throw new Error("Post not found.");

    const reactorId = await this.getProfileId(userId);
    const existing = await db.query.reactions.findFirst({
      where: and(
        eq(reactions.reactorId, reactorId),
        eq(reactions.contentType, "post"),
        eq(reactions.contentId, postId),
      ),
    });

    let state: "added" | "switched" | "removed";

    if (!existing) {
      await db.insert(reactions).values({
        reactorId,
        contentType: "post",
        contentId: postId,
        reactionType,
        active: true,
        spamDetected: false,
        aiReviewed: false,
      });
      state = "added";
    } else if (existing.active && existing.reactionType === reactionType) {
      await db.update(reactions).set({ active: false, updatedAt: new Date() }).where(eq(reactions.id, existing.id));
      state = "removed";
    } else {
      await db.update(reactions).set({ reactionType, active: true, updatedAt: new Date() }).where(eq(reactions.id, existing.id));
      state = "switched";
    }

    await db.insert(activityLog).values({
      userId,
      activityType: state === "removed" ? "reaction_removed" : "reaction",
      activityCategory: "feed",
      activityTitle: state === "removed" ? "Removed post reaction" : `Reacted ${REACTION_EMOJIS[reactionType]} to post`,
      activityDescription: state === "switched" ? `Switched post reaction to ${reactionType}.` : `Post reaction: ${reactionType}.`,
      targetId: postId,
      targetType: "post",
      status: "success",
      triggeredBy: "user",
      undoSupported: true,
      hidden: true,
      archived: false,
    });

    return this.getSummary(userId, postId);
  }

  async getSummary(userId: string, postId: string) {
    const reactorProfileId = await this.getProfileId(userId);
    const rows = await db.select({
      id: reactions.id,
      reactorId: reactions.reactorId,
      reactionType: reactions.reactionType,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      profilePhoto: userProfiles.profilePhoto,
      userId: users.id,
    })
      .from(reactions)
      .innerJoin(userProfiles, eq(reactions.reactorId, userProfiles.id))
      .innerJoin(users, eq(userProfiles.userId, users.id))
      .where(and(
        eq(reactions.contentType, "post"),
        eq(reactions.contentId, postId),
        eq(reactions.active, true),
        eq(reactions.spamDetected, false),
      ));

    const counts: Record<PostReactionType, number> = { like: 0, haha: 0, sad: 0, love: 0 };
    for (const row of rows) {
      if (POST_REACTION_TYPES.includes(row.reactionType as PostReactionType)) counts[row.reactionType as PostReactionType] += 1;
    }

    const relationshipRows = await Promise.all([
      db.select({ userId: friends.friendUserId }).from(friends).where(and(eq(friends.userId, userId), eq(friends.friendshipStatus, "active"))).limit(500),
      db.select({ userId: following.followingId }).from(following).where(eq(following.userId, userId)).limit(500),
    ]);
    const visibleUserIds = new Set([...relationshipRows[0].map((r) => r.userId), ...relationshipRows[1].map((r) => r.userId), userId]);

    const orderedTypes = POST_REACTION_TYPES
      .filter((type) => counts[type] > 0)
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, 3);

    return {
      total: rows.length,
      top: orderedTypes.map((type) => ({ type, emoji: REACTION_EMOJIS[type], count: counts[type] })),
      counts,
      myReaction: rows.find((row) => row.userId === userId)?.reactionType ?? null,
      visibleReactors: rows
        .filter((row) => visibleUserIds.has(row.userId))
        .slice(0, 100)
        .map((row) => ({ userId: row.userId, firstName: row.firstName, lastName: row.lastName, username: row.username, profilePhoto: row.profilePhoto, reactionType: row.reactionType, emoji: REACTION_EMOJIS[row.reactionType as PostReactionType] ?? "" })),
      hiddenReactorCount: rows.filter((row) => !visibleUserIds.has(row.userId)).length,
      reactorProfileId,
    };
  }

  async getSummaries(userId: string, postIds: string[]) {
    const result = new Map<string, Awaited<ReturnType<PostReactionService["getSummary"]>>>();
    for (const postId of postIds) result.set(postId, await this.getSummary(userId, postId));
    return result;
  }
}

export const postReactionService = new PostReactionService();

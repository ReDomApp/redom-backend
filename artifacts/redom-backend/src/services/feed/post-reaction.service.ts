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
      await db.update(reactions)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(reactions.id, existing.id));
      state = "removed";
    } else {
      await db.update(reactions)
        .set({ reactionType, active: true, updatedAt: new Date() })
        .where(eq(reactions.id, existing.id));
      state = "switched";
    }

    // Every reaction variant is one Like engagement signal. The selected
    // visual variant is retained only so the UI can render the animation.
    await db.insert(activityLog).values({
      userId,
      activityType: state === "removed" ? "reaction_removed" : "reaction",
      activityCategory: "feed",
      activityTitle: state === "removed" ? "Removed post reaction" : "Liked post",
      activityDescription: state === "switched" ? "Switched post reaction." : "Post Like.",
      targetId: postId,
      targetType: "post",
      status: "success",
      triggeredBy: "user",
      undoSupported: true,
      hidden: true,
      archived: false,
    });

    return { state, ...(await this.getSummary(userId, postId)) };
  }

  private buildSummary(
    userId: string,
    rows: Array<{
      userId: string;
      firstName: string;
      lastName: string;
      username: string;
      profilePhoto: string | null;
      reactionType: string;
    }>,
    visibleUserIds: Set<string>,
  ): PostReactionSummary {
    const counts: Record<PostReactionType, number> = { like: 0, haha: 0, sad: 0, love: 0 };
    for (const row of rows) {
      if (POST_REACTION_TYPES.includes(row.reactionType as PostReactionType)) {
        counts[row.reactionType as PostReactionType] += 1;
      }
    }

    const orderedTypes = POST_REACTION_TYPES
      .filter((type) => counts[type] > 0)
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, 3);

    return {
      // All four visual variants contribute to the single Like total.
      total: rows.length,
      top: orderedTypes.map((type) => ({ type, count: counts[type] })),
      counts,
      myReaction: (rows.find((row) => row.userId === userId)?.reactionType as PostReactionType | undefined) ?? null,
      visibleReactors: rows.filter((row) => visibleUserIds.has(row.userId)).slice(0, 100),
      hiddenReactorCount: rows.filter((row) => !visibleUserIds.has(row.userId)).length,
    };
  }

  async getSummary(userId: string, postId: string): Promise<PostReactionSummary> {
    const summaries = await this.getSummaries(userId, [postId]);
    return summaries.get(postId) ?? {
      total: 0,
      top: [],
      counts: { like: 0, haha: 0, sad: 0, love: 0 },
      myReaction: null,
      visibleReactors: [],
      hiddenReactorCount: 0,
    };
  }

  async getSummaries(userId: string, postIds: string[]) {
    const result = new Map<string, PostReactionSummary>();
    if (!postIds.length) return result;

    const [rows, friendRows, followingRows] = await Promise.all([
      db.select({
        contentId: reactions.contentId,
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        profilePhoto: userProfiles.profilePhoto,
        reactionType: reactions.reactionType,
      })
        .from(reactions)
        .innerJoin(userProfiles, eq(reactions.reactorId, userProfiles.id))
        .innerJoin(users, eq(userProfiles.userId, users.id))
        .where(and(
          eq(reactions.contentType, "post"),
          inArray(reactions.contentId, postIds),
          eq(reactions.active, true),
          eq(reactions.spamDetected, false),
        )),
      db.select({ userId: friends.friendUserId })
        .from(friends)
        .where(and(eq(friends.userId, userId), eq(friends.friendshipStatus, "active")))
        .limit(500),
      db.select({ userId: following.followingId })
        .from(following)
        .where(eq(following.userId, userId))
        .limit(500),
    ]);

    const visibleUserIds = new Set([
      ...friendRows.map((row) => row.userId),
      ...followingRows.map((row) => row.userId),
      userId,
    ]);

    for (const postId of postIds) {
      const postRows = rows
        .filter((row) => row.contentId === postId)
        .map(({ contentId: _contentId, ...row }) => row);
      result.set(postId, this.buildSummary(userId, postRows, visibleUserIds));
    }

    return result;
  }
}

export const postReactionService = new PostReactionService();

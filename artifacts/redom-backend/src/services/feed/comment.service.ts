import { and, desc, eq, sql } from "drizzle-orm";
import { randomInt } from "node:crypto";

import { db } from "../../database/db";
import { comments } from "../../database/comments";
import { posts } from "../../database/posts";
import { reactions } from "../../database/reactions";
import { users } from "../../database/schema";
import { userProfiles } from "../../database/userProfiles";
import { notifications } from "../../database/notifications";
import { shares } from "../../database/shares";

export const COMMENT_REACTION_TYPES = ["like", "haha", "sad", "love"] as const;
export type CommentReactionType = (typeof COMMENT_REACTION_TYPES)[number];

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

function makePublicId() {
  return String(1000000000000000 + randomInt(0, 899999999999999));
}

function makeSlug(content: string) {
  const normalized = content
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110);
  return normalized || "comment";
}

function formatComment(row: any, summary: CommentReactionSummary) {
  return {
    id: row.id,
    postId: row.postId,
    parentCommentId: row.parentCommentId,
    publicId: row.publicId,
    content: row.content,
    edited: row.edited,
    pinned: row.pinned,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: {
      userId: row.authorId,
      firstName: row.firstName,
      lastName: row.lastName,
      username: row.username,
      profilePhoto: row.profilePhoto,
      verified: row.verified,
    },
    isCreatorComment: row.authorId === row.postAuthorId,
    creatorBadge: row.authorId === row.postAuthorId ? "Creator" : null,
    reactionSummary: summary,
    replyCount: row.replyCount,
  };
}

export class CommentService {
  private async getProfileId(userId: string) {
    const profile = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, userId), columns: { id: true } });
    if (!profile) throw new Error("User profile not found.");
    return profile.id;
  }

  private async getPost(postId: string) {
    const post = await db.query.posts.findFirst({
      where: and(eq(posts.id, postId), eq(posts.deleted, false)),
      columns: { id: true, userId: true, commentsEnabled: true },
    });
    if (!post) throw new Error("Post not found.");
    if (!post.commentsEnabled) throw new Error("Comments are disabled for this post.");
    return post;
  }

  private async getReactionSummary(userId: string, commentId: string): Promise<CommentReactionSummary> {
    const rows = await db.select({
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
      .where(and(eq(reactions.contentType, "comment"), eq(reactions.contentId, commentId), eq(reactions.active, true), eq(reactions.spamDetected, false)));

    const counts: Record<CommentReactionType, number> = { like: 0, haha: 0, sad: 0, love: 0 };
    for (const row of rows) if (COMMENT_REACTION_TYPES.includes(row.reactionType as CommentReactionType)) counts[row.reactionType as CommentReactionType] += 1;
    const top = COMMENT_REACTION_TYPES.filter((type) => counts[type] > 0).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
    const visibleIds = new Set([userId]);
    const friendRows = await db.execute(sql`SELECT friend_user_id AS "userId" FROM friends WHERE user_id = ${userId} AND friendship_status = 'active' LIMIT 500`);
    const followingRows = await db.execute(sql`SELECT following_id AS "userId" FROM following WHERE user_id = ${userId} LIMIT 500`);
    for (const row of friendRows.rows as Array<{ userId: string }>) visibleIds.add(row.userId);
    for (const row of followingRows.rows as Array<{ userId: string }>) visibleIds.add(row.userId);

    return {
      total: rows.length,
      top: top.map((type) => ({ type, count: counts[type] })),
      counts,
      myReaction: (rows.find((row) => row.userId === userId)?.reactionType as CommentReactionType | undefined) ?? null,
      visibleReactors: rows.filter((row) => visibleIds.has(row.userId)).slice(0, 100),
      hiddenReactorCount: rows.filter((row) => !visibleIds.has(row.userId)).length,
    };
  }

  async list(userId: string, postId: string, limit = 50, before?: string) {
    await this.getPost(postId);
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const where = before
      ? and(eq(comments.postId, postId), eq(comments.deleted, false), eq(comments.hidden, false), sql`${comments.createdAt} < ${new Date(before)}`)
      : and(eq(comments.postId, postId), eq(comments.deleted, false), eq(comments.hidden, false));

    const rows = await db.select({
      id: comments.id,
      postId: comments.postId,
      parentCommentId: comments.parentCommentId,
      publicId: comments.publicId,
      content: comments.content,
      edited: comments.edited,
      pinned: comments.pinned,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      replyCount: comments.replyCount,
      authorId: comments.authorId,
      postAuthorId: posts.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      profilePhoto: userProfiles.profilePhoto,
      verified: userProfiles.verified,
    })
      .from(comments)
      .innerJoin(posts, eq(comments.postId, posts.id))
      .innerJoin(users, eq(comments.authorId, users.id))
      .innerJoin(userProfiles, eq(comments.authorId, userProfiles.userId))
      .where(where)
      .orderBy(desc(comments.pinned), desc(comments.createdAt))
      .limit(boundedLimit);

    const summaries = await Promise.all(rows.map((row) => this.getReactionSummary(userId, row.id)));
    return { comments: rows.map((row, index) => formatComment(row, summaries[index])), hasMore: rows.length === boundedLimit };
  }

  async create(userId: string, postId: string, content: string, parentCommentId?: string | null) {
    const trimmed = content.trim();
    await this.getPost(postId);
    if (!trimmed || trimmed.length > 5000) throw new Error("Comment must contain 1-5000 characters.");

    let replyToUserId: string | null = null;
    if (parentCommentId) {
      const parent = await db.query.comments.findFirst({ where: and(eq(comments.id, parentCommentId), eq(comments.postId, postId), eq(comments.deleted, false)), columns: { id: true, authorId: true } });
      if (!parent) throw new Error("Parent comment not found.");
      replyToUserId = parent.authorId;
      await db.update(comments).set({ replyCount: sql`${comments.replyCount} + 1`, updatedAt: new Date() }).where(eq(comments.id, parentCommentId));
    }

    const inserted = await db.insert(comments).values({
      postId,
      authorId: userId,
      parentCommentId: parentCommentId ?? null,
      replyToUserId,
      publicId: makePublicId(),
      shareSlug: makeSlug(trimmed),
      content: trimmed,
    }).returning({ id: comments.id, publicId: comments.publicId });

    const commentId = inserted[0].id;
    if (replyToUserId && replyToUserId !== userId) {
      const [recipientProfile, actorProfile] = await Promise.all([
        db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, replyToUserId), columns: { id: true } }),
        db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, userId), columns: { id: true } }),
      ]);
      if (recipientProfile && actorProfile) {
        await db.insert(notifications).values({
          recipientUserId: recipientProfile.id,
          actorUserId: actorProfile.id,
          postId,
          commentId,
          notificationType: "comment_reply",
          title: "New reply",
          body: "Someone replied to your comment.",
          actionUrl: `/comments/${inserted[0].publicId}`,
          priority: "normal",
        });
      }
    }

    const result = await this.list(userId, postId, 100);
    return result.comments.find((comment) => comment.id === commentId);
  }

  async react(userId: string, commentId: string, reactionType: CommentReactionType) {
    if (!COMMENT_REACTION_TYPES.includes(reactionType)) throw new Error("Unsupported comment reaction.");
    const comment = await db.query.comments.findFirst({ where: and(eq(comments.id, commentId), eq(comments.deleted, false)), columns: { id: true } });
    if (!comment) throw new Error("Comment not found.");
    const reactorId = await this.getProfileId(userId);
    const existing = await db.query.reactions.findFirst({ where: and(eq(reactions.reactorId, reactorId), eq(reactions.contentType, "comment"), eq(reactions.contentId, commentId)) });
    if (!existing) await db.insert(reactions).values({ reactorId, contentType: "comment", contentId: commentId, reactionType, active: true, spamDetected: false, aiReviewed: false });
    else if (existing.active && existing.reactionType === reactionType) await db.update(reactions).set({ active: false, updatedAt: new Date() }).where(eq(reactions.id, existing.id));
    else await db.update(reactions).set({ reactionType, active: true, updatedAt: new Date() }).where(eq(reactions.id, existing.id));
    const summary = await this.getReactionSummary(userId, commentId);
    await db.update(comments).set({ likeCount: summary.total, updatedAt: new Date() }).where(eq(comments.id, commentId));
    return summary;
  }

  async pin(userId: string, commentId: string, pinned: boolean) {
    const row = await db.select({ id: comments.id, postAuthorId: posts.userId })
      .from(comments).innerJoin(posts, eq(comments.postId, posts.id)).where(eq(comments.id, commentId)).limit(1);
    if (!row[0]) throw new Error("Comment not found.");
    if (row[0].postAuthorId !== userId) throw new Error("Only the post creator can pin comments.");
    await db.update(comments).set({ pinned, updatedAt: new Date() }).where(eq(comments.id, commentId));
    return { pinned };
  }

  async edit(userId: string, commentId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 5000) throw new Error("Comment must contain 1-5000 characters.");
    const row = await db.query.comments.findFirst({ where: and(eq(comments.id, commentId), eq(comments.authorId, userId), eq(comments.deleted, false)), columns: { id: true } });
    if (!row) throw new Error("Comment not found or not owned by you.");
    await db.update(comments).set({ content: trimmed, edited: true, shareSlug: makeSlug(trimmed), updatedAt: new Date() }).where(eq(comments.id, commentId));
    return { success: true };
  }

  async remove(userId: string, commentId: string) {
    const row = await db.select({ id: comments.id, authorId: comments.authorId, postAuthorId: posts.userId })
      .from(comments).innerJoin(posts, eq(comments.postId, posts.id)).where(eq(comments.id, commentId)).limit(1);
    if (!row[0]) throw new Error("Comment not found.");
    if (row[0].authorId !== userId && row[0].postAuthorId !== userId) throw new Error("You cannot delete this comment.");
    await db.update(comments).set({ deleted: true, hidden: true, content: "", updatedAt: new Date() }).where(eq(comments.id, commentId));
    return { success: true };
  }

  async share(userId: string, commentId: string, destination: string, externalPlatform?: string) {
    const row = await db.select({ id: comments.id, publicId: comments.publicId, shareSlug: comments.shareSlug, postId: comments.postId })
      .from(comments).where(and(eq(comments.id, commentId), eq(comments.deleted, false))).limit(1);
    if (!row[0]) throw new Error("Comment not found.");
    const profileId = await this.getProfileId(userId);
    const shareId = String(randomInt(1000000000, 9999999999));
    await db.insert(shares).values({ sharerId: profileId, contentType: "comment", contentId: commentId, shareId, destination, externalPlatform: externalPlatform ?? null, validShare: true, spamDetected: false, aiReviewed: false });
    return { shareId, url: `/comments/${row[0].shareSlug}/@rtr_post/${row[0].postId}/${row[0].publicId}` };
  }
}

export const commentService = new CommentService();

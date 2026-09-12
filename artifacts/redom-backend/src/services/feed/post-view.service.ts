import { and, eq } from "drizzle-orm";

import { db } from "../../database/db";
import { activityLog } from "../../database/activityLog";
import { posts } from "../../database/posts";

export class PostViewService {
  async recordUniqueView(userId: string, postId: string) {
    const post = await db.query.posts.findFirst({
      where: and(eq(posts.id, postId), eq(posts.deleted, false)),
      columns: { id: true },
    });

    if (!post) {
      return { found: false, counted: false, viewCount: 0 };
    }

    const existing = await db.query.activityLog.findFirst({
      where: and(
        eq(activityLog.userId, userId),
        eq(activityLog.targetId, postId),
        eq(activityLog.targetType, "post"),
        eq(activityLog.activityType, "view_post"),
      ),
      columns: { id: true },
    });

    if (existing) {
      return { found: true, counted: false, viewCount: 1 };
    }

    await db.insert(activityLog).values({
      userId,
      activityType: "view_post",
      activityCategory: "feed",
      activityTitle: "Viewed post",
      activityDescription: "Post view counted once for recommendation indexing.",
      targetId: postId,
      targetType: "post",
      status: "success",
      triggeredBy: "user",
      undoSupported: false,
      hidden: true,
      archived: false,
    });

    return { found: true, counted: true, viewCount: 1 };
  }
}

export const postViewService = new PostViewService();

import { and, desc, eq, ilike, ne } from "drizzle-orm";

import { db } from "../../database/db";
import { posts } from "../../database/posts";
import { users } from "../../database/schema";
import { userProfiles } from "../../database/userProfiles";
import { checkIP } from "../../lib/ipapi";

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
        // Feed generation remains available when IP geolocation is temporarily unavailable.
      }
    }

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
      })
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(posts.deleted, false), eq(posts.visibility, "public"), eq(users.accountStatus, "active")))
      .orderBy(desc(posts.publishedAt))
      .limit(40);

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

    return {
      success: true,
      refreshedAt: new Date().toISOString(),
      indexing: {
        provider: "ReDom",
        locationSource: params.ipAddress ? "ipapi" : "unavailable",
        approximate: Boolean(params.ipAddress),
        location,
      },
      posts: publicPosts,
      suggestedProfiles,
      friendStories: [],
    };
  }
}

export const homeFeedService = new HomeFeedService();

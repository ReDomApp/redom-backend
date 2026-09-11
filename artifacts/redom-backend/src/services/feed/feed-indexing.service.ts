import { and, desc, eq, gt, inArray, ne, or } from "drizzle-orm";

import { db } from "../../database/db";
import { activityLog } from "../../database/activityLog";
import { loginHistory } from "../../database/loginHistory";
import { searchHistory } from "../../database/searchHistory";
import { posts } from "../../database/posts";
import { reactions } from "../../database/reactions";
import { userProfiles } from "../../database/userProfiles";
import { users } from "../../database/schema";
import { friends } from "../../database/friends";
import { following } from "../../database/following";

const ACTION_WEIGHT: Record<string, number> = {
  comment: 5,
  commented: 5,
  share: 4,
  shared: 4,
  save: 4,
  saved: 4,
  like: 3,
  liked: 3,
  reaction: 3,
  watch_video: 2,
  video_view: 2,
  follow: 2,
  search: 2,
  view_profile: 1,
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "are", "was", "what", "about",
  "have", "has", "into", "just", "more", "than", "they", "them", "their", "our", "not", "but", "all",
  "www", "com", "http", "https", "redom",
]);

function tokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .slice(0, 120);
}

function addInterest(map: Map<string, number>, values: string[], weight: number) {
  for (const value of values) map.set(value, (map.get(value) ?? 0) + weight);
}

function normalizeLocation(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase() || null;
}

function locationMatch(value: string | null | undefined, target: string | null): boolean {
  const left = normalizeLocation(value);
  return Boolean(left && target && (left === target || left.includes(target) || target.includes(left)));
}

export interface FeedIndex {
  anchorLogin: {
    country: string | null;
    region: string | null;
    city: string | null;
    loginTime: Date | null;
  };
  laterLocations: Array<{ country: string | null; region: string | null; city: string | null; loginTime: Date }>;
  locationMix: { anchorWeight: number; explorationWeight: number };
  interests: Array<{ token: string; score: number }>;
  contentTypePreferences: Array<{ type: string; score: number }>;
  source: "login_history_and_activity";
}

export class FeedIndexingService {
  async build(userId: string): Promise<FeedIndex> {
    const history = await db
      .select({
        country: loginHistory.country,
        region: loginHistory.region,
        city: loginHistory.city,
        loginTime: loginHistory.loginTime,
        hiddenByUser: loginHistory.hiddenByUser,
      })
      .from(loginHistory)
      .where(and(eq(loginHistory.userId, userId), eq(loginHistory.hiddenByUser, false)))
      .orderBy(loginHistory.loginTime);

    const usableHistory = history.filter((entry) => entry.country || entry.region || entry.city);
    const anchor = usableHistory[0] ?? null;
    const laterLocations = usableHistory.slice(1, 21).map((entry) => ({
      country: entry.country,
      region: entry.region,
      city: entry.city,
      loginTime: entry.loginTime,
    }));

    const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const activities = await db
      .select({
        activityType: activityLog.activityType,
        activityCategory: activityLog.activityCategory,
        activityTitle: activityLog.activityTitle,
        activityDescription: activityLog.activityDescription,
        targetType: activityLog.targetType,
        activityTime: activityLog.activityTime,
      })
      .from(activityLog)
      .where(and(eq(activityLog.userId, userId), eq(activityLog.hidden, false), eq(activityLog.archived, false), gt(activityLog.activityTime, since)))
      .orderBy(desc(activityLog.activityTime))
      .limit(2000);

    const searches = await db
      .select({
        searchQuery: searchHistory.searchQuery,
        searchType: searchHistory.searchType,
        searchCount: searchHistory.searchCount,
        createdAt: searchHistory.createdAt,
      })
      .from(searchHistory)
      .innerJoin(userProfiles, eq(searchHistory.userId, userProfiles.id))
      .where(and(eq(userProfiles.userId, userId), eq(searchHistory.active, true), eq(searchHistory.deleted, false), gt(searchHistory.createdAt, since)))
      .orderBy(desc(searchHistory.createdAt))
      .limit(500);

    const interestScores = new Map<string, number>();
    const contentTypeScores = new Map<string, number>();

    for (const activity of activities) {
      const actionWeight = ACTION_WEIGHT[activity.activityType.toLowerCase()] ?? 1;
      addInterest(interestScores, tokens(activity.activityTitle), actionWeight);
      addInterest(interestScores, tokens(activity.activityDescription), actionWeight * 0.6);
      if (activity.targetType) {
        const type = activity.targetType.toLowerCase();
        contentTypeScores.set(type, (contentTypeScores.get(type) ?? 0) + actionWeight);
      }
    }

    for (const search of searches) {
      const weight = Math.min(8, 2 + Math.max(0, search.searchCount - 1));
      addInterest(interestScores, tokens(search.searchQuery), weight);
      if (search.searchType && search.searchType !== "all") {
        const type = search.searchType.toLowerCase();
        contentTypeScores.set(type, (contentTypeScores.get(type) ?? 0) + weight);
      }
    }

    return {
      anchorLogin: {
        country: anchor?.country ?? null,
        region: anchor?.region ?? null,
        city: anchor?.city ?? null,
        loginTime: anchor?.loginTime ?? null,
      },
      laterLocations,
      locationMix: { anchorWeight: 0.7, explorationWeight: 0.3 },
      interests: [...interestScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80)
        .map(([token, score]) => ({ token, score })),
      contentTypePreferences: [...contentTypeScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([type, score]) => ({ type, score })),
      source: "login_history_and_activity",
    };
  }

  async getRelationshipIds(userId: string) {
    const [friendRows, followingRows] = await Promise.all([
      db.select({ friendUserId: friends.friendUserId })
        .from(friends)
        .where(and(eq(friends.userId, userId), eq(friends.friendshipStatus, "active")))
        .limit(500),
      db.select({ followingId: following.followingId })
        .from(following)
        .where(eq(following.userId, userId))
        .limit(500),
    ]);

    return {
      friendUserIds: friendRows.map((row) => row.friendUserId),
      followingUserIds: followingRows.map((row) => row.followingId),
    };
  }

  async rankProfiles(userId: string, index: FeedIndex, limit = 10) {
    const candidates = await db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        publicId: users.publicId,
        profileId: users.profileId,
        profilePhoto: userProfiles.profilePhoto,
        currentCity: userProfiles.currentCity,
        bio: userProfiles.bio,
        occupation: userProfiles.occupation,
        education: userProfiles.education,
        friendCount: userProfiles.friendCount,
        followerCount: userProfiles.followerCount,
      })
      .from(userProfiles)
      .innerJoin(users, eq(userProfiles.userId, users.id))
      .where(and(ne(userProfiles.userId, userId), eq(userProfiles.profileVisibility, "public"), eq(users.accountStatus, "active")))
      .orderBy(desc(userProfiles.friendCount), desc(userProfiles.followerCount), desc(userProfiles.createdAt))
      .limit(300);

    if (!candidates.length) return [];

    const candidateIds = candidates.map((candidate) => candidate.userId);
    const candidateLogins = await db
      .select({ userId: loginHistory.userId, country: loginHistory.country, region: loginHistory.region, city: loginHistory.city, loginTime: loginHistory.loginTime })
      .from(loginHistory)
      .where(and(inArray(loginHistory.userId, candidateIds), eq(loginHistory.hiddenByUser, false)))
      .orderBy(loginHistory.loginTime);

    const firstLocationByUser = new Map<string, typeof candidateLogins[number]>();
    for (const login of candidateLogins) {
      if (!firstLocationByUser.has(login.userId) && (login.country || login.region || login.city)) firstLocationByUser.set(login.userId, login);
    }

    const { friendUserIds, followingUserIds } = await this.getRelationshipIds(userId);
    const friendSet = new Set(friendUserIds);
    const followingSet = new Set(followingUserIds);
    const anchorCountry = normalizeLocation(index.anchorLogin.country);
    const anchorRegion = normalizeLocation(index.anchorLogin.region);
    const anchorCity = normalizeLocation(index.anchorLogin.city);
    const laterCountries = new Set(index.laterLocations.map((location) => normalizeLocation(location.country)).filter(Boolean) as string[]);
    const interestMap = new Map(index.interests.map((interest) => [interest.token, interest.score]));

    const scored = candidates.map((candidate) => {
      const candidateLocation = firstLocationByUser.get(candidate.userId);
      const candidateCountry = normalizeLocation(candidateLocation?.country);
      const candidateRegion = normalizeLocation(candidateLocation?.region);
      const candidateCity = normalizeLocation(candidateLocation?.city);

      let anchorGeo = 0;
      if (anchorCountry && candidateCountry === anchorCountry) anchorGeo += 0.55;
      if (anchorRegion && candidateRegion === anchorRegion) anchorGeo += 0.20;
      if (anchorCity && candidateCity === anchorCity) anchorGeo += 0.25;
      const laterGeo = laterCountries.has(candidateCountry ?? "") ? 1 : candidateCountry && candidateCountry !== anchorCountry ? 0.5 : 0;
      const geoScore = anchorGeo * 0.7 + laterGeo * 0.3;

      const text = tokens([candidate.bio, candidate.occupation, candidate.education, candidate.currentCity, candidate.username].filter(Boolean).join(" "));
      let behaviorScore = 0;
      for (const token of text) behaviorScore += interestMap.get(token) ?? 0;
      behaviorScore = Math.min(1, behaviorScore / 25);

      const relationshipBoost = friendSet.has(candidate.userId) ? 1 : followingSet.has(candidate.userId) ? 0.7 : 0;
      return {
        ...candidate,
        score: geoScore * 0.7 + behaviorScore * 0.3 + relationshipBoost,
        suggestionType: friendSet.has(candidate.userId) ? "friend" : followingSet.has(candidate.userId) ? "following" : "friend_suggestion",
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ score: _score, ...profile }) => profile);
  }

  async rankPosts(userId: string, index: FeedIndex, limit = 80) {
    const { friendUserIds, followingUserIds } = await this.getRelationshipIds(userId);
    const friendSet = new Set(friendUserIds);
    const followingSet = new Set(followingUserIds);

    const visibilityConditions = [
      eq(posts.visibility, "public"),
      friendUserIds.length ? and(eq(posts.visibility, "friends"), inArray(posts.userId, friendUserIds)) : undefined,
      followingUserIds.length ? and(eq(posts.visibility, "followers"), inArray(posts.userId, followingUserIds)) : undefined,
    ].filter(Boolean) as Array<any>;

    const candidates = await db
      .select({
        id: posts.id,
        shareId: posts.shareId,
        content: posts.content,
        type: posts.type,
        visibility: posts.visibility,
        commentsEnabled: posts.commentsEnabled,
        sharingEnabled: posts.sharingEnabled,
        publishedAt: posts.publishedAt,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        authorId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        publicId: users.publicId,
        profileId: users.profileId,
        profilePhoto: userProfiles.profilePhoto,
        authorCity: userProfiles.currentCity,
      })
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(posts.deleted, false), eq(users.accountStatus, "active"), or(...visibilityConditions)))
      .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
      .limit(500);

    const interacted = await db
      .select({ contentId: reactions.contentId })
      .from(reactions)
      .innerJoin(userProfiles, eq(reactions.reactorId, userProfiles.id))
      .where(and(eq(userProfiles.userId, userId), eq(reactions.active, true)))
      .limit(2000);
    const interactedIds = new Set(interacted.map((row) => row.contentId));

    const interestMap = new Map(index.interests.map((interest) => [interest.token, interest.score]));
    const typeMap = new Map(index.contentTypePreferences.map((item) => [item.type, item.score]));
    const anchorCountry = normalizeLocation(index.anchorLogin.country);
    const anchorRegion = normalizeLocation(index.anchorLogin.region);
    const anchorCity = normalizeLocation(index.anchorLogin.city);
    const laterCountries = new Set(index.laterLocations.map((location) => normalizeLocation(location.country)).filter(Boolean) as string[]);

    const scored = candidates.map((post) => {
      const postTokens = tokens(post.content);
      let behavior = typeMap.get(post.type.toLowerCase()) ?? 0;
      for (const token of postTokens) behavior += interestMap.get(token) ?? 0;
      const behaviorScore = Math.min(1, behavior / 30);

      const sameAnchorCountry = Boolean(anchorCountry && post.authorCity && normalizeLocation(post.authorCity) === anchorCountry);
      const sameAnchorRegion = Boolean(anchorRegion && locationMatch(post.authorCity, anchorRegion));
      const sameAnchorCity = Boolean(anchorCity && locationMatch(post.authorCity, anchorCity));
      const anchorGeo = (sameAnchorCountry ? 0.55 : 0) + (sameAnchorRegion ? 0.20 : 0) + (sameAnchorCity ? 0.25 : 0);
      const laterGeo = laterCountries.has(normalizeLocation(post.authorCity) ?? "") ? 1 : 0;
      const geoScore = anchorGeo * 0.7 + laterGeo * 0.3;

      const freshnessHours = Math.max(0, (Date.now() - post.publishedAt.getTime()) / 3600000);
      const freshnessScore = Math.max(0, 1 - freshnessHours / 168);
      const relationshipScore = friendSet.has(post.authorId) ? 1 : followingSet.has(post.authorId) ? 0.75 : 0;
      const relevance = behaviorScore + geoScore + freshnessScore * 0.25;
      const isDirectRelationship = relationshipScore > 0;
      const recommended = !isDirectRelationship && behaviorScore > 0;

      return {
        ...post,
        score: relevance + relationshipScore,
        recommended,
        source: friendSet.has(post.authorId) ? "friend" : followingSet.has(post.authorId) ? "following" : recommended ? "recommended" : "public",
        sourceLabel: friendSet.has(post.authorId)
          ? `${post.firstName} is your friend`
          : followingSet.has(post.authorId)
            ? `You follow this page`
            : recommended
              ? "Suggested post that matches your preferences"
              : null,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    // Do not let one author dominate a feed page.
    const authorCounts = new Map<string, number>();
    const selected: typeof scored = [];
    for (const post of scored) {
      const count = authorCounts.get(post.authorId) ?? 0;
      if (count >= 3) continue;
      authorCounts.set(post.authorId, count + 1);
      selected.push(post);
      if (selected.length >= limit) break;
    }

    return selected.map(({ score: _score, ...post }) => post);
  }
}

export const feedIndexingService = new FeedIndexingService();

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
import { feedPreferences } from "../../database/feedPreferences";

const ACTION_WEIGHT: Record<string, number> = {
  comment: 5, commented: 5, share: 4, shared: 4, save: 4, saved: 4,
  like: 3, liked: 3, reaction: 3, watch_video: 2, video_view: 2,
  follow: 2, search: 2, view_profile: 1,
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "are", "was", "what", "about",
  "have", "has", "into", "just", "more", "than", "they", "them", "their", "our", "not", "but", "all",
  "www", "com", "http", "https", "redom",
]);

function tokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter((token) => token.length >= 3 && !STOP_WORDS.has(token)).slice(0, 120);
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

function watchedForAtLeastTenSeconds(value: string | null | undefined): boolean {
  if (!value) return false;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/i);
  return Boolean(match && Number(match[1]) >= 10);
}

export interface FeedIndex {
  anchorLogin: { country: string | null; region: string | null; city: string | null; loginTime: Date | null };
  laterLocations: Array<{ country: string | null; region: string | null; city: string | null; loginTime: Date }>;
  locationMix: { anchorWeight: number; explorationWeight: number };
  interests: Array<{ token: string; score: number }>;
  contentTypePreferences: Array<{ type: string; score: number }>;
  authorAffinity: Array<{ userId: string; score: number; likes: number; qualifyingVideoWatches: number }>;
  preferences: {
    homeFeedEnabled: boolean;
    followingFeedEnabled: boolean;
    videosFeedEnabled: boolean;
    personalizedRecommendationsEnabled: boolean;
    recommendationEligible: boolean;
    recommendationRestricted: boolean;
    friendsPriority: number;
    followingPriority: number;
    trendingPriority: number;
    newestPriority: number;
    infiniteFeedEnabled: boolean;
  };
  source: "login_history_and_activity";
}

export class FeedIndexingService {
  async build(userId: string): Promise<FeedIndex> {
    const history = await db.select({
      country: loginHistory.country, region: loginHistory.region, city: loginHistory.city,
      loginTime: loginHistory.loginTime, hiddenByUser: loginHistory.hiddenByUser,
    }).from(loginHistory).where(and(eq(loginHistory.userId, userId), eq(loginHistory.hiddenByUser, false))).orderBy(loginHistory.loginTime);

    const usableHistory = history.filter((entry) => entry.country || entry.region || entry.city);
    const anchor = usableHistory[0] ?? null;
    const laterLocations = usableHistory.slice(1, 21).map((entry) => ({ country: entry.country, region: entry.region, city: entry.city, loginTime: entry.loginTime }));

    const profile = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    const preferencesRow = profile.length ? await db.select({
      homeFeedEnabled: feedPreferences.homeFeedEnabled,
      followingFeedEnabled: feedPreferences.followingFeedEnabled,
      videosFeedEnabled: feedPreferences.videosFeedEnabled,
      personalizedRecommendationsEnabled: feedPreferences.personalizedRecommendationsEnabled,
      recommendationEligible: feedPreferences.recommendationEligible,
      recommendationRestricted: feedPreferences.recommendationRestricted,
      friendsPriority: feedPreferences.friendsPriority,
      followingPriority: feedPreferences.followingPriority,
      trendingPriority: feedPreferences.trendingPriority,
      newestPriority: feedPreferences.newestPriority,
      infiniteFeedEnabled: feedPreferences.infiniteFeedEnabled,
    }).from(feedPreferences).where(eq(feedPreferences.userId, profile[0].id)).limit(1) : [];

    const preferences = preferencesRow[0] ?? {
      homeFeedEnabled: true, followingFeedEnabled: true, videosFeedEnabled: true,
      personalizedRecommendationsEnabled: true, recommendationEligible: true, recommendationRestricted: false,
      friendsPriority: 100, followingPriority: 100, trendingPriority: 100, newestPriority: 100, infiniteFeedEnabled: true,
    };

    const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const activities = await db.select({
      activityType: activityLog.activityType, activityCategory: activityLog.activityCategory,
      activityTitle: activityLog.activityTitle, activityDescription: activityLog.activityDescription,
      targetId: activityLog.targetId, targetType: activityLog.targetType, activityTime: activityLog.activityTime,
    }).from(activityLog).where(and(eq(activityLog.userId, userId), eq(activityLog.hidden, false), eq(activityLog.archived, false), gt(activityLog.activityTime, since))).orderBy(desc(activityLog.activityTime)).limit(2000);

    const searches = await db.select({
      searchQuery: searchHistory.searchQuery, searchType: searchHistory.searchType,
      searchCount: searchHistory.searchCount, createdAt: searchHistory.createdAt,
    }).from(searchHistory).innerJoin(userProfiles, eq(searchHistory.userId, userProfiles.id))
      .where(and(eq(userProfiles.userId, userId), eq(searchHistory.active, true), eq(searchHistory.deleted, false), gt(searchHistory.createdAt, since)))
      .orderBy(desc(searchHistory.createdAt)).limit(500);

    const interestScores = new Map<string, number>();
    const contentTypeScores = new Map<string, number>();
    for (const activity of activities) {
      const actionWeight = ACTION_WEIGHT[activity.activityType.toLowerCase()] ?? 1;
      addInterest(interestScores, tokens(activity.activityTitle), actionWeight);
      addInterest(interestScores, tokens(activity.activityDescription), actionWeight * 0.6);
      if (activity.targetType) contentTypeScores.set(activity.targetType.toLowerCase(), (contentTypeScores.get(activity.targetType.toLowerCase()) ?? 0) + actionWeight);
    }
    for (const search of searches) {
      const weight = Math.min(8, 2 + Math.max(0, search.searchCount - 1));
      addInterest(interestScores, tokens(search.searchQuery), weight);
      if (search.searchType && search.searchType !== "all") contentTypeScores.set(search.searchType.toLowerCase(), (contentTypeScores.get(search.searchType.toLowerCase()) ?? 0) + weight);
    }

    // Build persistent behavioral affinity toward the authors of posts the user actually engages with.
    // A like is a strong signal; a video watch of >=10 seconds is an explicit sustained-interest signal.
    const affinity = new Map<string, { likes: number; qualifyingVideoWatches: number }>();
    const addAffinity = (authorId: string, kind: "like" | "watch") => {
      const current = affinity.get(authorId) ?? { likes: 0, qualifyingVideoWatches: 0 };
      if (kind === "like") current.likes += 1;
      else current.qualifyingVideoWatches += 1;
      affinity.set(authorId, current);
    };

    const postIdsFromActivities = activities
      .filter((activity) => activity.targetId && ["post", "video", "reel", "page_post"].includes((activity.targetType ?? "").toLowerCase()))
      .map((activity) => activity.targetId as string);
    const uniqueActivityPostIds = [...new Set(postIdsFromActivities)];

    if (uniqueActivityPostIds.length) {
      const engagedPosts = await db.select({ id: posts.id, authorId: posts.userId })
        .from(posts).where(inArray(posts.id, uniqueActivityPostIds));
      const authorByPostId = new Map(engagedPosts.map((post) => [post.id, post.authorId]));
      for (const activity of activities) {
        if (!activity.targetId) continue;
        const authorId = authorByPostId.get(activity.targetId);
        if (!authorId) continue;
        const type = activity.activityType.toLowerCase();
        if (["like", "liked", "reaction"].includes(type)) addAffinity(authorId, "like");
        if (["watch_video", "video_view"].includes(type) && watchedForAtLeastTenSeconds(`${activity.activityTitle} ${activity.activityDescription ?? ""}`)) {
          addAffinity(authorId, "watch");
        }
      }
    }

    // Reactions are the source of truth for active likes, including page/profile posts.
    const activeLikes = await db.select({ contentId: reactions.contentId })
      .from(reactions).innerJoin(userProfiles, eq(reactions.reactorId, userProfiles.id))
      .where(and(eq(userProfiles.userId, userId), eq(reactions.active, true), eq(reactions.reactionType, "like"), inArray(reactions.contentType, ["post", "video", "photo", "reel", "page_post"])))
      .limit(5000);
    const likedPostIds = [...new Set(activeLikes.map((row) => row.contentId))];
    if (likedPostIds.length) {
      const likedPosts = await db.select({ id: posts.id, authorId: posts.userId }).from(posts).where(inArray(posts.id, likedPostIds));
      for (const post of likedPosts) addAffinity(post.authorId, "like");
    }

    const authorAffinity = [...affinity.entries()]
      .map(([authorId, signals]) => ({
        userId: authorId,
        likes: signals.likes,
        qualifyingVideoWatches: signals.qualifyingVideoWatches,
        score: Math.min(1, signals.likes * 0.18 + signals.qualifyingVideoWatches * 0.22 + (signals.likes > 0 && signals.qualifyingVideoWatches > 0 ? 0.15 : 0)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 300);

    return {
      anchorLogin: { country: anchor?.country ?? null, region: anchor?.region ?? null, city: anchor?.city ?? null, loginTime: anchor?.loginTime ?? null },
      laterLocations,
      locationMix: { anchorWeight: 0.7, explorationWeight: 0.3 },
      interests: [...interestScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([token, score]) => ({ token, score })),
      contentTypePreferences: [...contentTypeScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([type, score]) => ({ type, score })),
      authorAffinity,
      preferences,
      source: "login_history_and_activity",
    };
  }

  async getRelationshipIds(userId: string) {
    const [friendRows, followingRows] = await Promise.all([
      db.select({ friendUserId: friends.friendUserId }).from(friends).where(and(eq(friends.userId, userId), eq(friends.friendshipStatus, "active"))).limit(500),
      db.select({ followingId: following.followingId }).from(following).where(eq(following.userId, userId)).limit(500),
    ]);
    return { friendUserIds: friendRows.map((row) => row.friendUserId), followingUserIds: followingRows.map((row) => row.followingId) };
  }

  async rankProfiles(userId: string, index: FeedIndex, limit = 10) {
    const candidates = await db.select({
      userId: users.id, firstName: users.firstName, lastName: users.lastName, username: users.username,
      publicId: users.publicId, profileId: users.profileId, profilePhoto: userProfiles.profilePhoto,
      currentCity: userProfiles.currentCity, bio: userProfiles.bio, occupation: userProfiles.occupation,
      education: userProfiles.education, friendCount: userProfiles.friendCount, followerCount: userProfiles.followerCount,
    }).from(userProfiles).innerJoin(users, eq(userProfiles.userId, users.id))
      .where(and(ne(userProfiles.userId, userId), eq(userProfiles.profileVisibility, "public"), eq(users.accountStatus, "active")))
      .orderBy(desc(userProfiles.friendCount), desc(userProfiles.followerCount), desc(userProfiles.createdAt)).limit(300);
    if (!candidates.length) return [];

    const candidateIds = candidates.map((candidate) => candidate.userId);
    const candidateLogins = await db.select({ userId: loginHistory.userId, country: loginHistory.country, region: loginHistory.region, city: loginHistory.city, loginTime: loginHistory.loginTime }).from(loginHistory).where(and(inArray(loginHistory.userId, candidateIds), eq(loginHistory.hiddenByUser, false))).orderBy(loginHistory.loginTime);
    const firstLocationByUser = new Map<string, typeof candidateLogins[number]>();
    for (const login of candidateLogins) if (!firstLocationByUser.has(login.userId) && (login.country || login.region || login.city)) firstLocationByUser.set(login.userId, login);

    const { friendUserIds, followingUserIds } = await this.getRelationshipIds(userId);
    const friendSet = new Set(friendUserIds), followingSet = new Set(followingUserIds);
    const anchorCountry = normalizeLocation(index.anchorLogin.country), anchorRegion = normalizeLocation(index.anchorLogin.region), anchorCity = normalizeLocation(index.anchorLogin.city);
    const laterCountries = new Set(index.laterLocations.map((location) => normalizeLocation(location.country)).filter(Boolean) as string[]);
    const interestMap = new Map(index.interests.map((interest) => [interest.token, interest.score]));
    const affinityMap = new Map(index.authorAffinity.map((entry) => [entry.userId, entry.score]));

    const scored = candidates.map((candidate) => {
      const location = firstLocationByUser.get(candidate.userId);
      const country = normalizeLocation(location?.country), region = normalizeLocation(location?.region), city = normalizeLocation(location?.city);
      const anchorGeo = (anchorCountry && country === anchorCountry ? 0.55 : 0) + (anchorRegion && region === anchorRegion ? 0.20 : 0) + (anchorCity && city === anchorCity ? 0.25 : 0);
      const laterGeo = laterCountries.has(country ?? "") ? 1 : country && country !== anchorCountry ? 0.5 : 0;
      const geoScore = anchorGeo * 0.7 + laterGeo * 0.3;
      const text = tokens([candidate.bio, candidate.occupation, candidate.education, candidate.currentCity, candidate.username].filter(Boolean).join(" "));
      const behaviorScore = Math.min(1, text.reduce((sum, token) => sum + (interestMap.get(token) ?? 0), 0) / 25);
      const relationshipBoost = friendSet.has(candidate.userId) ? 1 : followingSet.has(candidate.userId) ? 0.7 : 0;
      const affinityScore = affinityMap.get(candidate.userId) ?? 0;
      return { ...candidate, score: geoScore * 0.7 + behaviorScore * 0.3 + relationshipBoost + affinityScore * 0.8, suggestionType: friendSet.has(candidate.userId) ? "friend" : followingSet.has(candidate.userId) ? "following" : "friend_suggestion" };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ score: _score, ...profile }) => profile);
  }

  async rankPosts(userId: string, index: FeedIndex, limit = 80) {
    const { friendUserIds, followingUserIds } = await this.getRelationshipIds(userId);
    const friendSet = new Set(friendUserIds), followingSet = new Set(followingUserIds);
    const visibilityConditions = [
      eq(posts.visibility, "public"),
      friendUserIds.length ? and(eq(posts.visibility, "friends"), inArray(posts.userId, friendUserIds)) : undefined,
      followingUserIds.length ? and(eq(posts.visibility, "followers"), inArray(posts.userId, followingUserIds)) : undefined,
    ].filter(Boolean) as Array<any>;

    const candidates = await db.select({
      id: posts.id, shareId: posts.shareId, content: posts.content, type: posts.type, visibility: posts.visibility,
      commentsEnabled: posts.commentsEnabled, sharingEnabled: posts.sharingEnabled, publishedAt: posts.publishedAt,
      createdAt: posts.createdAt, updatedAt: posts.updatedAt, authorId: users.id, firstName: users.firstName,
      lastName: users.lastName, username: users.username, publicId: users.publicId, profileId: users.profileId,
      profilePhoto: userProfiles.profilePhoto, authorCity: userProfiles.currentCity, profileType: userProfiles.profileType,
    }).from(posts).innerJoin(users, eq(posts.userId, users.id)).leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(posts.deleted, false), eq(users.accountStatus, "active"), or(...visibilityConditions)))
      .orderBy(desc(posts.publishedAt), desc(posts.createdAt)).limit(500);

    const interacted = await db.select({ contentId: reactions.contentId }).from(reactions).innerJoin(userProfiles, eq(reactions.reactorId, userProfiles.id)).where(and(eq(userProfiles.userId, userId), eq(reactions.active, true))).limit(2000);
    const interactedIds = new Set(interacted.map((row) => row.contentId));
    const interestMap = new Map(index.interests.map((interest) => [interest.token, interest.score]));
    const typeMap = new Map(index.contentTypePreferences.map((item) => [item.type, item.score]));
    const affinityMap = new Map(index.authorAffinity.map((entry) => [entry.userId, entry.score]));
    const anchorCountry = normalizeLocation(index.anchorLogin.country), anchorRegion = normalizeLocation(index.anchorLogin.region), anchorCity = normalizeLocation(index.anchorLogin.city);
    const laterCountries = new Set(index.laterLocations.map((location) => normalizeLocation(location.country)).filter(Boolean) as string[]);

    const scored = candidates.map((post) => {
      const behavior = (typeMap.get(post.type.toLowerCase()) ?? 0) + tokens(post.content).reduce((sum, token) => sum + (interestMap.get(token) ?? 0), 0);
      const behaviorScore = Math.min(1, behavior / 30);
      // Geographic ranking uses the author's current city only for city-level matching; the 70/30 anchor remains authoritative.
      const anchorGeo = (anchorCity && locationMatch(post.authorCity, anchorCity) ? 0.25 : 0) + (anchorRegion && locationMatch(post.authorCity, anchorRegion) ? 0.20 : 0) + (anchorCountry && locationMatch(post.authorCity, anchorCountry) ? 0.55 : 0);
      const laterGeo = laterCountries.has(normalizeLocation(post.authorCity) ?? "") ? 1 : 0;
      const geoScore = anchorGeo * 0.7 + laterGeo * 0.3;
      const freshnessHours = Math.max(0, (Date.now() - post.publishedAt.getTime()) / 3600000);
      const freshnessScore = Math.max(0, 1 - freshnessHours / 168);
      const relationshipScore = friendSet.has(post.authorId) ? 1 : followingSet.has(post.authorId) ? 0.75 : 0;
      const authorAffinity = affinityMap.get(post.authorId) ?? 0;
      const direct = relationshipScore > 0;
      const recommendationAllowed = index.preferences.personalizedRecommendationsEnabled && index.preferences.recommendationEligible && !index.preferences.recommendationRestricted;
      const recommended = recommendationAllowed && !direct && (behaviorScore > 0 || authorAffinity > 0);
      return {
        ...post,
        score: geoScore * 0.7 + behaviorScore * 0.3 + freshnessScore * 0.25 + relationshipScore + authorAffinity * 1.25,
        recommended,
        source: friendSet.has(post.authorId) ? "friend" : followingSet.has(post.authorId) ? "following" : recommended ? "recommended" : "public",
        sourceLabel: friendSet.has(post.authorId)
          ? `${post.firstName} is your friend`
          : followingSet.has(post.authorId)
            ? (post.profileType === "page" ? "You follow this page" : `You follow ${post.firstName}`)
            : recommended ? "Suggested post that matches your preferences" : null,
        alreadyInteracted: interactedIds.has(post.id),
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const authorCounts = new Map<string, number>();
    const selected: typeof scored = [];
    for (const post of scored) {
      if ((authorCounts.get(post.authorId) ?? 0) >= 3) continue;
      authorCounts.set(post.authorId, (authorCounts.get(post.authorId) ?? 0) + 1);
      selected.push(post);
      if (selected.length >= limit) break;
    }
    return selected.map(({ score: _score, alreadyInteracted: _alreadyInteracted, ...post }) => post);
  }
}

export const feedIndexingService = new FeedIndexingService();

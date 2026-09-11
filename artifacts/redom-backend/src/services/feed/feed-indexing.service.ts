import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";

import { db } from "../../database/db";
import { activityLog } from "../../database/activityLog";
import { loginHistory } from "../../database/loginHistory";
import { searchHistory } from "../../database/searchHistory";
import { posts } from "../../database/posts";
import { reactions } from "../../database/reactions";
import { userProfiles } from "../../database/userProfiles";
import { users } from "../../database/schema";

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
    .slice(0, 80);
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

    // search_history.user_id points to user_profiles.id, not users.id.
    // Join through the user's profile so search intent is attached to the correct account.
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
        .slice(0, 60)
        .map(([token, score]) => ({ token, score })),
      contentTypePreferences: [...contentTypeScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([type, score]) => ({ type, score })),
      source: "login_history_and_activity",
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
      .limit(200);

    if (!candidates.length) return [];

    const candidateIds = candidates.map((candidate) => candidate.userId);
    const candidateLogins = await db
      .select({ userId: loginHistory.userId, country: loginHistory.country, region: loginHistory.region, city: loginHistory.city, loginTime: loginHistory.loginTime })
      .from(loginHistory)
      .where(and(inArray(loginHistory.userId, candidateIds), eq(loginHistory.hiddenByUser, false)))
      .orderBy(loginHistory.loginTime);

    const firstLocationByUser = new Map<string, typeof candidateLogins[number]>();
    for (const login of candidateLogins) {
      if (!firstLocationByUser.has(login.userId) && (login.country || login.region || login.city)) {
        firstLocationByUser.set(login.userId, login);
      }
    }

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
      let anchorScore = 0;
      if (anchorCountry && candidateCountry === anchorCountry) anchorScore += 55;
      if (anchorRegion && candidateRegion === anchorRegion) anchorScore += 20;
      if (anchorCity && candidateCity === anchorCity) anchorScore += 25;
      const explorationScore = laterCountries.has(candidateCountry ?? "") ? 70 : candidateCountry && candidateCountry !== anchorCountry ? 40 : 0;
      const text = tokens([candidate.bio, candidate.occupation, candidate.education, candidate.currentCity, candidate.username].filter(Boolean).join(" "));
      let behaviorScore = 0;
      for (const token of text) behaviorScore += interestMap.get(token) ?? 0;
      behaviorScore += Math.min(20, candidate.friendCount * 0.25 + candidate.followerCount * 0.05);
      const bucket = anchorScore > 0 ? "anchor" : "exploration";
      const locationScore = bucket === "anchor" ? anchorScore * 0.7 : explorationScore * 0.3;
      return { ...candidate, score: locationScore + behaviorScore, bucket };
    });

    scored.sort((a, b) => b.score - a.score);
    const anchorCandidates = scored.filter((candidate) => candidate.bucket === "anchor");
    const explorationCandidates = scored.filter((candidate) => candidate.bucket === "exploration");
    const anchorCount = Math.ceil(limit * 0.7);
    const explorationCount = Math.max(0, limit - anchorCount);
    const selected = [...anchorCandidates.slice(0, anchorCount), ...explorationCandidates.slice(0, explorationCount)];
    if (selected.length < limit) {
      const selectedIds = new Set(selected.map((candidate) => candidate.userId));
      selected.push(...scored.filter((candidate) => !selectedIds.has(candidate.userId)).slice(0, limit - selected.length));
    }
    return selected.slice(0, limit);
  }

  async rankPosts(userId: string, index: FeedIndex, limit = 40) {
    const candidates = await db
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
        authorCity: userProfiles.currentCity,
      })
      .from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(posts.deleted, false), eq(posts.visibility, "public"), eq(users.accountStatus, "active")))
      .orderBy(desc(posts.publishedAt))
      .limit(200);

    const interacted = await db
      .select({ contentId: reactions.contentId })
      .from(reactions)
      .innerJoin(userProfiles, eq(reactions.reactorId, userProfiles.id))
      .where(and(eq(userProfiles.userId, userId), eq(reactions.active, true)))
      .limit(1000);
    const interactedIds = new Set(interacted.map((row) => row.contentId));
    const interestMap = new Map(index.interests.map((interest) => [interest.token, interest.score]));
    const typeMap = new Map(index.contentTypePreferences.map((item) => [item.type, item.score]));

    const scored = candidates.map((post) => {
      const postTokens = tokens(post.content);
      let behaviorScore = typeMap.get(post.type.toLowerCase()) ?? 0;
      for (const token of postTokens) behaviorScore += interestMap.get(token) ?? 0;
      if (interactedIds.has(post.id)) behaviorScore -= 100;
      const freshnessHours = Math.max(0, (Date.now() - post.publishedAt.getTime()) / 3600000);
      const freshnessScore = Math.max(0, 18 - freshnessHours / 8);
      const anchorCityScore = index.anchorLogin.city && locationMatch(post.authorCity, index.anchorLogin.city) ? 20 : 0;
      const laterCitySignal = index.laterLocations.some((location) => location.city && locationMatch(post.authorCity, location.city)) ? 5 : 0;
      const locationScore = anchorCityScore * 0.7 + laterCitySignal * 0.3;
      return { ...post, score: behaviorScore + freshnessScore + locationScore };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}

export const feedIndexingService = new FeedIndexingService();

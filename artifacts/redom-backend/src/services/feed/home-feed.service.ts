import { and, desc, eq, gt, inArray, or } from "drizzle-orm";

import { db } from "../../database/db";
import { activityLog } from "../../database/activityLog";
import { stories } from "../../database/stories";
import { friends } from "../../database/friends";
import { following } from "../../database/following";
import { users } from "../../database/schema";
import { userProfiles } from "../../database/userProfiles";
import { postMedia } from "../../database/postMedia";
import { polls } from "../../database/polls";
import { checkIP } from "../../lib/ipapi";
import { feedIndexingService } from "./feed-indexing.service";
import { postFeedActionService } from "./post-feed-action.service";
import { postReactionService } from "./post-reaction.service";

const PAGE_SIZE = 40;
const STORY_HOURS = 24;
const MAX_RECOMMENDED_IMPRESSIONS = 2;

export class HomeFeedService {
  async generate(params: { userId: string; ipAddress?: string; page?: number }) {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const index = await feedIndexingService.build(params.userId);
    const relationships = await feedIndexingService.getRelationshipIds(params.userId);
    const friendSet = new Set(relationships.friendUserIds);
    const followingSet = new Set(relationships.followingUserIds);

    let location = {
      country: index.anchorLogin.country,
      region: index.anchorLogin.region,
      city: index.anchorLogin.city,
      timezone: null as string | null,
    };

    if (!location.country && !location.region && !location.city && params.ipAddress) {
      try {
        const geo = await checkIP(params.ipAddress);
        location = {
          country: geo.location?.country ?? null,
          region: geo.location?.state ?? null,
          city: geo.location?.city ?? null,
          timezone: geo.location?.timezone ?? null,
        };
      } catch {
        // The current IP is only a fallback. It never replaces the first-login anchor.
      }
    }

    const rankedPosts = await feedIndexingService.rankPosts(params.userId, index, 500);
    const rankedPostIds = rankedPosts.map((post) => post.id);

    let impressionCounts = new Map<string, number>();
    if (rankedPostIds.length) {
      const impressions = await db.select({ targetId: activityLog.targetId })
        .from(activityLog)
        .where(and(
          eq(activityLog.userId, params.userId),
          eq(activityLog.activityType, "feed_post_impression"),
          eq(activityLog.targetType, "post"),
          eq(activityLog.hidden, true),
          inArray(activityLog.targetId, rankedPostIds),
        ));
      impressionCounts = impressions.reduce((map, row) => {
        if (row.targetId) map.set(row.targetId, (map.get(row.targetId) ?? 0) + 1);
        return map;
      }, new Map<string, number>());
    }

    const hiddenPostIds = await postFeedActionService.getHiddenPostIds(params.userId);
    const allRankedPosts = rankedPosts.filter((post) =>
      !hiddenPostIds.has(post.id) && (!post.recommended || (impressionCounts.get(post.id) ?? 0) < MAX_RECOMMENDED_IMPRESSIONS),
    );

    const postStart = (page - 1) * PAGE_SIZE;
    const pagePosts = allRankedPosts.slice(postStart, postStart + PAGE_SIZE);
    const postIds = pagePosts.map((post) => post.id);

    const [mediaRows, pollRows, reactionSummaries] = await Promise.all([
      postIds.length
        ? db.select({
            id: postMedia.id, postId: postMedia.postId, shareId: postMedia.shareId,
            mediaType: postMedia.mediaType, objectKey: postMedia.objectKey, thumbnailKey: postMedia.thumbnailKey,
            fileName: postMedia.fileName, mimeType: postMedia.mimeType, fileSize: postMedia.fileSize,
            width: postMedia.width, height: postMedia.height, duration: postMedia.duration,
            caption: postMedia.caption, altText: postMedia.altText, displayOrder: postMedia.displayOrder, isPrimary: postMedia.isPrimary,
          }).from(postMedia).where(inArray(postMedia.postId, postIds)).orderBy(postMedia.displayOrder)
        : [],
      postIds.length
        ? db.select({
            id: polls.id, postId: polls.postId, question: polls.question, options: polls.options,
            optionVoteCounts: polls.optionVoteCounts, totalVotes: polls.totalVotes, votingType: polls.votingType,
            anonymousVoting: polls.anonymousVoting, allowVoteRemoval: polls.allowVoteRemoval, duration: polls.duration,
            expiresAt: polls.expiresAt, manuallyClosed: polls.manuallyClosed, closed: polls.closed, expired: polls.expired,
          }).from(polls).where(inArray(polls.postId, postIds))
        : [],
      postReactionService.getSummaries(params.userId, postIds),
    ]);

    const mediaByPost = new Map<string, typeof mediaRows>();
    for (const media of mediaRows) {
      const list = mediaByPost.get(media.postId) ?? [];
      list.push(media);
      mediaByPost.set(media.postId, list);
    }
    const pollByPost = new Map(pollRows.map((poll) => [poll.postId, poll]));

    const posts = pagePosts.map((post) => ({
      ...post,
      verified: Boolean(post.verified),
      media: mediaByPost.get(post.id) ?? [],
      poll: pollByPost.get(post.id) ?? null,
      reactionSummary: reactionSummaries.get(post.id) ?? { total: 0, top: [], counts: { like: 0, haha: 0, sad: 0, love: 0 }, myReaction: null, visibleReactors: [], hiddenReactorCount: 0 },
      relationship: post.source === "friend"
        ? { type: "friend", label: `${post.firstName} is your friend` }
        : post.source === "following"
          ? { type: "following", label: "You follow this page" }
          : null,
      recommendation: post.recommended
        ? { type: "preferences", label: "Suggested post that matches your preferences" }
        : null,
    }));

    const recommendedPagePosts = pagePosts.filter((post) => post.recommended);
    if (recommendedPagePosts.length) {
      await Promise.all(recommendedPagePosts.map((post) => db.insert(activityLog).values({
        userId: params.userId,
        activityType: "feed_post_impression",
        activityCategory: "feed",
        activityTitle: "Recommended post delivered",
        activityDescription: "Recommendation exposure counted toward the two-delivery limit.",
        targetId: post.id,
        targetType: "post",
        status: "success",
        triggeredBy: "system",
        undoSupported: false,
        hidden: true,
        archived: false,
      }).catch(() => undefined)));
    }

    const storySince = new Date(Date.now() - STORY_HOURS * 60 * 60 * 1000);
    const storyVisibility = [
      eq(stories.privacy, "public"),
      relationships.friendUserIds.length ? and(eq(stories.privacy, "friends"), inArray(userProfiles.userId, relationships.friendUserIds)) : undefined,
      relationships.followingUserIds.length ? and(eq(stories.privacy, "public"), inArray(userProfiles.userId, relationships.followingUserIds)) : undefined,
    ].filter(Boolean) as Array<any>;

    const storyCandidates = await db
      .select({
        id: stories.id, shareId: stories.shareId, storyText: stories.storyText, storyType: stories.storyType,
        mediaId: stories.mediaId, hasMusic: stories.hasMusic, musicTitle: stories.musicTitle, musicArtist: stories.musicArtist,
        hasStickers: stories.hasStickers, privacy: stories.privacy, professionalMode: stories.professionalMode,
        expiresAt: stories.expiresAt, createdAt: stories.createdAt, authorId: users.id, firstName: users.firstName,
        lastName: users.lastName, username: users.username, publicId: users.publicId, profileId: users.profileId,
        profilePhoto: userProfiles.profilePhoto,
      })
      .from(stories)
      .innerJoin(userProfiles, eq(stories.authorId, userProfiles.id))
      .innerJoin(users, eq(userProfiles.userId, users.id))
      .where(and(
        eq(stories.deleted, false), eq(stories.moderationStatus, "approved"), gt(stories.expiresAt, new Date()),
        gt(stories.createdAt, storySince), eq(users.accountStatus, "active"), or(...storyVisibility),
      ))
      .orderBy(desc(stories.createdAt)).limit(200);

    const interestMap = new Map(index.interests.map((interest) => [interest.token, interest.score]));
    const scoredStories = storyCandidates.map((story) => {
      const text = `${story.storyText ?? ""} ${story.firstName} ${story.lastName} ${story.username}`.toLowerCase();
      const matchingInterests = [...interestMap.entries()].reduce((score, [token, weight]) => score + (text.includes(token) ? weight : 0), 0);
      const directRelationship = friendSet.has(story.authorId) || followingSet.has(story.authorId);
      return {
        ...story,
        score: (directRelationship ? 100 : 0) + matchingInterests,
        source: friendSet.has(story.authorId) ? "friend" : followingSet.has(story.authorId) ? "following" : "recommended",
        recommendation: !directRelationship && matchingInterests > 0
          ? { type: "preferences", label: "Suggested story that matches your preferences" }
          : null,
      };
    });

    scoredStories.sort((a, b) => b.score - a.score);
    const storyAuthors = new Set<string>();
    const activeStories = scoredStories.filter((story) => {
      if (storyAuthors.has(story.authorId)) return false;
      storyAuthors.add(story.authorId);
      return true;
    }).slice(0, 30).map(({ score: _score, ...story }) => ({
      ...story,
      relationship: story.source === "friend"
        ? { type: "friend", label: `${story.firstName} is your friend` }
        : story.source === "following"
          ? { type: "following", label: `You follow ${story.firstName}` }
          : null,
    }));

    const suggestedProfiles = (await feedIndexingService.rankProfiles(params.userId, index, 10)).map((profile) => ({
      ...profile, placement: "stories", label: "Friend suggestion",
    }));

    return {
      success: true,
      refreshedAt: new Date().toISOString(),
      page,
      pageSize: PAGE_SIZE,
      hasMore: postStart + pagePosts.length < allRankedPosts.length,
      indexing: {
        provider: "ReDom Indexing Engine",
        locationSource: index.anchorLogin.loginTime ? "first_login_history" : params.ipAddress ? "current_ip_fallback" : "unavailable",
        approximate: true,
        location,
        weights: { firstLoginHistory: 0.7, laterLoginHistory: 0.3 },
        behaviorSignals: {
          actions: ["comment", "share", "save", "like", "reaction", "watch_video", "follow", "search", "post_view", "not_interested"],
          interestsIndexed: index.interests.length,
          contentTypesIndexed: index.contentTypePreferences.length,
        },
        friendsIndexed: relationships.friendUserIds.length,
        followingIndexed: relationships.followingUserIds.length,
        recommendationPolicy: {
          maxRecommendedPostDeliveries: MAX_RECOMMENDED_IMPRESSIONS,
          repeatedPostViewsCountAsOneSignal: true,
          duplicateLikeOrShareSignals: false,
        },
      },
      stories: activeStories,
      friendSuggestions: suggestedProfiles,
      posts,
    };
  }
}

export const homeFeedService = new HomeFeedService();

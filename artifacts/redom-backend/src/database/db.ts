import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { env } from "../config/env";

import { users } from "./schema";
import { userProfiles } from "./userProfiles";
import { accountSecurity } from "./accountSecurity";
import { twoFactorRecoveryCodes } from "./twoFactorRecoveryCodes";
import { sessions } from "./sessions.schema";
import { activeSessions } from "./activeSessions";
import { loginHistory } from "./loginHistory";
import { activityLog } from "./activityLog";
import { userPrivacy } from "./userPrivacy";
import { userSettings } from "./userSettings";

import { verification } from "./verification";
import { verificationDocuments } from "./verificationDocuments";
import { verificationSubscriptions } from "./verificationSubscriptions";
import { verifications } from "./verifications.schema";

import { accountActions } from "./accountActions";
import { reports } from "./reports";
import { appeals } from "./appeals";
import { blockedUsers } from "./blockedUsers";
import { restrictedUsers } from "./restrictedUsers";
import { mutedUsers } from "./mutedUsers";

import { followers } from "./followers";
import { following } from "./following";
import { friends } from "./friends";
import { friendRequests } from "./friendRequests";

import { conversations } from "./conversations";
import { conversationParticipants } from "./conversationParticipants";
import { messages } from "./messages";
import { messageAttachments } from "./messageAttachments";
import { messageReads } from "./messageReads";
import { messageRequests } from "./messageRequests";
import { messageDrafts } from "./messageDrafts";
import { calls } from "./calls";

import { posts } from "./posts";
import { postMedia } from "./postMedia";
import { postMentions } from "./postMentions";
import { draftPosts } from "./draftPosts";
import { scheduledPosts } from "./scheduledPosts";
import { polls } from "./polls";
import { reactions } from "./reactions";
import { saves } from "./saves";
import { shares } from "./shares";
import { stories } from "./stories";
import { storyViewers } from "./storyViewers";
import { feedPreferences } from "./feedPreferences";
import { notifications } from "./notifications";
import { searchHistory } from "./searchHistory";

import { marketplaceCategories } from "./marketplaceCategories";
import { marketplaceListings } from "./marketplaceListings";
import { marketplaceInteractions } from "./marketplaceInteractions";
import { marketplaceReviews } from "./marketplaceReviews";
import { marketplaceTransactions } from "./marketplaceTransactions";

import { videoMetadata } from "./videoMetadata";
import { videoCaptions } from "./videoCaptions";
import { videoComments } from "./videoComments";
import { videoQuality } from "./videoQuality";
import { videoViews } from "./videoViews";

const pool = new Pool({
  connectionString:
    env.database.url,
});

pool.on("connect", () => {
  console.log(
    "Connected to Neon PostgreSQL",
  );
});

pool.on("error", (error) => {
  console.error(
    "Database connection error:",
    error,
  );
});

export const db = drizzle(pool, {
  schema: {
    users,
    userProfiles,
    accountSecurity,
    twoFactorRecoveryCodes,

    sessions,
    activeSessions,
    loginHistory,
    activityLog,
    userPrivacy,
    userSettings,

    verification,
    verificationDocuments,
    verificationSubscriptions,
    verifications,

    accountActions,
    reports,
    appeals,
    blockedUsers,
    restrictedUsers,
    mutedUsers,

    followers,
    following,
    friends,
    friendRequests,

    conversations,
    conversationParticipants,
    messages,
    messageAttachments,
    messageReads,
    messageRequests,
    messageDrafts,
    calls,

    posts,
    postMedia,
    postMentions,
    draftPosts,
    scheduledPosts,
    polls,
    reactions,
    saves,
    shares,
    stories,
    storyViewers,
    feedPreferences,
    notifications,
    searchHistory,

    marketplaceCategories,
    marketplaceListings,
    marketplaceInteractions,
    marketplaceReviews,
    marketplaceTransactions,

    videoMetadata,
    videoCaptions,
    videoComments,
    videoQuality,
    videoViews,
  },
});

export { pool };
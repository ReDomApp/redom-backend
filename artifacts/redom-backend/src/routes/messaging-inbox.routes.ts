import { Router } from "express";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db } from "../database/db";
import { conversations } from "../database/conversations";
import { conversationParticipants } from "../database/conversationParticipants";
import { messages } from "../database/messages";
import { userProfiles } from "../database/userProfiles";
import { reports } from "../database/reports";

const router = Router();
router.use(authMiddleware, authRateLimit);
async function profileFor(userId: string) { const [profile] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1); return profile?.id ?? null; }

router.get("/conversations/:conversationId/contact-info", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const profileId = await profileFor(req.user.userId); if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  const [conversation] = await db.select({ id: conversations.id, type: conversations.conversationType }).from(conversations).where(and(eq(conversations.id, req.params.conversationId), eq(conversations.deleted, false))).limit(1);
  if (!conversation) return void res.status(404).json({ success: false, message: "Conversation not found." });
  const [member] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversation.id), eq(conversationParticipants.userId, profileId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false))).limit(1);
  if (!member) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  if (conversation.type === "group") return void res.status(400).json({ success: false, message: "Use group information for group conversations." });
  const [peer] = await db.select({ profileId: userProfiles.id, displayName: userProfiles.displayName, bio: userProfiles.bio, profilePhoto: userProfiles.profilePhoto, website: userProfiles.website, occupation: userProfiles.occupation, education: userProfiles.education, hometown: userProfiles.hometown, currentCity: userProfiles.currentCity, verified: userProfiles.verified, profileVisibility: userProfiles.profileVisibility }).from(conversationParticipants).innerJoin(userProfiles, eq(userProfiles.id, conversationParticipants.userId)).where(and(eq(conversationParticipants.conversationId, conversation.id), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false), ne(conversationParticipants.userId, profileId))).limit(1);
  if (!peer) return void res.status(404).json({ success: false, message: "ReDom contact not found." });
  const mediaRows = await db.select({ messageType: messages.messageType }).from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.deletedForEveryone, false))).orderBy(desc(messages.createdAt));
  const mediaCount = mediaRows.filter((m) => ["photo", "video", "voice", "audio", "gif", "sticker"].includes(m.messageType)).length;
  const sharedDocCount = mediaRows.filter((m) => m.messageType === "document").length;
  res.json({ success: true, conversationId: conversation.id, contact: peer, mediaCount, sharedLinkCount: 0, sharedDocCount });
});

router.post("/conversations/:conversationId/contact-report", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const body = z.object({ reason: z.string().min(1).max(60), details: z.string().max(5000).optional() }).strict().safeParse(req.body);
  if (!body.success) return void res.status(400).json({ success: false, message: "A report reason is required." });
  const profileId = await profileFor(req.user.userId); if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  const [conversation] = await db.select({ id: conversations.id, type: conversations.conversationType }).from(conversations).where(and(eq(conversations.id, req.params.conversationId), eq(conversations.deleted, false))).limit(1);
  if (!conversation || conversation.type === "group") return void res.status(404).json({ success: false, message: "Direct conversation not found." });
  const [member] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversation.id), eq(conversationParticipants.userId, profileId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false))).limit(1);
  if (!member) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  const [peer] = await db.select({ profileId: userProfiles.id }).from(conversationParticipants).innerJoin(userProfiles, eq(userProfiles.id, conversationParticipants.userId)).where(and(eq(conversationParticipants.conversationId, conversation.id), eq(conversationParticipants.activeMember, true), ne(conversationParticipants.userId, profileId))).limit(1);
  if (!peer) return void res.status(404).json({ success: false, message: "ReDom contact not found." });
  const [created] = await db.insert(reports).values({ reporterUserId: profileId, reportedUserId: peer.profileId, reportTarget: "profile", targetId: peer.profileId, reportReason: body.data.reason.toLowerCase(), additionalDetails: body.data.details ?? null, aiReviewed: false, autoHidden: false, autoRemoved: false, requiresHumanReview: true, moderatorAction: "pending", status: "open", priority: "normal" }).returning({ id: reports.id });
  res.status(201).json({ success: true, reported: true, reportId: created?.id ?? null });
});

router.get("/inbox", async (req, res) => {
  if (!req.user?.userId) return void res.status(401).json({ success: false, message: "Authentication required." });
  const profileId = await profileFor(req.user.userId); if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  const memberships = await db.select({ conversationId: conversationParticipants.conversationId, unreadMessageCount: conversationParticipants.unreadMessageCount, muted: conversationParticipants.muted, pinned: conversationParticipants.pinned, archived: conversationParticipants.archived, notificationsEnabled: conversationParticipants.notificationsEnabled, mentionsOnly: conversationParticipants.mentionsOnly }).from(conversationParticipants).where(and(eq(conversationParticipants.userId, profileId), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false)));
  const ids = memberships.map((row) => row.conversationId); if (!ids.length) return void res.json({ success: true, conversations: [], archivedCount: 0, unreadCount: 0 });
  const rows = await db.select({ id: conversations.id, type: conversations.conversationType, groupName: conversations.groupName, groupPhoto: conversations.groupPhoto, updatedAt: conversations.updatedAt, messageCount: conversations.messageCount }).from(conversations).where(and(inArray(conversations.id, ids), eq(conversations.deleted, false))).orderBy(desc(conversations.updatedAt));
  const result = await Promise.all(rows.map(async (conversation) => { const membership = memberships.find((row) => row.conversationId === conversation.id); const [last] = await db.select({ id: messages.id, messageType: messages.messageType, senderId: messages.senderId, createdAt: messages.createdAt, deletedForEveryone: messages.deletedForEveryone, deletedPlaceholder: messages.deletedPlaceholder, edited: messages.edited }).from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(desc(messages.createdAt)).limit(1); if (conversation.type === "group") return { ...conversation, displayName: conversation.groupName || "ReDom group", profilePhoto: conversation.groupPhoto, peerProfileId: null, unreadMessageCount: membership?.unreadMessageCount ?? 0, muted: membership?.muted ?? false, pinned: membership?.pinned ?? false, archived: membership?.archived ?? false, notificationsEnabled: membership?.notificationsEnabled ?? true, mentionsOnly: membership?.mentionsOnly ?? false, lastMessage: last ? { ...last, message: null } : null }; const [peer] = await db.select({ profileId: userProfiles.id, displayName: userProfiles.displayName, profilePhoto: userProfiles.profilePhoto, verified: userProfiles.verified }).from(conversationParticipants).innerJoin(userProfiles, eq(userProfiles.id, conversationParticipants.userId)).where(and(eq(conversationParticipants.conversationId, conversation.id), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false), ne(conversationParticipants.userId, profileId))).limit(1); return { ...conversation, displayName: peer?.displayName || "ReDom contact", profilePhoto: peer?.profilePhoto || null, peerProfileId: peer?.profileId || null, verified: peer?.verified || false, unreadMessageCount: membership?.unreadMessageCount ?? 0, muted: membership?.muted ?? false, pinned: membership?.pinned ?? false, archived: membership?.archived ?? false, notificationsEnabled: membership?.notificationsEnabled ?? true, mentionsOnly: membership?.mentionsOnly ?? false, lastMessage: last ? { ...last, message: null } : null }; }));
  const unreadCount = result.reduce((sum, row) => sum + Number(row.unreadMessageCount || 0), 0); const archivedCount = result.filter((row) => row.archived).length; res.json({ success: true, conversations: result, archivedCount, unreadCount });
});
export default router;

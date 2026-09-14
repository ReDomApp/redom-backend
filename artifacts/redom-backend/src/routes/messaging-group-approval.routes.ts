import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db } from "../database/db";
import { conversations } from "../database/conversations";
import { conversationParticipants } from "../database/conversationParticipants";
import { userProfiles } from "../database/userProfiles";
import { notifications } from "../database/notifications";
import { activityLog } from "../database/activityLog";

const router = Router();
router.use(authMiddleware, authRateLimit);

async function profileId(userId: string) {
  const [row] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return row?.id ?? null;
}

async function activeMember(conversationId: string, profileIdValue: string) {
  const [row] = await db.select().from(conversationParticipants).where(and(
    eq(conversationParticipants.conversationId, conversationId),
    eq(conversationParticipants.userId, profileIdValue),
    eq(conversationParticipants.activeMember, true),
    eq(conversationParticipants.temporarilySuspended, false),
    eq(conversationParticipants.permanentlyRemoved, false),
  )).limit(1);
  return row ?? null;
}

async function group(conversationId: string) {
  const [row] = await db.select({
    id: conversations.id,
    participantCount: conversations.participantCount,
    joinApprovalRequired: conversations.joinApprovalRequired,
    groupName: conversations.groupName,
  }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.conversationType, "group"))).limit(1);
  return row ?? null;
}

function isAdmin(role: string) { return role === "owner" || role === "admin"; }

// A user can request to join an approval-protected group. This never activates membership until an admin approves it.
router.post("/groups/:conversationId/join-request", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId);
  if (!req.user?.userId || !id.success) return void res.status(400).json({ success: false, message: "Invalid group." });
  const me = await profileId(req.user.userId); if (!me) return void res.status(404).json({ success: false, message: "Profile not found." });
  const target = await group(id.data); if (!target) return void res.status(404).json({ success: false, message: "Group not found." });
  const existingActive = await activeMember(id.data, me); if (existingActive) return void res.status(409).json({ success: false, message: "You are already a member of this group." });
  const [existing] = await db.select().from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.userId, me))).limit(1);
  if (existing?.joinRequestApproved === false && !existing.permanentlyRemoved) return void res.status(409).json({ success: false, pending: true, message: "Your group join request is already pending." });
  if (existing?.permanentlyRemoved) return void res.status(403).json({ success: false, message: "You cannot request to join this group." });
  if (!target.joinApprovalRequired) return void res.status(400).json({ success: false, message: "This group does not require join approval." });
  const [owner] = await db.select({ userId: conversationParticipants.userId }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.role, "owner"), eq(conversationParticipants.activeMember, true))).limit(1);
  await db.insert(conversationParticipants).values({ conversationId: id.data, userId: me, role: "member", invited: false, activeMember: false, joinRequestApproved: false, joinedByCreator: false });
  if (owner) await db.insert(notifications).values({ recipientUserId: owner.userId, actorUserId: me, conversationId: id.data, notificationType: "group_join_request", title: "New group join request", body: `Someone requested to join ${target.groupName || "your ReDom group"}.`, actionUrl: `redom://messages/${id.data}/group-requests`, unread: true, read: false, inAppDelivered: true, priority: "normal" });
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "group_join_requested", activityCategory: "messages", activityTitle: "Group join requested", activityDescription: `Requested to join ReDom group ${target.groupName || "group"}.`, targetId: id.data, targetType: "conversation", status: "success", triggeredBy: "user", source: "app", undoSupported: false, hidden: false, archived: false });
  res.status(201).json({ success: true, pending: true });
});

router.get("/groups/:conversationId/join-requests", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId);
  if (!req.user?.userId || !id.success) return void res.status(400).json({ success: false, message: "Invalid group." });
  const me = await profileId(req.user.userId); if (!me) return void res.status(404).json({ success: false, message: "Profile not found." });
  const actor = await activeMember(id.data, me); if (!actor || !isAdmin(actor.role)) return void res.status(403).json({ success: false, message: "Only group admins can review join requests." });
  const rows = await db.select({ id: conversationParticipants.id, profileId: conversationParticipants.userId, requestedAt: conversationParticipants.joinedAt }).from(conversationParticipants).where(and(
    eq(conversationParticipants.conversationId, id.data),
    eq(conversationParticipants.activeMember, false),
    eq(conversationParticipants.joinRequestApproved, false),
    eq(conversationParticipants.permanentlyRemoved, false),
    eq(conversationParticipants.leftGroup, false),
  ));
  res.json({ success: true, requests: rows });
});

router.post("/groups/:conversationId/join-requests/:profileId/approve", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); const targetId = z.string().uuid().safeParse(req.params.profileId);
  if (!req.user?.userId || !id.success || !targetId.success) return void res.status(400).json({ success: false, message: "Invalid join request." });
  const me = await profileId(req.user.userId); if (!me) return void res.status(404).json({ success: false, message: "Profile not found." });
  const actor = await activeMember(id.data, me); if (!actor || !isAdmin(actor.role)) return void res.status(403).json({ success: false, message: "Only group admins can approve join requests." });
  const targetGroup = await group(id.data); if (!targetGroup) return void res.status(404).json({ success: false, message: "Group not found." });
  if (targetGroup.participantCount >= 1024) return void res.status(409).json({ success: false, message: "The group has reached ReDom's 1024-member limit." });
  const [pending] = await db.select({ id: conversationParticipants.id, userId: conversationParticipants.userId }).from(conversationParticipants).where(and(
    eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.userId, targetId.data), eq(conversationParticipants.activeMember, false), eq(conversationParticipants.joinRequestApproved, false), eq(conversationParticipants.permanentlyRemoved, false), eq(conversationParticipants.leftGroup, false),
  )).limit(1);
  if (!pending) return void res.status(404).json({ success: false, message: "Join request not found." });
  await db.update(conversationParticipants).set({ activeMember: true, joinRequestApproved: true, joinedAt: new Date(), updatedAt: new Date() }).where(eq(conversationParticipants.id, pending.id));
  await db.update(conversations).set({ participantCount: sql`${conversations.participantCount} + 1`, updatedAt: new Date() }).where(eq(conversations.id, id.data));
  await db.insert(notifications).values({ recipientUserId: targetId.data, actorUserId: me, conversationId: id.data, notificationType: "group_join_approved", title: "Group join request approved", body: `Your request to join ${targetGroup.groupName || "the ReDom group"} was approved.`, actionUrl: `redom://messages/${id.data}`, unread: true, read: false, inAppDelivered: true, priority: "normal" });
  res.json({ success: true, approved: true });
});

router.post("/groups/:conversationId/join-requests/:profileId/reject", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); const targetId = z.string().uuid().safeParse(req.params.profileId);
  if (!req.user?.userId || !id.success || !targetId.success) return void res.status(400).json({ success: false, message: "Invalid join request." });
  const me = await profileId(req.user.userId); if (!me) return void res.status(404).json({ success: false, message: "Profile not found." });
  const actor = await activeMember(id.data, me); if (!actor || !isAdmin(actor.role)) return void res.status(403).json({ success: false, message: "Only group admins can reject join requests." });
  const targetGroup = await group(id.data); if (!targetGroup) return void res.status(404).json({ success: false, message: "Group not found." });
  const [pending] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.userId, targetId.data), eq(conversationParticipants.activeMember, false), eq(conversationParticipants.joinRequestApproved, false), eq(conversationParticipants.permanentlyRemoved, false), eq(conversationParticipants.leftGroup, false))).limit(1);
  if (!pending) return void res.status(404).json({ success: false, message: "Join request not found." });
  await db.update(conversationParticipants).set({ permanentlyRemoved: true, activeMember: false, joinRequestApproved: false, removedByAdmin: true, updatedAt: new Date() }).where(eq(conversationParticipants.id, pending.id));
  await db.insert(notifications).values({ recipientUserId: targetId.data, actorUserId: me, conversationId: id.data, notificationType: "group_join_rejected", title: "Group join request declined", body: `Your request to join ${targetGroup.groupName || "the ReDom group"} was declined.`, actionUrl: `redom://messages/${id.data}`, unread: true, read: false, inAppDelivered: true, priority: "normal" });
  res.json({ success: true, rejected: true });
});

export default router;

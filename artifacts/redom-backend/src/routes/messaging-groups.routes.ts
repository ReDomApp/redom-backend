import { randomBytes } from "node:crypto";
import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db } from "../database/db";
import { conversations } from "../database/conversations";
import { conversationParticipants } from "../database/conversationParticipants";
import { userProfiles } from "../database/userProfiles";
import { activityLog } from "../database/activityLog";
import { groupInviteLinks } from "../database/groupInviteLinks";

const router = Router();
router.use(authMiddleware, authRateLimit);

async function profileId(userId: string) {
  const [row] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return row?.id ?? null;
}
async function member(conversationId: string, profile: string) {
  const [row] = await db.select().from(conversationParticipants).where(and(
    eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, profile),
    eq(conversationParticipants.activeMember, true), eq(conversationParticipants.temporarilySuspended, false), eq(conversationParticipants.permanentlyRemoved, false),
  )).limit(1);
  return row ?? null;
}
function canAdmin(role: string) { return role === "owner" || role === "admin"; }
function canCreateInvite(group: { participantCount: number; anyoneCanInvite: boolean }, role: string) { return canAdmin(role) || (group.anyoneCanInvite && group.participantCount < 33); }
async function activeInvite(conversationId: string) {
  const [row] = await db.select().from(groupInviteLinks).where(and(eq(groupInviteLinks.conversationId, conversationId), eq(groupInviteLinks.active, true))).orderBy(desc(groupInviteLinks.createdAt)).limit(1);
  return row ?? null;
}
async function ensureInvite(conversationId: string, creator: string) {
  const current = await activeInvite(conversationId);
  if (current) return current;
  const token = randomBytes(32).toString("base64url");
  const [created] = await db.insert(groupInviteLinks).values({ conversationId, token, createdBy: creator, active: true }).returning();
  if (!created) throw new Error("Unable to create group invite link.");
  return created;
}

router.post("/groups", async (req, res) => {
  const body = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(2000).optional(), memberProfileIds: z.array(z.string().uuid()).max(1023).default([]) }).strict().safeParse(req.body);
  if (!req.user?.userId || !body.success) return void res.status(400).json({ success: false, message: "A valid group name and member list are required." });
  const creator = await profileId(req.user.userId); if (!creator) return void res.status(404).json({ success: false, message: "Profile not found." });
  const unique = [...new Set(body.data.memberProfileIds)].filter(id => id !== creator);
  const profiles = unique.length ? await db.select({ id: userProfiles.id }).from(userProfiles).where(inArray(userProfiles.id, unique)) : [];
  if (profiles.length !== unique.length) return void res.status(400).json({ success: false, message: "One or more group members could not be found." });
  const [group] = await db.insert(conversations).values({ createdBy: creator, conversationType: "group", groupName: body.data.name, groupDescription: body.data.description ?? null, participantCount: unique.length + 1, anyoneCanEditInfo: true, anyoneCanInvite: true, anyoneCanRemoveMembers: false, anyoneCanPinMessages: true, anyoneCanSendMessages: true, anyoneCanSendHistory: true, joinApprovalRequired: false, encrypted: true }).returning({ id: conversations.id });
  if (!group) return void res.status(500).json({ success: false, message: "Unable to create group." });
  await db.insert(conversationParticipants).values([{ conversationId: group.id, userId: creator, role: "owner", joinedByCreator: true, joinRequestApproved: true }, ...unique.map(userId => ({ conversationId: group.id, userId, role: "member", joinedBy: creator, joinedByCreator: false, joinRequestApproved: true }))]);
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "group_created", activityCategory: "messages", activityTitle: "Group created", activityDescription: `Created ReDom group ${body.data.name}.`, targetId: group.id, targetType: "conversation", status: "success", triggeredBy: "user", source: "app", undoSupported: false, hidden: false, archived: false });
  res.status(201).json({ success: true, conversationId: group.id, participantCount: unique.length + 1 });
});

router.get("/groups/:conversationId/members", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); if (!req.user?.userId || !id.success) return void res.status(400).json({ success: false, message: "Invalid group." });
  const me = await profileId(req.user.userId); if (!me || !await member(id.data, me)) return void res.status(403).json({ success: false, message: "You do not have access to this group." });
  const rows = await db.select({ id: conversationParticipants.id, profileId: conversationParticipants.userId, role: conversationParticipants.role, joinedAt: conversationParticipants.joinedAt, online: conversationParticipants.online, memberTag: conversationParticipants.memberTag }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, id.data), eq(conversationParticipants.activeMember, true), eq(conversationParticipants.permanentlyRemoved, false))).orderBy(conversationParticipants.joinedAt);
  res.json({ success: true, members: rows });
});

router.get("/groups/:conversationId/settings", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); if (!req.user?.userId || !id.success) return void res.status(400).json({ success: false, message: "Invalid group." });
  const me = await profileId(req.user.userId); const actor = me ? await member(id.data, me) : null; if (!actor) return void res.status(403).json({ success: false, message: "You do not have access to this group." });
  const [group] = await db.select({ id: conversations.id, groupName: conversations.groupName, groupDescription: conversations.groupDescription, groupPhoto: conversations.groupPhoto, anyoneCanEditInfo: conversations.anyoneCanEditInfo, anyoneCanInvite: conversations.anyoneCanInvite, anyoneCanRemoveMembers: conversations.anyoneCanRemoveMembers, anyoneCanPinMessages: conversations.anyoneCanPinMessages, anyoneCanSendMessages: conversations.anyoneCanSendMessages, anyoneCanSendHistory: conversations.anyoneCanSendHistory, joinApprovalRequired: conversations.joinApprovalRequired, encrypted: conversations.encrypted, participantCount: conversations.participantCount }).from(conversations).where(eq(conversations.id, id.data)).limit(1);
  if (!group) return void res.status(404).json({ success: false, message: "Group not found." });
  const invite = canCreateInvite(group, actor.role) ? await activeInvite(id.data) : null;
  res.json({ success: true, settings: { ...group, isAdmin: canAdmin(actor.role), inviteLink: invite ? `https://redom.app/group-invite/${invite.token}` : null } });
});

router.patch("/groups/:conversationId/settings", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId);
  const body = z.object({ groupName: z.string().trim().min(1).max(100).optional(), groupDescription: z.string().max(2000).nullable().optional(), anyoneCanEditInfo: z.boolean().optional(), anyoneCanInvite: z.boolean().optional(), anyoneCanRemoveMembers: z.boolean().optional(), anyoneCanPinMessages: z.boolean().optional(), anyoneCanSendMessages: z.boolean().optional(), anyoneCanSendHistory: z.boolean().optional(), joinApprovalRequired: z.boolean().optional() }).strict().safeParse(req.body);
  if (!req.user?.userId || !id.success || !body.success || !Object.keys(body.data).length) return void res.status(400).json({ success: false, message: "Invalid group settings." });
  const me = await profileId(req.user.userId); const actor = me ? await member(id.data, me) : null; if (!actor) return void res.status(403).json({ success: false, message: "You do not have access to this group." });
  const infoFields = body.data.groupName !== undefined || body.data.groupDescription !== undefined;
  const permissionFields = Object.keys(body.data).some(k => k.startsWith("anyoneCan") || k === "joinApprovalRequired");
  const [group] = await db.select({ anyoneCanEditInfo: conversations.anyoneCanEditInfo, participantCount: conversations.participantCount }).from(conversations).where(eq(conversations.id, id.data)).limit(1);
  if (!group) return void res.status(404).json({ success: false, message: "Group not found." });
  if (infoFields && !group.anyoneCanEditInfo && !canAdmin(actor.role)) return void res.status(403).json({ success: false, message: "Only group admins can edit group information." });
  if (permissionFields && !canAdmin(actor.role)) return void res.status(403).json({ success: false, message: "Only group admins can change group permissions." });
  const patch = { ...body.data } as Record<string, unknown>;
  if (body.data.anyoneCanEditInfo === true && group.participantCount > 256) patch.anyoneCanEditInfo = false;
  await db.update(conversations).set({ ...patch, updatedAt: new Date() }).where(eq(conversations.id, id.data));
  res.json({ success: true });
});

router.post("/groups/:conversationId/members", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); const body = z.object({ profileIds: z.array(z.string().uuid()).min(1).max(1023), sendHistory: z.boolean().optional() }).strict().safeParse(req.body);
  if (!req.user?.userId || !id.success || !body.success) return void res.status(400).json({ success: false, message: "Invalid member list." });
  const me = await profileId(req.user.userId); const actor = me ? await member(id.data, me) : null; if (!actor || !me) return void res.status(403).json({ success: false, message: "You do not have access to this group." });
  const [group] = await db.select({ anyoneCanInvite: conversations.anyoneCanInvite, anyoneCanSendHistory: conversations.anyoneCanSendHistory, participantCount: conversations.participantCount, joinApprovalRequired: conversations.joinApprovalRequired }).from(conversations).where(eq(conversations.id, id.data)).limit(1); if (!group) return void res.status(404).json({ success: false, message: "Group not found." });
  if (!group.anyoneCanInvite && !canAdmin(actor.role)) return void res.status(403).json({ success: false, message: "Only group admins can add members." });
  if (body.data.sendHistory && !group.anyoneCanSendHistory) return void res.status(403).json({ success: false, message: "Group members cannot send message history." });
  const requested = [...new Set(body.data.profileIds)].filter(p => p !== me); if (group.participantCount + requested.length > 1024) return void res.status(400).json({ success: false, message: "ReDom groups support up to 1024 active members." });
  const existing = await db.select({ userId: conversationParticipants.userId }).from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, id.data), inArray(conversationParticipants.userId, requested))); const existingSet = new Set(existing.map(r => r.userId)); const add = requested.filter(p => !existingSet.has(p)); if (!add.length) return res.json({ success: true, added: 0, pending: 0 });
  const pending = group.joinApprovalRequired && !canAdmin(actor.role); await db.insert(conversationParticipants).values(add.map(userId => ({ conversationId: id.data, userId, role: "member", joinedBy: me, invited: true, activeMember: !pending, joinRequestApproved: !pending }))); if (!pending) await db.update(conversations).set({ participantCount: group.participantCount + add.length, updatedAt: new Date() }).where(eq(conversations.id, id.data));
  res.status(201).json({ success: true, added: pending ? 0 : add.length, pending: pending ? add.length : 0, sendHistory: Boolean(body.data.sendHistory && !pending) });
});

router.delete("/groups/:conversationId/members/:profileId", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); const target = z.string().uuid().safeParse(req.params.profileId); if (!req.user?.userId || !id.success || !target.success) return void res.status(400).json({ success: false, message: "Invalid member." });
  const me = await profileId(req.user.userId); const actor = me ? await member(id.data, me) : null; const targetMember = await member(id.data, target.data); if (!actor || !targetMember) return void res.status(403).json({ success: false, message: "Member access denied." });
  const [group] = await db.select({ anyoneCanRemoveMembers: conversations.anyoneCanRemoveMembers, participantCount: conversations.participantCount }).from(conversations).where(eq(conversations.id, id.data)).limit(1); if (!group) return void res.status(404).json({ success: false, message: "Group not found." });
  if (!group.anyoneCanRemoveMembers && !canAdmin(actor.role)) return void res.status(403).json({ success: false, message: "Only group admins can remove members." }); if (targetMember.role === "owner") return void res.status(403).json({ success: false, message: "The group owner cannot be removed." });
  await db.update(conversationParticipants).set({ activeMember: false, permanentlyRemoved: true, removedByAdmin: canAdmin(actor.role), leftAt: new Date(), updatedAt: new Date() }).where(eq(conversationParticipants.id, targetMember.id)); await db.update(conversations).set({ participantCount: Math.max(0, group.participantCount - 1), updatedAt: new Date() }).where(eq(conversations.id, id.data)); res.json({ success: true, removed: true });
});

router.patch("/groups/:conversationId/members/:profileId/role", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); const target = z.string().uuid().safeParse(req.params.profileId); const body = z.object({ role: z.enum(["admin", "member"]) }).strict().safeParse(req.body); if (!req.user?.userId || !id.success || !target.success || !body.success) return void res.status(400).json({ success: false, message: "Invalid group role." });
  const me = await profileId(req.user.userId); const actor = me ? await member(id.data, me) : null; const targetMember = await member(id.data, target.data); if (!actor || !targetMember || actor.role !== "owner") return void res.status(403).json({ success: false, message: "Only the group owner can manage admin roles." });
  if (targetMember.role === "owner") return void res.status(409).json({ success: false, message: "The group owner is always an admin." });
  await db.update(conversationParticipants).set({ role: body.data.role, updatedAt: new Date() }).where(eq(conversationParticipants.id, targetMember.id)); res.json({ success: true, role: body.data.role });
});

router.patch("/groups/:conversationId/members/:profileId/tag", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); const target = z.string().uuid().safeParse(req.params.profileId); const body = z.object({ tag: z.string().trim().max(80).nullable() }).strict().safeParse(req.body);
  if (!req.user?.userId || !id.success || !target.success || !body.success) return void res.status(400).json({ success: false, message: "Invalid member tag." });
  const me = await profileId(req.user.userId); const actor = me ? await member(id.data, me) : null; const targetMember = await member(id.data, target.data); if (!actor || !targetMember) return void res.status(403).json({ success: false, message: "Member access denied." });
  if (target.data !== me && !canAdmin(actor.role)) return void res.status(403).json({ success: false, message: "Only admins can change another member's tag." });
  await db.update(conversationParticipants).set({ memberTag: body.data.tag || null, updatedAt: new Date() }).where(eq(conversationParticipants.id, targetMember.id)); res.json({ success: true, tag: body.data.tag || null });
});

router.get("/groups/:conversationId/member-changes", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); if (!req.user?.userId || !id.success) return void res.status(400).json({ success: false, message: "Invalid group." });
  const me = await profileId(req.user.userId); if (!me || !await member(id.data, me)) return void res.status(403).json({ success: false, message: "You do not have access to this group." });
  const rows = await db.select({ id: activityLog.id, type: activityLog.activityType, title: activityLog.activityTitle, description: activityLog.activityDescription, createdAt: activityLog.createdAt }).from(activityLog).where(eq(activityLog.targetId, id.data)).orderBy(desc(activityLog.createdAt)).limit(100);
  res.json({ success: true, changes: rows });
});

router.post("/groups/:conversationId/transfer-owner", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); const body = z.object({ profileId: z.string().uuid() }).strict().safeParse(req.body); if (!req.user?.userId || !id.success || !body.success) return void res.status(400).json({ success: false, message: "Invalid ownership transfer." });
  const me = await profileId(req.user.userId); const actor = me ? await member(id.data, me) : null; const target = await member(id.data, body.data.profileId); if (!actor || actor.role !== "owner" || !target) return void res.status(403).json({ success: false, message: "Only the group owner can transfer ownership." });
  await db.transaction(async (tx) => { await tx.update(conversationParticipants).set({ role: "admin", updatedAt: new Date() }).where(eq(conversationParticipants.id, actor.id)); await tx.update(conversationParticipants).set({ role: "owner", updatedAt: new Date() }).where(eq(conversationParticipants.id, target.id)); });
  res.json({ success: true, ownerProfileId: body.data.profileId });
});

router.get("/groups/:conversationId/invite-link", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); if (!req.user?.userId || !id.success) return void res.status(400).json({ success: false, message: "Invalid group." });
  const me = await profileId(req.user.userId); const actor = me ? await member(id.data, me) : null; if (!actor) return void res.status(403).json({ success: false, message: "You do not have access to this group." });
  const [group] = await db.select({ participantCount: conversations.participantCount, anyoneCanInvite: conversations.anyoneCanInvite, groupName: conversations.groupName, groupPhoto: conversations.groupPhoto, joinApprovalRequired: conversations.joinApprovalRequired }).from(conversations).where(eq(conversations.id, id.data)).limit(1); if (!group) return void res.status(404).json({ success: false, message: "Group not found." });
  if (!canCreateInvite(group, actor.role)) return void res.status(403).json({ success: false, message: "Only group admins can create invite links for this group." });
  const invite = await ensureInvite(id.data, me!); res.json({ success: true, group, token: invite.token, link: `https://redom.app/group-invite/${invite.token}`, active: invite.active });
});

router.post("/groups/:conversationId/invite-link/reset", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); if (!req.user?.userId || !id.success) return void res.status(400).json({ success: false, message: "Invalid group." });
  const me = await profileId(req.user.userId); const actor = me ? await member(id.data, me) : null; if (!actor || !canAdmin(actor.role)) return void res.status(403).json({ success: false, message: "Only group admins can reset the invite link." });
  await db.update(groupInviteLinks).set({ active: false, resetAt: new Date() }).where(and(eq(groupInviteLinks.conversationId, id.data), eq(groupInviteLinks.active, true)));
  const invite = await ensureInvite(id.data, me!); res.json({ success: true, token: invite.token, link: `https://redom.app/group-invite/${invite.token}` });
});

router.get("/groups/invite/:token", async (req, res) => {
  const token = z.string().min(20).max(128).safeParse(req.params.token); if (!token.success) return void res.status(400).json({ success: false, message: "Invalid group invite." });
  const [invite] = await db.select({ token: groupInviteLinks.token, conversationId: groupInviteLinks.conversationId, active: groupInviteLinks.active }).from(groupInviteLinks).where(and(eq(groupInviteLinks.token, token.data), eq(groupInviteLinks.active, true))).limit(1); if (!invite) return void res.status(404).json({ success: false, message: "This group invite link is no longer valid." });
  const [group] = await db.select({ id: conversations.id, groupName: conversations.groupName, groupDescription: conversations.groupDescription, groupPhoto: conversations.groupPhoto, participantCount: conversations.participantCount, joinApprovalRequired: conversations.joinApprovalRequired, encrypted: conversations.encrypted }).from(conversations).where(and(eq(conversations.id, invite.conversationId), eq(conversations.deleted, false), eq(conversations.status, "active"))).limit(1); if (!group) return void res.status(404).json({ success: false, message: "This group is unavailable." });
  res.json({ success: true, group, link: `https://redom.app/group-invite/${invite.token}` });
});

router.post("/groups/invite/:token/join", async (req, res) => {
  const token = z.string().min(20).max(128).safeParse(req.params.token); if (!req.user?.userId || !token.success) return void res.status(400).json({ success: false, message: "Invalid group invite." });
  const me = await profileId(req.user.userId); if (!me) return void res.status(404).json({ success: false, message: "Profile not found." });
  const [invite] = await db.select({ conversationId: groupInviteLinks.conversationId }).from(groupInviteLinks).where(and(eq(groupInviteLinks.token, token.data), eq(groupInviteLinks.active, true))).limit(1); if (!invite) return void res.status(404).json({ success: false, message: "This group invite link is no longer valid." });
  const [group] = await db.select({ id: conversations.id, participantCount: conversations.participantCount, joinApprovalRequired: conversations.joinApprovalRequired, groupName: conversations.groupName }).from(conversations).where(eq(conversations.id, invite.conversationId)).limit(1); if (!group) return void res.status(404).json({ success: false, message: "Group not found." });
  if (group.participantCount >= 1024) return void res.status(409).json({ success: false, message: "This group is full." });
  if (await member(invite.conversationId, me)) return res.json({ success: true, joined: true, conversationId: invite.conversationId });
  const [existing] = await db.select().from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, invite.conversationId), eq(conversationParticipants.userId, me))).limit(1);
  if (existing?.permanentlyRemoved) return void res.status(403).json({ success: false, message: "You cannot join this group." });
  if (existing?.joinRequestApproved === false && !existing.permanentlyRemoved) return res.json({ success: true, pending: true, conversationId: invite.conversationId });
  if (existing) await db.delete(conversationParticipants).where(eq(conversationParticipants.id, existing.id));
  if (group.joinApprovalRequired) {
    await db.insert(conversationParticipants).values({ conversationId: invite.conversationId, userId: me, role: "member", invited: true, activeMember: false, joinRequestApproved: false, joinedByCreator: false });
    return res.status(202).json({ success: true, pending: true, conversationId: invite.conversationId });
  }
  await db.insert(conversationParticipants).values({ conversationId: invite.conversationId, userId: me, role: "member", invited: true, activeMember: true, joinRequestApproved: true, joinedByCreator: false });
  await db.update(conversations).set({ participantCount: sql`${conversations.participantCount} + 1`, updatedAt: new Date() }).where(eq(conversations.id, invite.conversationId));
  res.status(201).json({ success: true, joined: true, conversationId: invite.conversationId, groupName: group.groupName });
});

router.post("/groups/:conversationId/leave", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.conversationId); if (!req.user?.userId || !id.success) return void res.status(400).json({ success: false, message: "Invalid group." });
  const me = await profileId(req.user.userId); const actor = me ? await member(id.data, me) : null; if (!actor) return void res.status(403).json({ success: false, message: "You are not a group member." }); if (actor.role === "owner") return void res.status(409).json({ success: false, message: "Transfer group ownership before leaving." });
  const [group] = await db.select({ participantCount: conversations.participantCount }).from(conversations).where(eq(conversations.id, id.data)).limit(1); if (!group) return void res.status(404).json({ success: false, message: "Group not found." });
  await db.update(conversationParticipants).set({ activeMember: false, leftGroup: true, leftAt: new Date(), updatedAt: new Date() }).where(eq(conversationParticipants.id, actor.id)); await db.update(conversations).set({ participantCount: Math.max(0, group.participantCount - 1), updatedAt: new Date() }).where(eq(conversations.id, id.data)); res.json({ success: true, left: true });
});

export default router;

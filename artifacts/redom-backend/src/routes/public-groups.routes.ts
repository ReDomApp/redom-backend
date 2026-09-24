import { Router } from "express";
import { and, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db } from "../database/db";
import { publicGroups } from "../database/publicGroups";
import { publicGroupMembers } from "../database/publicGroupMembers";
import { userProfiles } from "../database/userProfiles";

const router = Router();
router.use(authMiddleware, authRateLimit);

async function meProfile(userId: string) {
  const [row] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return row?.id ?? null;
}

router.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20) || 20, 1), 50);
  const base = and(eq(publicGroups.status, "active"), eq(publicGroups.deleted, false), eq(publicGroups.moderationStatus, "approved"));
  const where = q ? and(base, ilike(publicGroups.name, "%" + q + "%")) : base;
  const rows = await db.select({
    id: publicGroups.id, name: publicGroups.name, description: publicGroups.description,
    groupPhoto: publicGroups.groupPhoto, coverPhoto: publicGroups.coverPhoto,
    memberCount: publicGroups.memberCount, memberApprovalRequired: publicGroups.memberApprovalRequired,
  }).from(publicGroups).where(where).orderBy(desc(publicGroups.memberCount), desc(publicGroups.updatedAt)).limit(limit);
  res.json({ success: true, groups: rows });
});

router.get("/mine", async (req, res) => {
  const profileId = await meProfile(req.user!.userId);
  if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  const rows = await db.select({
    id: publicGroups.id, name: publicGroups.name, description: publicGroups.description,
    groupPhoto: publicGroups.groupPhoto, memberCount: publicGroups.memberCount, role: publicGroupMembers.role,
  }).from(publicGroupMembers)
    .innerJoin(publicGroups, eq(publicGroups.id, publicGroupMembers.groupId))
    .where(and(eq(publicGroupMembers.profileId, profileId), eq(publicGroupMembers.active, true), eq(publicGroupMembers.pending, false), eq(publicGroups.deleted, false)))
    .orderBy(desc(publicGroups.updatedAt));
  res.json({ success: true, groups: rows });
});

router.post("/", async (req, res) => {
  const body = z.object({ name: z.string().trim().min(1).max(150), description: z.string().trim().max(5000).optional(), groupPhoto: z.string().url().optional(), coverPhoto: z.string().url().optional(), memberApprovalRequired: z.boolean().optional() }).strict().safeParse(req.body);
  if (!body.success || !req.user?.userId) return void res.status(400).json({ success: false, message: "A valid public group name is required." });
  const profileId = await meProfile(req.user.userId);
  if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  const [group] = await db.insert(publicGroups).values({ createdBy: profileId, name: body.data.name, description: body.data.description ?? null, groupPhoto: body.data.groupPhoto ?? null, coverPhoto: body.data.coverPhoto ?? null, memberApprovalRequired: body.data.memberApprovalRequired ?? false }).returning();
  if (!group) return void res.status(500).json({ success: false, message: "Public group could not be created." });
  await db.insert(publicGroupMembers).values({ groupId: group.id, profileId, role: "owner", active: true, pending: false });
  res.status(201).json({ success: true, group });
});

router.post("/:groupId/join", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.groupId);
  if (!id.success || !req.user?.userId) return void res.status(400).json({ success: false, message: "Invalid public group." });
  const profileId = await meProfile(req.user.userId);
  if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  const [group] = await db.select().from(publicGroups).where(and(eq(publicGroups.id, id.data), eq(publicGroups.status, "active"), eq(publicGroups.deleted, false), eq(publicGroups.moderationStatus, "approved"))).limit(1);
  if (!group) return void res.status(404).json({ success: false, message: "Public group not found." });
  const [existing] = await db.select().from(publicGroupMembers).where(and(eq(publicGroupMembers.groupId, id.data), eq(publicGroupMembers.profileId, profileId))).limit(1);
  if (existing?.active) return res.json({ success: true, joined: true, pending: false, groupId: id.data });
  const pending = group.memberApprovalRequired;
  if (existing) await db.update(publicGroupMembers).set({ active: !pending, pending, updatedAt: new Date() }).where(eq(publicGroupMembers.id, existing.id));
  else await db.insert(publicGroupMembers).values({ groupId: id.data, profileId, role: "member", active: !pending, pending });
  if (!pending && !existing?.active) await db.update(publicGroups).set({ memberCount: group.memberCount + 1, updatedAt: new Date() }).where(eq(publicGroups.id, id.data));
  res.status(201).json({ success: true, joined: !pending, pending, groupId: id.data });
});

router.post("/:groupId/leave", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.groupId);
  if (!id.success || !req.user?.userId) return void res.status(400).json({ success: false, message: "Invalid public group." });
  const profileId = await meProfile(req.user!.userId);
  if (!profileId) return void res.status(404).json({ success: false, message: "Profile not found." });
  const [member] = await db.select().from(publicGroupMembers).where(and(eq(publicGroupMembers.groupId, id.data), eq(publicGroupMembers.profileId, profileId), eq(publicGroupMembers.active, true))).limit(1);
  if (!member || member.role === "owner") return void res.status(400).json({ success: false, message: member?.role === "owner" ? "The group owner cannot leave the group." : "You are not a member of this group." });
  const [group] = await db.select({ memberCount: publicGroups.memberCount }).from(publicGroups).where(eq(publicGroups.id, id.data)).limit(1);
  await db.update(publicGroupMembers).set({ active: false, updatedAt: new Date() }).where(eq(publicGroupMembers.id, member.id));
  await db.update(publicGroups).set({ memberCount: Math.max(1, (group?.memberCount ?? 2) - 1), updatedAt: new Date() }).where(eq(publicGroups.id, id.data));
  res.json({ success: true, left: true });
});

export default router;

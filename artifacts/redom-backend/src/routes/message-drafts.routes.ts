import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { db } from "../database/db";
import { conversationParticipants } from "../database/conversationParticipants";
import { messageDrafts } from "../database/messageDrafts";
import { userProfiles } from "../database/userProfiles";

const router = Router();
router.use(authMiddleware, authRateLimit);

async function profileIdFor(userId: string) {
  const [profile] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return profile?.id ?? null;
}

async function requireMember(userId: string, conversationId: string) {
  const profileId = await profileIdFor(userId);
  if (!profileId) return null;
  const [member] = await db.select({ id: conversationParticipants.id }).from(conversationParticipants).where(and(
    eq(conversationParticipants.conversationId, conversationId),
    eq(conversationParticipants.userId, profileId),
    eq(conversationParticipants.activeMember, true),
    eq(conversationParticipants.temporarilySuspended, false),
    eq(conversationParticipants.permanentlyRemoved, false),
  )).limit(1);
  return member ? profileId : null;
}

const conversationIdSchema = z.string().uuid();

router.get("/conversations/:conversationId/draft", async (req, res) => {
  const conversationId = conversationIdSchema.safeParse(req.params.conversationId);
  if (!req.user?.userId || !conversationId.success) return void res.status(400).json({ success: false, message: "A valid conversation is required." });
  const profileId = await requireMember(req.user.userId, conversationId.data);
  if (!profileId) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  const [draft] = await db.select({ id: messageDrafts.id, draftMessage: messageDrafts.draftMessage, hasDraft: messageDrafts.hasDraft, discarded: messageDrafts.discarded, updatedAt: messageDrafts.updatedAt }).from(messageDrafts).where(and(eq(messageDrafts.conversationId, conversationId.data), eq(messageDrafts.userId, profileId), eq(messageDrafts.sent, false), eq(messageDrafts.discarded, false), eq(messageDrafts.hasDraft, true))).orderBy(messageDrafts.updatedAt).limit(1);
  res.json({ success: true, draft: draft ?? null });
});

router.put("/conversations/:conversationId/draft", async (req, res) => {
  const conversationId = conversationIdSchema.safeParse(req.params.conversationId);
  const body = z.object({ draftMessage: z.string().max(10000) }).strict().safeParse(req.body);
  if (!req.user?.userId || !conversationId.success || !body.success) return void res.status(400).json({ success: false, message: "A valid draft is required." });
  const profileId = await requireMember(req.user.userId, conversationId.data);
  if (!profileId) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  const value = body.data.draftMessage;
  const [existing] = await db.select({ id: messageDrafts.id }).from(messageDrafts).where(and(eq(messageDrafts.conversationId, conversationId.data), eq(messageDrafts.userId, profileId), eq(messageDrafts.sent, false))).orderBy(messageDrafts.updatedAt).limit(1);
  let draft;
  if (existing) {
    [draft] = await db.update(messageDrafts).set({ draftMessage: value || null, hasDraft: Boolean(value), discarded: false, updatedAt: new Date() }).where(eq(messageDrafts.id, existing.id)).returning({ id: messageDrafts.id, draftMessage: messageDrafts.draftMessage, hasDraft: messageDrafts.hasDraft, updatedAt: messageDrafts.updatedAt });
  } else {
    [draft] = await db.insert(messageDrafts).values({ conversationId: conversationId.data, userId: profileId, draftMessage: value || null, hasDraft: Boolean(value), sent: false, discarded: false }).returning({ id: messageDrafts.id, draftMessage: messageDrafts.draftMessage, hasDraft: messageDrafts.hasDraft, updatedAt: messageDrafts.updatedAt });
  }
  res.json({ success: true, draft: draft ?? null });
});

router.delete("/conversations/:conversationId/draft", async (req, res) => {
  const conversationId = conversationIdSchema.safeParse(req.params.conversationId);
  if (!req.user?.userId || !conversationId.success) return void res.status(400).json({ success: false, message: "A valid conversation is required." });
  const profileId = await requireMember(req.user.userId, conversationId.data);
  if (!profileId) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  await db.update(messageDrafts).set({ draftMessage: null, hasDraft: false, discarded: true, updatedAt: new Date() }).where(and(eq(messageDrafts.conversationId, conversationId.data), eq(messageDrafts.userId, profileId), eq(messageDrafts.sent, false)));
  res.json({ success: true, discarded: true });
});

router.post("/conversations/:conversationId/draft/clear-on-send", async (req, res) => {
  const conversationId = conversationIdSchema.safeParse(req.params.conversationId);
  if (!req.user?.userId || !conversationId.success) return void res.status(400).json({ success: false, message: "A valid conversation is required." });
  const profileId = await requireMember(req.user.userId, conversationId.data);
  if (!profileId) return void res.status(403).json({ success: false, message: "You do not have access to this conversation." });
  await db.update(messageDrafts).set({ draftMessage: null, hasDraft: false, sent: true, updatedAt: new Date() }).where(and(eq(messageDrafts.conversationId, conversationId.data), eq(messageDrafts.userId, profileId), eq(messageDrafts.sent, false)));
  res.json({ success: true, cleared: true });
});

export default router;

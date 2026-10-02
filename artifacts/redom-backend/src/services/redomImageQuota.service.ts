import { and, eq, gt, isNull, or, asc, sql } from "drizzle-orm";
import { db } from "../database/db";
import { reDomAiImageQuota } from "../database/reDomAiImageQuota";
import { verificationSubscriptions } from "../database/verificationSubscriptions";

export const IMAGE_QUOTA_LIMITS: Record<string, number> = {
  free: Number(process.env.REDOM_AI_IMAGE_QUOTA_FREE ?? "5"),
  standard: Number(process.env.REDOM_AI_IMAGE_QUOTA_STANDARD ?? "20"),
  standard_plus: Number(process.env.REDOM_AI_IMAGE_QUOTA_STANDARD_PLUS ?? "50"),
  plus: Number(process.env.REDOM_AI_IMAGE_QUOTA_PLUS ?? "100"),
  creator: Number(process.env.REDOM_AI_IMAGE_QUOTA_CREATOR ?? "200"),
  business: Number(process.env.REDOM_AI_IMAGE_QUOTA_BUSINESS ?? "500"),
  corporate: Number(process.env.REDOM_AI_IMAGE_QUOTA_CORPORATE ?? "1000"),
};

const ENTITLEMENT_PRIORITY = ["corporate", "business", "creator", "plus", "standard_plus", "standard"] as const;
const UPGRADE_PRODUCT_BY_ENTITLEMENT: Record<string, string | null> = { free: "redom_ai_standard", standard: "redom_ai_standard_plus", standard_plus: "redom_ai_plus", plus: "redom_ai_creator", creator: "redom_ai_business", business: "redom_ai_corporate", corporate: null };

export type ImageQuotaStatus = {
  entitlement: string;
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
};

export class ReDomImageQuotaError extends Error {
  status = 429 as const;
  code = "IMAGE_QUOTA_EXCEEDED" as const;
  quota: ImageQuotaStatus;
  upgradeProduct: string | null;

  constructor(quota: ImageQuotaStatus, upgradeProduct: string | null) {
    super("You’ve reached your current image-generation limit.");
    this.name = "ReDomImageQuotaError";
    this.quota = quota;
    this.upgradeProduct = upgradeProduct;
  }
}

function normalizeLimit(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function planRank(value: string) {
  const index = ENTITLEMENT_PRIORITY.indexOf(value as typeof ENTITLEMENT_PRIORITY[number]);
  return index === -1 ? ENTITLEMENT_PRIORITY.length : index;
}

async function resolveEntitlement(userId: string) {
  const now = new Date();
  const rows = await db.select({
    subscriptionType: verificationSubscriptions.subscriptionType,
    subscriptionStatus: verificationSubscriptions.subscriptionStatus,
    expiresAt: verificationSubscriptions.expiresAt,
  }).from(verificationSubscriptions).where(and(
    eq(verificationSubscriptions.userId, userId),
    eq(verificationSubscriptions.subscriptionStatus, "active"),
    or(isNull(verificationSubscriptions.expiresAt), gt(verificationSubscriptions.expiresAt, now)),
  ));
  const active = rows.sort((a, b) => planRank(a.subscriptionType) - planRank(b.subscriptionType))[0];
  const entitlement = active?.subscriptionType && IMAGE_QUOTA_LIMITS[active.subscriptionType] ? active.subscriptionType : "free";
  return { entitlement, limit: normalizeLimit(IMAGE_QUOTA_LIMITS[entitlement], 5) };
}

async function currentOrCreateWindow(userId: string, entitlement: string, limit: number) {
  const now = new Date();
  const existing = await db.select().from(reDomAiImageQuota)
    .where(and(eq(reDomAiImageQuota.userId, userId), gt(reDomAiImageQuota.windowResetAt, now)))
    .orderBy(asc(reDomAiImageQuota.windowStartedAt))
    .limit(1);
  if (existing[0]) return existing[0];

  const started = now;
  const reset = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const inserted = await db.insert(reDomAiImageQuota).values({
    userId,
    entitlement,
    windowStartedAt: started,
    windowResetAt: reset,
    limit,
    used: 0,
    reserved: 0,
  }).onConflictDoNothing().returning();
  if (inserted[0]) return inserted[0];

  const raced = await db.select().from(reDomAiImageQuota)
    .where(and(eq(reDomAiImageQuota.userId, userId), gt(reDomAiImageQuota.windowResetAt, now)))
    .orderBy(asc(reDomAiImageQuota.windowStartedAt))
    .limit(1);
  if (!raced[0]) throw new Error("Unable to initialize ReDom image quota.");
  return raced[0];
}

function publicQuota(row: typeof reDomAiImageQuota.$inferSelect): ImageQuotaStatus {
  return {
    entitlement: row.entitlement,
    used: row.used,
    limit: row.limit,
    remaining: Math.max(0, row.limit - row.used),
    resetAt: row.windowResetAt.toISOString(),
  };
}

export async function getReDomImageQuota(userId: string): Promise<ImageQuotaStatus> {
  const entitlement = await resolveEntitlement(userId);
  const row = await currentOrCreateWindow(userId, entitlement.entitlement, entitlement.limit);
  if (row.entitlement !== entitlement.entitlement || row.limit !== entitlement.limit) {
    await db.update(reDomAiImageQuota).set({
      entitlement: entitlement.entitlement,
      limit: entitlement.limit,
      updatedAt: new Date(),
    }).where(eq(reDomAiImageQuota.id, row.id));
    row.entitlement = entitlement.entitlement;
    row.limit = entitlement.limit;
  }
  return publicQuota(row);
}

export async function reserveReDomImageQuota(userId: string) {
  const entitlement = await resolveEntitlement(userId);
  const row = await currentOrCreateWindow(userId, entitlement.entitlement, entitlement.limit);

  const updated = await db.update(reDomAiImageQuota).set({
    reserved: row.reserved + 1,
    entitlement: entitlement.entitlement,
    limit: entitlement.limit,
    updatedAt: new Date(),
  }).where(and(
    eq(reDomAiImageQuota.id, row.id),
    sql`(${reDomAiImageQuota.used} + ${reDomAiImageQuota.reserved}) < ${entitlement.limit}`,
  )).returning();

  if (!updated[0]) {
    const quota = publicQuota({ ...row, entitlement: entitlement.entitlement, limit: entitlement.limit });
    throw new ReDomImageQuotaError(quota, UPGRADE_PRODUCT_BY_ENTITLEMENT[entitlement.entitlement] ?? "redom_ai_standard");
  }

  const reservationId = updated[0].id;
  let committed = false;
  return {
    quota: publicQuota(updated[0]),
    commit: async () => {
      if (committed) return;
      committed = true;
      await db.update(reDomAiImageQuota).set({
        used: updated[0].used + 1,
        reserved: Math.max(0, updated[0].reserved - 1),
        updatedAt: new Date(),
      }).where(eq(reDomAiImageQuota.id, reservationId));
    },
    release: async () => {
      if (committed) return;
      committed = true;
      await db.update(reDomAiImageQuota).set({
        reserved: Math.max(0, updated[0].reserved - 1),
        updatedAt: new Date(),
      }).where(eq(reDomAiImageQuota.id, reservationId));
    },
  };
}

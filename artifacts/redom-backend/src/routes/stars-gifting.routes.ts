import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../database/db";

const router = Router();
const STAR_REWARD_VALUE_MINOR = 10;
const CREATOR_SHARE_PERCENT = 40;
const REDOM_GROSS_PERCENT = 60;

router.post("/stars/send", authMiddleware, async (req, res) => {
  const parsed = z.object({ recipientUserId: z.string().uuid(), stars: z.number().int().positive().max(1000000) }).safeParse(req.body);
  const senderUserId = req.user?.userId;
  if (!senderUserId) return res.status(401).json({ success: false, message: "Authentication required." });
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid Stars transfer." });
  if (senderUserId === parsed.data.recipientUserId) return res.status(400).json({ success: false, message: "You cannot send Stars to yourself." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const recipient = await client.query("SELECT u.id, COALESCE(up.professional_mode,false) AS professional_mode FROM users u LEFT JOIN user_profiles up ON up.user_id=u.id WHERE u.id=$1 LIMIT 1 FOR UPDATE OF u", [parsed.data.recipientUserId]);
    if (!recipient.rows[0]) throw new Error("Recipient not found.");
    await client.query("INSERT INTO redom_stars_accounts(user_id) VALUES($1),($2) ON CONFLICT(user_id) DO NOTHING", [senderUserId, parsed.data.recipientUserId]);
    const sender = await client.query("SELECT balance FROM redom_stars_accounts WHERE user_id=$1 FOR UPDATE", [senderUserId]);
    const recipientBalance = await client.query("SELECT balance FROM redom_stars_accounts WHERE user_id=$1 FOR UPDATE", [parsed.data.recipientUserId]);
    const senderBalance = BigInt(String(sender.rows[0]?.balance ?? "0"));
    const stars = BigInt(parsed.data.stars);
    if (senderBalance < stars) throw new Error("You do not have enough ReDom Stars.");
    const nextSenderBalance = senderBalance - stars;
    const nextRecipientBalance = BigInt(String(recipientBalance.rows[0]?.balance ?? "0")) + stars;
    const rewardValueMinor = BigInt(parsed.data.stars) * BigInt(STAR_REWARD_VALUE_MINOR);
    const creatorEligible = Boolean(recipient.rows[0].professional_mode);
    const creatorShareMinor = creatorEligible ? rewardValueMinor * BigInt(CREATOR_SHARE_PERCENT) / 100n : 0n;
    const redomGrossMinor = creatorEligible ? rewardValueMinor * BigInt(REDOM_GROSS_PERCENT) / 100n : rewardValueMinor;
    const reference = "rdgift_" + Date.now().toString(36) + "_" + Math.random().toString(16).slice(2,10);
    await client.query("UPDATE redom_stars_accounts SET balance=$1,updated_at=now() WHERE user_id=$2", [nextSenderBalance.toString(), senderUserId]);
    await client.query("UPDATE redom_stars_accounts SET balance=$1,updated_at=now() WHERE user_id=$2", [nextRecipientBalance.toString(), parsed.data.recipientUserId]);
    await client.query("INSERT INTO redom_stars_transactions(user_id,type,stars,balance_after,reference,reward_value_minor,creator_share_minor,redom_gross_minor) VALUES($1,'adjustment',$2,$3,$4,$5,$6,$7)", [senderUserId, -parsed.data.stars, nextSenderBalance.toString(), reference, rewardValueMinor.toString(), creatorShareMinor.toString(), redomGrossMinor.toString()]);
    await client.query("INSERT INTO redom_stars_transactions(user_id,type,stars,balance_after,reference,reward_value_minor,creator_share_minor,redom_gross_minor) VALUES($1,'adjustment',$2,$3,$4,$5,$6,$7)", [parsed.data.recipientUserId, parsed.data.stars, nextRecipientBalance.toString(), reference, rewardValueMinor.toString(), creatorShareMinor.toString(), redomGrossMinor.toString()]);
    const gift = await client.query("INSERT INTO redom_stars_gifts(sender_user_id,recipient_user_id,stars,reward_value_minor,creator_share_minor,redom_gross_minor,creator_eligible) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [senderUserId, parsed.data.recipientUserId, parsed.data.stars, rewardValueMinor.toString(), creatorShareMinor.toString(), redomGrossMinor.toString(), creatorEligible]);
    if (creatorEligible) {
      const month = new Date(); month.setUTCDate(1);
      await client.query("INSERT INTO redom_creator_earnings(creator_user_id,gift_id,stars,reward_value_minor,creator_share_minor,status,earning_month) VALUES($1,$2,$3,$4,$5,'pending',$6)", [parsed.data.recipientUserId, gift.rows[0].id, parsed.data.stars, rewardValueMinor.toString(), creatorShareMinor.toString(), month.toISOString().slice(0,10)]);
    }
    await client.query("COMMIT");
    return res.json({ success:true, starsSent:parsed.data.stars, recipientUserId:parsed.data.recipientUserId, creatorEligible, rewardValueUsd:Number(rewardValueMinor)/100, creatorShareUsd:Number(creatorShareMinor)/100, redomGrossUsd:Number(redomGrossMinor)/100, senderBalance:Number(nextSenderBalance), recipientBalance:Number(nextRecipientBalance), reference });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return res.status(400).json({ success:false, message:error instanceof Error ? error.message : "Unable to send Stars." });
  } finally { client.release(); }
});

router.get("/stars/creator/earnings", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success:false, message:"Authentication required." });
  const result = await pool.query("SELECT earning_month, SUM(stars)::bigint AS stars, SUM(creator_share_minor)::bigint AS creator_share_minor, SUM(reward_value_minor)::bigint AS reward_value_minor, status FROM redom_creator_earnings WHERE creator_user_id=$1 GROUP BY earning_month,status ORDER BY earning_month DESC LIMIT 24", [userId]);
  return res.json({ success:true, sharePercent:CREATOR_SHARE_PERCENT, starRewardValueUsd:STAR_REWARD_VALUE_MINOR/100, months:result.rows.map(row=>({ earningMonth:new Date(row.earning_month).toISOString().slice(0,10), stars:Number(row.stars??0), rewardValueUsd:Number(row.reward_value_minor??0)/100, creatorShareUsd:Number(row.creator_share_minor??0)/100, status:String(row.status) })) });
});

export default router;
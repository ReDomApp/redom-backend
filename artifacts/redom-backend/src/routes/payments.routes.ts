import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../database/db";
import { initializeSubscriptionRenewal, verifyPayment, handlePaymentWebhook, verifyPaymentFromCallback, sendPaymentEmailForReference } from "../services/payments/payment.service";
import { verifyStripePayment, verifyStripeStarsCheckout, handleStripeWebhook, stripeCallbackRedirect } from "../services/payments/stripe-payment.service";
import { verifyStarsTrialSetup } from "../services/payments/stripe-stars-trial.service";

const router = Router();


router.post("/subscription/renew", authMiddleware, async (req, res) => {
  const parsed = z.object({ subscriptionId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success || !req.user?.userId) return res.status(400).json({ success: false, message: "A valid subscription is required." });
  try {
    const result = await initializeSubscriptionRenewal(req.user.userId, parsed.data.subscriptionId);
    return res.json({ success: true, checkoutUrl: result.authorizationUrl, reference: result.reference });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to start payment." });
  }
});

router.get("/verify/:reference", authMiddleware, async (req, res) => {
  if (!req.user?.userId) return res.status(401).json({ success: false, message: "Authentication required." });
  const reference = z.string().min(8).max(100).regex(/^[A-Za-z0-9_.=-]+$/).safeParse(req.params.reference);
  if (!reference.success) return res.status(400).json({ success: false, message: "Invalid payment reference." });
  try {
    const trialSetup = await pool.query("SELECT 1 FROM redom_stars_trial_setups WHERE reference=$1 AND user_id=$2 LIMIT 1",[reference.data,req.user.userId]);
    if(trialSetup.rows[0]) {
      const trial = await verifyStarsTrialSetup(req.user.userId, reference.data);
      return res.json({ success:true, payment:{ status:trial.status, transactionId:null, redomTransactionId:null, amountMinor:String(trial.trial?.conversion_amount_minor??"199"), currency:String(trial.trial?.currency??"USD"), purpose:"stars_trial_setup", finalFailure:false, trial:trial.trial } });
    }
    const stripeTx = await pool.query("SELECT metadata FROM payment_transactions WHERE reference=$1 AND user_id=$2 LIMIT 1",[reference.data,req.user.userId]);
    let stripeMetadata:any={}; try { stripeMetadata = stripeTx.rows[0]?.metadata ? (typeof stripeTx.rows[0].metadata==="string" ? JSON.parse(stripeTx.rows[0].metadata) : stripeTx.rows[0].metadata) : {}; } catch {}
    if (stripeMetadata?.provider === "stripe") {
      const payment = await verifyStripePayment(req.user.userId, reference.data);
      if (payment.status === "paid") await sendPaymentEmailForReference(reference.data);
      return res.json({ success: true, payment });
    }
    const deferredStripeAttempt = await pool.query(
      "SELECT 1 FROM stripe_stars_checkout_attempts WHERE reference=$1 AND user_id=$2 LIMIT 1",
      [reference.data,req.user.userId],
    );
    if (deferredStripeAttempt.rows[0]) {
      const payment = await verifyStripeStarsCheckout(req.user.userId, reference.data);
      return res.json({ success: true, payment });
    }
    const payment = await verifyPayment(req.user.userId, reference.data);
    if (payment.status === "paid") await sendPaymentEmailForReference(reference.data);
    return res.json({ success: true, payment });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to verify payment." });
  }
});

router.get("/stripe/callback", async (req,res)=>{
  const reference=z.string().min(8).max(100).regex(/^[A-Za-z0-9_.=-]+$/).safeParse(req.query.reference);
  const sessionId=typeof req.query.session_id==="string" ? req.query.session_id : undefined;
  const status=typeof req.query.status==="string" ? req.query.status : undefined;
  if(!reference.success)return res.status(400).send("Invalid Stripe payment reference.");
  const target=await stripeCallbackRedirect(reference.data,sessionId,status);
  return res.redirect(target);
});

router.get("/callback", async (req, res) => {
  const reference = z.string().min(8).max(100).regex(/^[A-Za-z0-9_.=-]+$/).safeParse(req.query.reference);
  if (!reference.success) return res.status(400).send("Invalid payment reference.");
  try {
    const verified = await verifyPaymentFromCallback(reference.data);
    if (verified.status === "paid") await sendPaymentEmailForReference(reference.data);
    const status = verified.status === "paid" ? "success" : verified.status;
    return res.redirect("redom://payment/callback?reference=" + encodeURIComponent(reference.data) + "&status=" + encodeURIComponent(status));
  } catch {
    return res.redirect("redom://payment/callback?reference=" + encodeURIComponent(reference.data) + "&status=error");
  }
});

router.post("/webhook", async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  try {
    const payload = Buffer.isBuffer(req.body) ? JSON.parse(raw.toString("utf8")) : req.body;
    await handlePaymentWebhook(raw, req.header("x-paystack-signature") ?? undefined, payload);
    if (payload?.event === "charge.success" && payload?.data?.reference) await sendPaymentEmailForReference(String(payload.data.reference));
    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(401).json({ received: false, message: error instanceof Error ? error.message : "Webhook rejected." });
  }
});

export default router;
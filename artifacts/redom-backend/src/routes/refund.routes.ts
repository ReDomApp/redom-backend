import { Router, type Response } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { REFUND_FEATURE_ENABLED, startStarsRefund, verifyStarsRefundAccountProfile, completeStarsRefund } from "../services/refund/refund.service";

const router = Router();

const transactionSchema = z.object({
  transactionNumber: z.string().trim().regex(/^(?:R-?\d{13}|\d{13})$/i),
});

const verificationSchema = z.object({
  transactionNumber: z.string().trim().regex(/^R-\d{13}$/i),
  code: z.string().regex(/^\d{6}$|^\d{8}$/),
});

function unavailable(res: Response) {
  return res.status(503).json({
    success: false,
    code: "REFUNDS_NOT_AVAILABLE",
    message: "ReDom refunds are not currently available.",
  });
}

router.post("/request", authMiddleware, async (req, res) => {
  if (!REFUND_FEATURE_ENABLED) return unavailable(res);
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, code:"INVALID_TRANSACTION_NUMBER", message:"Enter a valid ReDom Transaction ID." });
  try {
    const result = await startStarsRefund({ userId:req.user!.userId, transactionNumber:parsed.data.transactionNumber });
    if (result.status === "non_refundable") return res.status(409).json(result);
    if (!result.success) return res.status(400).json(result);
    return res.status(201).json(result);
  } catch (error) {
    req.log?.error?.({err:error},"Stars refund request failed");
    return res.status(500).json({success:false,code:"REFUND_REQUEST_FAILED",message:error instanceof Error?error.message:"Unable to start the refund request."});
  }
});

router.post("/transaction", authMiddleware, async (req,res) => {
  if (!REFUND_FEATURE_ENABLED) return unavailable(res);
  const parsed=transactionSchema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json({success:false,code:"INVALID_TRANSACTION_NUMBER",message:"Enter a valid ReDom Transaction ID."});
  try {
    const result=await startStarsRefund({userId:req.user!.userId,transactionNumber:parsed.data.transactionNumber});
    if(result.status==="non_refundable") return res.status(409).json(result);
    return res.status(result.success?200:400).json(result);
  } catch(error) {
    return res.status(500).json({success:false,code:"REFUND_TRANSACTION_FAILED",message:error instanceof Error?error.message:"Unable to validate the transaction."});
  }
});

router.post("/account-profile", authMiddleware, async (req,res) => {
  const parsed=z.object({transactionNumber:z.string().trim().min(1)}).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({success:false,code:"INVALID_TRANSACTION",message:"A valid transaction number is required."});
  try {
    const result=await verifyStarsRefundAccountProfile({userId:req.user!.userId,transactionNumber:parsed.data.transactionNumber,accountProfileId:""});
    if(result.status==="non_refundable") return res.status(409).json(result);
    return res.status(result.success?200:400).json(result);
  } catch(error) {});

router.post("/verify-code", authMiddleware, async (req,res) => {
  const parsed=verificationSchema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json({success:false,code:"INVALID_VERIFICATION_CODE",message:"Enter the current 8-digit phone code or 6-digit email fallback code."});
  try {
    const result=await completeStarsRefund({userId:req.user!.userId,transactionNumber:parsed.data.transactionNumber,code:parsed.data.code});
    if(result.status==="non_refundable") return res.status(409).json(result);
    return res.status(result.success?200:400).json(result);
  } catch(error) {
    req.log?.error?.({err:error},"Stars refund verification failed");
    return res.status(400).json({success:false,code:"REFUND_VERIFICATION_FAILED",message:error instanceof Error?error.message:"Unable to complete refund verification."});
  }
});

router.post("/stars", authMiddleware, async (req,res) => {
  if(!REFUND_FEATURE_ENABLED) return unavailable(res);
  const parsed=transactionSchema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json({success:false,code:"INVALID_TRANSACTION_NUMBER",message:"Enter a valid ReDom Transaction ID."});
  try {
    const result=await startStarsRefund({userId:req.user!.userId,transactionNumber:parsed.data.transactionNumber});
    if(result.status==="non_refundable") return res.status(409).json(result);
    return res.status(result.success?201:400).json(result);
  } catch(error) {
    return res.status(500).json({success:false,code:"REFUND_REQUEST_FAILED",message:error instanceof Error?error.message:"Unable to start the Stars refund."});
  }
});

export default router;

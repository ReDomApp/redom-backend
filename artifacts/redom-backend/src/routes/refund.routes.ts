import { Router, type Response } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { REFUND_FEATURE_ENABLED, startStarsRefund, verifyStarsRefundAccountProfile, completeStarsRefund, getOwnedRefundCase } from "../services/refund/refund.service";
import { addSupportMessage, getAccountContextById, getOwnedSupportCase, getSupportCaseMessages } from "../services/support/support.service";
import { generatePolicyAwareSupportReply } from "../services/support/policy-aware-support.service";

const router = Router();

const transactionSchema = z.object({
  transactionNumber: z.string().trim().min(3).max(100).regex(/^[A-Za-z0-9_.=-]+$/),
});

const verificationSchema = z.object({
  transactionNumber: z.string().trim().regex(/^(?:R-?\d{13}|\d{13})$/i),
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
  } catch(error) { req.log?.error?.({err:error},"Stars refund account verification failed"); return res.status(500).json({success:false,code:"REFUND_ACCOUNT_VERIFICATION_FAILED",message:error instanceof Error?error.message:"Unable to start refund verification."}); }
});

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


const caseNumberSchema = z.string().trim().regex(/^R\d{11}$/i);

router.get("/cases/:caseNumber", authMiddleware, async (req,res) => {
  const parsed=caseNumberSchema.safeParse(req.params.caseNumber);
  if(!parsed.success) return res.status(400).json({success:false,code:"INVALID_CASE_NUMBER",message:"Invalid refund case number."});
  try {
    const refundCase=await getOwnedRefundCase({userId:req.user!.userId,caseNumber:parsed.data});
    if(!refundCase) return res.status(404).json({success:false,code:"REFUND_CASE_NOT_FOUND",message:"Refund case not found."});
    return res.json({success:true,refundCase});
  } catch(error) {
    req.log?.error?.({err:error},"Refund case read failed");
    return res.status(500).json({success:false,code:"REFUND_CASE_READ_FAILED",message:"Unable to load the refund case."});
  }
});

router.post("/cases/:caseNumber/messages", authMiddleware, async (req,res) => {
  const parsed=z.object({
    message:z.string().trim().min(1).max(12000),
    useGemini:z.boolean().optional().default(true),
  }).strict().safeParse(req.body);
  const caseNumber=caseNumberSchema.safeParse(req.params.caseNumber);
  if(!caseNumber.success || !parsed.success) return res.status(400).json({success:false,code:"INVALID_REFUND_MESSAGE",message:"Enter a valid refund case message."});
  try {
    const supportCase=await getOwnedSupportCase(req.user!.userId,caseNumber.data);
    if(!supportCase || supportCase.category!=="refund_payment") return res.status(404).json({success:false,code:"REFUND_CASE_NOT_FOUND",message:"Refund case not found."});
    if(supportCase.status==="closed") return res.status(409).json({success:false,code:"REFUND_CASE_CLOSED",message:"This refund case is closed and cannot receive new messages."});
    const refundCase=await getOwnedRefundCase({userId:req.user!.userId,caseNumber:caseNumber.data});
    if(!refundCase) return res.status(404).json({success:false,code:"REFUND_CASE_NOT_FOUND",message:"Refund case not found."});
    await addSupportMessage({caseId:supportCase.id,senderType:"user",senderEmail:"authenticated-in-app-user",body:parsed.data.message});
    if(parsed.data.useGemini) {
      const account=await getAccountContextById(req.user!.userId);
      const history=await getSupportCaseMessages(supportCase.id,30);
      const ai=await generatePolicyAwareSupportReply({message:parsed.data.message,subject:supportCase.subject,account,supportCase,history});
      if(ai.is_safe && ai.support_reply) {
        const reply=ai.support_reply.trim()+"\n\n"+refundCase.securityWarning;
        await addSupportMessage({caseId:supportCase.id,senderType:"ai",senderEmail:null,body:reply});
      }
    }
    const updated=await getOwnedRefundCase({userId:req.user!.userId,caseNumber:caseNumber.data});
    return res.status(201).json({success:true,refundCase:updated});
  } catch(error) {
    req.log?.error?.({err:error},"Refund case message failed");
    return res.status(500).json({success:false,code:"REFUND_CASE_MESSAGE_FAILED",message:"Unable to send the refund case message."});
  }
});

export default router;

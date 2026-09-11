import { Request, Response } from "express";
import { registrationVerificationService } from "../services/auth/registration-verification.service";
import { z } from "zod";

const paramsSchema = z.object({
  verificationChallengeId: z.string().uuid(),
});
const resendSchema = z.object({
  reservationId: z.string().uuid(),
  flowId: z.string().regex(/^\d{6,16}$/),
  deviceId: z.string().trim().min(1).max(255).optional(),
});
const switchSchema = resendSchema.extend({
  contactType: z.enum(["phone", "email"]),
  target: z.string().trim().min(3).max(320),
});

function verificationId(req: Request) { return paramsSchema.parse(req.params).verificationChallengeId; }

export class RegistrationVerificationController {
  async resend(req: Request, res: Response) {
    try {
      const body = resendSchema.parse(req.body);
      res.status(200).json(await registrationVerificationService.resend({ verificationChallengeId: verificationId(req), ...body }));
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to resend the verification code." });
    }
  }

  async switchContact(req: Request, res: Response) {
    try {
      const body = switchSchema.parse(req.body);
      res.status(200).json(await registrationVerificationService.switchContact({ verificationChallengeId: verificationId(req), ...body }));
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to send a verification code to the new contact." });
    }
  }
}

export const registrationVerificationController = new RegistrationVerificationController();

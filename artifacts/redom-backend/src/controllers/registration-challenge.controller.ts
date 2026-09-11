import { Request, Response } from "express";

import { registrationChallengeService } from "../services/auth/registration-challenge.service";
import "../services/auth/registration-flow-reservation.consume";
import "../services/auth/registration-challenge-complete-raw-flow";
import {
  completeRegistrationChallengeSchema,
  saveRegistrationStepSchema,
  startRegistrationChallengeSchema,
  verifyRegistrationChallengeSchema,
} from "../validators/registration-challenge.validator";

function requestContext(req: Request) {
  return { requestIp: req.ip, userAgent: req.get("user-agent") ?? undefined, deviceId: req.body?.deviceId };
}
function routeParam(value: string | string[] | undefined, name: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && value.length === 1 && value[0]) return value[0];
  throw new Error(`${name} is required.`);
}
function verificationChallengeId(req: Request): string {
  const routeValue = req.params?.verificationChallengeId;
  if (typeof routeValue === "string" && routeValue.length > 0) return routeValue;
  const bodyValue = req.body?.verificationChallengeId;
  if (typeof bodyValue === "string" && bodyValue.length > 0) return bodyValue;
  throw new Error("Verification challenge ID is required.");
}

export class RegistrationChallengeController {
  async start(req: Request, res: Response) { try { const result = await registrationChallengeService.start({ ...startRegistrationChallengeSchema.parse(req.body), ...requestContext(req) }); res.status(201).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to start registration." }); } }
  async saveStep(req: Request, res: Response) { try { const result = await registrationChallengeService.saveStep({ challengeId: routeParam(req.params.challengeId, "challengeId"), ...saveRegistrationStepSchema.parse(req.body) }); res.status(200).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to save registration step." }); } }
  async complete(req: Request, res: Response) { try { const result = await registrationChallengeService.complete({ challengeId: routeParam(req.params.challengeId, "challengeId"), ...completeRegistrationChallengeSchema.parse(req.body) }); res.status(201).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to complete registration." }); } }
  async verify(req: Request, res: Response) {
    try {
      const challengeId = verificationChallengeId(req);
      const body = verifyRegistrationChallengeSchema.parse({ verificationChallengeId: challengeId, code: req.body?.code });
      const result = await registrationChallengeService.verify({ verificationChallengeId: body.verificationChallengeId, code: body.code });
      res.status(200).json(result);
    } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Account verification failed." }); }
  }
  async getFlow(req: Request, res: Response) { try { const result = await registrationChallengeService.getFlow(routeParam(req.params.challengeId, "challengeId")); res.status(200).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Registration flow unavailable." }); } }
}
export const registrationChallengeController = new RegistrationChallengeController();

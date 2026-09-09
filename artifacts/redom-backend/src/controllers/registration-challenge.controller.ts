import { Request, Response } from "express";

import { registrationChallengeService } from "../services/auth/registration-challenge.service";
import {
  completeRegistrationChallengeSchema,
  saveRegistrationStepSchema,
  startRegistrationChallengeSchema,
  verifyRegistrationChallengeSchema,
} from "../validators/registration-challenge.validator";

function requestContext(req: Request) {
  return {
    requestIp: req.ip,
    userAgent: req.get("user-agent") ?? undefined,
    deviceId: req.body?.deviceId,
  };
}

export class RegistrationChallengeController {
  async start(req: Request, res: Response) {
    try {
      const result = await registrationChallengeService.start({
        ...startRegistrationChallengeSchema.parse(req.body),
        ...requestContext(req),
      });
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Unable to start registration.",
      });
    }
  }

  async saveStep(req: Request, res: Response) {
    try {
      const result = await registrationChallengeService.saveStep({
        challengeId: req.params.challengeId,
        ...saveRegistrationStepSchema.parse(req.body),
      });
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Unable to save registration step.",
      });
    }
  }

  async complete(req: Request, res: Response) {
    try {
      const result = await registrationChallengeService.complete({
        challengeId: req.params.challengeId,
        ...completeRegistrationChallengeSchema.parse(req.body),
      });
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Unable to complete registration.",
      });
    }
  }

  async verify(req: Request, res: Response) {
    try {
      const result = await registrationChallengeService.verify({
        registrationChallengeId: req.params.challengeId,
        ...verifyRegistrationChallengeSchema.parse(req.body),
      });
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Account verification failed.",
      });
    }
  }

  async getFlow(req: Request, res: Response) {
    try {
      const result = await registrationChallengeService.getFlow(req.params.challengeId);
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Registration flow unavailable.",
      });
    }
  }
}

export const registrationChallengeController = new RegistrationChallengeController();

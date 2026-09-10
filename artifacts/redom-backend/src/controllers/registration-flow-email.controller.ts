import type { Request, Response } from "express";

import { registrationFlowEmailService } from "../services/auth/registration-flow-email.service";
import { saveRegistrationFlowEmailSchema } from "../validators/registration-challenge.validator";

function reservationIdFrom(req: Request) {
  const value = req.params.reservationId;
  return typeof value === "string" ? value : undefined;
}

export class RegistrationFlowEmailController {
  async save(req: Request, res: Response) {
    try {
      const reservationId = reservationIdFrom(req);
      if (!reservationId) throw new Error("reservationId is required.");
      const input = saveRegistrationFlowEmailSchema.parse(req.body);
      const result = await registrationFlowEmailService.save({ reservationId, ...input });
      return res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the registration email.";
      return res.status(400).json({ success: false, message });
    }
  }
}

export const registrationFlowEmailController = new RegistrationFlowEmailController();

import { Request, Response } from "express";
import { registrationFlowReservationService } from "../services/auth/registration-flow-reservation.service";
import { reserveRegistrationFlowSchema } from "../validators/registration-challenge.validator";

export class RegistrationFlowController {
  async reserve(req: Request, res: Response) {
    try {
      const input = reserveRegistrationFlowSchema.parse(req.body ?? {});
      const result = await registrationFlowReservationService.reserve(input.deviceId);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Unable to create registration Flow ID.",
      });
    }
  }
}

export const registrationFlowController = new RegistrationFlowController();

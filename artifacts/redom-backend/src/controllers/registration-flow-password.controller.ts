import type { Request, Response } from "express";
import { registrationFlowPasswordService } from "../services/auth/registration-flow-password.service";
import { saveRegistrationFlowPasswordSchema } from "../validators/registration-challenge.validator";

export class RegistrationFlowPasswordController {
  async save(req: Request, res: Response) {
    try {
      const reservationId = typeof req.params.reservationId === "string" ? req.params.reservationId : undefined;
      if (!reservationId) throw new Error("reservationId is required.");
      const input = saveRegistrationFlowPasswordSchema.parse(req.body);
      const result = await registrationFlowPasswordService.save({ reservationId, ...input });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to save password details." });
    }
  }
}
export const registrationFlowPasswordController = new RegistrationFlowPasswordController();

import { Request, Response } from "express";
import { registrationFlowReservationService } from "../services/auth/registration-flow-reservation.service";
import {
  reserveRegistrationFlowSchema,
  saveRegistrationFlowBirthdaySchema,
  saveRegistrationFlowGenderSchema,
  saveRegistrationFlowNameSchema,
} from "../validators/registration-challenge.validator";

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

  async saveName(req: Request, res: Response) {
    try {
      const reservationId = typeof req.params.reservationId === "string"
        ? req.params.reservationId
        : Array.isArray(req.params.reservationId) && req.params.reservationId.length === 1
          ? req.params.reservationId[0]
          : undefined;
      if (!reservationId) throw new Error("reservationId is required.");

      const input = saveRegistrationFlowNameSchema.parse(req.body);
      const result = await registrationFlowReservationService.saveName({ reservationId, ...input });
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Unable to save your name.",
      });
    }
  }

  async saveBirthday(req: Request, res: Response) {
    try {
      const reservationId = typeof req.params.reservationId === "string"
        ? req.params.reservationId
        : Array.isArray(req.params.reservationId) && req.params.reservationId.length === 1
          ? req.params.reservationId[0]
          : undefined;
      if (!reservationId) throw new Error("reservationId is required.");

      const input = saveRegistrationFlowBirthdaySchema.parse(req.body);
      const result = await registrationFlowReservationService.saveBirthday({ reservationId, ...input });
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Unable to save your birthday.",
      });
    }
  }

  async saveGender(req: Request, res: Response) {
    try {
      const reservationId = typeof req.params.reservationId === "string"
        ? req.params.reservationId
        : Array.isArray(req.params.reservationId) && req.params.reservationId.length === 1
          ? req.params.reservationId[0]
          : undefined;
      if (!reservationId) throw new Error("reservationId is required.");

      const input = saveRegistrationFlowGenderSchema.parse(req.body);
      const result = await registrationFlowReservationService.saveGender({ reservationId, ...input });
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Unable to save your gender.",
      });
    }
  }
}

export const registrationFlowController = new RegistrationFlowController();

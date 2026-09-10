import { Request, Response } from "express";
import { registrationFlowReservationService } from "../services/auth/registration-flow-reservation.service";
import {
  reserveRegistrationFlowSchema,
  saveRegistrationFlowBirthdaySchema,
  saveRegistrationFlowGenderSchema,
  saveRegistrationFlowNameSchema,
  saveRegistrationFlowPhoneSchema,
} from "../validators/registration-challenge.validator";

function reservationIdFrom(req: Request) {
  return typeof req.params.reservationId === "string"
    ? req.params.reservationId
    : Array.isArray(req.params.reservationId) && req.params.reservationId.length === 1
      ? req.params.reservationId[0]
      : undefined;
}

function requestIp(req: Request) {
  const forwarded = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.ip || "0.0.0.0";
}

export class RegistrationFlowController {
  async reserve(req: Request, res: Response) {
    try { const input = reserveRegistrationFlowSchema.parse(req.body ?? {}); res.status(201).json(await registrationFlowReservationService.reserve(input.deviceId)); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to create registration Flow ID." }); }
  }

  async saveName(req: Request, res: Response) {
    try { const reservationId = reservationIdFrom(req); if (!reservationId) throw new Error("reservationId is required."); const input = saveRegistrationFlowNameSchema.parse(req.body); res.status(200).json(await registrationFlowReservationService.saveName({ reservationId, ...input })); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to save your name." }); }
  }

  async saveBirthday(req: Request, res: Response) {
    try { const reservationId = reservationIdFrom(req); if (!reservationId) throw new Error("reservationId is required."); const input = saveRegistrationFlowBirthdaySchema.parse(req.body); res.status(200).json(await registrationFlowReservationService.saveBirthday({ reservationId, ...input })); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to save your birthday." }); }
  }

  async saveGender(req: Request, res: Response) {
    try { const reservationId = reservationIdFrom(req); if (!reservationId) throw new Error("reservationId is required."); const input = saveRegistrationFlowGenderSchema.parse(req.body); res.status(200).json(await registrationFlowReservationService.saveGender({ reservationId, ...input })); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to save your gender." }); }
  }

  async detectPhoneCountry(req: Request, res: Response) {
    try {
      const reservationId = reservationIdFrom(req); if (!reservationId) throw new Error("reservationId is required.");
      const flowId = typeof req.query.flowId === "string" ? req.query.flowId : "";
      const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : undefined;
      const deviceRegion = typeof req.query.deviceRegion === "string" ? req.query.deviceRegion.toUpperCase() : undefined;
      const timeZone = typeof req.query.timeZone === "string" ? req.query.timeZone : undefined;
      res.status(200).json(await registrationFlowReservationService.detectPhoneCountry({ reservationId, flowId, deviceId, ip: requestIp(req), deviceRegion, timeZone }));
    } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to detect your country." }); }
  }

  async savePhone(req: Request, res: Response) {
    try { const reservationId = reservationIdFrom(req); if (!reservationId) throw new Error("reservationId is required."); const input = saveRegistrationFlowPhoneSchema.parse(req.body); res.status(200).json(await registrationFlowReservationService.savePhone({ reservationId, ...input })); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to verify your phone number." }); }
  }
}

export const registrationFlowController = new RegistrationFlowController();

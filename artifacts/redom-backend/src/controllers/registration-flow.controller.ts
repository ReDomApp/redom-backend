import { Request, Response } from "express";
import { registrationFlowReservationService } from "../services/auth/registration-flow-reservation.service";
import { registrationFlowMemoryService } from "../services/auth/registration-flow-memory.service";
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
  return req.ip?.trim() || "0.0.0.0";
}

function flowIdFrom(req: Request, body: { flowId?: unknown }) {
  if (typeof body.flowId === "string" && body.flowId.trim()) return body.flowId.trim();
  throw new Error("flowId is required.");
}

export class RegistrationFlowController {
  async reserve(req: Request, res: Response) {
    try { const input = reserveRegistrationFlowSchema.parse(req.body ?? {}); res.status(201).json(await registrationFlowReservationService.reserve(input.deviceId)); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to create registration Flow ID." }); }
  }

  async saveName(req: Request, res: Response) {
    try {
      const reservationId = reservationIdFrom(req); if (!reservationId) throw new Error("reservationId is required.");
      const input = saveRegistrationFlowNameSchema.parse(req.body);
      const result = await registrationFlowReservationService.saveName({ reservationId, ...input });
      await registrationFlowMemoryService.registerScreenSafely({ reservationId, flowId: flowIdFrom(req, input), screen: "name" });
      res.status(200).json(result);
    } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to save your name." }); }
  }

  async saveBirthday(req: Request, res: Response) {
    try {
      const reservationId = reservationIdFrom(req); if (!reservationId) throw new Error("reservationId is required.");
      const input = saveRegistrationFlowBirthdaySchema.parse(req.body);
      const result = await registrationFlowReservationService.saveBirthday({ reservationId, ...input });
      await registrationFlowMemoryService.registerScreenSafely({ reservationId, flowId: flowIdFrom(req, input), screen: "birthday" });
      res.status(200).json(result);
    } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to save your birthday." }); }
  }

  async saveGender(req: Request, res: Response) {
    try {
      const reservationId = reservationIdFrom(req); if (!reservationId) throw new Error("reservationId is required.");
      const input = saveRegistrationFlowGenderSchema.parse(req.body);
      const result = await registrationFlowReservationService.saveGender({ reservationId, ...input });
      await registrationFlowMemoryService.registerScreenSafely({ reservationId, flowId: flowIdFrom(req, input), screen: "gender" });
      res.status(200).json(result);
    } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to save your gender." }); }
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
    try {
      const reservationId = reservationIdFrom(req);
      if (!reservationId) throw new Error("reservationId is required.");
      const input = saveRegistrationFlowPhoneSchema.parse(req.body);
      const result = await registrationFlowReservationService.savePhone({ reservationId, ...input, ip: requestIp(req) });
      await registrationFlowMemoryService.registerScreenSafely({ reservationId, flowId: flowIdFrom(req, input), screen: "phone" });
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to verify your phone number." });
    }
  }

  async getMemory(req: Request, res: Response) {
    try {
      const reservationId = reservationIdFrom(req); if (!reservationId) throw new Error("reservationId is required.");
      const flowId = typeof req.query.flowId === "string" ? req.query.flowId.trim() : "";
      if (!flowId) throw new Error("flowId is required.");
      const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : undefined;
      res.status(200).json(await registrationFlowMemoryService.get({ reservationId, flowId, deviceId }));
    } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to load registration Flow memory." }); }
  }
}

export const registrationFlowController = new RegistrationFlowController();

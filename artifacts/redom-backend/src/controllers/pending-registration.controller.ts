import { Request, Response } from "express";
import { z } from "zod";
import { pendingRegistrationService } from "../services/auth/pending-registration.service";

const identifierSchema = z.object({ identifier: z.string().trim().min(3).max(320) });
const sendSchema = identifierSchema.extend({ channel: z.enum(["email", "sms"]), deviceId: z.string().trim().min(1).max(255).optional() });
const verifySchema = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{8}$/), deviceId: z.string().trim().min(1).max(255).optional() });

function clientIp(req: Request) {
  const candidates = [req.get("cf-connecting-ip"), req.get("true-client-ip"), req.get("x-forwarded-for")?.split(",")[0]?.trim(), req.ip, req.socket.remoteAddress];
  return candidates.find((value) => value && !/^(127\.0\.0\.1|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(value.replace(/^::ffff:/, ""))) ?? undefined;
}

export class PendingRegistrationController {
  async options(req: Request, res: Response) {
    try { const body = identifierSchema.parse(req.body); res.status(200).json(await pendingRegistrationService.options(body.identifier)); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "No pending registration was found." }); }
  }
  async sendCode(req: Request, res: Response) {
    try {
      const body = sendSchema.parse(req.body);
      res.status(200).json(await pendingRegistrationService.sendCode({ identifier: body.identifier, channel: body.channel, deviceId: body.deviceId, requestIp: clientIp(req), userAgent: req.get("user-agent") ?? undefined }));
    } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to send the verification code." }); }
  }
  async verifyAndInvalidate(req: Request, res: Response) {
    try { const body = verifySchema.parse(req.body); res.status(200).json(await pendingRegistrationService.verifyAndInvalidate(body)); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "The verification code could not be verified." }); }
  }
}
export const pendingRegistrationController = new PendingRegistrationController();

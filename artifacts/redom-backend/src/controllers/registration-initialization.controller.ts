import { isIP } from "node:net";
import { Request, Response } from "express";

import { registrationInitializationService } from "../services/auth/registration-initialization.service";

function normalizeIp(value: string) { return value.trim().replace(/^\[|\]$/g, "").replace(/^::ffff:/i, ""); }
function isPublicIp(value: string) {
  const ip = normalizeIp(value);
  if (isIP(ip) === 4) { const [a,b] = ip.split(".").map(Number); if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false; return a >= 1 && a <= 223; }
  if (isIP(ip) === 6) { const lower = ip.toLowerCase(); if (lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return false; return true; }
  return false;
}
function requestIp(req: Request) {
  const candidates = [req.get("cf-connecting-ip"), req.get("true-client-ip"), ...(req.get("x-forwarded-for")?.split(",") ?? []), req.ip, req.socket.remoteAddress];
  return candidates.map(v => v?.trim()).filter((v): v is string => Boolean(v)).map(normalizeIp).find(isPublicIp);
}

export class RegistrationInitializationController {
  async initialize(req: Request, res: Response) {
    try {
      const verificationChallengeId = String(req.body?.verificationChallengeId ?? "").trim();
      if (!verificationChallengeId) throw new Error("Verification challenge ID is required.");
      const result = await registrationInitializationService.initialize({
        verificationChallengeId,
        language: typeof req.body?.language === "string" ? req.body.language : undefined,
        ipAddress: requestIp(req),
        userAgent: req.get("user-agent") ?? undefined,
        deviceId: typeof req.body?.deviceId === "string" ? req.body.deviceId : undefined,
        deviceName: typeof req.body?.deviceName === "string" ? req.body.deviceName : undefined,
        deviceType: typeof req.body?.deviceType === "string" ? req.body.deviceType : undefined,
        platform: typeof req.body?.platform === "string" ? req.body.platform : undefined,
        browser: typeof req.body?.browser === "string" ? req.body.browser : undefined,
        loginSource: "registration",
        appVersion: typeof req.body?.appVersion === "string" ? req.body.appVersion : undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to finish account customization." });
    }
  }
}

export const registrationInitializationController = new RegistrationInitializationController();

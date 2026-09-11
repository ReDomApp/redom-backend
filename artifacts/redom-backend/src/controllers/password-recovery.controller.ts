import { Request, Response } from "express";
import { passwordRecoveryService } from "../services/auth/password-recovery.service";

function context(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? undefined,
    deviceId: req.body?.deviceId,
    deviceName: req.body?.deviceName,
    deviceType: req.body?.deviceType,
    platform: req.body?.platform,
    browser: req.body?.browser,
    appVersion: req.body?.appVersion,
    language: req.body?.language,
  };
}

export class PasswordRecoveryController {
  async findAccount(req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json(await passwordRecoveryService.findAccount(String(req.body?.identifier ?? "")));
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to find the account." });
    }
  }

  async sendCode(req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json(await passwordRecoveryService.sendCode({ ...req.body, ...context(req) }));
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to send the reset code." });
    }
  }

  async verifyCode(req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json(await passwordRecoveryService.verifyCode({ ...req.body, ...context(req) }));
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "The verification code could not be verified." });
    }
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json(await passwordRecoveryService.changePassword({ ...req.body, ...context(req) }));
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Password change failed." });
    }
  }
}

export const passwordRecoveryController = new PasswordRecoveryController();

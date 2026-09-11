import { Request, Response } from "express";
import { totpService } from "../services/auth/totp.service";

export class TotpController {
  private userId(req: Request) { if (!req.user?.userId) throw new Error("Authentication required."); return req.user.userId; }
  async beginSetup(req: Request, res: Response) { try { res.status(200).json(await totpService.beginSetup(this.userId(req))); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to start Authenticator setup." }); } }
  async confirmSetup(req: Request, res: Response) { try { res.status(200).json(await totpService.confirmSetup(this.userId(req), String(req.body?.code ?? ""))); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to enable Authenticator." }); } }
  async useRecoveryCode(req: Request, res: Response) { try { res.status(200).json(await totpService.useRecoveryCode(this.userId(req), String(req.body?.code ?? ""))); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Recovery code verification failed." }); } }
}
export const totpController = new TotpController();

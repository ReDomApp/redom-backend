import { Request, Response } from "express";
import { recognizedDeviceService } from "../services/auth/recognized-device.service";

function credential(req: Request) { return typeof req.body?.deviceCredential === "string" ? req.body.deviceCredential : typeof req.get("x-redom-device-credential") === "string" ? req.get("x-redom-device-credential")! : ""; }

export class RecognizedDeviceController {
  async bootstrap(req: Request, res: Response) {
    try {
      const supplied = credential(req) || undefined;
      const result = await recognizedDeviceService.ensureDevice({ credential: supplied, deviceType: req.body?.deviceType, platform: req.body?.platform, browser: req.body?.browser, deviceName: req.body?.deviceName });
      res.status(200).json({ success: true, deviceId: result.deviceId, deviceCredential: result.created || !supplied ? result.credential : undefined });
    } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to initialize this device." }); }
  }
  async list(req: Request, res: Response) {
    try {
      const value = credential(req);
      if (!value) return res.status(200).json({ success: true, deviceId: null, accounts: [] });
      res.status(200).json({ success: true, ...(await recognizedDeviceService.list(value)) });
    } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to load recognized accounts." }); }
  }
  async detail(req: Request, res: Response) {
    try { const value = credential(req); if (!value) throw new Error("Device credential is required."); res.status(200).json({ success: true, account: await recognizedDeviceService.detail(value, req.params.userId) }); }
    catch (error) { res.status(404).json({ success: false, message: error instanceof Error ? error.message : "Recognized account not found." }); }
  }
  async remove(req: Request, res: Response) {
    try { const value = credential(req); if (!value) throw new Error("Device credential is required."); res.status(200).json(await recognizedDeviceService.removeAccount(value, req.params.userId)); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to remove the profile from this device." }); }
  }
}
export const recognizedDeviceController = new RecognizedDeviceController();
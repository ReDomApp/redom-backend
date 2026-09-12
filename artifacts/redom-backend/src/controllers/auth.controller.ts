import { isIP } from "node:net";
import { Request, Response } from "express";
import { authService } from "../services/auth/auth.service";
import { loginFlowService } from "../services/auth/login-flow.service";
import { loginSchema, registerSchema } from "../validators/auth.validator";

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
function requestContext(req: Request) {
  return { ipAddress: requestIp(req), userAgent: req.get("user-agent") ?? undefined, platform: req.body?.platform, browser: req.body?.browser, deviceName: req.body?.deviceName, deviceId: req.body?.deviceId, deviceType: req.body?.deviceType, loginSource: req.body?.loginSource, appVersion: req.body?.appVersion, networkIp: req.body?.networkIp, country: req.body?.country, region: req.body?.region, city: req.body?.city };
}

export class AuthController {
  async register(req: Request, res: Response): Promise<void> { try { const result = await authService.register({ ...registerSchema.parse(req.body), ...requestContext(req) }); res.status(201).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Registration failed." }); } }
  async login(req: Request, res: Response): Promise<void> { try { const result = await loginFlowService.login({ ...loginSchema.parse(req.body), ...requestContext(req) }); res.status(200).json(result); } catch (error) { res.status(401).json({ success: false, message: error instanceof Error ? error.message : "Login failed." }); } }
  async verifyLoginDevice(req: Request, res: Response): Promise<void> { try { const result = await loginFlowService.verifyNewDevice({ ...req.body, ipAddress: requestIp(req), userAgent: req.get("user-agent") ?? req.body.userAgent }); res.status(200).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Device verification failed." }); } }
  async verifyLoginTwoFactor(req: Request, res: Response): Promise<void> { try { const result = await loginFlowService.verifyTwoFactor({ ...req.body, ipAddress: requestIp(req), userAgent: req.get("user-agent") ?? req.body.userAgent }); res.status(200).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Two-factor authentication failed." }); } }
  async verifyEmail(req: Request, res: Response): Promise<void> { try { const result = await authService.verifyEmail(req.body); res.status(200).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Email verification failed." }); } }
  async verifyPhone(req: Request, res: Response): Promise<void> { try { const result = await authService.verifyPhone(req.body); res.status(200).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Phone verification failed." }); } }
  async resendEmailCode(req: Request, res: Response): Promise<void> { try { const result = await authService.resendEmailCode(req.body); res.status(200).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to resend email verification code." }); } }
  async resendPhoneCode(req: Request, res: Response): Promise<void> { try { const result = await authService.resendPhoneCode(req.body); res.status(200).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Unable to resend phone verification code." }); } }
  async forgotPassword(req: Request, res: Response): Promise<void> { try { const result = await authService.forgotPassword(req.body); res.status(200).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Forgot password request failed." }); } }
  async resetPassword(req: Request, res: Response): Promise<void> { try { const result = await authService.resetPassword(req.body); res.status(200).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Password reset failed." }); } }
  async logout(req: Request, res: Response): Promise<void> { try { if (!req.user) { res.status(401).json({ success: false, message: "Authentication required." }); return; } if (!req.user.sessionId) { res.status(401).json({ success: false, message: "Authentication session is invalid." }); return; } const result = await authService.logout({ userId: req.user.userId, sessionId: req.user.sessionId }); res.status(200).json(result); } catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Logout failed." }); } }
  async refreshSession(req: Request, res: Response): Promise<void> { try { const result = await authService.refreshSession(req.body); res.status(200).json(result); } catch (error) { res.status(401).json({ success: false, message: error instanceof Error ? error.message : "Session refresh failed." }); } }
}
export const authController = new AuthController();
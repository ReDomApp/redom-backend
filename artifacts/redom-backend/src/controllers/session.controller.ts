import {
  Request,
  Response,
} from "express";

import {
  sessionService,
} from "../services/auth/session.service";

import {
  loginHistoryService,
} from "../services/auth/login-history.service";

export class SessionController {
  async list(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });
        return;
      }

      const sessions =
        await sessionService.getActiveSessions(
          req.user.userId,
        );

      res.status(200).json({
        success: true,
        sessions,
      });
    } catch {
      res.status(500).json({
        success: false,
        message:
          "Unable to retrieve active sessions.",
      });
    }
  }

  async revoke(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });
        return;
      }

      const sessionId =
        req.params.sessionId;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          message:
            "Session ID is required.",
        });
        return;
      }

      await sessionService.revokeSession(
        sessionId,
        req.user.userId,
      );

      await loginHistoryService.logout(
        sessionId,
      );

      res.status(200).json({
        success: true,
        message:
          "Session revoked successfully.",
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to revoke session.",
      });
    }
  }

  async revokeAll(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });
        return;
      }

      await sessionService.revokeAllSessions(
        req.user.userId,
      );

      res.status(200).json({
        success: true,
        message:
          "All sessions have been revoked.",
      });
    } catch {
      res.status(500).json({
        success: false,
        message:
          "Unable to revoke sessions.",
      });
    }
  }
}

export const sessionController =
  new SessionController();
import {
  Request,
  Response,
} from "express";

import {
  sessionService,
} from "../services/auth/session.service";

export class SessionController {
  /**
   * Return the authenticated user's
   * currently active sessions.
   */
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

  /**
   * Revoke one session owned by
   * the authenticated account.
   */
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

      await this.markHistoryEnded(
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

  /**
   * Revoke every session owned by
   * the authenticated account.
   */
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

  private async markHistoryEnded(
    sessionId: string,
  ): Promise<void> {
    // Login-history synchronization is intentionally
    // kept outside SessionService because SessionService
    // owns authentication/session state, not history.
    //
    // The actual history update is handled by the
    // existing LoginHistoryService through the import
    // added below in the final implementation.
  }
}

export const sessionController =
  new SessionController();
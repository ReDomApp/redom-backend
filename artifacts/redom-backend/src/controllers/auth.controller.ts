import {
  Request,
  Response,
} from "express";

import { authService } from "../services/auth/auth.service";

export class AuthController {
  async register(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const result =
        await authService.register(
          req.body,
        );

      res.status(201).json(
        result,
      );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Registration failed.",
      });
    }
  }

  async login(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const result =
        await authService.login(
          req.body,
        );

      res.status(200).json(
        result,
      );
    } catch (error) {
      res.status(401).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Login failed.",
      });
    }
  }

  async verifyEmail(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const result =
        await authService.verifyEmail(
          req.body,
        );

      res.status(200).json(
        result,
      );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Email verification failed.",
      });
    }
  }

  async verifyPhone(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const result =
        await authService.verifyPhone(
          req.body,
        );

      res.status(200).json(
        result,
      );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Phone verification failed.",
      });
    }
  }

  async resendEmailCode(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const result =
        await authService.resendEmailCode(
          req.body,
        );

      res.status(200).json(
        result,
      );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to resend email verification code.",
      });
    }
  }

  async resendPhoneCode(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const result =
        await authService.resendPhoneCode(
          req.body,
        );

      res.status(200).json(
        result,
      );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to resend phone verification code.",
      });
    }
  }

  async forgotPassword(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const result =
        await authService.forgotPassword(
          req.body,
        );

      res.status(200).json(
        result,
      );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Forgot password request failed.",
      });
    }
  }

  async resetPassword(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const result =
        await authService.resetPassword(
          req.body,
        );

      res.status(200).json(
        result,
      );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Password reset failed.",
      });
    }
  }

  async logout(
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

      const result =
        await authService.logout({
          userId:
            req.user.userId,
          sessionId:
            req.user.sessionId,
        });

      res.status(200).json(
        result,
      );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Logout failed.",
      });
    }
  }

  async refreshSession(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const result =
        await authService.refreshSession(
          req.body,
        );

      res.status(200).json(
        result,
      );
    } catch (error) {
      res.status(401).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Session refresh failed.",
      });
    }
  }
}

export const authController =
  new AuthController();
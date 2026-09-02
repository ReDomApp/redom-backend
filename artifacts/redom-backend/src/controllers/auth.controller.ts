import {
  Request,
  Response,
} from "express";

import {
  authService,
} from "../services/auth/auth.service";

import {
  loginFlowService,
} from "../services/auth/login-flow.service";

import {
  loginSchema,
  registerSchema,
} from "../validators/auth.validator";

function requestContext(
  req: Request,
) {
  return {
    ipAddress:
      req.ip,

    userAgent:
      req.get("user-agent") ??
      undefined,

    platform:
      req.body?.platform,

    browser:
      req.body?.browser,

    deviceName:
      req.body?.deviceName,

    deviceId:
      req.body?.deviceId,

    deviceType:
      req.body?.deviceType,

    loginSource:
      req.body?.loginSource,

    appVersion:
      req.body?.appVersion,

    country:
      req.body?.country,

    region:
      req.body?.region,

    city:
      req.body?.city,
  };
}

export class AuthController {
  async register(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const result =
        await authService.register(
          {
            ...registerSchema.parse(req.body),
            ...requestContext(req),
          },
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
        await loginFlowService.login({
          ...loginSchema.parse(req.body),
          ...requestContext(req),
        });

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

  async verifyLoginDevice(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const result =
        await loginFlowService.verifyNewDevice({
          ...req.body,

          ipAddress:
            req.ip,

          userAgent:
            req.get("user-agent") ??
            req.body.userAgent,
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
            : "Device verification failed.",
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

      if (!req.user.sessionId) {
        res.status(401).json({
          success: false,
          message: "Authentication session is invalid.",
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

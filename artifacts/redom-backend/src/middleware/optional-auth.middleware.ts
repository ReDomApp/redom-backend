import { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        profileId: string;
      };
    }
  }
}

export function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const authorization =
      req.headers.authorization;

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      next();
      return;
    }

    const token =
      authorization.substring(7);

    const payload =
      verifyAccessToken(token);

    req.user = {
      userId: payload.userId,
      profileId: payload.profileId,
    };

    next();
  } catch {
    /**
     * Ignore invalid or missing tokens.
     * Continue as a guest request.
     */
    next();
  }
}
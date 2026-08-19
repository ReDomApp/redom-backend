import {
  NextFunction,
  Request,
  Response,
} from "express";
import { eq, and, isNull, gt } from "drizzle-orm";

import { db } from "../database/db";
import { users } from "../database/schema";
import { sessions } from "../database/sessions.schema";

import { verifyAccessToken } from "../utils/jwt";

import { sessionService } from "../services/auth/session.service";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        profileId: string;
        sessionId: string;
      };
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authorization =
      req.headers.authorization;

    if (
      !authorization ||
      !authorization.startsWith(
        "Bearer ",
      )
    ) {
      res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
      return;
    }

    const token =
      authorization.substring(7);

    const payload =
      verifyAccessToken(token);

    const user =
      await db.query.users.findFirst({
        where: eq(
          users.id,
          payload.userId,
        ),
      });

    if (!user) {
      res.status(401).json({
        success: false,
        message:
          "User not found.",
      });
      return;
    }

    // The access token must identify the
    // exact server-created session.
    const session =
      await db.query.sessions.findFirst({
        where: and(
          eq(
            sessions.id,
            payload.sessionId,
          ),
          eq(
            sessions.userId,
            payload.userId,
          ),
          isNull(
            sessions.revokedAt,
          ),
          gt(
            sessions.expiresAt,
            new Date(),
          ),
        ),
      });

    if (!session) {
      res.status(401).json({
        success: false,
        message:
          "Session is invalid, revoked, or expired.",
      });
      return;
    }

    await sessionService.touch(
      session.id,
    );

    req.user = {
      userId:
        payload.userId,
      profileId:
        payload.profileId,
      sessionId:
        payload.sessionId,
    };

    next();
  } catch {
    res.status(401).json({
      success: false,
      message:
        "Invalid access token.",
    });
  }
}
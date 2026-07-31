import { NextFunction, Request, Response } from "express";
import { eq, isNull } from "drizzle-orm";

import { db } from "../database/db";
import { users } from "../database/schema";
import { sessions } from "../database/sessions.schema";

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
      !authorization.startsWith("Bearer ")
    ) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    const token =
      authorization.substring(7);

    const payload =
      verifyAccessToken(token);

    const user =
      await db.query.users.findFirst({
        where: eq(users.id, payload.userId),
      });

    if (!user) {
      res.status(401).json({
        success: false,
        message: "User not found.",
      });
      return;
    }

    const session =
      await db.query.sessions.findFirst({
        where: eq(
          sessions.userId,
          payload.userId,
        ),
      });

    if (!session) {
      res.status(401).json({
        success: false,
        message: "Session not found.",
      });
      return;
    }

    if (session.revokedAt) {
      res.status(401).json({
        success: false,
        message: "Session has been revoked.",
      });
      return;
    }

    if (
      session.expiresAt.getTime() <
      Date.now()
    ) {
      res.status(401).json({
        success: false,
        message: "Session expired.",
      });
      return;
    }

    await db
      .update(sessions)
      .set({
        lastActivityAt: new Date(),
      })
      .where(
        eq(sessions.id, session.id),
      );

    req.user = {
      userId: payload.userId,
      profileId: payload.profileId,
    };

    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid access token.",
    });
  }
}
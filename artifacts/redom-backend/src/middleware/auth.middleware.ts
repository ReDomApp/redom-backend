import {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  and,
  eq,
  gt,
  isNull,
} from "drizzle-orm";

import { db } from "../database/db";
import { users } from "../database/schema";
import { sessions } from "../database/sessions.schema";

import {
  verifyAccessToken,
} from "../utils/jwt";

import {
  sessionService,
} from "../services/auth/session.service";

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
      authorization.slice(7).trim();

    if (!token) {
      res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });

      return;
    }

    const payload =
      verifyAccessToken(token);

    if (
      !payload.userId ||
      !payload.profileId ||
      !payload.sessionId
    ) {
      res.status(401).json({
        success: false,
        message:
          "Invalid authentication session.",
      });

      return;
    }

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

    /*
     * The JWT profileId is a claim.
     *
     * The database remains authoritative.
     *
     * Never allow a stale or manipulated claim
     * to become the active profile identity.
     */
    if (
      user.profileId !==
      payload.profileId
    ) {
      res.status(401).json({
        success: false,
        message:
          "Authentication identity is no longer valid.",
      });

      return;
    }

    /*
     * Authentication must respect account lifecycle.
     */
    if (
      user.accountStatus ===
      "suspended"
    ) {
      res.status(403).json({
        success: false,
        message:
          "This account has been suspended.",
      });

      return;
    }

    if (
      user.accountStatus ===
      "banned"
    ) {
      res.status(403).json({
        success: false,
        message:
          "This account has been banned.",
      });

      return;
    }

    /*
     * The access token is only valid when the exact
     * server-created session remains active.
     */
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

    /*
     * Keep active-session state synchronized.
     */
    await sessionService.touch(
      session.id,
    );

    req.user = {
      userId:
        user.id,

      profileId:
        user.profileId,

      sessionId:
        session.id,
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

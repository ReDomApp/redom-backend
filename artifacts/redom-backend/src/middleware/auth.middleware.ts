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
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const token = authorization.slice(7).trim();
    if (!token) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const payload = verifyAccessToken(token);

    // userId and sessionId identify the authenticated account/session.
    // profileId is deliberately not trusted from the access token for ownership.
    if (!payload.userId || !payload.sessionId) {
      res.status(401).json({ success: false, message: "Invalid authentication session." });
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.userId),
    });

    if (!user) {
      res.status(401).json({ success: false, message: "User not found." });
      return;
    }

    if (user.accountStatus === "suspended") {
      res.status(403).json({ success: false, message: "This account has been suspended." });
      return;
    }

    if (user.accountStatus === "banned") {
      res.status(403).json({ success: false, message: "This account has been banned." });
      return;
    }

    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.id, payload.sessionId),
        eq(sessions.userId, payload.userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    });

    if (!session) {
      res.status(401).json({ success: false, message: "Session is invalid, revoked, or expired." });
      return;
    }

    await sessionService.touch(session.id);

    // The database user row is authoritative. Every protected endpoint receives
    // the current profile identity even when an older access token has no
    // profileId claim or carries a stale profileId claim.
    req.user = {
      userId: user.id,
      profileId: user.profileId,
      sessionId: session.id,
    };

    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid access token." });
  }
}

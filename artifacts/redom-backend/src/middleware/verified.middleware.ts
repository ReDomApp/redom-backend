import { NextFunction, Request, Response } from "express";

import { db } from "../database/db";
import { users } from "../database/schema";
import { eq } from "drizzle-orm";

export async function verifiedMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user.userId),
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found.",
      });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        success: false,
        message: "Email verification required.",
      });
      return;
    }

    if (!user.phoneVerified) {
      res.status(403).json({
        success: false,
        message: "Phone verification required.",
      });
      return;
    }

    if (user.accountStatus !== "active") {
      res.status(403).json({
        success: false,
        message: "Account is not active.",
      });
      return;
    }

    next();
  } catch {
    res.status(500).json({
      success: false,
      message: "Unable to verify account.",
    });
  }
}
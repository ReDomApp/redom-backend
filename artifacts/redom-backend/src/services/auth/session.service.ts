import { randomUUID } from "crypto";
import { addDays } from "date-fns";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../database/db";
import { users } from "../../database/schema";
import { sessions } from "../../database/sessions.schema";

import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt";

import { passwordService } from "./password.service";

export class SessionService {
  /**
   * Create a new login session.
   */
  async createSession(params: {
    userId: string;
    profileId: string;
    ipAddress?: string;
    country?: string;
    userAgent?: string;
    platform?: string;
    browser?: string;
    deviceName?: string;
    deviceId?: string;
  }) {
    const sessionId = randomUUID();

    const accessToken =
      generateAccessToken({
        userId: params.userId,
        profileId: params.profileId,
      });

    const refreshToken =
      generateRefreshToken({
        userId: params.userId,
        sessionId,
      });

    const refreshTokenHash =
      await passwordService.hash(
        refreshToken,
      );

    await db
      .insert(sessions)
      .values({
        id: sessionId,
        userId: params.userId,
        refreshTokenHash,
        ipAddress: params.ipAddress,
        country: params.country,
        userAgent: params.userAgent,
        platform: params.platform,
        browser: params.browser,
        deviceName: params.deviceName,
        deviceId: params.deviceId,
        expiresAt: addDays(
          new Date(),
          30,
        ),
      });

    return {
      sessionId,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Verify a refresh token.
   */
  async verifyRefreshSession(
    refreshToken: string,
  ) {
    const payload =
      verifyRefreshToken(
        refreshToken,
      );

    const session =
      await db.query.sessions.findFirst({
        where: and(
          eq(
            sessions.id,
            payload.sessionId,
          ),
          isNull(
            sessions.revokedAt,
          ),
        ),
      });

    if (!session) {
      throw new Error(
        "Session not found.",
      );
    }

    const valid =
      await passwordService.verify(
        refreshToken,
        session.refreshTokenHash,
      );

    if (!valid) {
      throw new Error(
        "Invalid refresh token.",
      );
    }

    return {
      payload,
      session,
    };
  }

  /**
   * Refresh an existing session.
   */
  async refreshSession(
    refreshToken: string,
  ) {
    const {
      payload,
      session,
    } =
      await this.verifyRefreshSession(
        refreshToken,
      );

    const user =
      await db.query.users.findFirst({
        where: eq(
          users.id,
          payload.userId,
        ),
      });

    if (!user) {
      throw new Error(
        "User not found.",
      );
    }

    const accessToken =
      generateAccessToken({
        userId: user.id,
        profileId: user.profileId,
      });

    await this.touch(
      session.id,
    );

    return {
      sessionId: session.id,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Revoke one session.
   */
  async revokeSession(
    sessionId: string,
  ): Promise<void> {
    await db
      .update(sessions)
      .set({
        revokedAt: new Date(),
      })
      .where(
        eq(
          sessions.id,
          sessionId,
        ),
      );
  }

  /**
   * Revoke all sessions for a user.
   */
  async revokeAllSessions(
    userId: string,
  ): Promise<void> {
    await db
      .update(sessions)
      .set({
        revokedAt: new Date(),
      })
      .where(
        eq(
          sessions.userId,
          userId,
        ),
      );
  }

  /**
   * Update session activity.
   */
  async touch(
    sessionId: string,
  ): Promise<void> {
    await db
      .update(sessions)
      .set({
        lastActivityAt:
          new Date(),
      })
      .where(
        eq(
          sessions.id,
          sessionId,
        ),
      );
  }
}

export const sessionService =
  new SessionService();
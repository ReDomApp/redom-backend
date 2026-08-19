import { randomUUID } from "crypto";
import { addDays } from "date-fns";
import {
  and,
  eq,
  gt,
  isNull,
} from "drizzle-orm";

import { db } from "../../database/db";
import { users } from "../../database/schema";
import { sessions } from "../../database/sessions.schema";
import {
  activeSessions,
} from "../../database/activeSessions";

import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt";

import { passwordService } from "./password.service";

export class SessionService {
  /**
   * Create a new authentication session
   * and its corresponding active-session record.
   */
  async createSession(params: {
    userId: string;
    profileId: string;

    ipAddress?: string;
    country?: string;
    region?: string;
    city?: string;

    userAgent?: string;
    platform?: string;
    browser?: string;

    deviceName?: string;
    deviceId?: string;
    deviceType?: string;
    loginSource?: string;
    appVersion?: string;
  }) {
    // Session IDs are generated exclusively by the server.
    const sessionId = randomUUID();

    const accessToken =
      generateAccessToken({
        userId: params.userId,
        profileId: params.profileId,
        sessionId,
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

    const now = new Date();

    await db.transaction(async (tx) => {
      // --------------------------------
      // PRIMARY AUTHENTICATION SESSION
      // --------------------------------

      await tx
        .insert(sessions)
        .values({
          id: sessionId,
          userId: params.userId,
          refreshTokenHash,

          ipAddress:
            params.ipAddress,
          country:
            params.country,

          userAgent:
            params.userAgent,
          platform:
            params.platform,
          browser:
            params.browser,

          deviceName:
            params.deviceName,

          deviceId:
            params.deviceId,

          lastActivityAt: now,

          expiresAt: addDays(
            now,
            30,
          ),

          createdAt: now,
        });

      // --------------------------------
      // CURRENT ACTIVE SESSION
      // --------------------------------

      await tx
        .insert(activeSessions)
        .values({
          userId: params.userId,
          sessionId,

          deviceName:
            params.deviceName ??
            "Unknown Device",

          deviceType:
            params.deviceType ??
            "unknown",

          loginSource:
            params.loginSource ??
            "web",

          appVersion:
            params.appVersion ??
            null,

          ipAddress:
            params.ipAddress ??
            "Unknown",

          country:
            params.country ??
            null,

          region:
            params.region ??
            null,

          city:
            params.city ??
            null,

          loginTime: now,
          lastActivity: now,
          createdAt: now,
          updatedAt: now,
        });
    });

    return {
      sessionId,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Verify a refresh token against
   * the authoritative sessions table.
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
      throw new Error(
        "Session is invalid, revoked, or expired.",
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
        sessionId: session.id,
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
   * Revoke one session owned by a user.
   */
  async revokeSession(
    sessionId: string,
    userId: string,
  ): Promise<void> {
    const revokedAt =
      new Date();

    const revoked =
      await db
        .update(sessions)
        .set({
          revokedAt,
        })
        .where(
          and(
            eq(
              sessions.id,
              sessionId,
            ),
            eq(
              sessions.userId,
              userId,
            ),
            isNull(
              sessions.revokedAt,
            ),
          ),
        )
        .returning({
          id: sessions.id,
        });

    if (revoked.length === 0) {
      throw new Error(
        "Session not found or does not belong to this account.",
      );
    }

    await db
      .delete(activeSessions)
      .where(
        and(
          eq(
            activeSessions.sessionId,
            sessionId,
          ),
          eq(
            activeSessions.userId,
            userId,
          ),
        ),
      );
  }

  /**
   * Revoke every authentication session
   * belonging to a user.
   */
  async revokeAllSessions(
    userId: string,
  ): Promise<void> {
    const revokedAt =
      new Date();

    await db.transaction(
      async (tx) => {
        await tx
          .update(sessions)
          .set({
            revokedAt,
          })
          .where(
            and(
              eq(
                sessions.userId,
                userId,
              ),
              isNull(
                sessions.revokedAt,
              ),
            ),
          );

        await tx
          .delete(activeSessions)
          .where(
            eq(
              activeSessions.userId,
              userId,
            ),
          );
      },
    );
  }

  /**
   * Update activity for the authoritative
   * session and its active-session record.
   */
  async touch(
    sessionId: string,
  ): Promise<void> {
    const now =
      new Date();

    await db.transaction(
      async (tx) => {
        await tx
          .update(sessions)
          .set({
            lastActivityAt: now,
          })
          .where(
            and(
              eq(
                sessions.id,
                sessionId,
              ),
              isNull(
                sessions.revokedAt,
              ),
              gt(
                sessions.expiresAt,
                now,
              ),
            ),
          );

        await tx
          .update(activeSessions)
          .set({
            lastActivity: now,
            updatedAt: now,
          })
          .where(
            eq(
              activeSessions.sessionId,
              sessionId,
            ),
          );
      },
    );
  }

  /**
   * Return only currently valid active sessions
   * belonging to the authenticated user.
   */
  async getActiveSessions(
    userId: string,
  ) {
    return db
      .select({
        id: activeSessions.id,
        sessionId:
          activeSessions.sessionId,
        deviceName:
          activeSessions.deviceName,
        deviceType:
          activeSessions.deviceType,
        loginSource:
          activeSessions.loginSource,
        appVersion:
          activeSessions.appVersion,
        ipAddress:
          activeSessions.ipAddress,
        country:
          activeSessions.country,
        region:
          activeSessions.region,
        city:
          activeSessions.city,
        loginTime:
          activeSessions.loginTime,
        lastActivity:
          activeSessions.lastActivity,
        createdAt:
          activeSessions.createdAt,
        updatedAt:
          activeSessions.updatedAt,
      })
      .from(activeSessions)
      .innerJoin(
        sessions,
        eq(
          activeSessions.sessionId,
          sessions.id,
        ),
      )
      .where(
        and(
          eq(
            activeSessions.userId,
            userId,
          ),
          isNull(
            sessions.revokedAt,
          ),
          gt(
            sessions.expiresAt,
            new Date(),
          ),
        ),
      );
  }
}

export const sessionService =
  new SessionService();
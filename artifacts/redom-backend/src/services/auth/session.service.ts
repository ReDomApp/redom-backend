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

import {
  sessions,
} from "../../database/sessions.schema";

import {
  activeSessions,
} from "../../database/activeSessions";

import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt";

import {
  passwordService,
} from "./password.service";

export class SessionService {
  async createSession(params: {
    userId: string;

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
    /*
     * The database account is authoritative.
     *
     * profileId is deliberately NOT accepted from
     * the caller anymore.
     */
    const user =
      await db.query.users.findFirst({
        where: eq(
          users.id,
          params.userId,
        ),
      });

    if (!user) {
      throw new Error(
        "Unable to create session for an unknown user.",
      );
    }

    if (
      user.accountStatus ===
      "suspended"
    ) {
      throw new Error(
        "Cannot create a session for a suspended account.",
      );
    }

    if (
      user.accountStatus ===
      "banned"
    ) {
      throw new Error(
        "Cannot create a session for a banned account.",
      );
    }

    const sessionId =
      randomUUID();

    const accessToken =
      generateAccessToken({
        userId:
          user.id,

        profileId:
          user.profileId,

        sessionId,
      });

    const refreshToken =
      generateRefreshToken({
        userId:
          user.id,

        sessionId,
      });

    const refreshTokenHash =
      await passwordService.hash(
        refreshToken,
      );

    const now =
      new Date();

    const expiresAt =
      addDays(
        now,
        30,
      );

    await db.transaction(
      async (tx) => {
        await tx
          .insert(sessions)
          .values({
            id:
              sessionId,

            userId:
              user.id,

            refreshTokenHash,

            deviceId:
              params.deviceId ??
              null,

            deviceName:
              params.deviceName ??
              null,

            platform:
              params.platform ??
              null,

            browser:
              params.browser ??
              null,

            userAgent:
              params.userAgent ??
              null,

            ipAddress:
              params.ipAddress ??
              null,

            country:
              params.country ??
              null,

            region:
              params.region ??
              null,

            city:
              params.city ??
              null,

            lastActivityAt:
              now,

            expiresAt,

            revokedAt:
              null,

            createdAt:
              now,

            updatedAt:
              now,
          });

        /*
         * The same authoritative user.id and
         * session.id are used for activeSessions.
         */
        await tx
          .insert(
            activeSessions,
          )
          .values({
            userId:
              user.id,

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

            loginTime:
              now,

            lastActivity:
              now,

            createdAt:
              now,

            updatedAt:
              now,
          });
      },
    );

    return {
      sessionId,

      accessToken,

      refreshToken,

      expiresAt,
    };
  }

  async verifyRefreshSession(
    refreshToken: string,
  ) {
    const payload =
      verifyRefreshToken(
        refreshToken,
      );

    const session =
      await db.query.sessions
        .findFirst({
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

    if (
      user.accountStatus ===
      "suspended"
    ) {
      throw new Error(
        "Account is suspended.",
      );
    }

    if (
      user.accountStatus ===
      "banned"
    ) {
      throw new Error(
        "Account is banned.",
      );
    }

    /*
     * profileId is re-read from the database.
     * A stale JWT claim is never propagated.
     */
    const accessToken =
      generateAccessToken({
        userId:
          user.id,

        profileId:
          user.profileId,

        sessionId:
          session.id,
      });

    await this.touch(
      session.id,
    );

    return {
      sessionId:
        session.id,

      accessToken,

      refreshToken,

      expiresAt:
        session.expiresAt,
    };
  }

  async revokeSession(
    sessionId: string,
    userId: string,
  ): Promise<void> {
    const revokedAt =
      new Date();

    await db.transaction(
      async (tx) => {
        const revoked =
          await tx
            .update(sessions)
            .set({
              revokedAt,

              updatedAt:
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
              id:
                sessions.id,
            });

        if (
          revoked.length ===
          0
        ) {
          throw new Error(
            "Session not found or does not belong to this account.",
          );
        }

        await tx
          .delete(
            activeSessions,
          )
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
      },
    );
  }

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

            updatedAt:
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
          .delete(
            activeSessions,
          )
          .where(
            eq(
              activeSessions.userId,
              userId,
            ),
          );
      },
    );
  }

  async touch(
    sessionId: string,
  ): Promise<void> {
    const now =
      new Date();

    await db.transaction(
      async (tx) => {
        const updated =
          await tx
            .update(sessions)
            .set({
              lastActivityAt:
                now,

              updatedAt:
                now,
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
            )
            .returning({
              id:
                sessions.id,

              userId:
                sessions.userId,
            });

        if (
          updated.length ===
          0
        ) {
          return;
        }

        const session =
          updated[0];

        /*
         * The session row determines the account.
         * activeSessions cannot be allowed to drift
         * to another user.
         */
        await tx
          .update(
            activeSessions,
          )
          .set({
            lastActivity:
              now,

            updatedAt:
              now,
          })
          .where(
            and(
              eq(
                activeSessions.sessionId,
                session.id,
              ),

              eq(
                activeSessions.userId,
                session.userId,
              ),
            ),
          );
      },
    );
  }

  async getActiveSessions(
    userId: string,
  ) {
    return db
      .select({
        id:
          activeSessions.id,

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
      .from(
        activeSessions,
      )
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

          eq(
            sessions.userId,
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
import { randomInt } from "crypto";
import { eq } from "drizzle-orm";

import { db } from "../../database/db";
import { users } from "../../database/schema";

export class ProfileIdService {
  /**
   * Generate a unique ReDom Profile ID.
   *
   * Format:
   * 234 + XXX + XXXXXXXXX
   */
  async generate(): Promise<string> {
    while (true) {
      const profileId = this.createCandidate();

      const existing =
        await db.query.users.findFirst({
          where: eq(
            users.profileId,
            profileId,
          ),
        });

      if (!existing) {
        return profileId;
      }
    }
  }

  /**
   * Validate a Profile ID.
   */
  validate(profileId: string): boolean {
    return /^234[1-9][0-9]{11}$/.test(
      profileId,
    );
  }

  /**
   * Check whether a Profile ID already exists.
   */
  async exists(
    profileId: string,
  ): Promise<boolean> {
    const existing =
      await db.query.users.findFirst({
        where: eq(
          users.profileId,
          profileId,
        ),
      });

    return !!existing;
  }

  /**
   * Generate:
   * 234 + XXX + XXXXXXXXX
   */
  private createCandidate(): string {
    const middle = randomInt(
      111,
      1000,
    ).toString();

    const last = randomInt(
      0,
      1_000_000_000,
    )
      .toString()
      .padStart(9, "0");

    return `234${middle}${last}`;
  }
}

export const profileIdService =
  new ProfileIdService();
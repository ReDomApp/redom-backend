import { randomInt } from "crypto";
import { eq } from "drizzle-orm";

import { db } from "../../database/db";
import { users } from "../../database/schema";

export class PublicIdService {
  /**
   * Generate a unique ReDom Public ID.
   *
   * Format:
   *
   * 234 + XXX + XXXXXXXXX
   *
   * Example:
   *
   * 234583928174521
   */
  async generate(): Promise<string> {
    while (true) {
      const publicId =
        this.createCandidate();

      const existing =
        await db.query.users.findFirst({
          where: eq(
            users.publicId,
            publicId,
          ),
        });

      if (!existing) {
        return publicId;
      }
    }
  }

  /**
   * Validate a ReDom Public ID.
   */
  validate(
    publicId: string,
  ): boolean {
    return /^234[1-9][0-9]{11}$/.test(
      publicId,
    );
  }

  /**
   * Check whether a Public ID exists.
   */
  async exists(
    publicId: string,
  ): Promise<boolean> {
    const existing =
      await db.query.users.findFirst({
        where: eq(
          users.publicId,
          publicId,
        ),
      });

    return !!existing;
  }

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

export const publicIdService =
  new PublicIdService();
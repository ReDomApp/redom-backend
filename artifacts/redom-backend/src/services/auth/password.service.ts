import {
  hashPassword,
  verifyPassword,
} from "../../utils/password";

export class PasswordService {
  /**
   * Hash a plain-text password.
   */
  async hash(password: string): Promise<string> {
    return hashPassword(password);
  }

  /**
   * Verify a password against its stored hash.
   */
  async verify(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    return verifyPassword(password, passwordHash);
  }

  /**
   * Check whether a password satisfies
   * ReDom's security requirements.
   */
  validate(password: string): void {
    if (password.length < 6) {
      throw new Error(
        "Password must be at least 6 characters.",
      );
    }

    if (!/[A-Za-z]/.test(password)) {
      throw new Error(
        "Password must contain at least one letter.",
      );
    }

    if (!/\d/.test(password)) {
      throw new Error(
        "Password must contain at least one number.",
      );
    }
  }
}

export const passwordService =
  new PasswordService();
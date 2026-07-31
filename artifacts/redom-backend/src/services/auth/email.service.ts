import { randomInt } from "crypto";

import { resend } from "../../lib/resend";

export class EmailService {
  /**
   * Normalize an email address.
   */
  normalize(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Validate email format.
   */
  validate(email: string): string {
    email = this.normalize(email);

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      throw new Error("Invalid email address.");
    }

    return email;
  }

  /**
   * Generate a 6-digit verification code.
   */
  generateVerificationCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Send email verification code.
   */
  async sendVerificationCode(
    email: string,
    firstName: string,
    code: string,
  ): Promise<void> {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: email,
      subject: "Verify your ReDom account",
      html: `
        <h2>Welcome to ReDom, ${firstName}!</h2>

        <p>Your verification code is:</p>

        <h1
          style="
            font-size:40px;
            letter-spacing:8px;
            text-align:center;
          "
        >
          ${code}
        </h1>

        <p>
          This code expires in <strong>10 minutes</strong>.
        </p>

        <p>
          If you didn't create this account, you can safely ignore this email.
        </p>
      `,
    });
  }

  /**
   * Send password reset code.
   */
  async sendPasswordResetCode(
    email: string,
    firstName: string,
    code: string,
  ): Promise<void> {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: email,
      subject: "Reset your ReDom password",
      html: `
        <h2>Hello ${firstName},</h2>

        <p>Your password reset code is:</p>

        <h1
          style="
            font-size:40px;
            letter-spacing:8px;
            text-align:center;
          "
        >
          ${code}
        </h1>

        <p>
          This code expires in <strong>10 minutes</strong>.
        </p>

        <p>
          If you didn't request this password reset, you can safely ignore this email.
        </p>
      `,
    });
  }
}

export const emailService = new EmailService();
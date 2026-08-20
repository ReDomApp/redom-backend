import { randomInt } from "crypto";

import { resend } from "../../lib/resend";
import { env } from "../../config/env";

export class EmailService {
  normalize(
    email: string,
  ): string {
    return email
      .trim()
      .toLowerCase();
  }

  validate(
    email: string,
  ): string {
    email =
      this.normalize(email);

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !emailRegex.test(email)
    ) {
      throw new Error(
        "Invalid email address.",
      );
    }

    return email;
  }

  generateVerificationCode(): string {
    return randomInt(
      100000,
      1000000,
    ).toString();
  }

  async sendVerificationCode(
    email: string,
    firstName: string,
    code: string,
  ): Promise<void> {
    await resend.emails.send({
      from:
        env.email.resend
          .fromEmail,

      to: email,

      subject:
        "Verify your ReDom account",

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
          If you didn't create this account,
          you can safely ignore this email.
        </p>
      `,
    });
  }

  async sendPasswordResetCode(
    email: string,
    firstName: string,
    code: string,
  ): Promise<void> {
    await resend.emails.send({
      from:
        env.email.resend
          .fromEmail,

      to: email,

      subject:
        "Reset your ReDom password",

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
          If you didn't request this password reset,
          you can safely ignore this email.
        </p>
      `,
    });
  }
}

export const emailService =
  new EmailService();
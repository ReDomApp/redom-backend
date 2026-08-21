import {
  resend,
} from "../../lib/resend";

import {
  env,
} from "../../config/env";

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
    const normalized =
      this.normalize(
        email,
      );

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !emailRegex.test(
        normalized,
      )
    ) {
      throw new Error(
        "Invalid email address.",
      );
    }

    return normalized;
  }

  async sendOtp(
    params: {
      email: string;
      firstName?: string;
      code: string;
      purpose: string;
      expiresAt: Date;
    },
  ): Promise<{
    provider: string;
    providerReference?: string;
  }> {
    const email =
      this.validate(
        params.email,
      );

    const subject =
      this.getSubject(
        params.purpose,
      );

    const expiresAtText =
      params.expiresAt.toLocaleString(
        "en-US",
        {
          dateStyle:
            "medium",
          timeStyle:
            "short",
        },
      );

    const result =
      await resend.emails.send({
        from:
          env.email.resend
            .fromEmail,

        to: email,

        subject,

        html: `
          <div
            style="
              font-family:Arial,sans-serif;
              max-width:600px;
              margin:auto;
            "
          >
            <h2>
              ${
                params.firstName
                  ? `Hello ${this.escapeHtml(
                      params.firstName,
                    )},`
                  : "Hello,"
              }
            </h2>

            <p>
              Your ReDom verification code is:
            </p>

            <div
              style="
                font-size:40px;
                font-weight:bold;
                letter-spacing:10px;
                text-align:center;
                margin:30px 0;
              "
            >
              ${this.escapeHtml(
                params.code,
              )}
            </div>

            <p>
              This code expires at
              <strong>
                ${this.escapeHtml(
                  expiresAtText,
                )}
              </strong>.
            </p>

            <p>
              Never share this code with anyone.
            </p>

            <p>
              If you did not request this,
              you can safely ignore this message.
            </p>
          </div>
        `,
      });

    if (
      result.error
    ) {
      throw new Error(
        `Resend failed to deliver the verification email: ${result.error.message}`,
      );
    }

    return {
      provider:
        "resend",

      providerReference:
        result.data?.id,
    };
  }

  private getSubject(
    purpose: string,
  ): string {
    switch (
      purpose
    ) {
      case "EMAIL_VERIFICATION":
        return "Verify your ReDom account";

      case "PASSWORD_RESET":
        return "Reset your ReDom password";

      case "CHANGE_EMAIL":
        return "Confirm your ReDom email change";

      case "CHANGE_PASSWORD":
        return "Confirm your ReDom password change";

      default:
        return "Your ReDom verification code";
    }
  }

  private escapeHtml(
    value: string,
  ): string {
    return value
      .replace(
        /&/g,
        "&amp;",
      )
      .replace(
        /</g,
        "&lt;",
      )
      .replace(
        />/g,
        "&gt;",
      )
      .replace(
        /"/g,
        "&quot;",
      )
      .replace(
        /'/g,
        "&#039;",
      );
  }
}

export const emailService =
  new EmailService();
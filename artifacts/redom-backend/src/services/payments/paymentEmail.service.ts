import { Resend } from "resend";
import { env } from "../../config/env";

const resend = new Resend(env.email.resend.apiKey);

export async function sendPaymentConfirmationEmail(input: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const { error } = await resend.emails.send({ from: env.email.paymentFrom, to: [input.to], subject: input.subject, text: input.text, html: input.html });
  if (error) throw new Error(`Email could not be sent: ${error.message}`);
}

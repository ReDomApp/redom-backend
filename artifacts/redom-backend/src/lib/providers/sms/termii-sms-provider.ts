import type {
  SmsDeliveryRequest,
  SmsDeliveryResult,
  SmsProvider,
} from "./sms-provider";

export class TermiiSmsProvider
  implements SmsProvider
{
  readonly name =
    "termii";

  supportsChannel(
    channel:
      | "email"
      | "sms"
      | "whatsapp",
  ): boolean {
    return (
      channel === "sms"
    );
  }

  async sendOtp(
    _request: SmsDeliveryRequest,
  ): Promise<SmsDeliveryResult> {
    throw new Error(
      "Termii OTP delivery is not configured in the current environment.",
    );
  }
}

export const termiiSmsProvider =
  new TermiiSmsProvider();
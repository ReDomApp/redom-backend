import type {
  SmsDeliveryRequest,
  SmsDeliveryResult,
  SmsProvider,
} from "./sms-provider";

export class InfobipSmsProvider
  implements SmsProvider
{
  readonly name =
    "infobip";

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
      "Infobip OTP delivery is not configured in the current environment.",
    );
  }
}

export const infobipSmsProvider =
  new InfobipSmsProvider();
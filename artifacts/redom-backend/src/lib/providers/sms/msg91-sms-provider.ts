import type {
  SmsDeliveryRequest,
  SmsDeliveryResult,
  SmsProvider,
} from "./sms-provider";

export class Msg91SmsProvider
  implements SmsProvider
{
  readonly name =
    "msg91";

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
      "MSG91 OTP delivery is not configured in the current environment.",
    );
  }
}

export const msg91SmsProvider =
  new Msg91SmsProvider();
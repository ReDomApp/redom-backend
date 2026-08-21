import type {
  SmsDeliveryRequest,
  SmsDeliveryResult,
  SmsProvider,
} from "./sms-provider";

export class MessageBirdSmsProvider
  implements SmsProvider
{
  readonly name =
    "messagebird";

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
      "MessageBird OTP delivery is not configured in the current environment.",
    );
  }
}

export const messageBirdSmsProvider =
  new MessageBirdSmsProvider();
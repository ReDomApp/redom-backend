import type {
  OtpChannel,
} from "../../../utils/otp";

export interface SmsDeliveryRequest {
  to: string;

  code: string;

  channel:
    | "sms"
    | "whatsapp";

  purpose: string;

  expiresAt: Date;
}

export interface SmsDeliveryResult {
  provider: string;

  providerReference?: string;

  channel:
    | "sms"
    | "whatsapp";
}

/**
 * Provider adapters ONLY deliver the OTP.
 *
 * They do NOT:
 *
 * - generate the OTP
 * - verify the OTP
 * - decide expiration
 * - decide attempts
 * - decide whether the user is verified
 */
export interface SmsProvider {
  readonly name: string;

  supportsChannel(
    channel: OtpChannel,
  ): boolean;

  sendOtp(
    request: SmsDeliveryRequest,
  ): Promise<SmsDeliveryResult>;
}
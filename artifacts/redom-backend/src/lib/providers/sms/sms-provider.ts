export interface SmsVerificationProvider {
  sendVerificationCode(
    phoneNumber: string,
  ): Promise<void>;

  verifyCode(
    phoneNumber: string,
    code: string,
  ): Promise<boolean>;
}